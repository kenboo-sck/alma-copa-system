// ローカル検証用の接続先（Firebase Emulator・Stripe の代替サーバー）を環境変数から読む。
// サーバー側の処理だけが使う。本番（Vercel の production）では、これらの環境変数が
// 誤って設定されていても無視する。

function isProductionDeployment() {
  return process.env.VERCEL_ENV === "production";
}

function readHost(name: string) {
  if (isProductionDeployment()) {
    return "";
  }

  return process.env[name]?.trim() ?? "";
}

// 例: "127.0.0.1:8080"
export function getFirestoreEmulatorHost() {
  return readHost("FIRESTORE_EMULATOR_HOST");
}

// 例: "127.0.0.1:9099"
export function getAuthEmulatorHost() {
  return readHost("FIREBASE_AUTH_EMULATOR_HOST");
}

// Stripe API の代わりに呼び出すローカルサーバー。例: "127.0.0.1:4010"
export function getStripeApiHost() {
  return readHost("STRIPE_API_HOST");
}
