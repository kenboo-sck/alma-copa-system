import type {
  EventSortKey,
  EventStatusFilter,
} from "./admin-event-types";

type AdminEventsToolbarProps = {
  searchQuery: string;
  statusFilter: EventStatusFilter;
  sortKey: EventSortKey;
  onSearchQueryChange: (value: string) => void;
  onStatusFilterChange: (value: EventStatusFilter) => void;
  onSortKeyChange: (value: EventSortKey) => void;
};

export function AdminEventsToolbar({
  searchQuery,
  statusFilter,
  sortKey,
  onSearchQueryChange,
  onStatusFilterChange,
  onSortKeyChange,
}: AdminEventsToolbarProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 shadow-2xl shadow-black/30">
      <div className="grid gap-3 lg:grid-cols-[1fr_180px_200px]">
        <label className="space-y-2">
          <span className="text-xs font-semibold text-zinc-400">大会名検索</span>
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="大会名で検索"
            className="h-11 w-full rounded-md border border-white/10 bg-black/70 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-alma-gold"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold text-zinc-400">公開状態</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              onStatusFilterChange(event.target.value as EventStatusFilter)
            }
            className="h-11 w-full rounded-md border border-white/10 bg-black/70 px-3 text-sm text-white outline-none transition focus:border-alma-gold"
          >
            <option value="all">すべて</option>
            <option value="published">公開中</option>
            <option value="draft">下書き</option>
            <option value="closed">受付終了</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold text-zinc-400">並び替え</span>
          <select
            value={sortKey}
            onChange={(event) => onSortKeyChange(event.target.value as EventSortKey)}
            className="h-11 w-full rounded-md border border-white/10 bg-black/70 px-3 text-sm text-white outline-none transition focus:border-alma-gold"
          >
            <option value="eventDateAsc">開催日が近い順</option>
            <option value="eventDateDesc">開催日が遠い順</option>
            <option value="createdAtDesc">作成日が新しい順</option>
          </select>
        </label>
      </div>
    </div>
  );
}
