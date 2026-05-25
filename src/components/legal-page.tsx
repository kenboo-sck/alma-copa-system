import type { ReactNode } from "react";

import { LegalPageHero } from "@/components/legal-page-hero";

type LegalSection = {
  heading: string;
  content: ReactNode;
};

export function LegalPage({
  title,
  heroTitle,
  highlightedHeroTitle,
  sections,
}: {
  title: string;
  heroTitle: string;
  highlightedHeroTitle: string;
  sections: LegalSection[];
}) {
  return (
    <main className="bg-[#050505] text-white">
      <LegalPageHero
        title={heroTitle}
        highlightedTitle={highlightedHeroTitle}
        subtitle={title}
      />

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
