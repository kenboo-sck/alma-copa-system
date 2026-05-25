# COPA ALMA Entry System

格闘技大会「COPA ALMA」のWebエントリー管理システムです。複数大会、個人エントリー、代表者エントリー、期間別料金、決済ステータス管理、管理画面を前提にしたNext.js + Firebase構成です。

## 技術構成

- Next.js App Router
- TypeScript
- Tailwind CSS
- Firebase Authentication
- Firestore
- Firebase Emulator Suite
- React Hook Form
- Zod
- ESLint
- Prettier

StripeとCloud Functionsの本実装は次フェーズで追加します。

## セットアップ

```bash
npm install
cp .env.example .env.local
npm run dev
```

Firebase Emulatorを使う場合:

```bash
npm run emulators
```

## Vercel 本番環境の環境変数

Stripe Checkout、Firestore 保存、決済前の重複チェック、完了メール送信を本番で動かすために、Vercel には以下を設定してください。

### Firebase Client 側

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### Stripe

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_STRIPE_TEST_MODE`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### メール送信

- `MAIL_PROVIDER`
- `PHP_MAIL_API_URL`
- `MAIL_PROVIDER_API_KEY`
- `ADMIN_NOTIFICATION_EMAIL`
- `MAIL_FROM_ADDRESS`

### 補足

決済前の重複チェックと大会情報の読み取りは、Firebase Admin SDK ではなく公開用の Firebase Web SDK で行います。  
そのため、このエントリー処理では `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` は不要です。

## 管理者ログイン

管理画面は Firebase Authentication のメールアドレス + パスワードログインを使います。ログイン後、Firestore の `adminUsers/{uid}` に有効な管理者ドキュメントが存在する場合のみ `/admin` 配下を閲覧できます。

`adminUsers/{uid}` の例:

```txt
email: "owner@example.com"
displayName: "Owner"
role: "owner"
permissions: ["events:read", "events:write", "entries:read"]
isActive: true
```

`role` は `owner | admin | staff` を想定しています。

## 主要ディレクトリ

```txt
src/app/(public)        公開側画面
src/app/admin           管理画面
src/components/ui       共通UI
src/components/public   公開側コンポーネント
src/components/admin    管理画面コンポーネント
src/components/forms    フォーム部品
src/features            業務機能単位
src/lib/firebase        Firebase初期化
src/schemas             Zodスキーマ
src/types               TypeScript型
src/server              Server Actions/API/Services
```

## 開発コマンド

```bash
npm run dev
npm run build
npm run lint
npm run format
npm run format:check
```

## 設計方針

- 公開側は黒ベース、高級感、スマホ優先
- 管理画面は実務重視で高速操作しやすいUI
- 重要な書き込み、料金計算、決済処理はCloud Functions/API経由に寄せる
- Firestoreへの直接書き込みは原則禁止
- Stripe依存はPayment Provider層に閉じ込める
- 申込時の料金スナップショットを保存し、後日の料金変更に影響されない設計にする

## 次の実装順

1. Firestore読み取りサービス
2. 大会作成・編集画面
3. カテゴリー管理と期間別料金UI
4. 公開側大会一覧・大会詳細
5. 個人/代表者エントリーフォーム
6. サーバー側バリデーションと仮申込作成
7. Stripe Checkout連携
8. Stripe Webhookと正式エントリー化
9. メール送信、CSV出力、当日受付、計量管理
