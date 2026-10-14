import type { AthleteInput } from "./entry-divisions";

const ENTRY_STORAGE_PREFIX = "alma-entry-";
const ENTRY_DRAFT_STORAGE_KEY = "alma-entry-draft";

function getStorageAreas() {
  if (typeof window === "undefined") {
    return [];
  }

  return [window.sessionStorage, window.localStorage];
}

export function getEntryDraftStorageKey(eventId: string) {
  return `${ENTRY_DRAFT_STORAGE_KEY}:${eventId}`;
}

export function clearEntryFlowStorage() {
  for (const storage of getStorageAreas()) {
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    ).filter((key): key is string => Boolean(key));

    for (const key of keys) {
      if (key.startsWith(ENTRY_STORAGE_PREFIX)) {
        storage.removeItem(key);
      }
    }
  }
}

// 入力フォームと確認画面で受け渡す下書き。
// 旧形式（version なし）の下書きは項目が合わないため読み込まない。
const ENTRY_DRAFT_VERSION = 2;

export type EntryDraftValues = {
  email: string;
  phone: string;
  gym: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
  representativeName: string;
  representativeEmail: string;
  representativePhone: string;
  representativeGym: string;
  representativePostalCode: string;
  representativePrefecture: string;
  representativeCity: string;
  representativeAddressLine: string;
  athletes: AthleteInput[];
};

export type EntryDraft = {
  version: typeof ENTRY_DRAFT_VERSION;
  eventId: string;
  entryType: "individual" | "representative";
  values: EntryDraftValues;
  savedAt: string;
};

export function readEntryDraft(eventId: string): EntryDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(getEntryDraftStorageKey(eventId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<EntryDraft> | null;

    if (
      !parsed ||
      parsed.version !== ENTRY_DRAFT_VERSION ||
      parsed.eventId !== eventId ||
      (parsed.entryType !== "individual" && parsed.entryType !== "representative") ||
      typeof parsed.savedAt !== "string" ||
      !parsed.values ||
      !Array.isArray(parsed.values.athletes)
    ) {
      return null;
    }

    return parsed as EntryDraft;
  } catch {
    return null;
  }
}

export function saveEntryDraft(
  eventId: string,
  entryType: "individual" | "representative",
  values: EntryDraftValues,
) {
  if (typeof window === "undefined") {
    return;
  }

  const draft: EntryDraft = {
    version: ENTRY_DRAFT_VERSION,
    eventId,
    entryType,
    values,
    savedAt: new Date().toISOString(),
  };

  window.sessionStorage.setItem(
    getEntryDraftStorageKey(eventId),
    JSON.stringify(draft),
  );
}

// 銀行振込・現金払いの受付完了画面に表示する内容。
// 申込の保存後に API が返した内容（申込時に保存した支払案内）をそのまま渡す。
const ENTRY_COMPLETION_STORAGE_KEY = "alma-entry-complete";

export type EntryCompletion = {
  entryId: string;
  eventTitle: string;
  entryType: "individual" | "representative";
  applicantName: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  totalAmount: number;
  summaryLines: string[];
  paymentGuidance: Array<{ label: string; value: string }>;
};

export function saveEntryCompletion(completion: EntryCompletion) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    `${ENTRY_COMPLETION_STORAGE_KEY}:${completion.entryId}`,
    JSON.stringify(completion),
  );
}

export function readEntryCompletionRaw(entryId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(`${ENTRY_COMPLETION_STORAGE_KEY}:${entryId}`);
}

export function parseEntryCompletion(
  entryId: string,
  raw: string,
): EntryCompletion | null {
  try {
    const parsed = JSON.parse(raw) as Partial<EntryCompletion> | null;

    if (
      !parsed ||
      parsed.entryId !== entryId ||
      typeof parsed.eventTitle !== "string" ||
      typeof parsed.applicantName !== "string" ||
      typeof parsed.paymentMethodLabel !== "string" ||
      typeof parsed.totalAmount !== "number" ||
      !Array.isArray(parsed.summaryLines) ||
      !Array.isArray(parsed.paymentGuidance)
    ) {
      return null;
    }

    return parsed as EntryCompletion;
  } catch {
    return null;
  }
}

// 申込が完了したあと、入力中の下書きを消す。
export function clearEntryDraft(eventId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(getEntryDraftStorageKey(eventId));
}
