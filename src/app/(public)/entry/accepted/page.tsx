import Link from "next/link";

import { CheckCircleIcon, HomeIcon, TrophyIcon } from "@/components/icons";
import { EntryAcceptedDetails } from "@/features/entries/entry-accepted-details";

type EntryAcceptedPageProps = {
  searchParams: Promise<{
    entry_id?: string;
  }>;
};

// 銀行振込・現金払いの受付完了画面（お支払いは未完了）。
export default async function EntryAcceptedPage({
  searchParams,
}: EntryAcceptedPageProps) {
  const { entry_id: entryId } = await searchParams;

  return (
    <section className="mx-auto w-full max-w-3xl overflow-hidden px-4 py-7 sm:px-6 sm:py-12">
      <div className="overflow-hidden rounded-lg border border-alma-gold/25 bg-alma-charcoal shadow-2xl shadow-black/40">
        <div className="h-1 bg-alma-gold" />

        <div className="p-5 sm:p-8 lg:p-10">
          <div className="grid h-20 w-20 place-items-center rounded-full border border-alma-gold/45 bg-alma-gold text-black shadow-lg shadow-alma-gold/20 sm:h-24 sm:w-24">
            <CheckCircleIcon size={48} />
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-alma-gold">
            Entry Accepted
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-white sm:text-5xl">
            お申し込みを受け付けました
          </h1>

          <div className="mt-6">
            <EntryAcceptedDetails entryId={entryId} />
          </div>
        </div>

        <div className="border-t border-white/10 bg-black/30 p-5 sm:p-6">
          <Link
            href="/events"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-alma-gold hover:bg-alma-gold/10 sm:w-auto"
          >
            <TrophyIcon size={17} />
            大会一覧へ戻る
          </Link>
          <Link
            href="/"
            className="mt-4 flex items-center gap-2 text-xs font-semibold text-zinc-500 transition hover:text-alma-gold"
          >
            <HomeIcon size={14} />
            TOPへ戻る
          </Link>
        </div>
      </div>
    </section>
  );
}
