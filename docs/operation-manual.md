# COPA ALMA エントリーシステム 操作説明書

## 1. システム概要

COPA ALMA エントリーシステムは、ブラジリアン柔術大会の告知、参加申込、決済、参加者管理、問い合わせ対応を行うためのWebシステムです。

公開ページでは、参加者が大会情報を確認し、個人または代表者としてエントリーできます。エントリー費は Stripe Checkout で決済され、決済完了後にエントリー情報が確定します。

管理画面では、大会情報の作成・編集、エントリー者の確認、決済状態の確認、受付状態の更新、メール送信、お問い合わせ対応を行えます。

### 公開ページ側の主な機能

- トップページで受付中の大会を表示
- 大会一覧の表示
- 大会詳細ページの表示
- 個人エントリー
- 代表者エントリー
- エントリー内容確認
- Stripe Checkout によるオンライン決済
- 決済完了ページ、キャンセルページの表示
- お問い合わせフォーム
- 特定商取引法、プライバシーポリシー、利用規約ページの表示

### 管理画面側の主な機能

- 管理者ログイン
- 大会管理
- エントリー管理
- 選手管理
- 決済管理
- 当日受付管理
- お問い合わせ管理
- メール履歴確認
- 一斉メール送信

「設定」と「計量」は管理メニューにありますが、現在は準備中または案内用の画面です。実運用では、大会管理、エントリー、選手管理、決済、受付、お問い合わせ、メール履歴を主に使用します。

## 2. 管理画面へのログイン方法

### ログインURL

管理画面のログインURLは次の通りです。

```text
/admin/login
```

本番環境では、納品時のドメインに続けてアクセスします。

```text
https://example.com/admin/login
```

### ログイン方法

1. 管理画面ログインURLを開きます。
2. 管理者用メールアドレスを入力します。
3. パスワードを入力します。
4. 「ログイン」を押します。
5. 認証に成功すると、管理画面のダッシュボードへ移動します。

### 管理者権限について

ログインには Firebase Authentication のユーザー登録だけでなく、Firestore の `adminUsers` に管理者情報が登録されている必要があります。

Firebase Authentication にユーザーが存在していても、`adminUsers/{UID}` が存在しない場合、または `isActive` が `true` でない場合はログインできません。

### ログインできない場合の確認点

- メールアドレス、パスワードが正しいか
- Firebase Authentication に対象ユーザーが作成されているか
- Firestore の `adminUsers/{UID}` が作成されているか
- `adminUsers/{UID}.isActive` が `true` になっているか
- Firebase の環境変数が本番環境に正しく設定されているか
- Firestore Rules を変更した直後で、管理者読み取りが拒否されていないか

## 3. 大会管理の使い方

管理画面の「大会管理」では、大会の作成、編集、公開状態の変更、受付期間、料金設定を管理します。

### 大会の作成

1. 管理画面にログインします。
2. 左メニューまたは上部メニューから「大会管理」を開きます。
3. 「大会を追加」を押します。
4. 大会情報を入力します。
5. 必要に応じて大会メイン画像を選択します。
6. 料金設定を入力します。
7. 「保存する」を押します。

### 入力できる主な項目

- 大会名
- 説明
- 大会メイン画像
- 開催日
- 会場
- エントリー開始日
- エントリー終了日
- ステータス
- 大会紹介の表示有無
- 大会コンセプト
- レベル
- クラス
- 雰囲気
- 初参加歓迎
- 早期割引価格
- 早期割引期間
- 通常価格
- 通常価格期間
- 最終価格
- 最終価格期間

### 大会情報の編集

1. 「大会管理」を開きます。
2. 対象大会の「編集」を押します。
3. 内容を修正します。
4. 「保存する」を押します。

大会画像を変更した場合、Firebase Storage に画像がアップロードされます。

### 公開 / 非公開

大会一覧の操作ボタンで公開状態を変更できます。

- 「公開」: 公開ページに表示され、エントリー対象になります。
- 「非公開」: 公開ページ側に表示されなくなります。
- 「受付終了」: 大会は残りますが、受付終了状態として扱います。

