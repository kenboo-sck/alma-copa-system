import { AdminEntriesManager } from "@/features/entries";

export default function AdminParticipantsPage() {
  return (
    <AdminEntriesManager
      eyebrow="選手管理"
      title="選手一覧"
      description="大会に登録された選手情報、決済状態、受付状態を確認・管理します。"
    />
  );
}
