import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicEntryListView } from "@/features/events/public-entry-list";
import { getPublicEntryList } from "@/lib/entries/public-entry-list-server";

// 申込の変更・取消をすぐに反映するため、リクエストごとに表示する。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "エントリーリスト",
};

type EntryListPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function EntryListPage({ params }: EntryListPageProps) {
  const { eventId } = await params;
  const entryList = await getPublicEntryList(eventId);

  // 公開設定が無効な大会は、直接アクセスされても表示しない。
  if (!entryList) {
    notFound();
  }

  return <PublicEntryListView entryList={entryList} />;
}