参加者がエントリーできるのは、基本的に `published（公開中）` の大会です。

### エントリー受付期間

大会作成・編集画面で、エントリー開始日と終了日を設定します。公開ページ側では、この期間をもとに受付可否や料金判定が行われます。

受付期間を変更する場合は、公開前に日時が正しいか必ず確認してください。

### 料金設定

料金は次の3段階で設定できます。

- 早期割引価格
- 通常価格
- 最終価格

それぞれに開始日時と終了日時があります。参加者が申し込む時点の日時に応じて、該当する料金が使用されます。

料金や期間を変更する場合は、すでに申込済みの参加者との金額差が発生しないよう注意してください。

## 4. エントリー管理の使い方

管理画面の「エントリー」では、申込者情報、決済状態、受付状態を確認・管理します。

### エントリー一覧の確認

1. 管理画面にログインします。
2. 「エントリー」を開きます。
3. エントリー一覧が表示されます。

一覧には主に次の情報が表示されます。

- 氏名
- フリガナ
- メールアドレス
- 大会名
- エントリー種別
- 階級
- 決済状態
- 受付状態
- 作成日時

代表者エントリーの場合、登録された選手ごとに一覧表示されます。

### 検索 / 絞り込み

次の条件で検索・絞り込みができます。

- 氏名
- メールアドレス
- QRのID
- 階級
- 決済状態
- 受付状態
- 大会

決済状態は「すべて」「未払い」「支払い済み」「失敗」から選択できます。

受付状態は「すべて」「未受付」「受付済」から選択できます。

### 表示形式

エントリー一覧には、通常の一覧表示と階級別表示があります。

階級別表示では、階級ごとに選手をまとめて確認できます。当日の組み合わせ確認や階級別の人数確認に便利です。

### 支払い状況確認

決済状態は次のいずれかで表示されます。

- 未払い
- 支払い済み
- 失敗

Stripe 決済が正常に完了すると、Webhook により `支払い済み` に更新されます。

### ステータス確認

エントリー管理では、主に決済状態と受付状態を確認します。

受付状態は、当日受付の進行に合わせて「受付済切替」で変更できます。

### CSV出力

1. 「エントリー」を開きます。
2. 必要に応じて検索・絞り込みを行います。
3. 「CSV出力」を押します。
4. 表示中の条件に一致するエントリーがCSVファイルとしてダウンロードされます。

CSVには、エントリーID、大会、種別、氏名、メール、電話番号、所属、カテゴリ、階級、決済状態、受付状態などが含まれます。

## 5. 選手管理の使い方

管理画面の「選手管理」は、「エントリー」と同じデータを選手管理向けの名称で表示する画面です。

### 選手一覧

「選手管理」を開くと、大会に登録された選手情報を確認できます。

表示される主な内容は次の通りです。

- 氏名
- フリガナ
- メールアドレス
- 大会名
- 個人 / 代表者
- 階級
- 決済状態
- 受付状態

### 階級別表示

表示モードを階級別にすると、選手を階級ごとにまとめて確認できます。階級別の人数確認や当日の運営準備に使用します。

### チェックボックス選択

各選手の左側にチェックボックスがあります。

- 個別に選択できます。
- 表示中の選手をまとめて選択できます。
- 階級別表示では、階級単位で選択できます。

選択した選手は、一括メール送信の対象になります。

### 一括メール送信

1. 「選手管理」を開きます。
2. 送信したい選手にチェックを入れます。
3. 「一括メール」を押します。
4. 件名と本文を入力します。
5. 「送信確認へ」を押します。
6. 送信対象人数と件名を確認します。
7. 「送信する」を押します。

送信後、各宛先ごとにメール履歴へ「一括メール」として保存されます。

### 個別メール送信

1. 対象選手の「メール」を押します。
2. 件名と本文を入力します。
3. 「送信」を押します。

送信内容はメール履歴に保存されます。

## 6. 決済管理の使い方

管理画面の「決済」では、Stripe Checkout の決済状態を確認できます。

### Stripe決済の流れ

