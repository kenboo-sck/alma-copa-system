import { LegalPage } from "@/components/legal-page";

export default function TermsPage() {
  return (
    <LegalPage
      title="利用規約"
      heroTitle="TERMS OF"
      highlightedHeroTitle="SERVICE"
      sections={[
        {
          heading: "本規約の適用",
          content: (
            <p>
              本規約は、当サイトを通じて行う大会エントリーおよび関連サービスの利用に適用されます。
            </p>
          ),
        },
        {
          heading: "エントリー申込",
          content: (
            <p>
              利用者は、正確な情報を入力し、各大会の条件を確認したうえで申し込みを行うものとします。
            </p>
          ),
        },
        {
          heading: "決済",
          content: (
            <p>決済は指定された方法に従って行い、決済完了時点で申込が確定します。</p>
          ),
        },
        {
          heading: "キャンセル",
          content: (
            <p>
              キャンセル条件は大会ごとに異なる場合があります。返金可否や受付締切は大会案内に従います。
            </p>
          ),
        },
        {
          heading: "禁止事項",
          content: (
            <p>
              虚偽情報の入力、不正アクセス、他者への迷惑行為、運営を妨げる行為を禁止します。
            </p>
          ),
        },
        {
          heading: "免責事項",
          content: (
            <p>
              システム障害、通信障害、外部サービス障害等に起因する損害について、法令上許される範囲で責任を負いません。
            </p>
          ),
        },
        {
          heading: "規約変更",
          content: (
            <p>
              運営上必要と判断した場合、事前の通知なく本規約を変更することがあります。
            </p>
          ),
        },
        {
          heading: "準拠法",
          content: (
            <p>
              本規約は日本法に準拠し、紛争が生じた場合は運営者所在地を管轄する裁判所を第一審の専属的合意管轄とします。
            </p>
          ),
        },
      ]}
    />
  );
}
