<?php

return [
    // お名前.comのメールサーバー名です。例: smtp.copa-alma.com
    'SMTP_HOST' => 'smtp.example.com',

    // SMTPポートです。587はSTARTTLS、465はSSL/TLSとして扱います。
    'SMTP_PORT' => 587,

    // SMTP認証に使うメールアカウントです。
    'SMTP_USER' => 'mail@example.com',

    // SMTP_USERのメールパスワードです。
    'SMTP_PASSWORD' => 'change-me',

    // 送信元メールアドレスです。SMTP_USERと同じドメインのアドレスを推奨します。
    'MAIL_FROM_ADDRESS' => 'noreply@example.com',

    // メール本文に表示される送信者名です。
    'MAIL_FROM_NAME' => 'ALMA COPA',

    // ブラウザから直接テストする場合の許可元です。
    'CORS_ALLOWED_ORIGINS' => [
        'https://copa-alma.com',
        'https://*.vercel.app',
    ],
];
