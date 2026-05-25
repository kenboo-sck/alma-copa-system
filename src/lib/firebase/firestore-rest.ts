import "server-only";

type FirestoreRestValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreRestValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreRestValue> } };

type FirestoreRestDocument = {
  name: string;
  fields?: Record<string, FirestoreRestValue>;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getFirebaseProjectId() {
  return requireEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
}

function getFirestoreBaseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${getFirebaseProjectId()}/databases/(default)/documents`;
}

export function decodeFirestoreFields(
  fields: Record<string, FirestoreRestValue> | undefined,
): Record<string, unknown> {
  const decoded: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields ?? {})) {
    decoded[key] = decodeFirestoreValue(value);
  }

  return decoded;
}

function decodeFirestoreValue(value: FirestoreRestValue): unknown {
  if ("stringValue" in value) {
    return value.stringValue;
  }
  if ("integerValue" in value) {
    return Number(value.integerValue);
  }
  if ("doubleValue" in value) {
    return value.doubleValue;
  }
  if ("booleanValue" in value) {
    return value.booleanValue;
  }
  if ("timestampValue" in value) {
    return new Date(value.timestampValue);
  }
  if ("nullValue" in value) {
    return null;
  }
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map((item) => decodeFirestoreValue(item));
  }
  if ("mapValue" in value) {
    return decodeFirestoreFields(value.mapValue.fields);
  }

  return null;
}

function encodeFirestoreValue(value: unknown): FirestoreRestValue {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }

    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => encodeFirestoreValue(item)) } };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: encodeFirestoreFields(value as Record<string, unknown>),
      },
    };
  }

  return { stringValue: String(value) };
}

export function encodeFirestoreFields(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)]),
  );
}

export async function getFirestoreDocumentWithAuth(
  path: string,
  idToken: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${getFirestoreBaseUrl()}/${path}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Firestore REST get failed: ${response.status} ${body}`);
  }

  const document = (await response.json()) as FirestoreRestDocument;
  return decodeFirestoreFields(document.fields);
}

export async function createFirestoreDocumentWithAuth(
  collectionPath: string,
  documentId: string,
  data: Record<string, unknown>,
  idToken: string,
) {
  const response = await fetch(
    `${getFirestoreBaseUrl()}/${collectionPath}?documentId=${encodeURIComponent(documentId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: encodeFirestoreFields(data),
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Firestore REST create failed: ${response.status} ${body}`);
  }
}
