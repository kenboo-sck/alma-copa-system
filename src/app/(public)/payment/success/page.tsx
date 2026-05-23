import Link from "next/link";

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

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-2xl shadow-black/30 sm:p-8">
        <p className="text-sm font-semibold text-alma-gold">決済完了</p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
          お支払いが完了しました
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
          Stripe Checkout の結果を確認し、エントリーの決済状態を更新します。
          <br />
          エントリー内容をメールで送信しました。
          <br />
          メールが届かない場合は、迷惑メールフォルダもご確認ください。
        </p>

        <div className="mt-6">
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

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-alma-gold px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#d7b760]"
          >
            トップページへ戻る
          </Link>
          {eventId ? (
            <Link
              href={`/events/${eventId}`}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-alma-gold hover:bg-alma-gold/10"
            >
              大会詳細へ戻る
            </Link>
          ) : (
            <Link
              href="/events"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-alma-gold hover:bg-alma-gold/10"
            >
              大会一覧へ戻る
            </Link>
          )}
          {eventId ? (
            <Link
              href={`/events/${eventId}/confirm`}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-alma-gold hover:bg-alma-gold/10 sm:col-span-2 lg:col-span-1"
            >
              申込内容の確認へ
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
