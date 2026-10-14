// ローカル検証用の設定でアプリを起動する（Emulator と代替サーバーにだけ接続する）。
//   node scripts/local/run-app.mjs        … ビルドして起動（通常の開発サーバーと同時に動かせる）
//   node scripts/local/run-app.mjs --dev  … 開発モードで起動（他の開発サーバーを止めてから）
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import { APP_PORT, APP_URL, applyLocalEnv } from "./env.mjs";

// --real-stripe: 実際の Stripe テストモードを使う（先に npm run local:stripe-listen を起動する）。
const realStripe = process.argv.includes("--real-stripe");
const env = applyLocalEnv({ ...process.env }, { realStripe });
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      env,
      stdio: "inherit",
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`next ${args[0]} exited with ${code}`)),
    );
  });
}

console.log(
  `ローカル検証用アプリ: ${APP_URL}（Stripe: ${realStripe ? "実際のテストモード" : "代替サーバー"}）`,
);

if (process.argv.includes("--dev")) {
  await run(["dev", "-p", String(APP_PORT)]);
} else {
  await run(["build"]);
  await run(["start", "-p", String(APP_PORT)]);
}
