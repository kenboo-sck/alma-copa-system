"use client";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { auth, db } from "@/lib/firebase/client";
import type { AdminUser, AdminUserDocument } from "@/types/admin";

type AdminAuthStatus = "loading" | "authenticated" | "unauthenticated";

type AdminAuthContextValue = {
  adminUser: AdminUser | null;
  firebaseUser: User | null;
  status: AdminAuthStatus;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAdminUser: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

function getErrorDetails(error: unknown) {
  if (error && typeof error === "object") {
    const maybeFirebaseError = error as {
      code?: unknown;
      message?: unknown;
    };

    return {
      code:
        typeof maybeFirebaseError.code === "string"
          ? maybeFirebaseError.code
          : "unknown",
      message:
        typeof maybeFirebaseError.message === "string"
          ? maybeFirebaseError.message
          : String(error),
    };
  }

  return {
    code: "unknown",
    message: String(error),
  };
}

async function fetchAdminUser(uid: string): Promise<AdminUser | null> {
  const snapshot = await getDoc(doc(db, "adminUsers", uid));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as AdminUserDocument;

  if (!data.isActive) {
    return null;
  }

  return {
    uid,
    email: data.email,
    displayName: data.displayName,
    role: data.role,
    permissions: data.permissions ?? [],
    isActive: data.isActive,
  };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const loadAdminUser = useCallback(async (user: User | null) => {
    setError(null);

    if (!user) {
      setFirebaseUser(null);
      setAdminUser(null);
      setStatus("unauthenticated");
      return;
    }

    setFirebaseUser(user);
    const nextAdminUser = await fetchAdminUser(user.uid);

    if (!nextAdminUser) {
      await signOut(auth);
      setFirebaseUser(null);
      setAdminUser(null);
      setStatus("unauthenticated");
      setError("管理者権限がありません。");
      return;
    }

    setAdminUser(nextAdminUser);
    setStatus("authenticated");
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setStatus("loading");
      void loadAdminUser(user).catch((caughtError: unknown) => {
        console.error(caughtError);
        setStatus("unauthenticated");
        setError("管理者情報の取得に失敗しました。");
      });
    });

    return unsubscribe;
  }, [loadAdminUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      setStatus("loading");
      setError(null);

      try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        await loadAdminUser(credential.user);
      } catch (caughtError) {
        const errorDetails = getErrorDetails(caughtError);

        console.error("Firebase admin login failed", {
          code: errorDetails.code,
          message: errorDetails.message,
          error: caughtError,
        });
        setStatus("unauthenticated");
        setError(
          `ログインに失敗しました。Firebase error.code: ${errorDetails.code} / error.message: ${errorDetails.message}`,
        );
        throw caughtError;
      }
    },
    [loadAdminUser],
  );

  const logout = useCallback(async () => {
    await signOut(auth);
    setFirebaseUser(null);
    setAdminUser(null);
    setStatus("unauthenticated");
  }, []);

  const refreshAdminUser = useCallback(async () => {
    setStatus("loading");
    await loadAdminUser(auth.currentUser);
  }, [loadAdminUser]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      adminUser,
      firebaseUser,
      status,
      error,
      login,
      logout,
      refreshAdminUser,
    }),
    [adminUser, error, firebaseUser, login, logout, refreshAdminUser, status],
  );

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider.");
  }

  return context;
}
