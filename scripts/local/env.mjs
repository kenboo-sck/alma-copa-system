import { readListenSecret, readStripeTestKeys } from "./stripe-test.mjs";

// ローカル検証環境の設定値。すべてローカル専用のダミー値で、秘密情報は含まない。
// 「demo-」で始まるプロジェクト ID は Firebase Emulator 専用で、本番には接続できない。

export const PROJECT_ID = "demo-alma-copa";
export const APP_PORT = 3002;
export const STUB_PORT = 4010;
export const FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
// 既定の 9099 は他のアプリが使っていることがあるため、9199 を使う。
export const AUTH_EMULATOR_HOST = "127.0.0.1:9199";
export const APP_URL = `http://localhost:${APP_PORT}`;
export const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;
export const STRIPE_WEBHOOK_SECRET = "whsec_local_dummy";

// テスト用の管理者（Auth Emulator にだけ存在する）。
export const TEST_PASSWORD = "local-test-1234";
export const TEST_ADMINS = [
  {
    email: "owner@example.test",
    displayName: "テスト管理者（owner）",
    role: "owner",
    permissions: [],
  },
  {
    // 出場内容の変更だけができる担当者。金額が動く操作（payments:write）は持たない。
    email: "editor@example.test",
    displayName: "テスト編集担当（admin）",
    role: "admin",
    permissions: ["entries:read", "entries:write", "emails:send"],
  },
  {
    // 受付担当。入金・現金受領の記録（payments:write）は持たない。
    email: "staff@example.test",
    displayName: "テスト受付担当（staff）",
    role: "staff",
    permissions: ["entries:read", "reception:write", "weigh-in:write"],
  },
];
export const TEST_EVENT_ID = "local-test-event";

export const localEnv = {
  NEXT_PUBLIC_SITE_URL: APP_URL,
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app-id",
  // ブラウザ側の接続先。
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true",
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR_HOST,
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR_HOST,
  // サーバー側の接続先（ブラウザ側と同じ Emulator）。
  FIRESTORE_EMULATOR_HOST,
  FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR_HOST,
  FIREBASE_ADMIN_PROJECT_ID: PROJECT_ID,
  // Google のライブラリが実行環境（GCP かどうか）を調べる問い合わせを行わない。
  METADATA_SERVER_DETECTION: "none",
  // Stripe: ローカルの代替サーバーを呼び出す（Stripe へは通信しない）。
  STRIPE_API_HOST: `127.0.0.1:${STUB_PORT}`,
  STRIPE_SECRET_KEY: "sk_test_local_dummy_not_a_real_key",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_local_dummy_not_a_real_key",
  NEXT_PUBLIC_STRIPE_TEST_MODE: "true",
  STRIPE_WEBHOOK_SECRET,
  // メール: ローカルの代替サーバーが受け取って一覧表示する（実際には送信しない）。
  MAIL_PROVIDER: "php",
  PHP_MAIL_API_URL: `${STUB_URL}/mail/send`,
  MAIL_PROVIDER_API_KEY: "local-unused",
  ADMIN_NOTIFICATION_EMAIL: "organizer@example.test",
  MAIL_FROM_ADDRESS: "COPA ALMA LOCAL <local@example.test>",
};

// .env.local に本番用の値があっても、ここで設定した値が優先される
// （Next.js は、すでに設定されている環境変数を .env ファイルで上書きしない）。
// 本番用の認証情報を誤って使わないよう、関係する変数は明示的に取り除く。
// realStripe: true の場合は、Stripe の代替サーバーの代わりに実際の Stripe テストモードを使う
// （.env.local のテスト用キーと、stripe listen が発行した署名シークレットを使う）。
// メールは引き続き代替サーバーが受け取る。
export function applyLocalEnv(env = process.env, { realStripe = false } = {}) {
  for (const key of [
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "VERCEL_ENV",
  ]) {
    delete env[key];
  }

  Object.assign(env, localEnv);

  if (realStripe) {
    const { secretKey, publishableKey } = readStripeTestKeys();
    delete env.STRIPE_API_HOST;
    Object.assign(env, {
      STRIPE_SECRET_KEY: secretKey,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
        publishableKey || localEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_STRIPE_TEST_MODE: "true",
      STRIPE_WEBHOOK_SECRET: readListenSecret(),
    });
  }

  return env;
}
