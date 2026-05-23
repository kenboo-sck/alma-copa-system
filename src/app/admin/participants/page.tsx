import { AdminEntriesManager } from "@/features/entries";

export default function AdminParticipantsPage() {
  return (
    <AdminEntriesManager
      eyebrow="選手管理"
      title="選手一覧"
      description="大会に登録された選手情報、決済状態、受付、計量、ゼッケンを管理します。"
    />
  );
}
