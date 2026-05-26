import "server-only";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getProjectId() {
  return (
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    ""
  );
}

function parseServiceAccountJson() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
  } catch (error) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function getServiceAccountFromEnv() {
  const serviceAccountJson = parseServiceAccountJson();

  if (serviceAccountJson) {
    return {
      projectId: serviceAccountJson.project_id || getProjectId(),
      clientEmail: serviceAccountJson.client_email,
      privateKey: serviceAccountJson.private_key?.replace(/\\n/g, "\n"),
    };
  }

  const projectId = getProjectId();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

export function getFirebaseAdminConfigStatus() {
  const serviceAccount = getServiceAccountFromEnv();
  const hasServiceAccount = Boolean(
    serviceAccount?.projectId &&
      serviceAccount.clientEmail &&
      serviceAccount.privateKey,
  );
  const hasApplicationDefault =
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) ||
    Boolean(process.env.FIREBASE_CONFIG?.trim()) ||
    Boolean(process.env.GOOGLE_CLOUD_PROJECT?.trim());

  return {
    hasServiceAccount,
    hasApplicationDefault,
    projectId: serviceAccount?.projectId || getProjectId(),
    missingKeys: hasServiceAccount
      ? []
      : [
          !getProjectId() ? "FIREBASE_ADMIN_PROJECT_ID" : "",
          !serviceAccount?.clientEmail ? "FIREBASE_ADMIN_CLIENT_EMAIL" : "",
          !serviceAccount?.privateKey ? "FIREBASE_ADMIN_PRIVATE_KEY" : "",
        ].filter(Boolean),
  };
}

export function getAdminFirestore() {
  if (!getApps().length) {
    const serviceAccount = getServiceAccountFromEnv();

    if (serviceAccount?.projectId && serviceAccount.clientEmail && serviceAccount.privateKey) {
      initializeApp({
        credential: cert({
          projectId: serviceAccount.projectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: serviceAccount.privateKey,
        }),
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        projectId: getProjectId() || undefined,
      });
    }
  }

  return getFirestore();
}
