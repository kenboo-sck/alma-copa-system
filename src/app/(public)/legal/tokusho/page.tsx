import { LegalPage } from "@/components/legal-page";

export default function TokushoPage() {
  return (
    <LegalPage
      title="特定商取引法に基づく表記"
      description="ALMA COPA Entry System における特定商取引法に基づく表記です。正式公開前の仮文言として掲載しています。"
      sections={[
        {
          heading: "販売事業者",
          content: <p>ALMA COPA 運営事務局</p>,
        },
        {
          heading: "運営責任者",
          content: <p>運営責任者名は正式公開時に差し替えてください。</p>,
        },
        {
          heading: "所在地",
          content: <p>所在地は正式公開時に差し替えてください。</p>,
        },
        {
          heading: "電話番号",
          content: <p>電話番号は正式公開時に差し替えてください。</p>,
        },
        {
          heading: "メールアドレス",
          content: <p>info@alma-copa.jp（仮）</p>,
        },
        {
          heading: "販売価格",
          content: <p>各大会ページおよびエントリーフォームに表示される参加費用をご確認ください。</p>,
        },
        {
          heading: "商品代金以外の必要料金",
          content: <p>通信料、振込手数料、その他必要な決済手数料が発生する場合があります。</p>,
        },
        {
          heading: "支払方法",
          content: <p>クレジットカード決済（Stripe）を予定しています。</p>,
        },
        {
          heading: "支払時期",
          content: <p>エントリー手続き時に決済を行います。</p>,
        },
        {
          heading: "サービス提供時期",
          content: <p>大会開催日および運営側が定める受付期間内に提供します。</p>,
        },
        {
          heading: "キャンセル・返金について",
          content: <p>キャンセル条件および返金可否は大会ごとの案内に従います。決済完了後の返金可否は運営規定に準拠します。</p>,
        },
        {
          heading: "表現および商品に関する注意書き",
          content: <p>掲載内容は仮文言を含みます。正式な運営情報、金額、条件は公開時に確定情報へ差し替えてください。</p>,
        },
      ]}
    />
  );
}
