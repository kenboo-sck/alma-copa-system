// エントリーの出場状態（有効／取消）と金額（請求・入金・返金）を読むための共通処理。
// 管理画面（ブラウザ）とサーバーの両方から使うため、サーバー専用の処理は置かない。
//
// - 取消は削除せず、選手・部門・申込に status: "cancelled" と cancelledAt を残す。
// - 金額は「請求額」「入金済み額」「返金予定額」「返金済み額」を別々に持つ。
//   出場を取り消しただけでは、入金済み額も返金済み額も変わらない。

import { OPEN_CLASS_FEE, type Division } from "./entry-divisions";

type DataRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is DataRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberField(data: DataRecord, key: string) {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// 出場状態
// ---------------------------------------------------------------------------

export function isCancelledItem(value: unknown) {
  return isRecord(value) && value.status === "cancelled";
}

export function isEntryCancelled(data: DataRecord) {
  return data.entryStatus === "cancelled";
}

// 新形式（Gi / No-Gi 対応）の選手かどうか。
export function isV2StoredAthlete(athlete: DataRecord) {
  return (
    (athlete.athleteClass === "adult" || athlete.athleteClass === "kids") &&
    (athlete.divisionSelection === "gi" ||
      athlete.divisionSelection === "nogi" ||
      athlete.divisionSelection === "both")
  );
}

// 申込に含まれる選手（取消済みも含む）。代表者申込は athletes、個人申込は athlete。
// 旧形式の個人申込は選手情報がドキュメント直下にあるため、ドキュメント自体を返す。
export function getStoredAthletes(data: DataRecord): DataRecord[] {
  if (data.entryType === "representative") {
    return Array.isArray(data.athletes) ? data.athletes.filter(isRecord) : [];
  }

  return isRecord(data.athlete) ? [data.athlete] : [data];
}

// 選手が現在出場している部門（取消済みの部門・選手は含めない）。
export function getActiveDivisions(athlete: DataRecord): Division[] {
  if (isCancelledItem(athlete) || !isV2StoredAthlete(athlete)) {
    return [];
  }

  return (["gi", "nogi"] as const).filter(
    (division) => isRecord(athlete[division]) && !isCancelledItem(athlete[division]),
  );
}

export type ActiveEntrySummary = {
  // 有効な選手数（旧形式の選手は 1 名＝1 出場として数える）。
  athleteCount: number;
  divisionEntryCount: number;
  openClassEntryCount: number;
};

// 有効な出場だけを数える。申込全体が取消済みの場合はすべて 0。
export function summarizeActiveEntry(data: DataRecord): ActiveEntrySummary {
  const summary = { athleteCount: 0, divisionEntryCount: 0, openClassEntryCount: 0 };

  if (isEntryCancelled(data)) {
    return summary;
  }

  for (const athlete of getStoredAthletes(data)) {
    if (isCancelledItem(athlete)) {
      continue;
    }

    if (!isV2StoredAthlete(athlete)) {
      summary.athleteCount += 1;
      summary.divisionEntryCount += 1;
      continue;
    }

    const divisions = getActiveDivisions(athlete);
    if (divisions.length === 0) {
      continue;
    }

    summary.athleteCount += 1;
    summary.divisionEntryCount += divisions.length;
    summary.openClassEntryCount += divisions.filter(
      (division) =>
        athlete.athleteClass === "adult" &&
        (athlete[division] as DataRecord).openClass === "yes",
    ).length;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// 単価
// ---------------------------------------------------------------------------

export type UnitPriceInfo = {
  // 追加部門・追加選手に適用する 1 部門あたりの参加費（最初の申込時の参加費）。
  unitPrice: number | null;
  // 新形式で申込時の参加費が保存されているか、管理者が根拠を確認して入力済みの場合に true。
  // false の場合は推測せず、管理者が単価と根拠を入力するまで追加を受け付けない。
  isTrusted: boolean;
  basis: string;
};

export function readUnitPrice(data: DataRecord): UnitPriceInfo {
  const confirmation = isRecord(data.unitPriceConfirmation)
    ? data.unitPriceConfirmation
    : null;

  if (confirmation) {
    const confirmed = numberField(confirmation, "unitPrice");
    if (confirmed !== null && confirmed > 0) {
      return {
        unitPrice: confirmed,
        isTrusted: true,
        basis: typeof confirmation.basis === "string" ? confirmation.basis : "",
      };
    }
  }

  const entryFee = numberField(data, "entryFee");

  if (data.formatVersion === 2 && entryFee !== null && entryFee > 0) {
    return { unitPrice: entryFee, isTrusted: true, basis: "申込時に確定した参加費" };
  }

  // 旧形式は「参加費 × 選手数」で、部門ごとの単価として扱える根拠がない。
  return {
    unitPrice: entryFee !== null && entryFee > 0 ? entryFee : null,
    isTrusted: false,
    basis: "",
  };
}

export { OPEN_CLASS_FEE };

// ---------------------------------------------------------------------------
// 金額
// ---------------------------------------------------------------------------

export type EntryAccounting = {
  // 請求額（現在の請求の合計）。
  billedAmount: number;
  // 入金済み額（受け取った金額の合計。返金しても減らさない）。
  paidAmount: number;
  // 返金予定額（返金すると決めた金額の合計。返金済みの分も含む）。
  refundPlannedAmount: number;
  // 返金済み額（実際に返金を完了した金額の合計）。
  refundedAmount: number;
  // 追加支払額（請求額に対して不足している金額）。
  dueAmount: number;
  // 過入金額（請求額を超えて受け取っている金額。返金するかどうかは管理者が判断する）。
  overpaidAmount: number;
  // 返金予定のうち、まだ返金が完了していない金額。
  refundPendingAmount: number;
  // 金額の記録（台帳）を作成済みかどうか。未作成の申込は、保存済みの支払状態から読み替える。
  isInitialized: boolean;
};

// 既存の申込（金額の内訳を持たないもの）は、支払状態から読み替える。
// 支払済みなら「入金済み額＝請求額」とし、台帳の作成時にも同じ値を 1 回だけ記録する
// （読み替えと記録で二重に計上しない）。
export function readEntryAccounting(data: DataRecord): EntryAccounting {
  const billedAmount = Math.max(0, numberField(data, "totalAmount") ?? 0);
  const isInitialized = data.accountingInitialized === true;
  const paidAmount = isInitialized
    ? Math.max(0, numberField(data, "paidAmount") ?? 0)
    : data.paymentStatus === "paid"
      ? billedAmount
      : 0;
  const refundPlannedAmount = isInitialized
    ? Math.max(0, numberField(data, "refundPlannedAmount") ?? 0)
    : 0;
  const refundedAmount = isInitialized
    ? Math.max(0, numberField(data, "refundedAmount") ?? 0)
    : 0;
  const netPaid = paidAmount - refundedAmount;

  return {
    billedAmount,
    paidAmount,
    refundPlannedAmount,
    refundedAmount,
    dueAmount: Math.max(0, billedAmount - netPaid),
    overpaidAmount: Math.max(0, netPaid - billedAmount),
    refundPendingAmount: Math.max(0, refundPlannedAmount - refundedAmount),
    isInitialized,
  };
}

// 保存する支払状態（未払い／支払い済みの 2 値。既存の画面・処理との互換のため）。
export function toStoredPaymentStatus(accounting: EntryAccounting): "pending" | "paid" {
  return accounting.dueAmount > 0 ? "pending" : "paid";
}

export type PaymentState =
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "overpaid"
  | "refund_pending"
  | "refunded"
  | "no_charge";

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  unpaid: "未払い",
  partially_paid: "一部入金（残額あり）",
  paid: "支払い済み",
  overpaid: "過入金（精算要確認）",
  refund_pending: "返金待ち",
  refunded: "全額返金済み",
  no_charge: "請求なし",
};

export const PAYMENT_STATE_TONES: Record<
  PaymentState,
  "neutral" | "success" | "warning" | "danger"
> = {
  unpaid: "neutral",
  partially_paid: "warning",
  paid: "success",
  overpaid: "danger",
  refund_pending: "warning",
  refunded: "neutral",
  no_charge: "neutral",
};

// 管理画面に表示する支払状態。
export function getPaymentState(accounting: EntryAccounting): PaymentState {
  if (accounting.dueAmount > 0) {
    return accounting.paidAmount - accounting.refundedAmount > 0
      ? "partially_paid"
      : "unpaid";
  }

  if (accounting.overpaidAmount > 0) {
    return accounting.refundPendingAmount >= accounting.overpaidAmount
      ? "refund_pending"
      : "overpaid";
  }

  if (accounting.refundPendingAmount > 0) {
    return "refund_pending";
  }

  // 請求がなくなり、受け取った金額をすべて返金した申込。
  if (
    accounting.billedAmount === 0 &&
    accounting.paidAmount > 0 &&
    accounting.refundedAmount >= accounting.paidAmount
  ) {
    return "refunded";
  }

  return accounting.billedAmount > 0 || accounting.paidAmount > 0
    ? "paid"
    : "no_charge";
}

// ---------------------------------------------------------------------------
// 台帳・履歴（entries/{entryId}/ledger, entries/{entryId}/history）
// ---------------------------------------------------------------------------

export const ENTRY_LEDGER_COLLECTION = "ledger";
export const ENTRY_HISTORY_COLLECTION = "history";

export type LedgerType =
  | "charge"
  | "payment"
  | "refund_planned"
  | "refund_completed"
  | "refund_decision";

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  charge: "請求",
  payment: "入金",
  refund_planned: "返金予定",
  refund_completed: "返金完了",
  refund_decision: "返金しない判断",
};

export const MANUAL_PAYMENT_METHODS = [
  "bank_transfer",
  "cash",
  "card_verified",
] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export const LEDGER_METHOD_LABELS: Record<string, string> = {
  card: "クレジットカード（Stripe）",
  bank_transfer: "銀行振込",
  cash: "現金",
  card_verified: "カード（Stripe 管理画面で確認）",
};
