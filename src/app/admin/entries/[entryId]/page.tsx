import { AdminEntryDetail } from "@/features/entries/admin-entry-detail";

type AdminEntryDetailPageProps = {
  params: Promise<{
    entryId: string;
  }>;
};

export default async function AdminEntryDetailPage({
  params,
}: AdminEntryDetailPageProps) {
  const { entryId } = await params;

  // エントリー ID には "%40" などが含まれるため、リンクでは二重にエンコードしている。
  // まだエンコードされたままの場合だけ 1 回戻す。
  const resolvedEntryId = entryId.includes("%25")
    ? decodeURIComponent(entryId)
    : entryId;

  return <AdminEntryDetail entryId={resolvedEntryId} />;
}