1. 参加者が公開ページからエントリー情報を入力します。
2. エントリー確認後、Stripe Checkout へ移動します。
3. 参加者がカード等で支払いを行います。
4. Stripe からシステムの Webhook に決済完了通知が送られます。
5. Webhook によりエントリーの `paymentStatus` が `paid` に更新されます。
6. `entryStatus` が `confirmed` になり、エントリー完了メールが送信されます。

### 支払い済み反映

支払い済み反映は Stripe Webhook によって自動で行われます。管理者が手動で Stripe 決済を確認する画面ではありません。

反映後、管理画面の「エントリー」「選手管理」「決済」で「支払い済み」と表示されます。

### 未払い確認

「決済」画面では、未払い、支払い済み、失敗の件数と一覧を確認できます。

未払いのままの場合は、参加者が決済を完了していない、または Webhook が正常に届いていない可能性があります。

### Webhookについて

Stripe Webhook は、Stripe 側の決済結果をシステムへ通知する仕組みです。

このシステムでは、主に `checkout.session.completed` を受け取り、エントリー情報を支払い済みに更新します。

本番運用では、Stripe 管理画面で Webhook URL と Webhook Secret が正しく設定されている必要があります。

Webhook URL は次の形式です。

```text
https://example.com/api/payments/stripe-webhook
```

### 決済確認時の注意点

- Stripe 管理画面の決済成功と、管理画面の支払い済み表示が一致しているか確認してください。
- 反映されない場合は Stripe Webhook の送信履歴を確認してください。
- `STRIPE_WEBHOOK_SECRET` を変更した場合は、必ず本番環境の環境変数も更新してください。
- テスト環境と本番環境の Stripe キーを混在させないでください。

## 7. メール機能の使い方

### 自動メール

次のメールが自動送信されます。

- 決済完了後のエントリー受付完了メール
- 管理者向けの新規エントリー通知メール
- お問い合わせ受付時の管理者通知メール
- お問い合わせ受付時のユーザー控えメール

決済完了メールは Stripe Webhook 処理の中で送信されます。

### 個別メール

「エントリー」または「選手管理」の各選手行にある「メール」から送信できます。

### 一括メール

一括メールは次の2箇所から送信できます。

- 「選手管理」または「エントリー」でチェックした選手へ送信
- 「メール履歴」画面の一斉メール送信から、条件に一致するエントリー者へ送信

「メール履歴」画面では、支払い済みのみ、未払いのみ、大会別、個人 / 代表者別に対象を絞れます。重複メールアドレスは除外されます。

### メール履歴の確認

「メール履歴」では、送信済み・失敗したメールを確認できます。

表示される主な内容は次の通りです。

- 送信日時
- 宛先
- 種別
- 件名
- ステータス
- エラー内容
- 対象大会

メールが届かない場合は、まずメール履歴でステータスとエラー内容を確認してください。

## 8. お問い合わせ管理の使い方

管理画面の「お問い合わせ」では、公開ページの問い合わせフォームから届いた内容を確認し、対応状況を管理できます。

### お問い合わせ一覧

一覧には次の情報が表示されます。

- 日時
- 名前
- メールアドレス
- 電話番号
- 問い合わせ種別
- 問い合わせ内容
- 対応状況

### 詳細確認

1. 「お問い合わせ」を開きます。
2. 対象行の「詳細」を押します。
3. お問い合わせ本文、送信日時、通知メールの状態、返信履歴情報を確認します。

### 対応状況変更

対応状況は次の3種類です。

- 未対応
- 対応中
- 対応済み

一覧または詳細画面のプルダウンから変更できます。

### 返信方法

1. お問い合わせ詳細を開きます。
2. 返信後の対応状況を選びます。
3. 件名と本文を入力します。
4. 「返信を送信」を押します。

返信メールはメール履歴へ「問い合わせ返信」として保存されます。

## 9. 管理者追加方法

管理者を追加するには、Firebase Authentication と Firestore の両方を設定します。

### 1. Firebase Authenticationでユーザー作成

1. Firebase コンソールを開きます。
2. 対象プロジェクトを選択します。
3. Authentication を開きます。
4. Users からユーザーを追加します。
5. メールアドレスとパスワードを設定します。
6. 作成されたユーザーの UID を控えます。

