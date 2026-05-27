"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SiteLogo } from "@/components/site-logo";

function useParallaxOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      return undefined;
    }

    let frame = 0;

    const updateOffset = () => {
      const scrollY = window.scrollY;
      const nextOffset = Math.min(scrollY * 0.12, 56);
      setOffset(nextOffset);
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateOffset);
    };

    updateOffset();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return offset;
}

export function SiteHero() {
  const offset = useParallaxOffset();

  return (
    <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden border-b border-white/10 bg-[#050505]">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.32)), url('/images/entry-select-hero.png')",
          transform: `translate3d(0, ${offset * 0.25}px, 0) scale(1.08)`,
          backgroundPosition: "center 28%",
          willChange: "transform",
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.32)_40%,rgba(5,5,5,0.88)_100%)]" />
      <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_18%_82%,rgba(214,173,69,0.22),transparent_28%),radial-gradient(circle_at_84%_18%,rgba(214,173,69,0.12),transparent_22%),linear-gradient(90deg,rgba(0,0,0,0.82)_0%,rgba(0,0,0,0.62)_46%,rgba(0,0,0,0.18)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-b from-transparent to-[#050505]" />

      <div className="relative z-20 mx-auto flex min-h-[58vh] w-full max-w-[1180px] items-end px-4 py-7 sm:min-h-[64vh] sm:px-6 sm:py-9 lg:min-h-[58vh] lg:px-8 lg:py-10">
        <div className="max-w-[46rem] pb-1 sm:pb-2">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-white/12 bg-black/30 p-2.5 backdrop-blur sm:h-24 sm:w-24 sm:p-3">
              <SiteLogo className="max-h-12 w-full sm:max-h-20" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.42em] text-alma-gold/90 sm:text-xs">
                COPA ALMA Entry System
              </p>
              <h1 className="sr-only">COPA ALMA</h1>
              <p className="mt-2 text-[clamp(2rem,7vw,5.4rem)] font-black uppercase leading-[0.9] text-white">
                COPA ALMA
              </p>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-[clamp(1.1rem,2.6vw,2.6rem)] font-black uppercase leading-[1.05] tracking-[0.06em] text-alma-gold">
            TEST YOUR TECHNIQUE.
          </p>
          <p className="mt-1.5 max-w-2xl text-[clamp(0.95rem,2vw,1.8rem)] font-semibold uppercase leading-[1.08] tracking-[0.05em] text-zinc-100/95">
            ELEVATE YOUR JIU-JITSU.
          </p>
          <p className="mt-4 max-w-xl break-all text-sm leading-7 text-zinc-300 sm:break-words sm:text-base sm:leading-8">
            すべての挑戦者に、最高の舞台を。
            COPA ALMAは、ブラジリアン柔術の緊張感とリスペクトを体現する大会エントリーサイトです。
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#events"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-alma-gold px-5 py-3 text-sm font-semibold text-black shadow-[0_12px_34px_rgba(214,173,69,0.22)] transition hover:bg-[#e0be58]"
            >
              大会を探す
            </Link>
            <Link
              href="#howto"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/18 bg-black/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-alma-gold hover:bg-alma-gold/10"
            >
              エントリーの流れ
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
