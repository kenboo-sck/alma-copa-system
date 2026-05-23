# ALMA COPA PHP Mail API

お名前.comレンタルサーバーに置く、PHPMailerベースのメール送信APIです。

想定URL:

```text
https://mail.copa-alma.com/api/send-entry-mail.php
```

DNS反映前はこのURLで疎通できない可能性があります。設置作業だけ先に進め、疎通テストは `mail.copa-alma.com` が開けるようになってから行ってください。

## フォルダ構成

```text
php-mail-api/
  composer.json
  config.sample.php
  config.php
  send-entry-mail.php
  test-send.html
  vendor/
```

`config.php` と `vendor/` は設置前に作成します。

## お名前.comへの設置手順

1. 手元のPC、またはComposerが使える環境で `php-mail-api` フォルダへ移動します。

```bash
cd php-mail-api
composer install --no-dev --optimize-autoloader
```

2. `config.sample.php` をコピーして `config.php` を作成します。

```bash
cp config.sample.php config.php
```

Windows PowerShellの場合:

```powershell
Copy-Item config.sample.php config.php
```

3. `config.php` のSMTP設定を、お名前.comで作成したメールアカウントに合わせて編集します。

4. お名前.comレンタルサーバーのファイルマネージャー、またはFTP/SFTPで、`mail.copa-alma.com` の公開フォルダに `api` フォルダを作ります。

5. 以下を `api` フォルダへアップロードします。

```text
send-entry-mail.php
test-send.html
config.php
vendor/
```

6. ブラウザで次を開きます。

```text
https://mail.copa-alma.com/api/test-send.html
```

7. 宛先メールアドレスを入力して送信し、JSONレスポンスとメール受信を確認します。

## config.php の設定値

```php
return [
    'SMTP_HOST' => 'smtp.example.com',
    'SMTP_PORT' => 587,
    'SMTP_USER' => 'mail@example.com',
    'SMTP_PASSWORD' => 'change-me',
    'MAIL_FROM_ADDRESS' => 'noreply@example.com',
    'MAIL_FROM_NAME' => 'ALMA COPA',
    'CORS_ALLOWED_ORIGINS' => [
        'https://copa-alma.com',
        'https://*.vercel.app',
    ],
];
```

`SMTP_HOST`: お名前.comのSMTPサーバー名です。メールアカウント作成画面やメール設定情報に表示されるSMTPサーバーを入れます。

`SMTP_PORT`: SMTPポートです。通常は `587` を使います。サーバー設定でSSL/TLSの `465` が指定されている場合は `465` を使います。

`SMTP_USER`: SMTP認証に使うメールアカウントです。例: `noreply@copa-alma.com`

`SMTP_PASSWORD`: `SMTP_USER` のメールパスワードです。Gitにはコミットせず、サーバー上の `config.php` だけに保存します。

`MAIL_FROM_ADDRESS`: 送信元として表示するメールアドレスです。迷惑メール判定を避けるため、`SMTP_USER` と同じドメインのアドレスを推奨します。

`MAIL_FROM_NAME`: メールの送信者名です。例: `ALMA COPA`

`CORS_ALLOWED_ORIGINS`: ブラウザからこのAPIを直接呼べるサイトです。本番は `https://copa-alma.com`、Vercel preview検証用に `https://*.vercel.app` を許可しています。

## API仕様

POST JSON:

```json
{
  "to": "customer@example.com",
  "subject": "ALMA COPA テストメール",
  "html": "<p>HTML本文です。</p>",
  "text": "テキスト本文です。"
}
```

成功:

```json
{
  "success": true
}
```

失敗:

```json
{
  "success": false,
  "error": "Required fields: to, subject, html, text."
}
```

設定不足:

```json
{
  "success": false,
  "error": "SMTP configuration is incomplete: SMTP_HOST, SMTP_PASSWORD"
}
```

## curlでのテスト

```bash
curl -i -X POST "https://mail.copa-alma.com/api/send-entry-mail.php" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-address@example.com",
    "subject": "ALMA COPA メールAPIテスト",
    "html": "<p>ALMA COPA メールAPIのHTMLテストです。</p>",
    "text": "ALMA COPA メールAPIのテキストテストです。"
  }'
```

PowerShell:

```powershell
$body = @{
  to = "your-address@example.com"
  subject = "ALMA COPA メールAPIテスト"
  html = "<p>ALMA COPA メールAPIのHTMLテストです。</p>"
  text = "ALMA COPA メールAPIのテキストテストです。"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "https://mail.copa-alma.com/api/send-entry-mail.php" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

## fetchでのテスト

```js
await fetch("https://mail.copa-alma.com/api/send-entry-mail.php", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    to: "your-address@example.com",
    subject: "ALMA COPA メールAPIテスト",
    html: "<p>ALMA COPA メールAPIのHTMLテストです。</p>",
    text: "ALMA COPA メールAPIのテキストテストです。",
  }),
}).then((response) => response.json());
```

## 本番切替前チェックリスト

- `mail.copa-alma.com` のDNSが反映済み
- `https://mail.copa-alma.com/api/test-send.html` が開ける
- `config.php` の `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` が正しい
- `MAIL_FROM_ADDRESS` が実在し、SMTP認証アカウントと同じドメイン
- `test-send.html` から `{ "success": true }` が返る
- 宛先にテストメールが届く
- Next.jsの `PHP_MAIL_API_URL` が `https://mail.copa-alma.com/api/send-entry-mail.php`
- Next.jsの `MAIL_PROVIDER=php` は、本番疎通確認後に設定する
- Stripe Checkout の success/cancel URL が `https://copa-alma.com` ベース
- paid/failed更新が `/payment/success` と `/payment/cancel` で動作する
- Firebase Admin SDKやservice account keyを追加していない
