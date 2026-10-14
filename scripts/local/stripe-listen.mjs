// Stripe テストモードの Webhook を、ローカル検証用アプリ（ポート 3002）へ転送する。
//   npm run local:stripe-listen
// - Stripe CLI（stripe）を使う。鍵は .env.local のテスト用キーを環境変数で渡す
//   （コマンドライン引数には載せない）。ログイン（stripe login）は不要。
// - 発行された署名シークレットは .env.stripe-listen.local（Git 管理外）に保存し、
//   画面には伏せ字で表示する。
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

import { APP_URL } from "./env.mjs";
import { LISTEN_SECRET_PATH, maskSecrets, readStripeTestKeys } from "./stripe-test.mjs";

const { secretKey } = readStripeTestKeys();
const env = {
  ...process.env,
  STRIPE_API_KEY: secretKey,
  STRIPE_CLI_TELEMETRY_OPTOUT: "1",
};
const forwardTo = `${APP_URL}/api/payments/stripe-webhook`;

function runForSecret() {
  return new Promise((resolve, reject) => {
    const child = spawn("stripe", ["listen", "--print-secret"], {
      env,
      windowsHide: true,
    });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (errors += chunk));
    child.on("error", (error) =>
      reject(new Error(`Stripe CLI を起動できません（${error.message}）。`)),
    );
    child.on("exit", (code) => {
      const secret = /whsec_[A-Za-z0-9]+/.exec(output)?.[0];
      if (code === 0 && secret) {
        resolve(secret);
      } else {
        reject(
          new Error(
            `署名シークレットを取得できません: ${maskSecrets(errors || output).trim()}`,
          ),
        );
      }
    });
  });
}

const secret = await runForSecret();
writeFileSync(
  LISTEN_SECRET_PATH,
  `# stripe listen が発行したローカル検証用の Webhook 署名シークレット（Git 管理外）\nSTRIPE_WEBHOOK_SECRET=${secret}\n`,
);
console.log(`Webhook 署名シークレットを保存しました（${maskSecrets(secret)}）。`);
console.log(`転送先: ${forwardTo}（イベント: checkout.session.completed）`);

const listener = spawn(
  "stripe",
  ["listen", "--forward-to", forwardTo, "--events", "checkout.session.completed"],
  { env, windowsHide: true },
);
for (const stream of [listener.stdout, listener.stderr]) {
  stream.on("data", (chunk) => process.stdout.write(maskSecrets(chunk)));
}
listener.on("exit", (code) => {
  console.log(`stripe listen が終了しました（${code}）。`);
  process.exit(code ?? 0);
});
