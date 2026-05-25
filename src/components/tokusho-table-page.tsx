import type { ReactNode } from "react";

import { LegalPageHero } from "@/components/legal-page-hero";

type TokushoRow = {
  label: string;
  content: ReactNode;
};

const tokushoRows: TokushoRow[] = [
  {
    label: "販売業者（イベント主催者）",
    content: <p>株式会社マーシャルワールドジャパン</p>,
  },
  {
    label: "運営責任者",
    content: <p>江崎 寿</p>,
  },
  {
    label: "所在地",
    content: <p>〒001-0907 北海道札幌市北区新琴似7条9-5-15 七番街ビル2F</p>,
  },
  {
    label: "電話番号",
    content: <p>011-776-6830</p>,
  },
  {
    label: "メールアドレス",
    content: <p>ezaki@mwjapan.jp</p>,
  },
  {
    label: "販売価格（参加費）",
    content: <p>各大会エントリーページ・詳細ページに記載されている金額とします。</p>,
  },
  {
    label: "商品代金以外の必要料金",
    content: (
      <ul className="list-disc space-y-2 pl-5">
        <li>インターネット接続に必要な通信料は、お客様のご負担となります。</li>
        <li>銀行振込をご利用の場合、振込手数料はお客様のご負担となります。</li>
        <li>
          クレジットカード決済に関する手数料は、別途表示がない限り当方負担とします。
        </li>
      </ul>
    ),
  },
  {
    label: "お支払い方法",
    content: (
      <ul className="list-disc space-y-2 pl-5">
        <li>クレジットカード決済</li>
      </ul>
    ),
  },
  {
    label: "お支払い時期",
    content: (
      <ul className="list-disc space-y-2 pl-5">
        <li>クレジットカード決済：お申込み時に決済処理が行われます。</li>
      </ul>
    ),
  },
  {
    label: "申込みの成立時期",
    content: (
      <p>
        お客様による申込み手続き完了後、当方にて決済確認または入金確認が取れた時点で、申込み成立とします。
        なお、申込み内容に不備がある場合は、受付完了とならない場合があります。
      </p>
    ),
  },
  {
    label: "役務の提供時期",
    content: (
      <div className="space-y-3">
        <p>申込み成立後、大会当日に大会参加に関する役務を提供します。</p>
        <p>
          大会当日の集合時間、組み合わせ、試合順その他の詳細については、当サイトまたは当方からの案内にて告知いたします。
        </p>
      </div>
    ),
  },
  {
    label: "キャンセル・返金について",
    content: (
      <div className="space-y-3">
        <p>
          申込み成立後のお客様都合によるキャンセル、返金は原則としてお受けしておりません。
        </p>
        <p>ただし、以下の場合はこの限りではありません。</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>主催者都合により大会が中止となった場合</li>
          <li>当方が返金対象と判断した場合</li>
        </ul>
        <p>
          主催者都合による中止の場合の返金方法および返金額については、当サイト上または電子メール等にてご案内いたします。
          なお、天災、災害、感染症拡大、交通機関の乱れ、行政機関の要請その他の不可抗力により大会の開催が困難となった場合の対応については、個別に定める大会規定または当方の告知内容に従うものとします。
        </p>
      </div>
    ),
  },
  {
    label: "カテゴリー変更・修正について",
    content: (
      <p>
        申込締切前で、かつ当方が対応可能と判断した場合に限り、申込内容の修正またはカテゴリー変更を受け付ける場合があります。
        ただし、申込締切後の変更については原則としてお受けできません。
      </p>
    ),
  },
  {
    label: "大会の変更・中止について",
    content: (
      <p>
        主催者の判断により、開催日、会場、カテゴリー、階級、試合形式、ルール、スケジュールその他大会運営に関する内容を変更する場合があります。
        また、参加人数その他の事情により、カテゴリーの統合または一部カテゴリーの中止を行う場合があります。
      </p>
    ),
  },
  {
    label: "サービス提供条件",
    content: (
      <p>
        大会への参加には、各大会ページに記載された参加資格、ルール、申込条件を満たしている必要があります。
        参加資格を満たしていないことが判明した場合、申込み成立後であっても受付を取り消す場合があります。
      </p>
    ),
  },
  {
    label: "免責事項",
    content: (
      <p>
        大会中および会場内で発生した事故、怪我、盗難、紛失、通信障害、交通事情その他のトラブルについて、当方は故意または重大な過失がある場合を除き、責任を負いかねます。
        参加者は、主催者が別途定める大会規約、注意事項、ルールを理解し、自己の責任において参加するものとします。
      </p>
    ),
  },
  {
    label: "表現およびサービスに関する注意書き",
    content: (
      <p>
        掲載されている大会情報、スケジュール、対戦形式、提供内容等は、運営上の都合により変更となる場合があります。
        最新情報は当サイト上の案内をご確認ください。
      </p>
    ),
  },
];

export function TokushoTablePage() {
  return (
    <main className="bg-[#050505] text-white">
      <LegalPageHero
        title="LEGAL"
        highlightedTitle="NOTICE"
        subtitle="特定商取引法に基づく表記"
        maxWidth="max-w-[1280px]"
      />

      <section>
        <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))] shadow-2xl shadow-black/30">
            <table className="w-full border-collapse text-left">
              <tbody className="divide-y divide-white/10">
                {tokushoRows.map((row) => (
                  <tr
                    key={row.label}
                    className="grid bg-black/10 sm:table-row sm:bg-transparent"
                  >
                    <th className="border-white/10 bg-alma-gold/[0.08] px-4 py-4 text-left align-top text-sm font-semibold leading-7 text-alma-gold sm:w-[30%] sm:border-r sm:px-6 sm:py-5 lg:w-[280px]">
                      {row.label}
                    </th>
                    <td className="px-4 pb-5 pt-0 align-top text-sm leading-8 text-zinc-200 sm:px-6 sm:py-5 sm:text-[15px]">
                      <div className="max-w-4xl space-y-3">{row.content}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
