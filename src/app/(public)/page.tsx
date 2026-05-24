import Link from "next/link";
import type { ReactNode } from "react";

import { SiteHero } from "@/components/site-hero";
import {
  CalendarIcon,
  GiIcon,
  PaymentIcon,
  ShieldIcon,
  TrophyIcon,
  UsersIcon,
} from "@/components/icons";
import { PublicEventsList } from "@/features/events";

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] p-6 transition duration-300 hover:border-alma-gold/28 hover:shadow-[0_18px_58px_rgba(214,173,69,0.06)]">
      <div className="grid h-11 w-11 place-items-center rounded-full border border-alma-gold/35 bg-alma-gold/10 text-alma-gold">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-white sm:text-lg">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-zinc-400">{text}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="overflow-x-clip bg-[#050505] text-white">
      <SiteHero />

      <section className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div id="events" className="mt-12">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/12 to-transparent" />
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.34em] text-alma-gold/90">
                TOURNAMENTS
              </p>
              <h2 className="mt-3 text-3xl font-bold text-white">
                エントリー受付中の大会
              </h2>
            </div>
            <Link
              href="/events"
              className="hidden text-sm text-zinc-400 transition hover:text-white md:inline-flex"
            >
              すべての大会を見る →
            </Link>
          </div>

          <div className="mt-6">
            <PublicEventsList />
          </div>
        </div>
      </section>

      <section
        id="howto"
        className="relative overflow-hidden border-t border-white/10 bg-[radial-gradient(circle_at_12%_12%,rgba(214,173,69,0.08),transparent_42%),linear-gradient(180deg,#060606_0%,#040404_100%)]"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_115%,rgba(214,173,69,0.045),transparent_34%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-[1180px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-alma-gold/90">
              Entry Flow
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              エントリーの流れ
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <FeatureCard
              icon={<CalendarIcon size={24} />}
              title="大会を選ぶ"
              text="公開中の大会一覧から、参加したい大会を選びます。"
            />
            <FeatureCard
              icon={<UsersIcon size={24} />}
              title="情報を入力する"
              text="氏名、連絡先、所属、カテゴリを入力して申込を進めます。"
            />
            <FeatureCard
              icon={<PaymentIcon size={24} />}
              title="Stripeで決済する"
              text="安全なStripe Checkoutで支払いを完了します。"
            />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-white/10 bg-[radial-gradient(circle_at_86%_8%,rgba(35,57,92,0.075),transparent_38%),radial-gradient(circle_at_12%_92%,rgba(91,54,32,0.055),transparent_36%),linear-gradient(180deg,#050505_0%,#020202_100%)]">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.22)_100%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-[1180px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-alma-gold/90">
              About ALMA COPA
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              ALMA COPAとは
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
              選手が集中できる競技環境と、運営が扱いやすいエントリー基盤を両立した、
              ブラジリアン柔術大会向けのエントリーシステムです。
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <FeatureCard
              icon={<GiIcon size={24} />}
              title="本格的な競技環境"
              text="大会当日の緊張感と運営効率を損なわない導線を設計しています。"
            />
            <FeatureCard
              icon={<ShieldIcon size={24} />}
              title="すべてのレベルに対応"
              text="初心者から競技者まで、受付から決済まで迷わず進める構成です。"
            />
            <FeatureCard
              icon={<TrophyIcon size={24} />}
              title="リスペクトの精神"
              text="選手、道場、運営の三者が気持ちよく使える体験を重視しています。"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
