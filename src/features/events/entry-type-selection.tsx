"use client";

import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import {
  ArrowRightIcon,
  ShieldIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";

type EntryTypeSelectionProps = {
  eventId: string;
};

const fallbackHeroImage = "/images/event-detail-hero.jpg";

const entryOptions = [
  {
    hrefSuffix: "individual",
    label: "個人エントリー",
    lead: "本人1名で参加",
    description:
      "1名のみ参加する方向け。自分自身の選手情報を入力して、シンプルに申し込みます。",
    cta: "個人で進む",
    icon: UserIcon,
    points: ["1名のみ参加", "自分自身の情報", "シンプル申込"],
    variant: "gold",
  },
  {
    hrefSuffix: "representative",
    label: "代表者エントリー",
    lead: "チームでまとめて参加",
    description:
      "道場・チーム単位で複数選手を一括登録。代表者情報と選手情報を分けて入力します。",
    cta: "代表者として進む",
    icon: UsersIcon,
    points: ["複数選手を登録", "道場・チーム向け", "代表者が管理"],
    variant: "outline",
  },
] as const;

function toCssUrl(imageUrl: string) {
  return imageUrl.replace(/'/g, "\\'");
}

export function EntryTypeSelection({ eventId }: EntryTypeSelectionProps) {
  const [heroImage, setHeroImage] = useState(fallbackHeroImage);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, collections.events, eventId), (snapshot) => {
      const nextHeroImage = snapshot.data()?.heroImage;

      setHeroImage(
        typeof nextHeroImage === "string" && nextHeroImage
          ? nextHeroImage
          : fallbackHeroImage,
      );
    });

    return unsubscribe;
  }, [eventId]);

  return (
    <main className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[#050505] text-white">
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_18%_34%,rgba(214,173,69,0.12),transparent_24%),radial-gradient(circle_at_82%_68%,rgba(214,173,69,0.08),transparent_22%),linear-gradient(180deg,#050505_0%,#090909_42%,#030303_100%)]"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.14)_1px,transparent_1px)] bg-[size:58px_58px]"
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-black"
        aria-hidden="true"
      />

      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(180deg,rgba(0,0,0,0.16),rgba(0,0,0,0.5)), url('${toCssUrl(heroImage)}')`,
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_18%_82%,rgba(214,173,69,0.18),transparent_28%),linear-gradient(90deg,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.74)_36%,rgba(0,0,0,0.28)_72%,rgba(0,0,0,0.12)_100%)]"
          aria-hidden="true"
        />
        <div
          className="absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-b from-transparent to-[#050505]"
          aria-hidden="true"
        />

        <div className="relative z-20 mx-auto flex min-h-[30vh] w-full max-w-[1200px] items-end px-4 py-8 sm:min-h-[34vh] sm:px-6 sm:py-10 lg:min-h-[38vh] lg:px-8 lg:py-11">
          <div className="max-w-[38rem]">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.54em] text-alma-gold">
              ENTRY
            </p>
            <h1 className="mt-5 text-[clamp(1.9rem,4.6vw,3.9rem)] font-black uppercase leading-[0.95] tracking-[0.12em] text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.5)]">
              ENTER THE STAGE
            </h1>
            <p className="mt-5 max-w-md text-sm font-semibold leading-7 text-zinc-200 sm:text-base">
              参加方法を選択してください。
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-alma-gold/90">
              Choose Your Path
            </p>
            <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">
              出場スタイルを選ぶ
            </h2>
          </div>
          <p className="max-w-md text-sm leading-7 text-zinc-400">
            個人で素早く申し込むか、代表者としてチームをまとめて登録するかを選択できます。
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {entryOptions.map((option) => {
            const Icon = option.icon;
            const isGold = option.variant === "gold";

            return (
              <Link
                key={option.hrefSuffix}
                href={`/events/${eventId}/entry/${option.hrefSuffix}`}
                className="group relative flex min-h-[360px] overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-1 hover:border-alma-gold/60 hover:shadow-[0_30px_90px_rgba(214,173,69,0.12)] sm:p-7"
              >
                <div
                  className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(214,173,69,0.16),transparent_26%),linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.28)_100%)] opacity-75 transition group-hover:opacity-100"
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-alma-gold/70 to-transparent opacity-60"
                  aria-hidden="true"
                />
                <div
                  className="absolute -right-14 -top-14 h-44 w-44 rounded-full border border-alma-gold/20"
                  aria-hidden="true"
                />

                <div className="relative flex w-full flex-col">
                  <div className="flex items-start justify-between gap-5">
                    <div className="grid h-14 w-14 place-items-center rounded-md border border-alma-gold/35 bg-alma-gold/10 text-alma-gold shadow-[0_14px_40px_rgba(214,173,69,0.12)]">
                      <Icon size={28} />
                    </div>
                    <ArrowRightIcon
                      size={24}
                      className="mt-2 text-zinc-500 transition group-hover:translate-x-1 group-hover:text-alma-gold"
                    />
                  </div>

                  <div className="mt-8">
                    <p className="text-xs font-bold uppercase tracking-[0.32em] text-alma-gold/90">
                      {option.lead}
                    </p>
                    <h3 className="mt-3 text-3xl font-black text-white sm:text-4xl">
                      {option.label}
                    </h3>
                    <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-300 sm:text-base">
                      {option.description}
                    </p>
                  </div>

                  <div className="mt-7 flex flex-wrap gap-2">
                    {option.points.map((point) => (
                      <span
                        key={point}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/28 px-3 py-1.5 text-xs font-semibold text-zinc-300"
                      >
                        <ShieldIcon size={14} className="text-alma-gold" />
                        {point}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto pt-8">
                    <span
                      className={
                        isGold
                          ? "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-alma-gold px-5 py-3 text-sm font-black text-black shadow-[0_14px_34px_rgba(214,173,69,0.22)] transition group-hover:bg-[#e0be58] sm:w-auto"
                          : "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-alma-gold/55 bg-black/24 px-5 py-3 text-sm font-black text-alma-gold transition group-hover:bg-alma-gold group-hover:text-black sm:w-auto"
                      }
                    >
                      {option.cta}
                      <ArrowRightIcon size={17} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-10 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.26em] text-zinc-500">
          <TrophyIcon size={18} className="text-alma-gold" />
          ALMA COPA Tournament Entry
        </div>
      </section>
    </main>
  );
}
