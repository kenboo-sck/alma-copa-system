import Link from "next/link";

import {
  CalendarIcon,
  CheckCircleIcon,
  HomeIcon,
  TrophyIcon,
  UserIcon,
} from "@/components/icons";
import { PaymentSuccessStatus } from "@/features/payments";

type PaymentSuccessPageProps = {
  searchParams: Promise<{
    entry_id?: string;
    session_id?: string;
    applicant_name?: string;
    applicant_email?: string;
    event_id?: string;
    event_title?: string;
    entry_type?: "individual" | "representative";
  }>;
};

function getEntryTypeLabel(entryType?: "individual" | "representative") {
  if (entryType === "individual") {
    return "個人エントリー";
  }

  if (entryType === "representative") {
    return "代表者エントリー";
  }

  return "未指定";
}

function formatAcceptedAt(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function PaymentSuccessPage({
  searchParams,
}: PaymentSuccessPageProps) {
  const {
    entry_id: entryId,
    session_id: sessionId,
    applicant_email: applicantEmail,
    applicant_name: applicantName,
    event_id: eventId,
    event_title: eventTitle,
    entry_type: entryType,
  } = await searchParams;
  const acceptedAt = formatAcceptedAt(new Date());
  const myPageHref = entryId
    ? `/entry/success?entry_id=${encodeURIComponent(entryId)}`
    : "/entry/success";

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="overflow-hidden rounded-lg border border-alma-gold/25 bg-alma-charcoal shadow-2xl shadow-black/40">
        <div className="h-1 bg-alma-gold" />

        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:p-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-alma-gold/40 bg-alma-gold/10 px-3 py-1.5 text-xs font-bold text-alma-gold">
              <CheckCircleIcon size={15} />
              完了
            </div>

            <div className="mt-6 flex items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-alma-gold/45 bg-alma-gold text-black shadow-lg shadow-alma-gold/20 sm:h-16 sm:w-16">
                <CheckCircleIcon size={32} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-alma-gold">
                  Entry Accepted
                </p>
                <h1 className="mt-2 text-3xl font-black leading-tight text-white sm:text-5xl">
                  エントリー受付完了
                </h1>
              </div>
            </div>

            <p className="mt-6 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
              確認メールを送信しました。大会当日の詳細は後日ご案内します。
              <br className="hidden sm:block" />
              ALMA COPA運営にて、エントリー内容をしっかり受付いたしました。
            </p>

            <div className="mt-6 rounded-lg border border-white/10 bg-black/25 p-4">
              <PaymentSuccessStatus
                entryId={entryId}
                sessionId={sessionId}
                applicantEmail={applicantEmail}
                applicantName={applicantName}
                eventId={eventId}
                eventTitle={eventTitle}
                entryType={entryType}
              />
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/35 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-alma-gold">
                  Receipt
                </p>
                <h2 className="mt-1 text-lg font-bold text-white">受付内容</h2>
              </div>
              <span className="rounded-full bg-alma-gold px-3 py-1 text-xs font-bold text-black">
                受付完了
              </span>
            </div>

            <dl className="mt-4 space-y-4">
              <div className="flex gap-3 rounded-md bg-white/[0.04] p-3">
                <UserIcon size={20} className="mt-0.5 shrink-0 text-alma-gold" />
                <div>
                  <dt className="text-xs font-semibold text-zinc-500">氏名</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-white">
                    {applicantName || "-"}
                  </dd>
                </div>
              </div>

              <div className="flex gap-3 rounded-md bg-white/[0.04] p-3">
                <TrophyIcon size={20} className="mt-0.5 shrink-0 text-alma-gold" />
                <div>
                  <dt className="text-xs font-semibold text-zinc-500">大会名</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-white">
                    {eventTitle || "-"}
                  </dd>
                </div>
              </div>

              <div className="flex gap-3 rounded-md bg-white/[0.04] p-3">
                <CheckCircleIcon size={20} className="mt-0.5 shrink-0 text-alma-gold" />
                <div>
                  <dt className="text-xs font-semibold text-zinc-500">申込区分</dt>
                  <dd className="mt-1 text-sm font-semibold text-white">
                    {getEntryTypeLabel(entryType)}
                  </dd>
                </div>
              </div>

              <div className="flex gap-3 rounded-md bg-white/[0.04] p-3">
                <CalendarIcon size={20} className="mt-0.5 shrink-0 text-alma-gold" />
                <div>
                  <dt className="text-xs font-semibold text-zinc-500">受付日時</dt>
                  <dd className="mt-1 text-sm font-semibold text-white">
                    {acceptedAt}
                  </dd>
                </div>
              </div>
            </dl>
          </div>
        </div>

        <div className="grid gap-3 border-t border-white/10 bg-black/25 p-5 sm:grid-cols-3 sm:p-6">
          <Link
            href={myPageHref}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-alma-gold px-4 py-3 text-sm font-bold text-black transition hover:bg-[#d7b760]"
          >
            マイページを見る
          </Link>
          <Link
            href="/events"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-alma-gold hover:bg-alma-gold/10"
          >
            大会一覧へ戻る
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-alma-gold hover:bg-alma-gold/10"
          >
            <HomeIcon size={17} />
            TOPへ戻る
          </Link>
        </div>
      </div>
    </section>
  );
}
