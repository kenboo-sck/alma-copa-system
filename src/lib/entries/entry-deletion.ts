// 申込の削除可否。管理画面のボタン表示と、削除できない理由の案内に使う。
// 実際の可否は firestore.rules（canWriteEntries / adminEntryDeleteAllowed）が決めるため、
// 判定を変える場合は両方を揃えること。
// ブラウザとサーバーの両方から読み込むため、サーバー専用の処理は置かない。

import type { AdminRole } from "@/lib/auth";

type DataRecord = Record<string, unknown>;

// paid: 支払済み / managed: 変更・キャンセル・入金や返金の記録がある
export type EntryDeleteBlockReason = "paid" | "managed";

export const ENTRY_DELETE_BLOCK_MESSAGES: Record<EntryDeleteBlockReason, string> = {
  paid: "支払済みの申込は削除できません。取り消す場合は「詳細・変更」から申込全体をキャンセルしてください。",
  managed:
    "変更・キャンセル・入金や返金の記録がある申込は、記録を残すため削除できません。キャンセル済みの申込があっても、同じメールアドレスで再申込できます。",
};

export const ENTRY_DELETE_PERMISSION_MESSAGE =
  "申込を削除する権限（entries:write）がありません。";

export function getEntryDeleteBlockReason(
  data: DataRecord,
): EntryDeleteBlockReason | null {
  if (data.paymentStatus === "paid") {
    return "paid";
  }

  const revision = typeof data.revision === "number" ? data.revision : 0;
  if (revision !== 0 || data.accountingInitialized === true) {
    return "managed";
  }

  return null;
}

// 申込を削除できる管理者か。オーナーは常に可能（サーバー側の requireAdminRequest と同じ判定）。
export function hasEntryWritePermission(
  user: { role: AdminRole; permissions: readonly string[] } | null | undefined,
): boolean {
  if (!user) {
    return false;
  }

  return user.role === "owner" || user.permissions.includes("entries:write");
}
