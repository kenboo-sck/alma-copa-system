import Link from "next/link";

import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  HomeIcon,
  ShieldIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
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

function formatDisplayEntryNumber(entryId?: string) {
  if (!entryId) {
    return "ENTRY------";
  }

  return `ENTRY-${entryId.slice(0, 6).toUpperCase()}`;
}

const nextSteps = [
  { label: "確認メール受信", icon: CheckCircleIcon },
  { label: "大会情報を後日メールで案内", icon: CalendarIcon },
  { label: "当日受付", icon: UsersIcon },
  { label: "試合開始", icon: TrophyIcon },
];

const myPageItems = ["エントリー情報", "決済状況", "ゼッケン", "QR受付", "計量情報"];

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
  const displayEntryNumber = formatDisplayEntryNumber(entryId);

  return (
    <section className="mx-auto w-full max-w-5xl overflow-hidden px-4 py-7 sm:px-6 sm:py-12">
      <div className="overflow-hidden rounded-lg border border-alma-gold/25 bg-alma-charcoal shadow-2xl shadow-black/40">
        <div className="h-1 bg-alma-gold" />

        <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8 lg:p-10">
          <div>
            <div className="grid h-20 w-20 place-items-center rounded-full border border-alma-gold/45 bg-alma-gold text-black shadow-lg shadow-alma-gold/20 sm:h-24 sm:w-24">
              <CheckCircleIcon size={48} />
            </div>

            <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-alma-gold">
              Entry Accepted
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-white sm:text-5xl">
              エントリーありがとうございます
            </h1>

            <p className="mt-6 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
              お申し込みと決済が正常に完了しました。
              <br className="hidden sm:block" />
              確認メールを送信しておりますのでご確認ください。
            </p>

            <div className="mt-6 rounded-lg border border-alma-gold/20 bg-alma-gold/10 p-4">
              <div className="flex gap-3">
                <ShieldIcon size={22} className="mt-0.5 shrink-0 text-alma-gold" />
                <div>
                  <p className="text-sm font-bold text-white">
                    確認メールを送信しました。
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    届かない場合は迷惑メールフォルダをご確認ください。
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-4">
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
              <div className="rounded-md border border-alma-gold/20 bg-alma-gold/10 p-3">
                <dt className="text-xs font-semibold text-alma-gold">受付番号</dt>
                <dd className="mt-2 break-all font-mono text-xl font-black tracking-wide text-white sm:text-2xl">
                  {displayEntryNumber}
                </dd>
                <p className="mt-2 break-all text-xs leading-5 text-zinc-500">
                  内部ID: {entryId || "-"}
                </p>
              </div>

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

        <div className="grid gap-5 border-t border-white/10 bg-black/20 p-5 sm:p-6 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <h2 className="text-lg font-black text-white">今後の流れ</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {nextSteps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <div
                    key={step.label}
                    className="flex min-h-16 items-center gap-3 rounded-md border border-white/10 bg-black/25 p-3"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-alma-gold text-black">
                      <Icon size={19} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-alma-gold">
                        STEP {index + 1}
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-white">
                        {step.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/25 p-4">
            <div className="flex items-center gap-3">
              <UserIcon size={22} className="text-alma-gold" />
              <div>
                <h2 className="text-lg font-black text-white">マイページ</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  マイページから以下を確認できます。
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {myPageItems.map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-zinc-200"
                >
                  {item}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              一部機能は今後対応予定です。
            </p>
          </div>
        </div>

        <div className="border-t border-white/10 bg-black/30 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
            <Link
              href={myPageHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-alma-gold px-4 py-3 text-sm font-bold text-black transition hover:bg-[#d7b760]"
            >
              マイページを開く
              <ArrowRightIcon size={17} />
            </Link>
            <Link
              href="/events"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-alma-gold hover:bg-alma-gold/10"
            >
              <TrophyIcon size={17} />
              大会一覧へ戻る
            </Link>
          </div>
          <Link
            href="/"
            className="mt-4 inline-flex items-center justify-center gap-2 text-xs font-semibold text-zinc-500 transition hover:text-alma-gold"
          >
            <HomeIcon size={14} />
            TOPへ戻る
          </Link>
        </div>
      </div>
    </section>
  );
}
