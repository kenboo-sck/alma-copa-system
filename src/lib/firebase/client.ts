import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from "firebase/firestore";

function requirePublicEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function maskApiKeyForLog(apiKey: string) {
  if (apiKey.length <= 10) {
    return `${apiKey.slice(0, 1)}...${apiKey.slice(-1)}`;
  }

  return `${apiKey.slice(0, 5)}...${apiKey.slice(-5)}`;
}

const useFirebaseEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
  (useFirebaseEmulator ? "alma-copa-dev" : undefined);

if (!projectId) {
  throw new Error(
    "Missing required environment variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  );
}

const firebaseConfig = {
  apiKey: useFirebaseEmulator
    ? (process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-api-key")
    : requirePublicEnv(
        "NEXT_PUBLIC_FIREBASE_API_KEY",
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      ),
  authDomain: useFirebaseEmulator
    ? (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`)
    : requirePublicEnv(
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      ),
  projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: useFirebaseEmulator
    ? (process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "demo-app-id")
    : requirePublicEnv(
        "NEXT_PUBLIC_FIREBASE_APP_ID",
        process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  ),
};

console.log("[Firebase client] initializeApp apiKey", {
  apiKey: maskApiKeyForLog(firebaseConfig.apiKey),
});

export const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);

function createFirestore(): Firestore {
  try {
    return initializeFirestore(firebaseApp, {
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    return getFirestore(firebaseApp);
  }
}

export const db = createFirestore();

declare global {
  interface Window {
    __ALMA_FIREBASE_EMULATORS_CONNECTED__?: boolean;
  }
}

if (
  useFirebaseEmulator &&
  typeof window !== "undefined" &&
  !window.__ALMA_FIREBASE_EMULATORS_CONNECTED__
) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  window.__ALMA_FIREBASE_EMULATORS_CONNECTED__ = true;
}
