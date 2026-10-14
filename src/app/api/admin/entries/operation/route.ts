import { z } from "zod";

import { requireAdminRequest } from "@/lib/auth/admin-server";
import {
  MANUAL_PAYMENT_METHODS,
  readEntryAccounting,
} from "@/lib/entries/entry-accounting";
import {
  MONEY_OPERATION_TYPES,
  applyEntryOperation,
  buildChangeNotificationDraft,
  type EntryOperation,
} from "@/lib/entries/entry-admin-operations";
import { athleteInputSchema } from "@/lib/entries/entry-athlete-schema";
import { getAdminFirestore, getMissingAdminEnvNames } from "@/lib/firebase/admin";
import { collections } from "@/lib/firebase/collections";

export const runtime = "nodejs";

const division = z.enum(["gi", "nogi"]);
const athleteIndex = z.number().int().min(0).max(200);
const amount = z.number().int().min(0).max(10_000_000);
const text = (max: number) => z.string().trim().max(max);

const operationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add_division"),
    athleteIndex,
    division,
    entry: z.object({
      ageCategory: text(40),
      weightClass: text(40),
      rank: text(20),
      openClass: z.enum(["yes", "no"]),
    }),
  }),
  z.object({
    type: z.literal("cancel_division"),
    athleteIndex,
    division,
    chargeReduction: amount,
  }),
  z.object({
    type: z.literal("set_open_class"),
    athleteIndex,
    division,
    openClass: z.enum(["yes", "no"]),
    chargeReduction: amount.optional(),
  }),
  z.object({
    type: z.literal("update_category"),
    athleteIndex,
    division,
    ageCategory: text(40),
    weightClass: text(40),
    rank: text(20),
  }),
  z.object({ type: z.literal("add_athlete"), athlete: athleteInputSchema }),
  z.object({
    type: z.literal("cancel_athlete"),
    athleteIndex,
    chargeReduction: amount,
  }),
  z.object({ type: z.literal("cancel_entry"), chargeReduction: amount }),
  z.object({
    type: z.literal("record_payment"),
    amount,
    method: z.enum(MANUAL_PAYMENT_METHODS),
  }),
  z.object({ type: z.literal("plan_refund"), amount }),
  z.object({ type: z.literal("complete_refund"), amount }),
  z.object({ type: z.literal("no_refund") }),
  z.object({
    type: z.literal("adjust_charge"),
    amount: z.number().int().min(-10_000_000).max(10_000_000),
  }),
  z.object({
    type: z.literal("confirm_unit_price"),
    unitPrice: amount,
    basis: text(500),
  }),
]);

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("apply"),
    entryId: z.string().trim().min(1),
    expectedRevision: z.number().int().min(0),
    // 変更・取消・精算の理由（必須）。
    reason: z.string().trim().min(1, "理由を入力してください。").max(500),
    // true: 確認画面用に、変更内容と金額だけを計算する（保存しない）。
    dryRun: z.boolean(),
    operation: operationSchema,
  }),
  // 現在の申込内容から、通知メールの文面（下書き）を作る。保存も送信もしない。
  z.object({
    action: z.literal("draft_notification"),
    entryId: z.string().trim().min(1),
  }),
]);

const authErrorStatus: Record<string, number> = {
  AUTH_TOKEN_MISSING: 401,
  AUTH_TOKEN_INVALID: 401,
  ADMIN_NOT_ACTIVE: 403,
  ADMIN_PERMISSION_DENIED: 403,
};

// エントリーの追加・変更・キャンセル、入金・返金・料金調整の記録。
// - 出場内容の変更には entries:write が必要。
// - 金額が動く操作（取消・入金・返金・料金調整・単価の確認）には payments:write も必要。
// - owner はすべて実行できる。受付担当（staff）には、どちらの権限も既定では付与していない。
export async function POST(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminRequest>>;

  try {
    admin = await requireAdminRequest(request, "entries:write");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = authErrorStatus[code] ?? 500;

    return Response.json(
      {
        error:
          status === 403
            ? "エントリーを変更する権限がありません。"
            : status === 401
              ? "管理者認証を確認できませんでした。"
              : "管理者認証の確認に失敗しました。",
        code,
      },
      { status },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json(
      {
        error:
          issue?.code === "custom" || issue?.path.includes("reason")
            ? issue.message
            : "入力内容を確認してください。",
        code: "invalid_request",
        issues: parsed.error.issues.map((item) => ({
          path: item.path.join("."),
          message: item.message,
        })),
      },
      { status: 400 },
    );
  }

  if (getMissingAdminEnvNames().length > 0) {
    return Response.json(
      {
        error:
          "サーバー設定が不足しているため、操作できません。（Firebase Admin SDK の環境変数が未設定です。ローカルで試す場合は、Emulator 用の検証環境 http://localhost:3002 を使ってください。）",
      },
      { status: 503 },
    );
  }

  const { adminUser } = admin;

  try {
    if (parsed.data.action === "draft_notification") {
      const snapshot = await getAdminFirestore()
        .collection(collections.entries)
        .doc(parsed.data.entryId)
        .get();

      if (!snapshot.exists) {
        return Response.json(
          { error: "エントリーが見つかりません。" },
          { status: 404 },
        );
      }

      const data = snapshot.data() as Record<string, unknown>;
      return Response.json({
        ok: true,
        notificationDraft: buildChangeNotificationDraft(
          data,
          readEntryAccounting(data),
          [],
        ),
      });
    }

    const operation = parsed.data.operation as EntryOperation;
    const canRecordMoney =
      adminUser.role === "owner" || adminUser.permissions.includes("payments:write");

    if (MONEY_OPERATION_TYPES.includes(operation.type) && !canRecordMoney) {
      return Response.json(
        {
          error: "入金・返金・料金の精算を記録する権限がありません。",
          code: "ADMIN_PERMISSION_DENIED",
        },
        { status: 403 },
      );
    }

    const result = await applyEntryOperation({
      entryId: parsed.data.entryId,
      operation,
      reason: parsed.data.reason,
      expectedRevision: parsed.data.expectedRevision,
      adminUid: adminUser.uid,
      adminEmail: adminUser.email,
      dryRun: parsed.data.dryRun,
    });

    if (!result.ok) {
      return Response.json(
        { error: result.message, code: result.code },
        { status: result.status },
      );
    }

    return Response.json(result);
  } catch (error) {
    console.error("Entry operation failed", {
      entryId: parsed.data.entryId,
      adminUid: adminUser.uid,
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json({ error: "操作に失敗しました。" }, { status: 500 });
  }
}
