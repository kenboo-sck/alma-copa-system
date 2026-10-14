import "server-only";

import {
  FieldValue,
  type DocumentReference,
  type Transaction,
} from "firebase-admin/firestore";

import {
  ENTRY_LEDGER_COLLECTION,
  readEntryAccounting,
  toStoredPaymentStatus,
  type EntryAccounting,
  type LedgerType,
} from "@/lib/entries/entry-accounting";
import { toPaymentMethod } from "@/lib/payments/payment-methods";

// 金額の記録（台帳）: entries/{entryId}/ledger
// 請求・入金・返金予定・返金完了を 1 件ずつ追記する。Firestore ルールでは誰にも
// 書き込みを認めておらず、サーバー（Admin SDK）だけが追記する。更新・削除は行わない。

type DataRecord = Record<string, unknown>;

export type LedgerRecordInput = {
  // 重複して記録しないよう、決まった ID を使う場合に指定する（例: stripe_<セッションID>）。
  id?: string;
  type: LedgerType;
  // 請求は増減（負の値は減額）、それ以外は 0 以上。
  amount: number;
  method?: string | null;
  note: string;
  source: "system" | "stripe" | "admin";
  historyId?: string | null;
  adminUid?: string | null;
  adminEmail?: string | null;
};

export function writeLedgerRecord(
  transaction: Transaction,
  entryRef: DocumentReference,
  record: LedgerRecordInput,
) {
  const ledger = entryRef.collection(ENTRY_LEDGER_COLLECTION);
  const ref = record.id ? ledger.doc(record.id) : ledger.doc();

  // create は同じ ID の記録がすでにある場合に失敗する（上書きしない）。
  transaction.create(ref, {
    type: record.type,
    amount: record.amount,
    method: record.method ?? null,
    note: record.note,
    source: record.source,
    historyId: record.historyId ?? null,
    adminUid: record.adminUid ?? null,
    adminEmail: record.adminEmail ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// 台帳を持たない既存の申込について、保存済みの請求額・支払状態を最初の記録として残す。
// 支払済みの申込は「入金済み額＝請求額」を 1 回だけ記録する（ID を固定し、二重に計上しない）。
// 戻り値は、台帳の作成後の金額。
export function ensureAccountingInitialized(
  transaction: Transaction,
  entryRef: DocumentReference,
  data: DataRecord,
): EntryAccounting {
  const accounting = readEntryAccounting(data);

  if (accounting.isInitialized) {
    return accounting;
  }

  writeLedgerRecord(transaction, entryRef, {
    id: "opening_charge",
    type: "charge",
    amount: accounting.billedAmount,
    note: "申込時に確定した請求額",
    source: "system",
  });

  if (accounting.paidAmount > 0) {
    writeLedgerRecord(transaction, entryRef, {
      id: "opening_payment",
      type: "payment",
      amount: accounting.paidAmount,
      method: toPaymentMethod(data.paymentMethod),
      note: "既存の支払済み記録からの読み替え",
      source: "system",
    });
  }

  return { ...accounting, isInitialized: true };
}

// エントリー本体に保存する金額の項目。
export function accountingFields(accounting: EntryAccounting) {
  return {
    accountingInitialized: true,
    totalAmount: accounting.billedAmount,
    subtotalAmount: accounting.billedAmount,
    paidAmount: accounting.paidAmount,
    refundPlannedAmount: accounting.refundPlannedAmount,
    refundedAmount: accounting.refundedAmount,
    paymentStatus: toStoredPaymentStatus(accounting),
  };
}

export function recalculate(
  accounting: EntryAccounting,
  changes: Partial<
    Pick<
      EntryAccounting,
      "billedAmount" | "paidAmount" | "refundPlannedAmount" | "refundedAmount"
    >
  >,
): EntryAccounting {
  const next = { ...accounting, ...changes };
  const netPaid = next.paidAmount - next.refundedAmount;

  return {
    ...next,
    dueAmount: Math.max(0, next.billedAmount - netPaid),
    overpaidAmount: Math.max(0, netPaid - next.billedAmount),
    refundPendingAmount: Math.max(0, next.refundPlannedAmount - next.refundedAmount),
  };
}
