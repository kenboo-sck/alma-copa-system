import { LegalPage } from "@/components/legal-page";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="プライバシーポリシー"
      description="ALMA COPA Entry System における個人情報の取り扱い方針です。正式公開前の仮文言として掲載しています。"
      sections={[
        {
          heading: "個人情報の取得",
          content: <p>大会エントリー、問い合わせ、管理運営のために、氏名、メールアドレス、電話番号等の情報を取得します。</p>,
        },
        {
          heading: "利用目的",
          content: <p>エントリー受付、本人確認、決済処理、連絡、運営管理、問い合わせ対応のために利用します。</p>,
        },
        {
          heading: "第三者提供",
          content: <p>法令に基づく場合を除き、本人の同意なく第三者へ提供しません。</p>,
        },
        {
          heading: "決済情報の取り扱い",
          content: <p>クレジットカード情報はStripeなどの外部決済事業者が処理し、当サイトでは必要最小限の情報のみ保持します。</p>,
        },
        {
          heading: "外部サービスの利用",
          content: <p>Firebase、Stripe、メール送信サービスなどの外部サービスを利用する場合があります。各サービスの規約やポリシーにも従います。</p>,
        },
        {
          heading: "安全管理",
          content: <p>個人情報への不正アクセス、紛失、漏えいを防止するため、適切な管理措置を講じます。</p>,
        },
        {
          heading: "お問い合わせ窓口",
          content: <p>お問い合わせ先は正式公開時に運営者情報へ差し替えてください。</p>,
        },
        {
          heading: "改定について",
          content: <p>本ポリシーは必要に応じて改定される場合があります。改定後は本ページで公開します。</p>,
        },
      ]}
    />
  );
}