### 2. FirestoreのadminUsersにUIDを追加

1. Firestore Database を開きます。
2. `adminUsers` コレクションを開きます。
3. Authentication で控えた UID と同じIDのドキュメントを作成します。

ドキュメントIDは必ず Firebase Authentication の UID と一致させてください。

### 3. role / isActive の設定

`adminUsers/{UID}` には次のような項目を設定します。

```json
{
  "email": "admin@example.com",
  "displayName": "管理者名",
  "role": "owner",
  "permissions": [
    "events:read",
    "events:write",
    "categories:write",
    "entries:read",
    "entries:write",
    "payments:read",
    "emails:read",
    "emails:send",
    "reception:write",
    "weigh-in:write",
    "settings:write"
  ],
  "isActive": true
}
```

`role` は次のいずれかです。

- `owner`
- `admin`
- `staff`

`owner` は権限チェックで最も強い権限として扱われます。`admin` または `staff` の場合、必要な `permissions` が不足していると一部APIを利用できない場合があります。

### 「管理者権限がありません」と出る場合の原因

- `adminUsers/{UID}` が存在しない
- ドキュメントIDが Authentication の UID と一致していない
- `isActive` が `true` ではない
- `role` が `owner` / `admin` / `staff` 以外になっている
- Firestore Rules により `adminUsers` を読めない
- 別のFirebaseプロジェクトのユーザーでログインしている

## 10. 運用上の注意

### Firebaseを直接触る際の注意

Firestore のデータを直接編集すると、公開ページや管理画面にすぐ反映されます。特に次のコレクションは慎重に扱ってください。

- `events`
- `entries`
- `inquiries`
- `emailLogs`
- `adminUsers`

大会ID、エントリーID、ユーザーUIDなどのIDを変更すると、関連データと紐づかなくなる可能性があります。

### Stripe設定を変更する際の注意

- テストキーと本番キーを混在させないでください。
- Webhook URL を変更した場合は、Stripe 管理画面側も更新してください。
- `STRIPE_WEBHOOK_SECRET` を変更した場合は、環境変数も更新してください。
- 決済金額は大会管理の料金設定から計算されます。Stripe 側で直接商品金額だけを変更しても、システムの料金設定とは連動しません。

### Firestore Rulesを変更する際の注意

Firestore Rules は、公開ページからのエントリー作成、お問い合わせ作成、管理者操作に影響します。

Rules を変更する前に、次の動作を確認してください。

- 公開中大会の表示
- エントリー作成
- 決済完了後のエントリー更新
- 管理画面ログイン
- 管理画面での大会編集
- メール履歴の書き込み
- お問い合わせ保存

### 本番運用前の確認項目

- Firebase Authentication に管理者ユーザーが作成されている
- Firestore `adminUsers` に管理者UIDが登録されている
- 大会が `published` になっている
- エントリー受付期間が正しい
- 料金設定が正しい
- Stripe 本番キーが設定されている
- Stripe Webhook が本番URLに設定されている
- メール送信設定が完了している
- `ADMIN_NOTIFICATION_EMAIL` が正しい
- お問い合わせフォームから通知メールが届く
- テスト決済または本番の少額確認で支払い済みに反映される
- メール履歴に送信結果が残る

## 11. よくあるトラブル

### ログインできない

確認すること:

- メールアドレスとパスワードが正しいか
- Firebase Authentication にユーザーが存在するか
- Firebase のAPIキーなど環境変数が正しいか
- ブラウザのキャッシュや古いログイン状態が残っていないか

対処:

- パスワードを再設定します。
- 一度ログアウトして再ログインします。
- Firebase Authentication のユーザー状態を確認します。

### 管理者権限がありません

確認すること:

- `adminUsers/{UID}` が存在するか
- `isActive` が `true` か
- UID が Firebase Authentication の UID と一致しているか
- `role` と `permissions` が正しいか

対処:

- Firestore に正しい UID の管理者ドキュメントを作成します。
- `isActive` を `true` にします。
- 必要な `permissions` を追加します。

### 決済が反映されない

確認すること:

