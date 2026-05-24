import Link from "next/link";

import { CheckCircleIcon, HomeIcon, TrophyIcon } from "@/components/icons";

type EntrySuccessPageProps = {
  searchParams: Promise<{
    entry_id?: string;
  }>;
};

export default async function EntrySuccessPage({
  searchParams,
}: EntrySuccessPageProps) {
  const { entry_id: entryId } = await searchParams;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rounded-lg border border-alma-gold/25 bg-alma-charcoal p-5 shadow-2xl shadow-black/40 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-alma-gold text-black">
            <CheckCircleIcon size={30} />
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-alma-gold">
              My Page
            </p>
            <h1 className="mt-2 text-3xl font-black text-white">エントリー受付完了</h1>
          </div>
        </div>

        <p className="mt-6 text-sm leading-7 text-zinc-300 sm:text-base">
          エントリーは正常に受付されています。確認メールをご確認ください。
          大会当日の詳細は後日ご案内します。
        </p>

        {entryId ? (
          <div className="mt-6 rounded-md border border-white/10 bg-black/30 p-4">
            <p className="text-xs font-semibold text-zinc-500">受付番号</p>
            <p className="mt-1 break-all text-sm font-semibold text-white">{entryId}</p>
          </div>
        ) : null}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            href="/events"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-alma-gold px-4 py-3 text-sm font-bold text-black transition hover:bg-[#d7b760]"
          >
            <TrophyIcon size={17} />
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
