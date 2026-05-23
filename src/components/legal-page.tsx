import type { ReactNode } from "react";

type LegalSection = {
  heading: string;
  content: ReactNode;
};

export function LegalPage({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: LegalSection[];
}) {
  return (
    <main className="bg-[#050505] text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-alma-gold/90">
            LEGAL
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400 sm:text-base">
            {description}
          </p>
          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/8 px-4 py-3 text-sm leading-7 text-amber-100/90">
            内容は正式公開前に運営者情報へ差し替えてください。
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="grid gap-4">
            {sections.map((section) => (
              <article
                key={section.heading}
                className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] p-6"
              >
                <h2 className="text-lg font-semibold text-white">{section.heading}</h2>
                <div className="mt-4 space-y-3 text-sm leading-7 text-zinc-300 sm:text-base">
                  {section.content}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
