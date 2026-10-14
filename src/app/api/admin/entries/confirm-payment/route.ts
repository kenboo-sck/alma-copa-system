import { z } from "zod";

import { requireAdminRequest } from "@/lib/auth/admin-server";
import { confirmManualPayment } from "@/lib/entries/entry-server";
import { getMissingAdminEnvNames } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const confirmPaymentSchema = z.object({
  entryId: z.string().trim().min(1),
});

const authErrorStatus: Record<string, number> = {
  AUTH_TOKEN_MISSING: 401,
  AUTH_TOKEN_INVALID: 401,
  ADMIN_NOT_ACTIVE: 403,
  ADMIN_PERMISSION_DENIED: 403,
};

// 銀行振込の入金確認・現金の受領を記録する。
// 「payments:write」の権限を持つ管理者（owner は常に可）だけが実行でき、
// 確認した管理者と日時はサーバー側で記録する。
export async function POST(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminRequest>>;

  try {
    admin = await requireAdminRequest(request, "payments:write");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = authErrorStatus[code] ?? 500;

    return Response.json(
      {
        error:
          status === 403
            ? "入金を記録する権限がありません。"
            : status === 401
              ? "管理者認証を確認できませんでした。"
              : "管理者認証の確認に失敗しました。",
        code,
      },
      { status },
    );
  }

  const parsed = confirmPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "entryId が指定されていません。" }, { status: 400 });
  }

  if (getMissingAdminEnvNames().length > 0) {
    return Response.json(
      {
        error:
          "サーバー設定が不足しているため、入金を記録できません。（Firebase Admin SDK の環境変数が未設定です。ローカルで試す場合は、Emulator 用の検証環境 http://localhost:3002 を使ってください。）",
      },
      { status: 503 },
    );
  }

  try {
    const result = await confirmManualPayment({
      entryId: parsed.data.entryId,
      adminUid: admin.adminUser.uid,
      adminEmail: admin.adminUser.email,
    });

    switch (result.status) {
      case "confirmed":
      case "already_confirmed":
        return Response.json({ ok: true, result: result.status });
      case "entry_not_found":
        return Response.json(
          { error: "エントリーが見つかりません。" },
          { status: 404 },
        );
      case "not_manual_payment":
        return Response.json(
          {
            error:
              "カード決済のエントリーは、Stripe の決済完了によってのみ支払済みになります。",
          },
          { status: 409 },
        );
      case "entry_cancelled":
        return Response.json(
          { error: "キャンセル済みのエントリーには入金を記録できません。" },
          { status: 409 },
        );
    }
  } catch (error) {
    console.error("Manual payment confirmation failed", {
      entryId: parsed.data.entryId,
      adminUid: admin.adminUser.uid,
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json({ error: "入金の記録に失敗しました。" }, { status: 500 });
  }
}
