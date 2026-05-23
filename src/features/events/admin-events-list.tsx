import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { EventStatus } from "@/types/event";

import type { AdminEvent } from "./admin-event-types";
import { eventStatusLabels, eventStatusTones } from "./admin-event-types";
import { formatDate, formatDateTime } from "./admin-event-utils";

type AdminEventsListProps = {
  events: AdminEvent[];
  isLoading: boolean;
  onEdit: (event: AdminEvent) => void;
  onStatusChange: (event: AdminEvent, status: EventStatus) => void;
  onDelete: (event: AdminEvent) => void;
};

function ActionButtons({
  event,
  onEdit,
  onStatusChange,
  onDelete,
}: Omit<AdminEventsListProps, "events" | "isLoading"> & { event: AdminEvent }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        className="min-h-9 px-3 py-1.5"
        variant="secondary"
        onClick={() => onEdit(event)}
      >
        編集
      </Button>
      <Button
        className="min-h-9 px-3 py-1.5"
        variant="secondary"
        onClick={() =>
          onStatusChange(event, event.status === "published" ? "draft" : "published")
        }
      >
        {event.status === "published" ? "非公開" : "公開"}
      </Button>
      <Button
        className="min-h-9 px-3 py-1.5"
        variant="secondary"
        onClick={() => onStatusChange(event, "closed")}
      >
        受付終了
      </Button>
      <Button
        className="min-h-9 px-3 py-1.5"
        variant="danger"
        onClick={() => onDelete(event)}
      >
        削除
      </Button>
    </div>
  );
}

export function AdminEventsList({
  events,
  isLoading,
  onEdit,
  onStatusChange,
  onDelete,
}: AdminEventsListProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-alma-gold border-t-transparent" />
        <p className="mt-4 text-sm text-zinc-400">大会一覧を読み込んでいます。</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="text-sm text-zinc-300">条件に一致する大会はありません。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:hidden">
        {events.map((event) => (
          <article
            key={event.id}
            className="rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 shadow-xl shadow-black/20"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white">{event.title}</h2>
                <p className="mt-1 text-sm text-zinc-400">{event.venue || "-"}</p>
              </div>
              <StatusBadge
                label={eventStatusLabels[event.status]}
                tone={eventStatusTones[event.status]}
              />
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-zinc-500">開催日</dt>
                <dd className="mt-1 text-zinc-200">{formatDate(event.eventDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">エントリー人数</dt>
                <dd className="mt-1 text-zinc-200">{event.entryCount}名</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-zinc-500">エントリー受付期間</dt>
                <dd className="mt-1 text-zinc-200">
                  {formatDateTime(event.entryStartAt)} - {formatDateTime(event.entryEndAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">作成日</dt>
                <dd className="mt-1 text-zinc-200">{formatDateTime(event.createdAt)}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <ActionButtons
                event={event}
                onEdit={onEdit}
                onStatusChange={onStatusChange}
                onDelete={onDelete}
              />
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/30 xl:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-b border-white/10 bg-black/50 text-xs text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-semibold">大会名</th>
                <th className="px-4 py-3 font-semibold">開催日</th>
                <th className="px-4 py-3 font-semibold">会場</th>
                <th className="px-4 py-3 font-semibold">公開状態</th>
                <th className="px-4 py-3 font-semibold">エントリー受付期間</th>
                <th className="px-4 py-3 text-right font-semibold">エントリー人数</th>
                <th className="px-4 py-3 font-semibold">作成日</th>
                <th className="px-4 py-3 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-white/5 align-top">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-white">{event.title}</p>
                    {event.description ? (
                      <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-500">
                        {event.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-zinc-300">
                    {formatDate(event.eventDate)}
                  </td>
                  <td className="px-4 py-4 text-zinc-300">{event.venue || "-"}</td>
                  <td className="px-4 py-4">
                    <StatusBadge
                      label={eventStatusLabels[event.status]}
                      tone={eventStatusTones[event.status]}
                    />
                  </td>
                  <td className="px-4 py-4 text-zinc-300">
                    {formatDateTime(event.entryStartAt)}
                    <span className="mx-1 text-zinc-600">-</span>
                    {formatDateTime(event.entryEndAt)}
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-white">
                    {event.entryCount}名
                  </td>
                  <td className="px-4 py-4 text-zinc-300">
                    {formatDateTime(event.createdAt)}
                  </td>
                  <td className="px-4 py-4">
                    <ActionButtons
                      event={event}
                      onEdit={onEdit}
                      onStatusChange={onStatusChange}
                      onDelete={onDelete}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
