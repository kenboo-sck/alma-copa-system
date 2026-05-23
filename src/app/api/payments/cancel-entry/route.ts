import { z } from "zod";

export const runtime = "nodejs";

const cancelEntrySchema = z.object({
  entryId: z.string().min(1),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = cancelEntrySchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      {
        error: "キャンセル対象のエントリーが見つかりません。",
      },
      { status: 400 },
    );
  }

  return Response.json({
    ok: true,
    entryId: parsed.data.entryId,
    message: "Client SDK 側でキャンセル状態を保存してください。",
  });
}
