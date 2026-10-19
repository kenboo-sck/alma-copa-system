import { z } from "zod";

import { requireAdminRequest } from "@/lib/auth/admin-server";
import { purgeTestEntries, setTestEntryFlags } from "@/lib/entries/test-entries-server";
import { getMissingAdminEnvNames } from "@/lib/firebase/admin";

export const runtime = "nodejs";

// 一度に操作できる申込の件数。
const MAX_ENTRIES = 100;

const entryIdsSchema = z
  .array(z.string().trim().min(1).max(400))
  .min(1, "申込を選択してください。")
  .max(MAX_ENTRIES, `一度に操作できるのは ${MAX_ENTRIES}件までです。`)
  .transform((ids) => [...new Set(ids)]);

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark"), entryIds: entryIdsSchema }),
  z.object({ action: z.literal("unmark"), entryIds: entryIdsSchema }),
  z.object({ action: z.literal("purge"), entryIds: entryIdsSchema }),
]);

const authErrorStatus: Record<string, number> = {
  AUTH_TOKEN_MISSING: 401,
  AUTH_TOKEN_INVALID: 401,
  ADMIN_NOT_ACTIVE: 403,
  ADMIN_PERMISSION_DENIED: 403,
};

// テスト申込の指定（mark）・解除（unmark）・完全削除（purge）。
// オーナーだけが実行できる。権限は管理者ドキュメント（adminUsers）の role を
// サーバー側で確認し、画面の表示には依存しない。
export async function POST(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminRequest>>;

  try {
    admin = await requireAdminRequest(request);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = authErrorStatus[code] ?? 500;

    return Response.json(
      {
        error:
          status === 401
            ? "管理者認証を確認できませんでした。"
            : status === 403
              ? "この操作を行う権限がありません。"
              : "管理者認証の確認に失敗しました。",
        code,
      },
      { status },
    );
  }

  if (admin.adminUser.role !== "owner") {
    return Response.json(
      {
        error: "テスト申込の指定と完全削除は、オーナーだけが行えます。",
        code: "OWNER_ONLY",
      },
      { status: 403 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "リクエストの形式が正しくありません。",
      },
      { status: 400 },
    );
  }

  if (getMissingAdminEnvNames().length > 0) {
    return Response.json(
      {
        error:
          "サーバー設定が不足しているため、操作できません。（Firebase Admin SDK の環境変数が未設定です。）",
      },
      { status: 503 },
    );
  }

  const { action, entryIds } = parsed.data;
  const actor = { uid: admin.adminUser.uid, email: admin.adminUser.email };
  const results =
    action === "purge"
      ? await purgeTestEntries(entryIds)
      : await setTestEntryFlags(entryIds, action === "mark", actor);
  const succeeded = results.filter((result) => result.ok).length;

  console.info("Test entry operation completed", {
    action,
    requestedCount: entryIds.length,
    succeeded,
    failed: results.length - succeeded,
    adminUid: actor.uid,
  });

  return Response.json({
    action,
    results,
    succeededCount: succeeded,
    failedCount: results.length - succeeded,
  });
}
