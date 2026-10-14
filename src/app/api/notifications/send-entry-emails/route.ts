import { emailService } from "@/lib/email";

export const runtime = "nodejs";

export async function GET() {
  const status = emailService.getEnvironmentStatus();

  // 設定の詳細（送信元アドレスや送信先 URL）は外部に返さない。
  return Response.json({
    provider: status.provider,
    isConfigured: status.isConfigured,
  });
}

// 受付メール・完了メールは、申込の保存や決済の確定を行うサーバー処理の中で送信する
// （src/lib/entries/entry-server.ts）。ブラウザからの送信依頼は、宛先や内容を
// 外部から指定できてしまうため受け付けない。
export async function POST() {
  return Response.json(
    {
      error: "ENDPOINT_REMOVED",
      message: "このエンドポイントからのメール送信は終了しました。",
    },
    { status: 410 },
  );
}
