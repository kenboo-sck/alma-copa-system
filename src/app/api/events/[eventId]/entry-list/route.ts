import { getPublicEntryList } from "@/lib/entries/public-entry-list-server";
import { isAdminFirestoreConfigured } from "@/lib/firebase/admin";

export const runtime = "nodejs";
// 申込の変更・取消をすぐに反映するため、キャッシュしない。
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

// 一般公開用のエントリーリスト。公開設定が有効な大会だけ、
// 「エントリーカテゴリー」「所属」「名前」の 3 項目を返す。
export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;

  if (!isAdminFirestoreConfigured()) {
    return Response.json(
      { error: "エントリーリストを表示できません。" },
      { status: 503, headers: noStoreHeaders },
    );
  }

  try {
    const entryList = await getPublicEntryList(eventId);

    // 非公開・未公開・存在しない大会は区別せず 404 にする。
    if (!entryList) {
      return Response.json(
        { error: "エントリーリストは公開されていません。" },
        { status: 404, headers: noStoreHeaders },
      );
    }

    return Response.json(entryList, { headers: noStoreHeaders });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "エントリーリストの取得に失敗しました。" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
