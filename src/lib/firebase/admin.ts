import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type FirebaseAdminServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function normalizePrivateKey(value: string | undefined) {
  return value?.replace(/\\n/g, "\n").trim();
}

function getSplitServiceAccountFromEnv(): FirebaseAdminServiceAccount | null {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function getJsonServiceAccountFromEnv(): FirebaseAdminServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    const projectId = parsed.project_id?.trim();
    const clientEmail = parsed.client_email?.trim();
    const privateKey = normalizePrivateKey(parsed.private_key);

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON must include project_id, client_email, and private_key.",
      );
    }

    return {
      projectId,
      clientEmail,
      privateKey,
    };
  } catch (error) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_JSON is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function getServiceAccountFromEnv() {
  return getJsonServiceAccountFromEnv() ?? getSplitServiceAccountFromEnv();
}

export function getFirebaseAdminConfigStatus() {
  let serviceAccount: FirebaseAdminServiceAccount | null = null;
  let configError: string | null = null;

  try {
    serviceAccount = getServiceAccountFromEnv();
  } catch (error) {
    configError = error instanceof Error ? error.message : String(error);
  }

  return {
    hasServiceAccount: Boolean(serviceAccount),
    projectId: serviceAccount?.projectId ?? "",
    configError,
    missingKeys: serviceAccount
      ? []
      : [
          !process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
            ? "FIREBASE_ADMIN_PROJECT_ID"
            : "",
          !process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
            ? "FIREBASE_ADMIN_CLIENT_EMAIL"
            : "",
          !process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim()
            ? "FIREBASE_ADMIN_PRIVATE_KEY"
            : "",
        ].filter(Boolean),
  };
}

export function getAdminFirestore() {
  if (!getApps().length) {
    const serviceAccount = getServiceAccountFromEnv();

    if (!serviceAccount) {
      throw new Error(
        "Firebase Admin SDK is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.",
      );
    }

    initializeApp({
      credential: cert({
        projectId: serviceAccount.projectId,
        clientEmail: serviceAccount.clientEmail,
        privateKey: serviceAccount.privateKey,
      }),
    });
  }

  return getFirestore();
}
