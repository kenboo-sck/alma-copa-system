import { z } from "zod";

import { requireAdminRequest } from "@/lib/auth/admin-server";
import { resendEntryEmails } from "@/lib/entries/entry-server";
import { getMissingAdminEnvNames } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const requestSchema = z.object({
  entryId: z.string().trim().min(1),
  // true の場合は管理者通知も送る（既定は申込者向けだけ）。
  includeAdmin: z.boolean().default(false),
});

const authErrorStatus: Record<string, number> = {
  AUTH_TOKEN_MISSING: 401,
  AUTH_TOKEN_INVALID: 401,
  ADMIN_NOT_ACTIVE: 403,
  ADMIN_PERMISSION_DENIED: 403,
};

// 受付メール（申込時と同じ文面）の再送。「emails:send」の権限を持つ管理者（owner は常に可）だけが実行できる。
export async function POST(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminRequest>>;

  try {
    admin = await requireAdminRequest(request, "emails:send");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = authErrorStatus[code] ?? 500;

    return Response.json(
      {
        error:
          status === 403
            ? "メールを送信する権限がありません。"
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
    return Response.json({ error: "entryId が指定されていません。" }, { status: 400 });
  }

  if (getMissingAdminEnvNames().length > 0) {
    return Response.json(
      {
        error:
          "サーバー設定が不足しているため、メールを再送できません。（Firebase Admin SDK の環境変数が未設定です。）",
      },
      { status: 503 },
    );
  }

  const result = await resendEntryEmails({
    entryId: parsed.data.entryId,
    includeAdmin: parsed.data.includeAdmin,
    adminUid: admin.adminUser.uid,
    adminEmail: admin.adminUser.email,
  });

  if (!result.ok) {
    return Response.json({ error: result.message }, { status: result.status });
  }

  return Response.json(result);
}
