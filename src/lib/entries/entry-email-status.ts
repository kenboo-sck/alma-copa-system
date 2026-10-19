// 受付メール（受付完了・完了メール）の送信状況。申込の entryEmail を読み、管理画面に表示する。
// ブラウザとサーバーの両方から読み込むため、サーバー専用の処理は置かない。

type DataRecord = Record<string, unknown>;

// sent: 送信済み / failed: 送信失敗 / stalled: 送信が途中で止まった（10 分以上 sending のまま）
// sending: 送信中 / waiting: カード決済の完了待ち（完了後に送信） / unknown: 記録なし（旧アプリの申込など）
export type EntryEmailState =
  | "sent"
  | "failed"
  | "stalled"
  | "sending"
  | "waiting"
  | "unknown";

export const ENTRY_EMAIL_STATE_LABELS: Record<EntryEmailState, string> = {
  sent: "送信済み",
  failed: "送信失敗",
  stalled: "送信未完了",
  sending: "送信中",
  waiting: "決済完了後に送信",
  unknown: "記録なし",
};

// 送信を担当した処理が止まったとみなすまでの時間（サーバー側の再送の判断と揃える）。
const SENDING_TIMEOUT_MS = 10 * 60 * 1000;

function toMillis(value: unknown): number | null {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (value && typeof value === "object" && "toMillis" in value) {
    const toMillisFn = (value as { toMillis?: unknown }).toMillis;
    return typeof toMillisFn === "function" ? (toMillisFn.call(value) as number) : null;
  }
  return null;
}

export function getEntryEmailState(
  data: DataRecord,
  now = Date.now(),
): EntryEmailState {
  const entryEmail =
    data.entryEmail && typeof data.entryEmail === "object"
      ? (data.entryEmail as DataRecord)
      : null;

  if (!entryEmail) {
    return "unknown";
  }

  switch (entryEmail.status) {
    case "sent":
      return "sent";
    case "failed":
      return "failed";
    case "none":
      return "waiting";
    case "sending": {
      const claimedAt = toMillis(entryEmail.claimedAt);
      return claimedAt !== null && now - claimedAt > SENDING_TIMEOUT_MS
        ? "stalled"
        : "sending";
    }
    default:
      return "unknown";
  }
}

// 受付済みなのに受付メールが届いていない（要対応）か。
export function needsEntryEmailAttention(data: DataRecord, now = Date.now()) {
  const state = getEntryEmailState(data, now);
  return (
    data.entryStatus === "confirmed" && (state === "failed" || state === "stalled")
  );
}
