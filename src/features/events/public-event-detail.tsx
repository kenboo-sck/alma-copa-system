"use client";

import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";

import { CalendarIcon, ClockIcon, LocationIcon, TrophyIcon } from "@/components/icons";

import {
  formatDate,
  formatDateTime,
  getEventImageUrl,
  getEntryState,
  mapPublicEvent,
  toCssUrl,
  type PublicEvent,
} from "./public-event-utils";

type PublicEventDetailProps = {
  eventId: string;
};

function InfoLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-white/10 py-4 last:border-b-0">
      <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-alma-gold/30 bg-alma-gold/10 text-alma-gold">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-zinc-500">
          {label}
        </p>
        <p className="mt-1 text-base font-semibold leading-7 text-white sm:text-lg">
          {value}
        </p>
      </div>
    </div>
  );
}

function EarlyEntryPolicyCard() {
  return (
    <div className="rounded-3xl border border-alma-gold/45 bg-[linear-gradient(145deg,rgba(21,27,45,0.88),rgba(8,11,22,0.94))] px-5 py-6 shadow-[0_20px_70px_rgba(0,0,0,0.28)] sm:px-7 sm:py-7">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-alma-gold/85">
        EARLY ENTRY POLICY
      </p>
      <div className="mt-4 space-y-5 text-sm font-semibold leading-8 text-zinc-100 sm:text-base sm:leading-9">
        <p>本大会は早期エントリー制を採用しております。</p>
        <p>
          目標をいち早く定め、トレーニングに集中したい選手を支援するため、早期のお申し込みには優待価格を適用いたします。
        </p>
        <p>決断の早さが、ケージでの余裕を生む。</p>
        <p>
          スムーズな大会運営へのご協力に感謝し、皆様のエントリーをお待ちしております。
        </p>
      </div>
    </div>
  );
}

