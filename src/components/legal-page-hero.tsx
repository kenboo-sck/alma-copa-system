type LegalPageHeroProps = {
  title: string;
  highlightedTitle: string;
  subtitle: string;
  maxWidth?: string;
};

export function LegalPageHero({
  title,
  highlightedTitle,
  subtitle,
  maxWidth = "max-w-[1180px]",
}: LegalPageHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(214,173,69,0.1),transparent_34%),linear-gradient(180deg,#060712_0%,#050505_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(255,255,255,0.04),transparent_24%),radial-gradient(circle_at_84%_20%,rgba(214,173,69,0.055),transparent_26%)]" />
      <div
        className={`relative mx-auto w-full ${maxWidth} px-4 pb-10 pt-12 text-center sm:px-6 sm:pb-14 sm:pt-16 lg:px-8`}
      >
        <h1 className="text-4xl font-black uppercase italic leading-none text-white sm:text-6xl">
          {title} <span className="text-alma-gold">{highlightedTitle}</span>
        </h1>
        <p className="mt-8 text-sm leading-7 text-zinc-500 sm:text-base">{subtitle}</p>
        <div className="mx-auto mt-7 h-1 w-16 bg-alma-gold" />
      </div>
    </section>
  );
}
