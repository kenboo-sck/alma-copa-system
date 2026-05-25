"use client";

import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import {
  CalendarIcon,
  LocationIcon,
  TrophyIcon,
  UsersIcon,
} from "@/components/icons";

import {
  formatDate,
  formatDateTime,
  getEventImageUrl,
  getEntryState,
  mapPublicEvent,
  toCssUrl,
  type PublicEvent,
} from "./public-event-utils";

export function PublicEventsList() {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventsQuery = query(
      collection(db, collections.events),
      where("status", "==", "published"),
    );

    const unsubscribe = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const nextEvents = snapshot.docs
          .filter((eventSnapshot) => !eventSnapshot.data().deletedAt)
          .map((eventSnapshot) =>
            mapPublicEvent(eventSnapshot.id, eventSnapshot.data()),
          )
          .sort(
            (a, b) =>
              (a.eventDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
              (b.eventDate?.getTime() ?? Number.MAX_SAFE_INTEGER),
          );

        setEvents(nextEvents);
        setIsLoading(false);
        setError(null);
      },
      (caughtError) => {
        console.error(caughtError);
        setError("大会一覧の取得に失敗しました。時間をおいて再度お試しください。");
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const summary = useMemo(
    () => ({
      total: events.length,
      accepting: events.filter((event) => getEntryState(event).canEnter).length,
    }),
    [events],
  );

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] p-8 text-center shadow-2xl shadow-black/25">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-alma-gold border-t-transparent" />
        <p className="mt-4 text-sm text-zinc-400">公開中の大会を読み込んでいます。</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {events.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] p-8 text-center shadow-2xl shadow-black/25">
          <p className="text-sm text-zinc-400">現在公開中の大会はありません。</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-5 py-4 shadow-2xl shadow-black/25">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-500">
                公開中の大会
              </p>
              <p className="mt-3 text-3xl font-bold text-white">{summary.total}</p>
            </div>
            <div className="rounded-2xl border border-alma-gold/25 bg-[linear-gradient(180deg,rgba(214,173,69,0.14),rgba(255,255,255,0.03))] px-5 py-4 shadow-2xl shadow-black/25">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-300">
                受付中
              </p>
              <p className="mt-3 text-3xl font-bold text-white">{summary.accepting}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-5 py-4 shadow-2xl shadow-black/25">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-500">
                エントリー可能
              </p>
              <p className="mt-3 text-3xl font-bold text-white">{summary.accepting}</p>
            </div>
          </div>

          <div className="grid gap-4">
            {events.map((event) => {
              const entryState = getEntryState(event);
              const eventImage = getEventImageUrl(event, "/images/event-card-bg.jpg");

              return (
                <article
                  key={event.id}
                  className="group overflow-hidden rounded-3xl border border-white/10 bg-[rgba(255,255,255,0.03)] shadow-2xl shadow-black/30 transition hover:border-alma-gold/30"
                >
                  <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
                    <div className="relative min-h-48 overflow-hidden border-b border-white/10 bg-black lg:border-b-0 lg:border-r">
                      <div
                        className="absolute inset-0 bg-cover bg-center opacity-95 brightness-[1.12] contrast-[0.96] saturate-[1.03] transition duration-300 group-hover:brightness-[1.18] group-hover:contrast-[0.98]"
                        style={{
                          backgroundImage: `url('${toCssUrl(eventImage)}')`,
                        }}
                      />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(214,173,69,0.1),transparent_30%),radial-gradient(circle_at_82%_82%,rgba(214,173,69,0.06),transparent_26%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.38))]" />
                      <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_0,rgba(255,255,255,0.045)_50%,transparent_56%)] opacity-20" />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_46%,rgba(0,0,0,0.14)_72%,rgba(0,0,0,0.3)_100%)]" />
                      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                      <div className="absolute inset-0 flex items-end p-5">
                        <div className="max-w-[11rem]">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-alma-gold/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
                            JIU-JITSU
                          </p>
                          <p className="mt-2 text-2xl font-black uppercase tracking-[0.12em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
                            COPA ALMA
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-alma-gold px-3 py-1 text-xs font-bold text-black">
                          {entryState.label}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300">
                          柔術大会
                        </span>
                      </div>

                      <h2 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
                        {event.title}
                      </h2>
                      {event.description ? (
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
                          {event.description}
                        </p>
                      ) : null}

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                          <p className="flex items-center gap-2 text-xs text-zinc-500">
                            <CalendarIcon size={16} className="text-alma-gold" />
                            開催日
                          </p>
                          <p className="mt-2 text-sm font-semibold text-white break-words">
                            {formatDate(event.eventDate)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                          <p className="flex items-center gap-2 text-xs text-zinc-500">
                            <LocationIcon size={16} className="text-alma-gold" />
                            会場
                          </p>
                          <p className="mt-2 text-sm font-semibold text-white break-words">
                            {event.venue || "会場未定"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 sm:col-span-2 lg:col-span-1">
                          <p className="flex items-center gap-2 text-xs text-zinc-500">
                            <UsersIcon size={16} className="text-alma-gold" />
                            受付期間
                          </p>
                          <p className="mt-2 text-sm font-semibold text-white break-words">
                            {formatDateTime(event.entryStartAt)} -{" "}
                            {formatDateTime(event.entryEndAt)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-zinc-400">
                          受付状態: <span className="font-semibold text-white">{entryState.label}</span>
                        </p>
                        <Link
                          href={`/events/${event.id}`}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-alma-gold px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#d7b760]"
                        >
                          <TrophyIcon size={16} />
                          詳細を見る
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
