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

