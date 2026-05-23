import Link from "next/link";

type EntryConfirmPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function EntryConfirmPage({ params }: EntryConfirmPageProps) {
  const { eventId } = await params;

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <p className="text-sm font-semibold text-alma-gold">エントリー確認</p>
        <h1 className="mt-2 text-3xl font-bold text-white">入力確認</h1>
        <p className="mt-3 text-zinc-400">
          エントリー情報入力後にStripe Checkoutへ進みます。
        </p>
      </div>
      <Link
        href={`/events/${eventId}/entry`}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-alma-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d7b760]"
      >
        エントリー入力へ戻る
      </Link>
    </section>
  );
}
