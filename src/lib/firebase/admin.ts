import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    ""
  );
}

function getAdminCredentials() {
  const projectId = getAdminProjectId();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return cert({
      projectId,
      clientEmail,
      privateKey,
    });
  }

  throw new Error(
    "Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID), FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
  );
}

export function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  return initializeApp({
    credential: getAdminCredentials(),
    projectId: getAdminProjectId(),
  });
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

export function getMissingAdminFirestoreEnvNames() {
  const missing: string[] = [];
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

  if (!projectId) {
    missing.push("FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)");
  }
  if (!clientEmail) {
    missing.push("FIREBASE_CLIENT_EMAIL");
  }
  if (!privateKey) {
    missing.push("FIREBASE_PRIVATE_KEY");
  }

  return missing;
}

export function isAdminFirestoreConfigured() {
  return getMissingAdminFirestoreEnvNames().length === 0;
}
