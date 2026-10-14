// ローカル検証で「実際の Stripe テストモード」を使うための設定の読み込み。
// - Stripe の鍵は .env.local（Git 管理外）から読み、テスト用キーでなければ使わない。
// - Webhook の署名シークレットは、Stripe CLI（stripe listen）が発行した値を
//   .env.stripe-listen.local（Git 管理外）に保存したものを使う。
// - 鍵やシークレットの値は画面・ログに出さない。
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const ENV_LOCAL_PATH = `${PROJECT_ROOT}.env.local`;
export const LISTEN_SECRET_PATH = `${PROJECT_ROOT}.env.stripe-listen.local`;

function readEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) {
      values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return values;
}

// .env.local の Stripe テスト用キー。テスト用でなければ例外にする（値は表示しない）。
export function readStripeTestKeys() {
  const values = readEnvFile(ENV_LOCAL_PATH);
  const secretKey = values.STRIPE_SECRET_KEY ?? "";
  const publishableKey = values.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

  if (!/^(sk|rk)_test_/.test(secretKey)) {
    throw new Error(
      ".env.local の STRIPE_SECRET_KEY がテスト用キー（sk_test_ / rk_test_）ではありません。実際のテストモードは使えません。",
    );
  }

  if (publishableKey && !publishableKey.startsWith("pk_test_")) {
    throw new Error(
      ".env.local の NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY がテスト用キー（pk_test_）ではありません。",
    );
  }

  return { secretKey, publishableKey };
}

// stripe listen が発行した Webhook 署名シークレット。
export function readListenSecret() {
  const secret = readEnvFile(LISTEN_SECRET_PATH).STRIPE_WEBHOOK_SECRET ?? "";

  if (!secret.startsWith("whsec_")) {
    throw new Error(
      "Webhook の署名シークレットがありません。先に `npm run local:stripe-listen` を起動してください。",
    );
  }

  return secret;
}

// ログに出す前に、鍵やシークレットらしい文字列を伏せる。
// Stripe のエラー文に含まれる伏せ字付きの鍵（末尾の数文字が見える形）も伏せる。
export function maskSecrets(text) {
  return String(text).replace(
    /\b(sk|rk|pk)_(test|live)_[A-Za-z0-9*]+|\bwhsec_[A-Za-z0-9*]+/g,
    (value) =>
      `${value
        .split("_")
        .slice(0, value.startsWith("whsec") ? 1 : 2)
        .join("_")}_****`,
  );
}
