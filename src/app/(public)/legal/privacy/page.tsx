import type { Metadata } from "next";
import type { ReactNode } from "react";

type PrivacySection = {
  title: string;
  content: ReactNode;
};

const privacySections: PrivacySection[] = [
  {
    title: "1. 個人情報の収集目的",
    content: (
      <div className="space-y-4">
        <p>収集した個人情報は、以下の目的のためにのみ利用いたします。</p>
        <ul className="space-y-2 pl-4">
          <li>大会のトーナメント表（ブラケット）作成および対戦カードの決定</li>
          <li>大会会場での進行、結果の公表、および公式ウェブサイト等への掲載</li>
          <li>参加費の入金確認および関連する事務連絡</li>
          <li>怪我や事故、不測の事態が発生した際の緊急連絡</li>
        </ul>
      </div>
    ),
  },
  {
    title: "2. 収集する項目",
    content: (
      <p>
        氏名、所属チーム、性別、年齢、カテゴリー、電話番号、メールアドレス等、エントリーフォームに入力された情報を収集します。
      </p>
    ),
  },
  {
    title: "3. 公開について",
    content: (
      <div className="space-y-4">
        <p>
          大会運営の性質上、以下の情報はインターネット上（公式HP、エントリーリスト、トーナメント表）および大会会場にて一般に公開されます。
          予めご了承ください。
        </p>
        <ul className="space-y-2 pl-4">
          <li>氏名</li>
          <li>所属チーム</li>
          <li>カテゴリー、階級および試合結果</li>
          <li>大会中に撮影された写真および動画</li>
        </ul>
      </div>
    ),
  },
  {
    title: "4. 第三者への提供",
    content: (
      <p>
        法令に基づく場合や、本人または公衆の生命・財産の保護のために必要な場合を除き、収集した個人情報を第三者に提供することはありません。
      </p>
    ),
  },
  {
    title: "5. お問い合わせ",
    content: (
      <p>個人情報の取り扱いに関するお問い合わせは、大会事務局までお願いいたします。</p>
    ),
  },
];

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description:
    "COPA ALMA CAGE SAPPORO 実行委員会による、参加者の個人情報の取り扱いに関するプライバシーポリシーです。",
};

export default function PrivacyPage() {
  return (
    <main className="bg-[#050505] text-white">
      <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(214,173,69,0.1),transparent_34%),linear-gradient(180deg,#060712_0%,#050505_100%)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(255,255,255,0.04),transparent_24%),radial-gradient(circle_at_84%_20%,rgba(214,173,69,0.055),transparent_26%)]" />
        <div className="relative mx-auto w-full max-w-[1180px] px-4 pb-10 pt-12 text-center sm:px-6 sm:pb-14 sm:pt-16 lg:px-8">
          <h1 className="text-4xl font-black uppercase italic leading-none text-white sm:text-6xl">
            PRIVACY <span className="text-alma-gold">POLICY</span>
          </h1>
          <p className="mt-8 text-sm leading-7 text-zinc-500 sm:text-base">
            プライバシーポリシー（個人情報の取り扱いについて）
          </p>
          <div className="mx-auto mt-7 h-1 w-16 bg-alma-gold" />
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
          <article className="rounded-3xl border border-white/10 bg-[linear-gradient(145deg,rgba(22,26,44,0.68),rgba(8,10,20,0.9))] px-5 py-8 shadow-2xl shadow-black/35 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
            <p className="text-sm leading-8 text-zinc-200 sm:text-base">
              「COPA ALMA CAGE SAPPORO
              実行委員会」（以下、「当委員会」といいます）は、本大会の運営にあたり、参加者の個人情報を適切に保護し、取り扱うことをお約束いたします。
            </p>

            <div className="mt-10 space-y-10">
              {privacySections.map((section) => (
                <section key={section.title}>
                  <h2 className="border-l-4 border-alma-gold pl-4 text-xl font-black leading-8 text-white sm:text-2xl">
                    {section.title}
                  </h2>
                  <div className="mt-5 space-y-3 text-sm leading-8 text-zinc-200 sm:text-base">
                    {section.content}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-14 text-right text-sm leading-8 text-zinc-500">
              <p>2026年3月4日 制定</p>
              <p>COPA ALMA CAGE SAPPORO 実行委員会</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