function AboutItemCard({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-alma-gold/20 bg-[linear-gradient(145deg,rgba(17,24,39,0.94),rgba(3,7,18,0.98)_62%,rgba(0,0,0,0.96))] p-5 shadow-[0_18px_56px_rgba(0,0,0,0.28)] sm:p-6 ${
        wide ? "sm:col-span-2" : ""
      }`}
    >
      <div
        className="absolute inset-y-5 left-0 w-px bg-gradient-to-b from-transparent via-alma-gold/80 to-transparent"
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-alma-gold/45 to-transparent"
        aria-hidden="true"
      />
      <h3 className="text-sm font-black tracking-[0.16em] text-alma-gold sm:text-base">
        {label}
      </h3>
      <p className="mt-4 max-w-[68ch] whitespace-pre-line text-[0.95rem] leading-8 text-zinc-200 sm:text-base sm:leading-8">
        {value}
      </p>
    </article>
  );
}

function getAboutText(value: string, fallback: string) {
  return value.trim() || fallback;
}

function formatPrice(value: number) {
  if (!value || value <= 0) {
    return "未設定";
  }

  return `¥${value.toLocaleString("ja-JP")}`;
}

function formatPeriod(startAt: Date | null, endAt: Date | null) {
  if (!startAt || !endAt) {
    return "未設定";
  }

  return `${formatDate(startAt)} 〜 ${formatDate(endAt)}`;
}

function isActivePeriod(startAt: Date | null, endAt: Date | null) {
  if (!startAt || !endAt) {
    return false;
  }

  const now = new Date();
  return now >= startAt && now <= endAt;
}

export function PublicEventDetail({ eventId }: PublicEventDetailProps) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, collections.events, eventId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setEvent(null);
          setIsLoading(false);
          setError("大会が見つかりません。");
          return;
        }

        const data = snapshot.data();

        if (data.status !== "published" || data.deletedAt) {
          setEvent(null);
          setIsLoading(false);
          setError("この大会は現在公開されていません。");
          return;
        }

        setEvent(mapPublicEvent(snapshot.id, data));
        setIsLoading(false);
        setError(null);
      },
      (caughtError) => {
        console.error(caughtError);
        setError("大会情報の取得に失敗しました。時間をおいて再度お試しください。");
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [eventId]);

  const entryState = useMemo(() => (event ? getEntryState(event) : null), [event]);

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-alma-gold border-t-transparent" />
          <p className="mt-4 text-sm text-zinc-400">大会情報を読み込んでいます。</p>
        </div>
      </section>
    );
  }

  if (error || !event) {
    return (
      <section className="mx-auto w-full max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
          {error ?? "大会情報を表示できません。"}
        </div>
      </section>
    );
  }

  const heroImage = getEventImageUrl(event);
  const hasEntry = Boolean(entryState?.canEnter);
  const feeCards = [
    {
      title: "早期エントリー",
      price: event.earlyBirdPrice,
      startAt: event.earlyBirdStartAt,
      endAt: event.earlyBirdEndAt,
    },
    {
      title: "通常エントリー",
      price: event.regularPrice,
      startAt: event.regularStartAt,
      endAt: event.regularEndAt,
    },
    {
      title: "最終エントリー",
      price: event.latePrice,
      startAt: event.lateStartAt,
      endAt: event.lateEndAt,
    },
  ];
  const aboutItems = [
    {
      label: "大会コンセプト",
      value: getAboutText(
        event.aboutSection.concept,
        event.description || "緊張感とリスペクトを大切にしたブラジリアン柔術大会です。",
      ),
    },
    {
      label: "レベル",
      value: getAboutText(
        event.aboutSection.level,
        "初参加から競技経験者まで、幅広い選手に対応します。",
      ),
    },
    {
      label: "クラス",
      value: getAboutText(
        event.aboutSection.classes,
        "個人戦 / 代表者エントリーなど、大会要項に沿って受付します。",
      ),
    },
    {
      label: "雰囲気",
      value: getAboutText(
        event.aboutSection.atmosphere,
        "黒とゴールドを基調にした、静かで緊張感のある大会体験を目指しています。",
      ),
    },
    {
      label: "初参加歓迎",
      value: getAboutText(
        event.aboutSection.beginnerWelcome,
        "ルールや受付導線をわかりやすく整理し、初めての方でも申し込みしやすい構成にしています。",
      ),
      wide: true,
    },
  ];

  return (
    <div className="bg-[#050505] text-white">
      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden border-b border-white/10 bg-[#050505]">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(180deg,rgba(0,0,0,0.16),rgba(0,0,0,0.34)), url('${toCssUrl(heroImage)}')`,
            backgroundPosition: "center",
          }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 z-10 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.35),rgba(0,0,0,0.78))]" />
        <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_18%_82%,rgba(214,173,69,0.24),transparent_30%),radial-gradient(circle_at_78%_18%,rgba(214,173,69,0.1),transparent_24%),linear-gradient(90deg,rgba(0,0,0,0.84)_0%,rgba(0,0,0,0.58)_48%,rgba(0,0,0,0.2)_100%)]" />
        <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_36%,rgba(0,0,0,0.32)_76%,rgba(0,0,0,0.64)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 z-10 h-36 bg-gradient-to-b from-transparent via-[#050505]/45 to-[#050505]" />

        <div className="relative z-20 mx-auto flex min-h-[64vh] w-full max-w-[1200px] items-end px-4 py-7 sm:min-h-[68vh] sm:px-6 sm:py-9 lg:min-h-[58vh] lg:px-8 lg:py-10">
          <div className="max-w-[54rem] pb-1 sm:pb-2">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.32em] text-zinc-200/80">
              <span className="text-alma-gold">柔術大会</span>
              <span className="h-px w-8 bg-alma-gold/70" aria-hidden="true" />
              <span className="text-zinc-100/90">
                {entryState?.label ?? "受付状況"}
              </span>
            </div>

            <h1 className="mt-4 text-[clamp(2.9rem,8vw,6.6rem)] font-black uppercase leading-[0.9] text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.48)]">
              {event.title}
            </h1>

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-zinc-100/95 sm:text-base">
              <span className="inline-flex items-center gap-2.5">
                <CalendarIcon size={18} />
                {formatDate(event.eventDate)}
              </span>
              <span className="inline-flex items-center gap-2.5">
                <LocationIcon size={18} />
                {event.venue || "会場未定"}
              </span>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              {entryState?.canEnter ? (
                <Link
                  href={`/events/${event.id}/entry`}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-alma-gold px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-black shadow-[0_16px_40px_rgba(214,173,69,0.28)] transition hover:bg-[#e0be58] sm:w-auto"
                >
                  ENTRY NOW
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-md border border-white/15 bg-black/25 px-6 py-3 text-sm font-bold uppercase tracking-[0.14em] text-zinc-500 sm:w-auto"
                >
                  ENTRY CLOSED
                </button>
              )}
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">
                COPA ALMA Official Event
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-10">
            <div className="border-b border-white/10 pb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.34em] text-alma-gold/90">
                Event Details
              </p>
              <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
                大会情報
              </h2>

              <div className="mt-6 border-t border-white/10">
                <InfoLine
                  icon={<CalendarIcon size={20} />}
                  label="開催日"
                  value={formatDate(event.eventDate)}
                />
                <InfoLine
                  icon={<LocationIcon size={20} />}
                  label="会場"
                  value={event.venue || "会場未定"}
                />
                <InfoLine
                  icon={<ClockIcon size={20} />}
                  label="エントリー受付期間"
                  value={`${formatDateTime(event.entryStartAt)} - ${formatDateTime(event.entryEndAt)}`}
                />
              </div>
            </div>

            <EarlyEntryPolicyCard />

            <div className="border-b border-white/10 pb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.34em] text-alma-gold/90">
                Entry Fee
              </p>
              <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
                エントリーフィー
              </h2>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {feeCards.map((feeCard) => {
                  const isActive = isActivePeriod(feeCard.startAt, feeCard.endAt);

                  return (
                    <div
                      key={feeCard.title}
                      className={
                        isActive
                          ? "relative overflow-hidden rounded-lg border border-alma-gold/60 bg-[linear-gradient(145deg,rgba(214,173,69,0.16),rgba(255,255,255,0.04))] p-5 shadow-[0_20px_60px_rgba(214,173,69,0.12)]"
                          : "relative overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5"
                      }
                    >
                      <div
                        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-alma-gold/70 to-transparent"
                        aria-hidden="true"
                      />
                      {isActive ? (
                        <span className="inline-flex rounded-sm bg-alma-gold px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.18em] text-black">
                          現在受付中
                        </span>
                      ) : null}
                      <h3
                        className={
                          isActive
                            ? "mt-4 text-lg font-black text-white"
                            : "text-lg font-black text-white"
                        }
                      >
                        {feeCard.title}
                      </h3>
                      <p className="mt-4 text-3xl font-black text-alma-gold">
                        {formatPrice(feeCard.price)}
                      </p>
                      <p className="mt-3 text-sm font-semibold leading-6 text-zinc-300">
                        {formatPeriod(feeCard.startAt, feeCard.endAt)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {event.aboutSection.enabled ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.34em] text-alma-gold/90">
                  About the Event
                </p>
                <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
                  大会紹介
                </h2>

                <div className="mt-6 grid gap-4 rounded-3xl border border-alma-gold/20 bg-[radial-gradient(circle_at_top_left,rgba(214,173,69,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-4 sm:grid-cols-2 sm:gap-5 sm:p-5">
                  {aboutItems.map((item) => (
                    <AboutItemCard
                      key={item.label}
                      label={item.label}
                      value={item.value}
                      wide={item.wide}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24">
            <div className="rounded-2xl border border-alma-gold/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-alma-gold/90">
                <TrophyIcon size={18} />
                ENTRY NOW
              </div>
              <h2 className="mt-4 text-2xl font-black text-white">
                {hasEntry ? "エントリー受付中" : (entryState?.label ?? "受付状況")}
              </h2>
              <p className="mt-3 text-sm leading-7 text-zinc-300">
                定員に達し次第締切となります。受付期間をご確認のうえ、お早めにお申し込みください。
              </p>

              <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-zinc-500">開催日</span>
                  <span className="font-semibold text-white">
                    {formatDate(event.eventDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-zinc-500">会場</span>
                  <span className="max-w-[14rem] text-right font-semibold text-white">
                    {event.venue || "会場未定"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-zinc-500">受付</span>
                  <span className="font-semibold text-white">
                    {entryState?.label ?? "-"}
                  </span>
                </div>
              </div>

              {entryState?.canEnter ? (
                <Link
                  href={`/events/${event.id}/entry`}
                  className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-alma-gold px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#e0be58]"
                >
                  エントリーする
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="mt-6 inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-md border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-500"
                >
                  現在エントリーできません
                </button>
              )}

              <p className="mt-4 text-xs leading-6 text-zinc-500">
                受付期間外の場合はエントリー不可です。公開中であっても、受付終了後は申込できません。
              </p>
            </div>
          </aside>
        </div>
      </section>

      {entryState?.canEnter ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-alma-gold/25 bg-black/78 px-4 py-3 backdrop-blur-xl sm:hidden">
          <Link
            href={`/events/${event.id}/entry`}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-alma-gold px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_14px_34px_rgba(214,173,69,0.25)]"
          >
            ENTRY NOW
          </Link>
        </div>
      ) : null}
    </div>
  );
}