- Stripe 管理画面で決済が成功しているか
- Stripe Webhook の送信履歴でエラーが出ていないか
- Webhook URL が正しいか
- `STRIPE_WEBHOOK_SECRET` が正しいか
- 対象エントリーが Firestore `entries` に存在するか

対処:

- Stripe Webhook の再送を行います。
- 環境変数を確認します。
- サーバーログで `stripe-webhook` のエラーを確認します。

### メールが届かない

確認すること:

- 「メール履歴」に送信記録があるか
- ステータスが「送信済み」か「失敗」か
- エラー内容が表示されていないか
- `MAIL_PROVIDER_API_KEY` が設定されているか
- `MAIL_FROM_ADDRESS` が正しいか
- `ADMIN_NOTIFICATION_EMAIL` が正しいか
- 迷惑メールフォルダに入っていないか

対処:

- メール履歴のエラー内容を確認します。
- メール送信サービスの管理画面で送信ログを確認します。
- 送信元ドメインの認証設定を確認します。

### お問い合わせが保存されない

確認すること:

- 問い合わせフォームの必須項目が入力されているか
- Firestore Rules が問い合わせ作成を許可しているか
- Firebase の公開設定が正しいか
- ブラウザまたはサーバーログにエラーがないか

対処:

- 名前、メールアドレス、本文を入力し直します。
- Firestore Rules と環境変数を確認します。
- 通知メールが失敗しても問い合わせ自体は保存される設計のため、まず管理画面の「お問い合わせ」に表示されているか確認します。

## 確認したルート

### 公開ページ

- `/`
- `/events`
- `/events/[eventId]`
- `/events/[eventId]/entry`
- `/events/[eventId]/entry/individual`
- `/events/[eventId]/entry/representative`
- `/events/[eventId]/confirm`
- `/payment/success`
- `/payment/cancel`
- `/entry/success`
- `/entry/cancel`
- `/contact`
- `/law`
- `/legal/privacy`
- `/legal/terms`
- `/legal/tokusho`

### 管理画面

- `/admin`
- `/admin/login`
- `/admin/events`
- `/admin/events/new`
- `/admin/events/[eventId]`
- `/admin/events/[eventId]/edit`
- `/admin/events/[eventId]/entries`
- `/admin/events/[eventId]/categories`
- `/admin/entries`
- `/admin/entries/[entryId]`
- `/admin/participants`
- `/admin/payments`
- `/admin/reception`
- `/admin/inquiries`
- `/admin/email-logs`
- `/admin/settings`
- `/admin/weigh-in`

### API

- `/api/payments/checkout-session`
- `/api/payments/stripe-webhook`
- `/api/payments/cancel-entry`
- `/api/entries/validate`
- `/api/notifications/send-entry-emails`
- `/api/admin/emails/send`
- `/api/admin/inquiries/reply`
- `/api/contact`

## 確認した管理画面メニュー

- ダッシュボード
- 大会管理
- エントリー
- 選手管理
- 決済
- 受付
- お問い合わせ
- メール履歴
- 設定

## 確認した主なファイル

- `src/features/admin-auth/admin-shell.tsx`
- `src/features/admin-auth/admin-login-form.tsx`
- `src/features/admin-auth/admin-auth-provider.tsx`
- `src/lib/auth/admin-server.ts`
- `src/features/events/admin-events-manager.tsx`
- `src/features/events/admin-event-form-modal.tsx`
- `src/features/events/admin-events-list.tsx`
- `src/features/entries/admin-entries-manager.tsx`
- `src/features/payments/admin-payments-manager.tsx`
- `src/features/reception/admin-reception-manager.tsx`
- `src/features/inquiries/admin-inquiries-manager.tsx`
- `src/features/emails/admin-email-logs-manager.tsx`
- `src/app/api/payments/checkout-session/route.ts`
- `src/app/api/payments/stripe-webhook/route.ts`
- `src/app/api/admin/emails/send/route.ts`
- `src/app/api/admin/inquiries/reply/route.ts`
- `src/app/api/contact/route.ts`
- `src/lib/firebase/collections.ts`
- `src/types/admin.ts`
- `src/lib/email/email-service.ts`
- `firestore.rules`
