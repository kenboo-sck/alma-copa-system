import "server-only";

import type { AdminPermission, AdminUser } from "@/types/admin";

import { getAuthEmulatorHost } from "@/lib/firebase/emulator";
import { getFirestoreDocumentWithAuth } from "@/lib/firebase/firestore-rest";

type FirebaseLookupResponse = {
  users?: Array<{
    localId?: string;
    email?: string;
  }>;
};

export type VerifiedAdminRequest = {
  idToken: string;
  adminUser: AdminUser;
};

function getFirebaseApiKey() {
  const value = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!value) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_FIREBASE_API_KEY",
    );
  }

  return value;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

async function verifyFirebaseIdToken(idToken: string) {
  // ローカル検証では、ログインに使った Auth Emulator に問い合わせる。
  const emulatorHost = getAuthEmulatorHost();
  const origin = emulatorHost
    ? `http://${emulatorHost}/identitytoolkit.googleapis.com`
    : "https://identitytoolkit.googleapis.com";
  const response = await fetch(
    `${origin}/v1/accounts:lookup?key=${encodeURIComponent(getFirebaseApiKey())}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idToken }),
    },
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as FirebaseLookupResponse;
  const user = body.users?.[0];
  if (!user?.localId) {
    return null;
  }

  return {
    uid: user.localId,
    email: user.email ?? "",
  };
}

function toAdminPermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is AdminPermission => typeof item === "string");
}

export async function requireAdminRequest(
  request: Request,
  permission?: AdminPermission,
): Promise<VerifiedAdminRequest> {
  const idToken = getBearerToken(request);
  if (!idToken) {
    throw new Error("AUTH_TOKEN_MISSING");
  }

  const verifiedUser = await verifyFirebaseIdToken(idToken);
  if (!verifiedUser) {
    throw new Error("AUTH_TOKEN_INVALID");
  }

  const adminData = await getFirestoreDocumentWithAuth(
    `adminUsers/${verifiedUser.uid}`,
    idToken,
  );

  if (!adminData || adminData.isActive !== true) {
    throw new Error("ADMIN_NOT_ACTIVE");
  }

  const permissions = toAdminPermissions(adminData.permissions);
  const role =
    adminData.role === "owner" ||
    adminData.role === "admin" ||
    adminData.role === "staff"
      ? adminData.role
      : "staff";

  if (permission && role !== "owner" && !permissions.includes(permission)) {
    throw new Error("ADMIN_PERMISSION_DENIED");
  }

  return {
    idToken,
    adminUser: {
      uid: verifiedUser.uid,
      email:
        typeof adminData.email === "string" && adminData.email
          ? adminData.email
          : verifiedUser.email,
      displayName:
        typeof adminData.displayName === "string" ? adminData.displayName : "",
      role,
      permissions,
      isActive: true,
    },
  };
}
