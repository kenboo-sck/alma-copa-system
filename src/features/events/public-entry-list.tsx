import Link from "next/link";

import {
  PUBLIC_DIVISION_LABELS,
  type PublicEntryList,
  type PublicEntryListCategory,
} from "@/lib/entries/public-entry-list";
import type { RecordDivision } from "@/lib/entries/entry-records";

type PublicEntryListViewProps = {
  entryList: PublicEntryList;
};

const DIVISION_ORDER: RecordDivision[] = ["gi", "nogi", "legacy"];

function CategoryCard({ category }: { category: PublicEntryListCategory }) {
  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))]">
      <header className="flex items-start justify-between gap-3 border-b border-alma-gold/20 bg-alma-gold/[0.06] px-4 py-3 sm:px-5">
        <h3 className="min-w-0 text-[0.95rem] font-bold leading-6 text-white sm:text-base">
          <span className="mr-2 inline-flex rounded-sm bg-alma-gold px-1.5 py-0.5 align-[0.1em] text-[0.65rem] font-black uppercase tracking-[0.12em] text-black">
            {category.divisionLabel}
          </span>
          {category.label}
        </h3>
        <span className="shrink-0 pt-0.5 text-xs font-semibold text-zinc-400">
          {category.athletes.length}名
        </span>
      </header>
      <ol className="divide-y divide-white/[0.06]">
        {category.athletes.map((athlete, index) => (
          <li
            key={`${index}-${athlete.name}`}
            className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 px-4 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:px-5"
          >
            <span className="text-sm font-semibold tabular-nums text-zinc-500">
              {index + 1}
            </span>
            <span className="min-w-0 break-words text-[0.95rem] font-semibold text-white">
              {athlete.name}
            </span>
            <span className="col-start-2 min-w-0 break-words text-sm text-zinc-400 sm:col-start-3">
              {athlete.gym || "所属なし"}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function PublicEntryListView({ entryList }: PublicEntryListViewProps) {
  const sections = DIVISION_ORDER.map((division) => ({
    division,
    label: PUBLIC_DIVISION_LABELS[division],
    categories: entryList.categories.filter(
      (category) => category.division === division,
    ),
  })).filter((section) => section.categories.length > 0);

  return (
    <div className="bg-[#050505] text-white">
      <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(214,173,69,0.1),transparent_34%),linear-gradient(180deg,#060712_0%,#050505_100%)]">
        <div className="relative mx-auto w-full max-w-[1000px] px-4 pb-10 pt-12 text-center sm:px-6 sm:pb-12 sm:pt-16 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-alma-gold/90">
            Entry List
          </p>
          <h1 className="mt-4 break-words text-3xl font-black leading-tight text-white sm:text-5xl">
            {entryList.eventTitle}
          </h1>
          <p className="mt-4 text-base font-bold text-zinc-200 sm:text-lg">
            エントリーリスト
          </p>
          <div className="mx-auto mt-6 h-1 w-16 bg-alma-gold" />
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1000px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/events/${entryList.eventId}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-alma-gold transition hover:text-[#e0be58]"
          >
            <span aria-hidden="true">←</span>
            大会詳細へ戻る
          </Link>
          {entryList.categories.length > 0 ? (
            <p className="text-sm text-zinc-400">
              {entryList.categories.length}カテゴリー / {entryList.athleteCount}名
            </p>
          ) : null}
        </div>

        {sections.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-10 text-center">
            <p className="text-base font-semibold text-white">
              現在、掲載できるエントリーはありません。
            </p>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              受付済みのエントリーがあると、カテゴリー別にここへ掲載されます。
            </p>
          </div>
        ) : (
          <>
            {sections.length > 1 ? (
              <nav
                aria-label="部門"
                className="mt-6 flex flex-wrap gap-2 border-y border-white/10 py-4"
              >
                {sections.map((section) => (
                  <a
                    key={section.division}
                    href={`#division-${section.division}`}
                    className="inline-flex min-h-10 items-center rounded-md border border-alma-gold/40 px-4 text-sm font-bold text-alma-gold transition hover:bg-alma-gold/10"
                  >
                    {section.label}
                    <span className="ml-2 text-xs font-semibold text-zinc-400">
                      {section.categories.length}
                    </span>
                  </a>
                ))}
              </nav>
            ) : null}

            <div className="mt-8 space-y-12">
              {sections.map((section) => (
                <section
                  key={section.division}
                  id={`division-${section.division}`}
                  className="scroll-mt-24"
                >
                  <h2 className="flex items-center gap-3 text-2xl font-black text-white sm:text-3xl">
                    <span className="h-6 w-1 bg-alma-gold" aria-hidden="true" />
                    {section.label}
                  </h2>
                  <div className="mt-5 space-y-4">
                    {section.categories.map((category) => (
                      <CategoryCard key={category.key} category={category} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}

        <p className="mt-10 text-xs leading-6 text-zinc-500">
          受付済みのエントリーを掲載しています。内容は申込の変更・取消に応じて更新されます。
        </p>
      </section>
    </div>
  );
}
