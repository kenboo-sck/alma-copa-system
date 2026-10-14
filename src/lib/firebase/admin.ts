import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { getFirestoreEmulatorHost } from "@/lib/firebase/emulator";

// サーバー（API ルート）からの Firestore 読み書きに使う Firebase Admin SDK。
// エントリーの保存・料金の確定・支払状態の更新は、Firestore ルールで一般ユーザーの
// 直接書き込みを禁止したうえで、ここを通したサーバー処理だけが行う。
//
// 認証情報は環境変数から読む（コードや Git には含めない）。次のいずれかを設定する。
//   1. FIREBASE_SERVICE_ACCOUNT_JSON: サービスアカウントキーの JSON 全文（base64 でも可）
//   2. FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY
// FIRESTORE_EMULATOR_HOST が設定されている場合は Emulator に接続し、認証情報は不要。

const ADMIN_APP_NAME = "alma-copa-admin";

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

function isEmulator() {
  return Boolean(getFirestoreEmulatorHost());
}

function parseServiceAccountJson(value: string): ServiceAccount | null {
  const candidates = [value];

  if (!value.startsWith("{")) {
    candidates.push(Buffer.from(value, "base64").toString("utf8"));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const projectId = parsed.project_id ?? parsed.projectId;
      const clientEmail = parsed.client_email ?? parsed.clientEmail;
      const privateKey = parsed.private_key ?? parsed.privateKey;

      if (
        typeof projectId === "string" &&
        typeof clientEmail === "string" &&
        typeof privateKey === "string"
      ) {
        return { projectId, clientEmail, privateKey };
      }
    } catch {
      // 次の候補を試す。
    }
  }

  return null;
}

function getServiceAccount(): ServiceAccount | null {
  const json = env("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (json) {
    return parseServiceAccountJson(json);
  }

  const projectId = env("FIREBASE_ADMIN_PROJECT_ID");
  const clientEmail = env("FIREBASE_ADMIN_CLIENT_EMAIL");
  // 環境変数では改行が "\n" という文字列で入ることが多いため、改行に戻す。
  const privateKey = env("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  return null;
}

// 設定が不足している場合に、不足している環境変数名を返す（値は返さない）。
export function getMissingAdminEnvNames(): string[] {
  if (isEmulator() || env("GOOGLE_APPLICATION_CREDENTIALS")) {
    return [];
  }

  if (env("FIREBASE_SERVICE_ACCOUNT_JSON")) {
    return getServiceAccount() ? [] : ["FIREBASE_SERVICE_ACCOUNT_JSON（形式が不正）"];
  }

  const missing = [
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY",
  ].filter((name) => !env(name));

  return missing.length === 3 ? ["FIREBASE_SERVICE_ACCOUNT_JSON"] : missing;
}

export function isAdminFirestoreConfigured() {
  return getMissingAdminEnvNames().length === 0;
}

function getAdminApp(): App {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) {
    return existing;
  }

  if (isEmulator()) {
    return initializeApp(
      {
        projectId:
          env("FIREBASE_ADMIN_PROJECT_ID") ||
          env("NEXT_PUBLIC_FIREBASE_PROJECT_ID") ||
          "alma-copa-dev",
      },
      ADMIN_APP_NAME,
    );
  }

  const serviceAccount = getServiceAccount();
  if (serviceAccount) {
    return initializeApp(
      {
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId,
      },
      ADMIN_APP_NAME,
    );
  }

  if (env("GOOGLE_APPLICATION_CREDENTIALS")) {
    return initializeApp({ credential: applicationDefault() }, ADMIN_APP_NAME);
  }

  throw new Error(
    `Firebase Admin SDK is not configured. Missing: ${getMissingAdminEnvNames().join(", ")}`,
  );
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}
