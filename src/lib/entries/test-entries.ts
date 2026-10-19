// テスト申込（動作確認のために登録した申込）の指定と完全削除の判定。
// テスト申込の指定・解除と完全削除は、オーナーだけがサーバー（API ルート）経由で行う。
// 名前やメールアドレスからの自動判定はしない（オーナーが明示的に指定した申込だけが対象）。
// ブラウザとサーバーの両方から読み込むため、サーバー専用の処理は置かない。

type DataRecord = Record<string, unknown>;

// 申込に保存する項目名。Firestore ルールでは管理者のブラウザからの変更を認めていない
// （adminEntryUpdateAllowed の対象外）ため、サーバーだけが書き込む。
export const TEST_ENTRY_FIELD = "isTestEntry";

export function isTestEntry(data: DataRecord) {
  return data[TEST_ENTRY_FIELD] === true;
}

export type TestEntryPurgeBlockReason =
  | "not_test"
  | "paid"
  | "money_recorded"
  | "stripe";

export const TEST_ENTRY_PURGE_BLOCK_MESSAGES: Record<
  TestEntryPurgeBlockReason,
  string
> = {
  not_test: "テスト申込に指定されていません。",
  paid: "支払済みの記録があるため、完全削除できません。",
  money_recorded: "入金・返金の記録があるため、完全削除できません。",
  stripe: "Stripe の決済手続きの記録があるため、完全削除できません。",
};

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && value > 0;
}

// 完全削除できない理由。削除できる場合は null。
// ledgerTypes: 会計記録（entries/{id}/ledger）の種類。一覧画面では渡さず、
// サーバーが削除の直前に読み直して渡す。申込時の請求記録（charge）だけなら
// 入金済みとは判断しない。
export function getTestEntryPurgeBlockReason(
  data: DataRecord,
  ledgerTypes: readonly string[] = [],
): TestEntryPurgeBlockReason | null {
  if (!isTestEntry(data)) {
    return "not_test";
  }

  if (
    data.paymentStatus === "paid" ||
    data.paidAt != null ||
    data.paymentConfirmedAt != null
  ) {
    return "paid";
  }

  if (
    nonEmptyString(data.stripeSessionId) ||
    nonEmptyString(data.stripeCheckoutSessionId) ||
    nonEmptyString(data.stripePaymentIntentId)
  ) {
    return "stripe";
  }

  if (
    positiveNumber(data.paidAmount) ||
    positiveNumber(data.refundPlannedAmount) ||
    positiveNumber(data.refundedAmount) ||
    ledgerTypes.some((type) => type !== "charge")
  ) {
    return "money_recorded";
  }

  return null;
}

// API の応答（1 件ごとの結果）。
export type TestEntryOperationResult = {
  entryId: string;
  name: string;
  eventTitle: string;
  ok: boolean;
  // 失敗した場合の理由（画面にそのまま表示する）。
  error?: string;
  // 完全削除で削除した関連記録の件数。
  deleted?: { history: number; ledger: number; emailLogs: number };
  // 同じ申込 ID を使っていた過去の別の申込の記録として、削除せずに残した件数。
  kept?: { history: number; ledger: number; emailLogs: number };
};
