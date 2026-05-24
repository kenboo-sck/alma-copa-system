import "server-only";

import { getApps, initializeApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore/lite";

function requirePublicEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getFirebaseConfig() {
  return {
    apiKey: requirePublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requirePublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requirePublicEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: requirePublicEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  };
}

export function getMissingPublicFirestoreEnvNames() {
  const missing: string[] = [];

  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()) {
    missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  }

  if (!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim()) {
    missing.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  }

  if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim()) {
    missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  }

  if (!process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim()) {
    missing.push("NEXT_PUBLIC_FIREBASE_APP_ID");
  }

  return missing;
}

export function isPublicFirestoreConfigured() {
  return getMissingPublicFirestoreEnvNames().length === 0;
}

export function getPublicFirestore(): Firestore {
  const app = getApps().length ? getApps()[0] : initializeApp(getFirebaseConfig());
  return getFirestore(app);
}
