"use client";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import { useAdminAuth } from "@/features/admin-auth";
import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import {
  PAYMENT_STATE_LABELS,
  PAYMENT_STATE_TONES,
  getPaymentState,
  readEntryAccounting,
  type EntryAccounting,
} from "@/lib/entries/entry-accounting";
import {
  ENTRY_DELETE_BLOCK_MESSAGES,
  ENTRY_DELETE_PERMISSION_MESSAGE,
  getEntryDeleteBlockReason,
  hasEntryWritePermission,
  type EntryDeleteBlockReason,
} from "@/lib/entries/entry-deletion";
import { getGenderLabel } from "@/lib/entries/entry-divisions";
import {
  DIVISION_CSV_HEADERS,
  RECORD_DIVISION_LABELS,
  RECORD_STATUS_LABELS,
  UNSET_LABEL,
  buildDivisionCsvCells,
  describeDivisionEntryRecord,
  emptyDivisionEntryFilters,
  getAgeCategoryLabel,
  getAthleteClassLabel,
  getDivisionWeightGroupLabel,
  getRankLabel,
  getWeightClassLabel,
  mapEntryAthletes,
  matchesDivisionEntryFilters,
  type AthleteRecord,
  type DivisionEntryFilters,
  type DivisionEntryRecord,
} from "@/lib/entries/entry-records";
import {
  TEST_ENTRY_PURGE_BLOCK_MESSAGES,
  getTestEntryPurgeBlockReason,
  isTestEntry,
  type TestEntryOperationResult,
  type TestEntryPurgeBlockReason,
} from "@/lib/entries/test-entries";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  formatPaymentDueDate,
  getEntryStatusLabel,
  isBankTransferOverdue,
  toEntryPaymentStatus,
  toPaymentMethod,
  type PaymentMethod,
} from "@/lib/payments/payment-methods";
import type { EntryType, ReceptionStatus } from "@/types/entry";

type PaymentStatus = "pending" | "paid" | "failed";
type PaymentStatusFilter = "all" | PaymentStatus;
type PaymentMethodFilter = "all" | PaymentMethod;
type OverdueFilter = "all" | "overdue";
type ParticipationFilter = "all" | "active" | "cancelled";
type TestEntryFilter = "all" | "test" | "exclude";
type TestEntryAction = "mark" | "unmark" | "purge";
type ReceptionStatusFilter = "all" | ReceptionStatus;
type ViewMode = "list" | "weightClass";

type AdminEntry = {
  id: string;
  entryId: string;
  eventId: string;
  eventTitle: string;
  entryType: EntryType;
  name: string;
  kana: string;
  email: string;
  phone: string;
  birthDate: Date | null;
  gym: string;
  gender: string;
  guardianName: string;
  // "legacy" は Gi / No-Gi 対応前の旧形式の申込。
  format: AthleteRecord["format"];
  // 出場部門ごとの情報。絞り込み後の一覧では、条件に一致した部門だけが入る。
  // 取消済みの部門も status: "cancelled" で含まれる。
  divisionEntries: DivisionEntryRecord[];
  // 選手（または申込全体）が取消済みかどうか。
  status: AthleteRecord["status"];
  // 請求・入金・返金の内訳（申込全体）。
  accounting: EntryAccounting;
  paymentStatus: PaymentStatus;
  // 支払方法を持たない申込（支払方法の追加前）はカードとして扱う。
  paymentMethod: PaymentMethod;
  // 申込状態（支払状態とは別）。
  entryStatus: string;
  // 申込時にサーバーが確定した金額（申込全体）。
  totalAmount: number;
  // 銀行振込の支払期限（日本時間の "YYYY-MM-DD"）。
  paymentDueDate: string;
  paymentConfirmedAt: Date | null;
  paymentConfirmedByEmail: string;
  // カード決済の金額・申込との照合に失敗した場合の理由（要確認）。
  paymentIssueReason: string;
  stripeSessionId: string;
  stripePaymentIntentId: string;
  receptionStatus: ReceptionStatus;
  checkedInAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  // 削除できない理由（支払済み・変更や入金の記録あり）。削除できる場合は null。
  deleteBlockReason: EntryDeleteBlockReason | null;
  // オーナーが指定したテスト申込かどうか。
  isTestEntry: boolean;
  // テスト申込として完全削除できない理由（申込本体の項目から判定した目安。
  // 会計記録を含めた最終的な判定はサーバーが削除の直前に行う）。
  testPurgeBlockReason: TestEntryPurgeBlockReason | null;
};

const entryTypeLabels: Record<EntryType, string> = {
  individual: "個人",
  representative: "代表者",
};

const receptionStatusLabels: Record<ReceptionStatus, string> = {
  not_checked_in: "未受付",
  checked_in: "受付済",
};

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  return null;
}

function toPaymentStatus(value: unknown): PaymentStatus {
  return toEntryPaymentStatus(value);
}

function formatYen(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

function toEntryType(value: unknown): EntryType {
  return value === "representative" ? "representative" : "individual";
}

function toReceptionStatus(value: unknown): ReceptionStatus {
  return value === "checked_in" ? "checked_in" : "not_checked_in";
}

function formatDate(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function stringField(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function mapEntrySnapshotToAdminEntries(
  entryId: string,
  data: Record<string, unknown>,
): AdminEntry[] {
  const entryType = toEntryType(data.entryType);
  const baseEntry = {
    entryId,
    eventId: stringField(data, "eventId"),
    eventTitle: stringField(data, "eventTitle") || "大会未設定",
    entryType,
    email: stringField(data, "email"),
    phone: stringField(data, "phone"),
    gym: stringField(data, "gym"),
    paymentStatus: toPaymentStatus(data.paymentStatus),
    accounting: readEntryAccounting(data),
    paymentMethod: toPaymentMethod(data.paymentMethod),
    entryStatus: stringField(data, "entryStatus"),
    totalAmount: typeof data.totalAmount === "number" ? data.totalAmount : 0,
    paymentDueDate: stringField(data, "paymentDueDate"),
    paymentConfirmedAt: toDate(data.paymentConfirmedAt) ?? toDate(data.paidAt),
    paymentConfirmedByEmail: stringField(data, "paymentConfirmedByEmail"),
    paymentIssueReason:
      data.paymentIssue && typeof data.paymentIssue === "object"
        ? stringField(data.paymentIssue as Record<string, unknown>, "reason")
        : "",
    stripeSessionId:
      stringField(data, "stripeSessionId") ||
      stringField(data, "stripeCheckoutSessionId"),
    stripePaymentIntentId: stringField(data, "stripePaymentIntentId"),
    receptionStatus: toReceptionStatus(data.receptionStatus),
    checkedInAt: toDate(data.checkedInAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    deleteBlockReason: getEntryDeleteBlockReason(data),
    isTestEntry: isTestEntry(data),
    testPurgeBlockReason: getTestEntryPurgeBlockReason(data),
  };

  return mapEntryAthletes(data, toDate).map((athlete) => ({
    ...baseEntry,
    id:
      athlete.athleteIndex === null
        ? entryId
        : `${entryId}__athlete_${athlete.athleteIndex}`,
    name: athlete.name,
    kana: athlete.kana,
    birthDate: athlete.birthDate,
    gender: athlete.gender,
    guardianName: athlete.guardianName,
    format: athlete.format,
    status: athlete.status,
    divisionEntries: athlete.divisionEntries,
  }));
}

function sortFilterLabels(a: string, b: string) {
  if (a === UNSET_LABEL) {
    return 1;
  }
  if (b === UNSET_LABEL) {
    return -1;
  }
  return a.localeCompare(b, "ja-JP");
}

function countLabels(labels: string[]) {
  const map = new Map<string, number>();

  for (const label of labels) {
    map.set(label, (map.get(label) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => sortFilterLabels(a, b))
    .map(([label, count]) => ({ label, count }));
}

const filterSelectClassName =
  "h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold";

function EntryDivisionLines({ entry }: { entry: AdminEntry }) {
  return (
    <div className="space-y-1">
      {entry.divisionEntries.map((divisionEntry) => (
        <p
          key={divisionEntry.division}
          className={divisionEntry.status === "cancelled" ? "text-zinc-500" : undefined}
        >
          {divisionEntry.status === "cancelled" ? (
            <span className="mr-1 rounded-sm border border-red-800/70 px-1 text-xs text-red-300">
              取消済み
            </span>
          ) : null}
          <span
            className={
              divisionEntry.status === "cancelled" ? "line-through" : undefined
            }
          >
            {describeDivisionEntryRecord(divisionEntry)}
          </span>
        </p>
      ))}
      {entry.guardianName ? (
        <p className="text-xs text-zinc-500">保護者: {entry.guardianName}</p>
      ) : null}
    </div>
  );
}

// 支払方法・支払状態・確定金額・振込期限と、入金／現金受領の記録ボタン。
function EntryPaymentSummary({
  entry,
  canRecordPayment,
  isRecording,
  onRecordPayment,
}: {
  entry: AdminEntry;
  canRecordPayment: boolean;
  isRecording: boolean;
  onRecordPayment: (entry: AdminEntry) => void;
}) {
  const isOverdue = isBankTransferOverdue(entry);
  const isManualPayment = entry.paymentMethod !== "card";
  const { accounting } = entry;
  const paymentState = getPaymentState(accounting);
  const canRecord =
    canRecordPayment &&
    isManualPayment &&
    accounting.dueAmount > 0 &&
    entry.entryStatus !== "cancelled";

  return (
    <div className="space-y-1.5 text-xs text-zinc-400">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge
          label={PAYMENT_STATE_LABELS[paymentState]}
          tone={PAYMENT_STATE_TONES[paymentState]}
        />
        {isOverdue ? <StatusBadge label="振込期限超過" tone="danger" /> : null}
        {entry.paymentIssueReason ? (
          <StatusBadge label="決済要確認" tone="danger" />
        ) : null}
      </div>
      <p className="text-zinc-300">
        {PAYMENT_METHOD_LABELS[entry.paymentMethod]} / 請求{" "}
        {formatYen(accounting.billedAmount)}
      </p>
      {accounting.paidAmount > 0 && paymentState !== "paid" ? (
        <p>入金済み {formatYen(accounting.paidAmount)}</p>
      ) : null}
      {accounting.dueAmount > 0 && accounting.paidAmount > 0 ? (
        <p className="text-alma-gold">追加支払 {formatYen(accounting.dueAmount)}</p>
      ) : null}
      {accounting.refundPlannedAmount > 0 ? (
        <p>
          返金予定 {formatYen(accounting.refundPlannedAmount)} / 返金済み{" "}
          {formatYen(accounting.refundedAmount)}
        </p>
      ) : null}
      <p>申込: {getEntryStatusLabel(entry.entryStatus)}</p>
      {entry.paymentMethod === "bank_transfer" && entry.paymentDueDate ? (
        <p>期限: {formatPaymentDueDate(entry.paymentDueDate)}</p>
      ) : null}
      {entry.paymentStatus === "paid" && entry.paymentConfirmedAt ? (
        <p>
          確認: {formatDateTime(entry.paymentConfirmedAt)}
          {entry.paymentConfirmedByEmail ? `（${entry.paymentConfirmedByEmail}）` : ""}
        </p>
      ) : null}
      {entry.paymentIssueReason ? (
        <p className="text-red-300">照合エラー: {entry.paymentIssueReason}</p>
      ) : null}
      {canRecord ? (
        <button
          type="button"
          onClick={() => onRecordPayment(entry)}
          disabled={isRecording}
          className="rounded-md border border-alma-gold/60 px-2 py-1.5 text-xs font-semibold text-alma-gold transition hover:bg-alma-gold hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRecording
            ? "記録中..."
            : entry.paymentMethod === "cash"
              ? "現金受領を記録"
              : "入金を記録"}
        </button>
      ) : null}
      <Link
        href={`/admin/entries/${encodeURIComponent(entry.entryId)}`}
        className="inline-block rounded-md border border-white/10 px-2 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-alma-gold hover:text-alma-gold"
      >
        詳細・変更
      </Link>
    </div>
  );
}

function compareEntriesByName(a: AdminEntry, b: AdminEntry) {
  const aName = a.kana || a.name;
  const bName = b.kana || b.name;
  const nameResult = aName.localeCompare(bName, "ja-JP");

  if (nameResult !== 0) {
    return nameResult;
  }

  return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
}

async function sendIndividualEmail(input: {
  token: string;
  entry: AdminEntry;
  subject: string;
  body: string;
}) {
  const response = await fetch("/api/admin/emails/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mailType: "manual_individual",
      subject: input.subject,
      body: input.body,
      recipients: [
        {
          entryId: input.entry.entryId,
          eventId: input.entry.eventId,
          eventTitle: input.entry.eventTitle,
          recipientEmail: input.entry.email,
          recipientName: input.entry.name,
        },
      ],
    }),
  });
  const data = (await response.json().catch(() => null)) as {
    error?: string;
    sentCount?: number;
    failedCount?: number;
  } | null;

  if (!response.ok) {
    throw new Error(data?.error ?? "メール送信に失敗しました。");
  }

  return data;
}

async function sendBulkEmail(input: {
  token: string;
  entries: AdminEntry[];
  subject: string;
  body: string;
}) {
  const response = await fetch("/api/admin/emails/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mailType: "manual_bulk",
      subject: input.subject,
      body: input.body,
      recipients: input.entries.map((entry) => ({
        entryId: entry.entryId,
        eventId: entry.eventId,
        eventTitle: entry.eventTitle,
        recipientEmail: entry.email,
        recipientName: entry.name,
      })),
    }),
  });
  const data = (await response.json().catch(() => null)) as {
    error?: string;
    sentCount?: number;
    failedCount?: number;
    targetCount?: number;
  } | null;

  if (!response.ok) {
    throw new Error(data?.error ?? "メール送信に失敗しました。");
  }

  return data;
}

function TestEntryBadge({ entry }: { entry: AdminEntry }) {
  return entry.isTestEntry ? (
    <span className="ml-2 inline-flex items-center rounded-sm border border-sky-500/70 bg-sky-950 px-2 py-0.5 align-middle text-xs font-bold text-sky-200">
      テスト申込
    </span>
  ) : null;
}

const TEST_ENTRY_ACTION_LABELS: Record<TestEntryAction, string> = {
  mark: "テスト申込に指定",
  unmark: "テスト指定を解除",
  purge: "テスト申込を完全削除",
};

// テスト申込の指定・解除・完全削除の確認と結果。
// targets は申込単位（代表者申込の複数の選手は 1 件にまとめる）。
function TestEntryActionDialog({
  action,
  targets,
  results,
  isRunning,
  onConfirm,
  onClose,
}: {
  action: TestEntryAction;
  targets: AdminEntry[];
  results: TestEntryOperationResult[] | null;
  isRunning: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isPurge = action === "purge";
  const blocked = isPurge
    ? targets.filter((entry) => entry.testPurgeBlockReason !== null)
    : [];
  const runnable = targets.filter((entry) => !blocked.includes(entry));
  const succeeded = results?.filter((result) => result.ok) ?? [];
  const failed = results?.filter((result) => !result.ok) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="test-entry-dialog-title"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-zinc-950 p-6">
        <p className="text-sm font-semibold text-alma-gold">
          テスト申込の管理（オーナーのみ）
        </p>
        <h2 id="test-entry-dialog-title" className="mt-2 text-xl font-bold text-white">
          {TEST_ENTRY_ACTION_LABELS[action]}
        </h2>

        {results ? (
          <div className="mt-4 space-y-4 text-sm">
            <p className="text-zinc-200">
              成功{" "}
              <span className="font-semibold text-emerald-300">
                {succeeded.length}件
              </span>
              {" / "}
              失敗 <span className="font-semibold text-red-300">{failed.length}件</span>
            </p>
            {succeeded.length > 0 ? (
              <div>
                <p className="font-semibold text-emerald-300">成功</p>
                <ul className="mt-2 space-y-1 text-zinc-300">
                  {succeeded.map((result) => (
                    <li key={result.entryId}>
                      {result.name || result.entryId}（
                      {result.eventTitle || "大会未設定"}）
                      {result.deleted
                        ? ` … 変更履歴 ${result.deleted.history}件・会計記録 ${result.deleted.ledger}件・メール履歴 ${result.deleted.emailLogs}件も削除`
                        : ""}
                      {result.kept &&
                      result.kept.history + result.kept.ledger + result.kept.emailLogs >
                        0
                        ? `（同じ申込IDを使っていた過去の別の申込の記録 ${
                            result.kept.history +
                            result.kept.ledger +
                            result.kept.emailLogs
                          }件は残しました）`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {failed.length > 0 ? (
              <div>
                <p className="font-semibold text-red-300">失敗（変更していません）</p>
                <ul className="mt-2 space-y-1 text-red-100">
                  {failed.map((result) => (
                    <li key={result.entryId}>
                      {result.name || result.entryId}
                      {result.eventTitle ? `（${result.eventTitle}）` : ""}：
                      {result.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            <p className="text-zinc-200">
              対象:{" "}
              <span className="font-semibold text-white">{runnable.length}件</span>
              {blocked.length > 0 ? `（ほか ${blocked.length}件は対象外）` : ""}
            </p>
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-white/10 p-3 text-zinc-300">
              {runnable.map((entry) => (
                <li key={entry.entryId}>
                  {entry.name}（{entry.eventTitle}）
                  {entry.status === "cancelled" ? " ・取消済み" : ""}
                </li>
              ))}
            </ul>
            {blocked.length > 0 ? (
              <div className="rounded-md border border-red-800 bg-red-950/60 p-3 text-red-100">
                <p className="font-semibold">完全削除できない申込（削除しません）</p>
                <ul className="mt-2 space-y-1">
                  {blocked.map((entry) => (
                    <li key={entry.entryId}>
                      {entry.name}（{entry.eventTitle}）：
                      {entry.testPurgeBlockReason
                        ? TEST_ENTRY_PURGE_BLOCK_MESSAGES[entry.testPurgeBlockReason]
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {isPurge ? (
              <div className="space-y-2 rounded-md border border-amber-700 bg-amber-950/50 p-3 text-amber-100">
                <p className="font-semibold">元に戻せません。</p>
                <p>
                  申込本体と、その申込の作成以降に作られた変更履歴・会計記録・メール履歴を削除します。キャンセル済みや変更履歴のある申込も削除されます。
                  同じメールアドレスで以前に申し込まれ、削除済みになった別の申込の記録は残します。
                  入金・返金・Stripe
                  の決済記録がある申込は、サーバーで確認して削除しません。
                </p>
                <p>
                  すでに受信されたメール、メールサーバーや Stripe・Vercel
                  など外部サービスに残る記録は削除できません。 削除時にメールの送信や
                  Stripe での取消・返金は行いません。
                </p>
                <p>削除後は、同じメールアドレスで再申込できます。</p>
              </div>
            ) : (
              <p className="text-zinc-400">
                {action === "mark"
                  ? "テスト申込に指定すると、一覧で「テスト申込」と表示され、オーナーが完全削除できるようになります。申込の内容・金額は変わりません。"
                  : "テスト指定を解除すると、通常の申込と同じ扱い（通常の削除制限）に戻ります。"}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="min-h-11 rounded-md border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:border-alma-gold hover:text-alma-gold disabled:opacity-50"
          >
            {results ? "閉じる" : "キャンセル"}
          </button>
          {results ? null : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isRunning || runnable.length === 0}
              className={`min-h-11 rounded-md px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                isPurge
                  ? "bg-red-700 text-white hover:bg-red-600"
                  : "bg-alma-gold text-black hover:bg-[#d7b760]"
              }`}
            >
              {isRunning
                ? "処理中…"
                : isPurge
                  ? `${runnable.length}件を完全削除する`
                  : `${runnable.length}件を${action === "mark" ? "指定" : "解除"}する`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// 削除できない申込・権限のない管理者には、押せない状態で理由を示す
// （押しても削除が拒否され、一覧が元に戻るだけになるため）。
function DeleteEntryButton({
  entry,
  canDelete,
  isDeleting,
  onDelete,
  size = "normal",
}: {
  entry: AdminEntry;
  canDelete: boolean;
  isDeleting: boolean;
  onDelete: (entry: AdminEntry) => void;
  size?: "normal" | "small";
}) {
  const blockedMessage = !canDelete
    ? ENTRY_DELETE_PERMISSION_MESSAGE
    : entry.deleteBlockReason
      ? ENTRY_DELETE_BLOCK_MESSAGES[entry.deleteBlockReason]
      : null;
  const sizeClassName = size === "small" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm";

  return (
    <button
      type="button"
      onClick={() => onDelete(entry)}
      disabled={Boolean(blockedMessage) || isDeleting}
      title={blockedMessage ?? undefined}
      aria-label={
        blockedMessage
          ? `削除できません: ${blockedMessage}`
          : `${entry.name}の申込を削除`
      }
      className={`rounded-md border border-red-800/70 ${sizeClassName} text-red-200 hover:border-red-500 hover:text-red-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-zinc-600 disabled:hover:border-white/10 disabled:hover:text-zinc-600`}
    >
      {isDeleting ? "削除中…" : blockedMessage ? "削除不可" : "削除"}
    </button>
  );
}

type AdminEntriesManagerProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
};

export function AdminEntriesManager({
  eyebrow = "エントリー管理",
  title = "エントリー",
  description = "申込者情報、決済状態、受付状態を確認・管理します。",
}: AdminEntriesManagerProps = {}) {
  const { firebaseUser, adminUser } = useAdminAuth();
  // 入金・現金受領の記録は、payments:write の権限を持つ管理者だけが行える（owner は常に可）。
  const canRecordPayment =
    adminUser?.role === "owner" ||
    (adminUser?.permissions ?? []).includes("payments:write");
  // 申込の削除は entries:write の権限を持つ管理者だけが行える（owner は常に可）。
  const canDeleteEntries = hasEntryWritePermission(adminUser);
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 一覧の取得エラー。一覧の更新を受け取ったら消す。
  const [listError, setListError] = useState<string | null>(null);
  // 操作（更新・削除・入金記録）のエラー。一覧の更新では消さない
  // （削除が拒否されると、一覧は「消える → 戻る」と更新されるため）。
  const [error, setError] = useState<string | null>(null);
  const [deletingEntryIds, setDeletingEntryIds] = useState<string[]>([]);
  // テスト申込の指定・解除・完全削除はオーナーだけが行える（サーバーでも確認する）。
  const isOwner = adminUser?.role === "owner";
  const [testEntryFilter, setTestEntryFilter] = useState<TestEntryFilter>("all");
  const [testEntryDialog, setTestEntryDialog] = useState<{
    action: TestEntryAction;
    targets: AdminEntry[];
    results: TestEntryOperationResult[] | null;
  } | null>(null);
  const [isRunningTestAction, setIsRunningTestAction] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] =
    useState<PaymentStatusFilter>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] =
    useState<PaymentMethodFilter>("all");
  const [overdueFilter, setOverdueFilter] = useState<OverdueFilter>("all");
  const [participationFilter, setParticipationFilter] =
    useState<ParticipationFilter>("all");
  const [recordingEntryIds, setRecordingEntryIds] = useState<string[]>([]);
  const [receptionStatusFilter, setReceptionStatusFilter] =
    useState<ReceptionStatusFilter>("all");
  const [divisionFilters, setDivisionFilters] = useState<DivisionEntryFilters>(
    emptyDivisionEntryFilters,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [eventFilter, setEventFilter] = useState("all");
  const [qrEntry, setQrEntry] = useState<AdminEntry | null>(null);
  const [mailEntry, setMailEntry] = useState<AdminEntry | null>(null);
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailError, setMailError] = useState<string | null>(null);
  const [isSendingMail, setIsSendingMail] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [isBulkMailOpen, setIsBulkMailOpen] = useState(false);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [bulkMailSubject, setBulkMailSubject] = useState("");
  const [bulkMailBody, setBulkMailBody] = useState("");
  const [bulkMailError, setBulkMailError] = useState<string | null>(null);
  const [isSendingBulkMail, setIsSendingBulkMail] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, collections.entries),
      (snapshot) => {
        const nextEntries = snapshot.docs
          .flatMap((entrySnapshot) =>
            mapEntrySnapshotToAdminEntries(entrySnapshot.id, entrySnapshot.data()),
          )
          .sort(
            (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
          );

        setEntries(nextEntries);
        setIsLoading(false);
        setListError(null);
      },
      (caughtError) => {
        console.error(caughtError);
        setListError("エントリー一覧の取得に失敗しました。");
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setSelectedEntryIds((currentIds) => {
      const entryIds = new Set(entries.map((entry) => entry.id));
      return currentIds.filter((entryId) => entryIds.has(entryId));
    });
  }, [entries]);

  const eventOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const entry of entries) {
      if (entry.eventId) {
        map.set(entry.eventId, entry.eventTitle);
      }
    }

    return Array.from(map.entries()).map(([eventId, eventTitle]) => ({
      eventId,
      eventTitle,
    }));
  }, [entries]);

  const divisionFilterOptions = useMemo(() => {
    const allDivisionEntries = entries.flatMap((entry) => entry.divisionEntries);

    return {
      ageCategories: countLabels(allDivisionEntries.map(getAgeCategoryLabel)),
      weightClasses: countLabels(allDivisionEntries.map(getWeightClassLabel)),
      ranks: countLabels(allDivisionEntries.map(getRankLabel)),
    };
  }, [entries]);

  function updateDivisionFilter<Key extends keyof DivisionEntryFilters>(
    key: Key,
    value: DivisionEntryFilters[Key],
  ) {
    setDivisionFilters((current) => ({ ...current, [key]: value }));
  }

  const visibleEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return entries.flatMap((entry) => {
      // 部門に関する条件は、同じ 1 部門がすべて満たす場合だけ一致とする。
      const matchedDivisionEntries = entry.divisionEntries.filter(
        (divisionEntry) =>
          matchesDivisionEntryFilters(divisionEntry, divisionFilters) &&
          (participationFilter === "all" ||
            divisionEntry.status === participationFilter),
      );
      const matchesSearch =
        query.length === 0 ||
        [
          entry.id,
          entry.name,
          entry.kana,
          entry.email,
          entry.phone,
          entry.gym,
          entry.guardianName,
          ...entry.divisionEntries.map(describeDivisionEntryRecord),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesPayment =
        (paymentStatusFilter === "all" ||
          entry.paymentStatus === paymentStatusFilter) &&
        (paymentMethodFilter === "all" ||
          entry.paymentMethod === paymentMethodFilter) &&
        (overdueFilter === "all" || isBankTransferOverdue(entry));
      const matchesReception =
        receptionStatusFilter === "all" ||
        entry.receptionStatus === receptionStatusFilter;
      const matchesEvent = eventFilter === "all" || entry.eventId === eventFilter;
      const matchesTestEntry =
        testEntryFilter === "all" ||
        (testEntryFilter === "test" ? entry.isTestEntry : !entry.isTestEntry);

      if (
        matchedDivisionEntries.length === 0 ||
        !matchesSearch ||
        !matchesPayment ||
        !matchesReception ||
        !matchesEvent ||
        !matchesTestEntry
      ) {
        return [];
      }

      return [{ ...entry, divisionEntries: matchedDivisionEntries }];
    });
  }, [
    divisionFilters,
    entries,
    eventFilter,
    overdueFilter,
    participationFilter,
    paymentMethodFilter,
    paymentStatusFilter,
    receptionStatusFilter,
    searchQuery,
    testEntryFilter,
  ]);

  // 部門・階級ごとのグループ。両部門に出場する選手は、それぞれのグループに入る。
  const visibleEntriesByWeightClass = useMemo(() => {
    const map = new Map<string, AdminEntry[]>();

    for (const entry of visibleEntries) {
      for (const divisionEntry of entry.divisionEntries) {
        // 取消済みを表示する場合は、有効な出場と分けて集計する。
        const groupLabel =
          divisionEntry.status === "cancelled"
            ? `${getDivisionWeightGroupLabel(divisionEntry)}（取消済み）`
            : getDivisionWeightGroupLabel(divisionEntry);
        const group = map.get(groupLabel) ?? [];
        group.push({ ...entry, divisionEntries: [divisionEntry] });
        map.set(groupLabel, group);
      }
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "ja-JP"))
      .map(([groupLabel, groupEntries]) => ({
        groupLabel,
        entries: [...groupEntries].sort(compareEntriesByName),
      }));
  }, [visibleEntries]);

  const selectedEntries = useMemo(() => {
    const selectedIds = new Set(selectedEntryIds);
    return entries.filter((entry) => selectedIds.has(entry.id));
  }, [entries, selectedEntryIds]);

  const visibleEntryIds = useMemo(
    () => visibleEntries.map((entry) => entry.id),
    [visibleEntries],
  );
  const visibleSelectedCount = visibleEntryIds.filter((entryId) =>
    selectedEntryIds.includes(entryId),
  ).length;
  const isAllVisibleSelected =
    visibleEntryIds.length > 0 && visibleSelectedCount === visibleEntryIds.length;

  async function updateEntry(entryId: string, values: Record<string, unknown>) {
    setError(null);

    try {
      await updateDoc(doc(db, collections.entries, entryId), {
        ...values,
        updatedAt: serverTimestamp(),
      });
      setToast("エントリーを更新しました。");
    } catch (caughtError) {
      console.error(caughtError);
      setError("エントリーの更新に失敗しました。管理者権限を確認してください。");
    }
  }

  // 振込入金・現金受領の記録。支払済みへの変更と、確認した管理者・日時の記録は
  // サーバーが行う。同じ申込への二重操作は、サーバー側で重複処理しない。
  async function recordPayment(entry: AdminEntry) {
    if (recordingEntryIds.includes(entry.entryId)) {
      return;
    }

    const actionLabel = entry.paymentMethod === "cash" ? "現金の受領" : "振込の入金";
    const confirmed = window.confirm(
      `「${entry.name}」の申込（${formatYen(entry.totalAmount)}）について、${actionLabel}を記録して支払い済みにします。よろしいですか？`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setRecordingEntryIds((currentIds) => [...currentIds, entry.entryId]);

    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) {
        throw new Error("管理者認証を確認できませんでした。");
      }

      const response = await fetch("/api/admin/entries/confirm-payment", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entryId: entry.entryId }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        result?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "入金の記録に失敗しました。");
      }

      setToast(
        data?.result === "already_confirmed"
          ? "すでに支払い済みとして記録されています。"
          : `${actionLabel}を記録しました。`,
      );
    } catch (caughtError) {
      console.error(caughtError);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "入金の記録に失敗しました。",
      );
    } finally {
      setRecordingEntryIds((currentIds) =>
        currentIds.filter((entryId) => entryId !== entry.entryId),
      );
    }
  }

  // 1 行 = 選手 1 名 × 出場 1 部門。両部門に出場する選手は 2 行になる。
  // 支払に関する列（確定金額など）は申込全体の値で、同じ申込の行には同じ値が入る。
  function exportCsv() {
    const headers = [
      "エントリーID",
      "大会",
      "種別",
      "氏名",
      "フリガナ",
      "メール",
      "電話番号",
      "生年月日",
      "所属",
      ...DIVISION_CSV_HEADERS,
      "支払方法",
      "支払状態",
      "請求額（申込全体）",
      "入金済み額",
      "返金予定額",
      "返金済み額",
      "追加支払額",
      "支払期限",
      "振込期限超過",
      "入金確認日時",
      "申込状態",
      "受付状態",
      "受付日時",
    ];
    const rows = visibleEntries.flatMap((entry) =>
      entry.divisionEntries.map((divisionEntry) => [
        entry.entryId,
        entry.eventTitle,
        entryTypeLabels[entry.entryType],
        entry.name,
        entry.kana,
        entry.email,
        entry.phone,
        formatDate(entry.birthDate),
        entry.gym,
        ...buildDivisionCsvCells(entry, divisionEntry),
        PAYMENT_METHOD_LABELS[entry.paymentMethod],
        PAYMENT_STATE_LABELS[getPaymentState(entry.accounting)],
        String(entry.accounting.billedAmount),
        String(entry.accounting.paidAmount),
        String(entry.accounting.refundPlannedAmount),
        String(entry.accounting.refundedAmount),
        String(entry.accounting.dueAmount),
        entry.paymentDueDate,
        isBankTransferOverdue(entry) ? "超過" : "",
        entry.paymentStatus === "paid" && entry.paymentConfirmedAt
          ? formatDateTime(entry.paymentConfirmedAt)
          : "",
        getEntryStatusLabel(entry.entryStatus),
        receptionStatusLabels[entry.receptionStatus],
        formatDateTime(entry.checkedInAt),
      ]),
    );
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => csvCell(String(value))).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alma-copa-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("CSVを出力しました。");
  }

  function toggleReception(entry: AdminEntry) {
    const checkedIn = entry.receptionStatus !== "checked_in";

    return updateEntry(entry.entryId, {
      receptionStatus: checkedIn ? "checked_in" : "not_checked_in",
      checkedInAt: checkedIn ? serverTimestamp() : null,
    });
  }

  // 申込（代表者申込の場合は全選手を含む申込全体）を削除する。
  // 削除できるのは、支払済みでなく、変更・キャンセル・入金や返金の記録がない申込だけ
  // （firestore.rules と同じ判定。記録がある申込はキャンセルで状態を残す）。
  async function deleteEntry(entry: AdminEntry) {
    if (deletingEntryIds.includes(entry.entryId)) {
      return;
    }

    if (!canDeleteEntries) {
      setToast(null);
      setError(ENTRY_DELETE_PERMISSION_MESSAGE);
      return;
    }

    if (entry.deleteBlockReason) {
      setToast(null);
      setError(ENTRY_DELETE_BLOCK_MESSAGES[entry.deleteBlockReason]);
      return;
    }

    const confirmed = window.confirm(
      `「${entry.name}」の申込を削除しますか？削除すると元に戻せません。同じメールアドレスで再申込できるようになります。`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setToast(null);
    setDeletingEntryIds((currentIds) => [...currentIds, entry.entryId]);

    try {
      // サーバーが削除を確定してから完了になる（拒否された場合は例外になり、一覧は元に戻る）。
      await deleteDoc(doc(db, collections.entries, entry.entryId));
      setToast(`「${entry.name}」の申込を削除しました。`);
    } catch (caughtError) {
      console.error(caughtError);
      const code =
        caughtError && typeof caughtError === "object" && "code" in caughtError
          ? String(caughtError.code)
          : "";

      setError(
        code === "permission-denied"
          ? `「${entry.name}」の申込を削除できませんでした。支払済み、または変更・キャンセル・入金や返金の記録がある申込は削除できません（削除する権限がない場合も同じです）。画面を再読み込みして、申込の状態を確認してください。`
          : `「${entry.name}」の申込を削除できませんでした。通信状態を確認して、もう一度お試しください。${code ? `（${code}）` : ""}`,
      );
    } finally {
      setDeletingEntryIds((currentIds) =>
        currentIds.filter((entryId) => entryId !== entry.entryId),
      );
    }
  }

  // 選択中の選手を申込単位にまとめる（代表者申込の複数の選手は 1 件）。
  function getSelectedApplications(filter?: (entry: AdminEntry) => boolean) {
    const byEntryId = new Map<string, AdminEntry>();
    for (const entry of selectedEntries) {
      if ((!filter || filter(entry)) && !byEntryId.has(entry.entryId)) {
        byEntryId.set(entry.entryId, entry);
      }
    }
    return [...byEntryId.values()];
  }

  function openTestEntryDialog(action: TestEntryAction) {
    if (!isOwner) {
      return;
    }

    const targets = getSelectedApplications(
      action === "mark"
        ? (entry) => !entry.isTestEntry
        : action === "unmark"
          ? (entry) => entry.isTestEntry
          : undefined,
    );
    setTestEntryDialog({ action, targets, results: null });
  }

  async function runTestEntryAction() {
    if (!testEntryDialog || isRunningTestAction) {
      return;
    }

    const { action, targets } = testEntryDialog;
    // 完全削除は、画面上で対象外と分かっている申込を送らない（サーバーでも再確認する）。
    const entryIds = targets
      .filter((entry) => action !== "purge" || entry.testPurgeBlockReason === null)
      .map((entry) => entry.entryId);

    setIsRunningTestAction(true);
    setError(null);

    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) {
        throw new Error("管理者認証を確認できませんでした。");
      }

      const response = await fetch("/api/admin/entries/test-entries", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, entryIds }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        results?: TestEntryOperationResult[];
      } | null;

      if (!response.ok || !data?.results) {
        throw new Error(data?.error ?? "操作に失敗しました。");
      }

      // 削除した申込は一覧の更新で消え、選択も自動で外れる。
      setTestEntryDialog({ action, targets, results: data.results });
    } catch (caughtError) {
      console.error(caughtError);
      setTestEntryDialog(null);
      setError(
        caughtError instanceof Error ? caughtError.message : "操作に失敗しました。",
      );
    } finally {
      setIsRunningTestAction(false);
    }
  }

  function openMailModal(entry: AdminEntry) {
    setMailEntry(entry);
    setMailError(null);
    setMailSubject(`【COPA ALMA】${entry.eventTitle}について`);
    setMailBody(`${entry.name} 様\n\nCOPA ALMA 運営事務局です。\n\n`);
  }

  function toggleEntrySelection(entryId: string) {
    setSelectedEntryIds((currentIds) =>
      currentIds.includes(entryId)
        ? currentIds.filter((currentId) => currentId !== entryId)
        : [...currentIds, entryId],
    );
  }

  function selectEntries(entryIds: string[]) {
    setSelectedEntryIds((currentIds) => {
      const nextIds = new Set(currentIds);
      for (const entryId of entryIds) {
        nextIds.add(entryId);
      }
      return Array.from(nextIds);
    });
  }

  function clearEntriesSelection(entryIds: string[]) {
    setSelectedEntryIds((currentIds) =>
      currentIds.filter((currentId) => !entryIds.includes(currentId)),
    );
  }

  function selectAllVisibleEntries() {
    selectEntries(visibleEntryIds);
  }

  function clearSelectedEntries() {
    setSelectedEntryIds([]);
  }

  function toggleWeightClassSelection(groupEntries: AdminEntry[]) {
    const groupEntryIds = groupEntries.map((entry) => entry.id);
    const isAllSelected = groupEntryIds.every((entryId) =>
      selectedEntryIds.includes(entryId),
    );

    if (isAllSelected) {
      clearEntriesSelection(groupEntryIds);
      return;
    }

    selectEntries(groupEntryIds);
  }

  function openBulkMailModal() {
    if (selectedEntries.length === 0) {
      setToast("選手を選択してください。");
      return;
    }

    const firstEntry = selectedEntries[0];
    setBulkMailSubject(`【COPA ALMA】${firstEntry?.eventTitle ?? "大会"}について`);
    setBulkMailBody("COPA ALMA 運営事務局です。\n\n");
    setBulkMailError(null);
    setIsBulkConfirmOpen(false);
    setIsBulkMailOpen(true);
  }

  function closeBulkMailModal() {
    if (isSendingBulkMail) {
      return;
    }

    setIsBulkMailOpen(false);
    setIsBulkConfirmOpen(false);
    setBulkMailError(null);
  }

  function openBulkConfirmModal() {
    const subject = bulkMailSubject.trim();
    const body = bulkMailBody.trim();

    if (!subject || !body) {
      setBulkMailError("件名と本文を入力してください。");
      return;
    }

    if (selectedEntries.length === 0) {
      setBulkMailError("送信対象の選手を選択してください。");
      return;
    }

    setBulkMailError(null);
    setIsBulkConfirmOpen(true);
  }

  async function handleBulkMailSend() {
    if (isSendingBulkMail) {
      return;
    }

    const subject = bulkMailSubject.trim();
    const body = bulkMailBody.trim();

    if (!subject || !body) {
      setBulkMailError("件名と本文を入力してください。");
      setIsBulkConfirmOpen(false);
      return;
    }

    if (selectedEntries.length === 0) {
      setBulkMailError("送信対象の選手を選択してください。");
      setIsBulkConfirmOpen(false);
      return;
    }

    setBulkMailError(null);
    setIsSendingBulkMail(true);

    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) {
        throw new Error("管理者認証を確認できませんでした。");
      }

      const result = await sendBulkEmail({
        token,
        entries: selectedEntries,
        subject,
        body,
      });
      const sentCount = result?.sentCount ?? 0;
      const failedCount = result?.failedCount ?? 0;

      if (failedCount > 0) {
        throw new Error(
          `一括メールの一部送信に失敗しました。送信済み ${sentCount}件 / 失敗 ${failedCount}件。メール履歴を確認してください。`,
        );
      }

      setToast(`一括メールを送信しました。送信済み ${sentCount}件。`);
      setSelectedEntryIds([]);
      setIsBulkMailOpen(false);
      setIsBulkConfirmOpen(false);
    } catch (caughtError) {
      console.error(caughtError);
      setBulkMailError(
        caughtError instanceof Error
          ? caughtError.message
          : "一括メール送信に失敗しました。",
      );
      setIsBulkConfirmOpen(false);
    } finally {
      setIsSendingBulkMail(false);
    }
  }

  async function handleIndividualMailSend() {
    if (!mailEntry) {
      return;
    }

    const subject = mailSubject.trim();
    const body = mailBody.trim();

    if (!subject || !body) {
      setMailError("件名と本文を入力してください。");
      return;
    }

    const confirmed = window.confirm("この内容でメールを送信します。よろしいですか？");

    if (!confirmed) {
      return;
    }

    setMailError(null);
    setIsSendingMail(true);

    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) {
        throw new Error("管理者認証を確認できませんでした。");
      }

      const result = await sendIndividualEmail({
        token,
        entry: mailEntry,
        subject,
        body,
      });

      if ((result?.failedCount ?? 0) > 0) {
        throw new Error("メール送信に失敗しました。メール履歴を確認してください。");
      }

      setToast("メールを送信しました。");
      setMailEntry(null);
    } catch (caughtError) {
      console.error(caughtError);
      setMailError(
        caughtError instanceof Error
          ? caughtError.message
          : "メール送信に失敗しました。",
      );
    } finally {
      setIsSendingMail(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-alma-gold">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-bold text-white">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="min-h-11 rounded-md border border-alma-gold px-4 py-2 text-sm font-semibold text-alma-gold transition hover:bg-alma-gold hover:text-black"
        >
          CSV出力
        </button>
      </div>

      {listError ? (
        <div className="rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
          {listError}
        </div>
      ) : null}

      {/* 操作の結果は一覧のどこで操作しても見えるよう、画面下に固定して表示する。 */}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex flex-col items-end gap-2"
        aria-live="polite"
      >
        {error ? (
          <div
            role="alert"
            className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100 shadow-lg"
          >
            <p className="flex-1 leading-6">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 rounded px-2 py-1 text-xs text-red-200 hover:bg-red-900"
            >
              閉じる
            </button>
          </div>
        ) : null}
        {toast ? (
          <div className="pointer-events-auto w-full max-w-xl rounded-md border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-100 shadow-lg">
            {toast}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_140px_170px_130px_130px_130px]">
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">検索</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="氏名、メール、QRのIDで検索"
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">支払方法</span>
            <select
              value={paymentMethodFilter}
              onChange={(event) =>
                setPaymentMethodFilter(event.target.value as PaymentMethodFilter)
              }
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">すべて</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">出場状態</span>
            <select
              value={participationFilter}
              onChange={(event) =>
                setParticipationFilter(event.target.value as ParticipationFilter)
              }
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">すべて（取消済みを含む）</option>
              <option value="active">{RECORD_STATUS_LABELS.active}のみ</option>
              <option value="cancelled">{RECORD_STATUS_LABELS.cancelled}のみ</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">テスト申込</span>
            <select
              value={testEntryFilter}
              onChange={(event) =>
                setTestEntryFilter(event.target.value as TestEntryFilter)
              }
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">すべて</option>
              <option value="test">テスト申込のみ</option>
              <option value="exclude">テスト申込を除く</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">振込期限</span>
            <select
              value={overdueFilter}
              onChange={(event) =>
                setOverdueFilter(event.target.value as OverdueFilter)
              }
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">すべて</option>
              <option value="overdue">期限超過のみ</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">支払状態</span>
            <select
              value={paymentStatusFilter}
              onChange={(event) =>
                setPaymentStatusFilter(event.target.value as PaymentStatusFilter)
              }
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">すべて</option>
              <option value="pending">未払い</option>
              <option value="paid">支払い済み</option>
              <option value="failed">失敗</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">ステータス</span>
            <select
              value={receptionStatusFilter}
              onChange={(event) =>
                setReceptionStatusFilter(event.target.value as ReceptionStatusFilter)
              }
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">すべて</option>
              <option value="not_checked_in">未受付</option>
              <option value="checked_in">受付済</option>
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">部門</span>
            <select
              value={divisionFilters.division}
              onChange={(event) =>
                updateDivisionFilter(
                  "division",
                  event.target.value as DivisionEntryFilters["division"],
                )
              }
              className={filterSelectClassName}
            >
              <option value="all">すべて</option>
              <option value="gi">{RECORD_DIVISION_LABELS.gi}</option>
              <option value="nogi">{RECORD_DIVISION_LABELS.nogi}</option>
              <option value="legacy">{RECORD_DIVISION_LABELS.legacy}</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">大人／キッズ</span>
            <select
              value={divisionFilters.athleteClass}
              onChange={(event) =>
                updateDivisionFilter(
                  "athleteClass",
                  event.target.value as DivisionEntryFilters["athleteClass"],
                )
              }
              className={filterSelectClassName}
            >
              <option value="all">すべて</option>
              <option value="adult">大人</option>
              <option value="kids">キッズ</option>
              <option value="legacy">区分なし（旧形式）</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">年齢区分</span>
            <select
              value={divisionFilters.ageCategory}
              onChange={(event) =>
                updateDivisionFilter("ageCategory", event.target.value)
              }
              className={filterSelectClassName}
            >
              <option value="all">すべて</option>
              {divisionFilterOptions.ageCategories.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label}（{option.count}件）
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">階級</span>
            <select
              value={divisionFilters.weightClass}
              onChange={(event) =>
                updateDivisionFilter("weightClass", event.target.value)
              }
              className={filterSelectClassName}
            >
              <option value="all">すべて</option>
              {divisionFilterOptions.weightClasses.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label}（{option.count}件）
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">帯色／グレード</span>
            <select
              value={divisionFilters.rank}
              onChange={(event) => updateDivisionFilter("rank", event.target.value)}
              className={filterSelectClassName}
            >
              <option value="all">すべて</option>
              {divisionFilterOptions.ranks.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label}（{option.count}件）
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">無差別級</span>
            <select
              value={divisionFilters.openClass}
              onChange={(event) =>
                updateDivisionFilter(
                  "openClass",
                  event.target.value as DivisionEntryFilters["openClass"],
                )
              }
              className={filterSelectClassName}
            >
              <option value="all">すべて</option>
              <option value="yes">参加</option>
              <option value="no">不参加</option>
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[220px_1fr]">
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">大会</span>
            <select
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">すべて</option>
              {eventOptions.map((event) => (
                <option key={event.eventId} value={event.eventId}>
                  {event.eventTitle}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">表示</span>
            <div className="grid min-h-11 grid-cols-2 overflow-hidden rounded-md border border-white/10 bg-black p-1">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded px-3 py-2 text-sm font-semibold transition ${
                  viewMode === "list"
                    ? "bg-alma-gold text-black"
                    : "text-zinc-300 hover:text-white"
                }`}
              >
                通常一覧
              </button>
              <button
                type="button"
                onClick={() => setViewMode("weightClass")}
                className={`rounded px-3 py-2 text-sm font-semibold transition ${
                  viewMode === "weightClass"
                    ? "bg-alma-gold text-black"
                    : "text-zinc-300 hover:text-white"
                }`}
              >
                部門・階級別
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-300">
            選択中{" "}
            <span className="font-semibold text-alma-gold">
              {selectedEntries.length}
            </span>
            名
            {visibleEntries.length > 0 ? (
              <span className="ml-2 text-xs text-zinc-500">
                表示中 {visibleSelectedCount}/{visibleEntries.length}名
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={selectAllVisibleEntries}
              disabled={visibleEntries.length === 0 || isAllVisibleSelected}
              className="min-h-10 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-alma-gold hover:text-alma-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              全選択
            </button>
            <button
              type="button"
              onClick={clearSelectedEntries}
              disabled={selectedEntries.length === 0}
              className="min-h-10 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-alma-gold hover:text-alma-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              全解除
            </button>
            <button
              type="button"
              onClick={openBulkMailModal}
              disabled={selectedEntries.length === 0 || isSendingBulkMail}
              className="min-h-10 rounded-md bg-alma-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-50"
            >
              一括メール
            </button>
          </div>
        </div>
        {isOwner ? (
          <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-end">
            <span className="text-xs text-zinc-500 sm:mr-auto">
              テスト申込の管理（オーナーのみ）
            </span>
            <button
              type="button"
              onClick={() => openTestEntryDialog("mark")}
              disabled={!selectedEntries.some((entry) => !entry.isTestEntry)}
              className="min-h-10 rounded-md border border-sky-700 px-3 py-2 text-sm text-sky-200 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              テスト申込に指定
            </button>
            <button
              type="button"
              onClick={() => openTestEntryDialog("unmark")}
              disabled={!selectedEntries.some((entry) => entry.isTestEntry)}
              className="min-h-10 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-alma-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              テスト指定を解除
            </button>
            <button
              type="button"
              onClick={() => openTestEntryDialog("purge")}
              disabled={!selectedEntries.some((entry) => entry.isTestEntry)}
              className="min-h-10 rounded-md border border-red-700 px-3 py-2 text-sm font-semibold text-red-200 hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              テスト申込を完全削除
            </button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-alma-gold border-t-transparent" />
          <p className="mt-4 text-sm text-zinc-400">エントリーを読み込んでいます。</p>
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-zinc-400">
          条件に一致するエントリーはありません。
        </div>
      ) : viewMode === "weightClass" ? (
        <div className="space-y-5">
          {visibleEntriesByWeightClass.map((group) => {
            const groupEntryIds = group.entries.map((entry) => entry.id);
            const groupSelectedCount = groupEntryIds.filter((entryId) =>
              selectedEntryIds.includes(entryId),
            ).length;
            const isGroupSelected =
              group.entries.length > 0 && groupSelectedCount === group.entries.length;
            const paidCount = group.entries.filter(
              (entry) => entry.paymentStatus === "paid",
            ).length;
            const checkedInCount = group.entries.filter(
              (entry) => entry.receptionStatus === "checked_in",
            ).length;

            return (
              <section
                key={group.groupLabel}
                className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]"
              >
                <div className="border-b border-white/10 bg-black/40 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isGroupSelected}
                        onChange={() => toggleWeightClassSelection(group.entries)}
                        className="mt-1 h-4 w-4 accent-alma-gold"
                        aria-label={`${group.groupLabel}を全選択`}
                      />
                      <div>
                        <h2 className="text-lg font-bold text-white">
                          {group.groupLabel}（{group.entries.length}名）
                        </h2>
                        <p className="mt-1 text-xs text-zinc-500">
                          選択中 {groupSelectedCount}名
                        </p>
                      </div>
                    </label>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs sm:flex sm:text-left">
                      <div className="rounded-md border border-white/10 bg-black px-3 py-2">
                        <p className="text-zinc-500">支払い済み</p>
                        <p className="mt-1 font-semibold text-emerald-300">
                          {paidCount}/{group.entries.length}
                        </p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-black px-3 py-2">
                        <p className="text-zinc-500">未払い</p>
                        <p className="mt-1 font-semibold text-zinc-200">
                          {group.entries.length - paidCount}
                        </p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-black px-3 py-2">
                        <p className="text-zinc-500">受付済</p>
                        <p className="mt-1 font-semibold text-alma-gold">
                          {checkedInCount}/{group.entries.length}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 p-4 xl:hidden">
                  {group.entries.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-lg border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <label className="flex min-w-0 items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedEntryIds.includes(entry.id)}
                            onChange={() => toggleEntrySelection(entry.id)}
                            className="mt-1 h-4 w-4 accent-alma-gold"
                            aria-label={`${entry.name}を選択`}
                          />
                          <div className="min-w-0">
                            <h3 className="font-semibold text-white">
                              {entry.name}
                              <TestEntryBadge entry={entry} />
                            </h3>
                            <p className="mt-1 text-sm text-zinc-400">
                              {entry.eventTitle}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">{entry.email}</p>
                          </div>
                        </label>
                        <EntryPaymentSummary
                          entry={entry}
                          canRecordPayment={canRecordPayment}
                          isRecording={recordingEntryIds.includes(entry.entryId)}
                          onRecordPayment={(target) => void recordPayment(target)}
                        />
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                        <div className="sm:col-span-3">
                          <dt className="text-xs text-zinc-500">出場内容</dt>
                          <dd className="mt-1 text-zinc-200">
                            <EntryDivisionLines entry={entry} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-zinc-500">受付</dt>
                          <dd className="mt-1 text-zinc-200">
                            {receptionStatusLabels[entry.receptionStatus]}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-zinc-500">作成日時</dt>
                          <dd className="mt-1 text-zinc-200">
                            {formatDateTime(entry.createdAt)}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 grid gap-2 sm:grid-cols-4">
                        <button
                          type="button"
                          onClick={() => void toggleReception(entry)}
                          className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                        >
                          受付済切替
                        </button>
                        <button
                          type="button"
                          onClick={() => setQrEntry(entry)}
                          className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                        >
                          QR表示
                        </button>
                        <button
                          type="button"
                          onClick={() => openMailModal(entry)}
                          className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                        >
                          メール
                        </button>
                        <DeleteEntryButton
                          entry={entry}
                          canDelete={canDeleteEntries}
                          isDeleting={deletingEntryIds.includes(entry.entryId)}
                          onDelete={(target) => void deleteEntry(target)}
                        />
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full min-w-[1120px] text-left text-sm">
                    <thead className="border-b border-white/10 bg-black/30 text-xs text-zinc-400">
                      <tr>
                        <th className="px-4 py-3 font-semibold">選択</th>
                        <th className="px-4 py-3 font-semibold">氏名</th>
                        <th className="px-4 py-3 font-semibold">大会</th>
                        <th className="px-4 py-3 font-semibold">種別</th>
                        <th className="px-4 py-3 font-semibold">出場内容</th>
                        <th className="px-4 py-3 font-semibold">支払</th>
                        <th className="px-4 py-3 font-semibold">受付</th>
                        <th className="px-4 py-3 font-semibold">作成日時</th>
                        <th className="px-4 py-3 font-semibold">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries.map((entry) => (
                        <tr
                          key={entry.id}
                          className="border-b border-white/5 align-top"
                        >
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedEntryIds.includes(entry.id)}
                              onChange={() => toggleEntrySelection(entry.id)}
                              className="h-4 w-4 accent-alma-gold"
                              aria-label={`${entry.name}を選択`}
                            />
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-semibold text-white">
                              {entry.name}
                              <TestEntryBadge entry={entry} />
                            </p>
                            {entry.status === "cancelled" ? (
                              <StatusBadge label="取消済み" tone="danger" />
                            ) : null}
                            <p className="mt-1 text-xs text-zinc-500">{entry.kana}</p>
                            <p className="mt-1 text-xs text-zinc-500">{entry.email}</p>
                          </td>
                          <td className="px-4 py-4 text-zinc-300">
                            {entry.eventTitle}
                          </td>
                          <td className="px-4 py-4 text-zinc-300">
                            {entryTypeLabels[entry.entryType]}
                          </td>
                          <td className="px-4 py-4 text-zinc-300">
                            <EntryDivisionLines entry={entry} />
                          </td>
                          <td className="px-4 py-4">
                            <EntryPaymentSummary
                              entry={entry}
                              canRecordPayment={canRecordPayment}
                              isRecording={recordingEntryIds.includes(entry.entryId)}
                              onRecordPayment={(target) => void recordPayment(target)}
                            />
                          </td>
                          <td className="px-4 py-4 text-zinc-300">
                            {receptionStatusLabels[entry.receptionStatus]}
                          </td>
                          <td className="px-4 py-4 text-zinc-300">
                            {formatDateTime(entry.createdAt)}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void toggleReception(entry)}
                                className="rounded-md border border-white/10 px-2 py-1.5 text-xs text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                              >
                                受付
                              </button>
                              <button
                                type="button"
                                onClick={() => setQrEntry(entry)}
                                className="rounded-md border border-white/10 px-2 py-1.5 text-xs text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                              >
                                QR
                              </button>
                              <button
                                type="button"
                                onClick={() => openMailModal(entry)}
                                className="rounded-md border border-white/10 px-2 py-1.5 text-xs text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                              >
                                メール
                              </button>
                              <DeleteEntryButton
                                entry={entry}
                                canDelete={canDeleteEntries}
                                isDeleting={deletingEntryIds.includes(entry.entryId)}
                                onDelete={(target) => void deleteEntry(target)}
                                size="small"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="grid gap-3 xl:hidden">
            {visibleEntries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <label className="flex min-w-0 items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedEntryIds.includes(entry.id)}
                      onChange={() => toggleEntrySelection(entry.id)}
                      className="mt-1 h-4 w-4 accent-alma-gold"
                      aria-label={`${entry.name}を選択`}
                    />
                    <div className="min-w-0">
                      <h2 className="font-semibold text-white">
                        {entry.name}
                        <TestEntryBadge entry={entry} />
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400">{entry.eventTitle}</p>
                    </div>
                  </label>
                  <div className="shrink-0">
                    <EntryPaymentSummary
                      entry={entry}
                      canRecordPayment={canRecordPayment}
                      isRecording={recordingEntryIds.includes(entry.entryId)}
                      onRecordPayment={(target) => void recordPayment(target)}
                    />
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-zinc-500">種別 / 性別</dt>
                    <dd className="mt-1 text-zinc-200">
                      {entryTypeLabels[entry.entryType]} /{" "}
                      {getGenderLabel(entry.gender) || "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">受付</dt>
                    <dd className="mt-1 text-zinc-200">
                      {receptionStatusLabels[entry.receptionStatus]}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-zinc-500">出場内容</dt>
                    <dd className="mt-1 text-zinc-200">
                      <EntryDivisionLines entry={entry} />
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => void toggleReception(entry)}
                    className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                  >
                    受付済切替
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrEntry(entry)}
                    className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                  >
                    QR表示
                  </button>
                  <button
                    type="button"
                    onClick={() => openMailModal(entry)}
                    className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                  >
                    メール
                  </button>
                  <DeleteEntryButton
                    entry={entry}
                    canDelete={canDeleteEntries}
                    isDeleting={deletingEntryIds.includes(entry.entryId)}
                    onDelete={(target) => void deleteEntry(target)}
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] xl:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/50 text-xs text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      <input
                        type="checkbox"
                        checked={isAllVisibleSelected}
                        onChange={(event) => {
                          if (event.target.checked) {
                            selectAllVisibleEntries();
                          } else {
                            setSelectedEntryIds((currentIds) =>
                              currentIds.filter(
                                (entryId) => !visibleEntryIds.includes(entryId),
                              ),
                            );
                          }
                        }}
                        disabled={visibleEntries.length === 0}
                        className="h-4 w-4 accent-alma-gold disabled:cursor-not-allowed"
                        aria-label="表示中の選手を全選択"
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">氏名</th>
                    <th className="px-4 py-3 font-semibold">大会</th>
                    <th className="px-4 py-3 font-semibold">種別</th>
                    <th className="px-4 py-3 font-semibold">出場内容</th>
                    <th className="px-4 py-3 font-semibold">支払</th>
                    <th className="px-4 py-3 font-semibold">受付</th>
                    <th className="px-4 py-3 font-semibold">作成日時</th>
                    <th className="px-4 py-3 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((entry) => (
                    <tr key={entry.id} className="border-b border-white/5 align-top">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedEntryIds.includes(entry.id)}
                          onChange={() => toggleEntrySelection(entry.id)}
                          className="h-4 w-4 accent-alma-gold"
                          aria-label={`${entry.name}を選択`}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-white">
                          {entry.name}
                          <TestEntryBadge entry={entry} />
                        </p>
                        {entry.status === "cancelled" ? (
                          <StatusBadge label="取消済み" tone="danger" />
                        ) : null}
                        <p className="mt-1 text-xs text-zinc-500">{entry.kana}</p>
                        <p className="mt-1 text-xs text-zinc-500">{entry.email}</p>
                      </td>
                      <td className="px-4 py-4 text-zinc-300">{entry.eventTitle}</td>
                      <td className="px-4 py-4 text-zinc-300">
                        {entryTypeLabels[entry.entryType]}
                      </td>
                      <td className="px-4 py-4 text-zinc-300">
                        <EntryDivisionLines entry={entry} />
                      </td>
                      <td className="px-4 py-4">
                        <EntryPaymentSummary
                          entry={entry}
                          canRecordPayment={canRecordPayment}
                          isRecording={recordingEntryIds.includes(entry.entryId)}
                          onRecordPayment={(target) => void recordPayment(target)}
                        />
                      </td>
                      <td className="px-4 py-4 text-zinc-300">
                        <p>{receptionStatusLabels[entry.receptionStatus]}</p>
                      </td>
                      <td className="px-4 py-4 text-zinc-300">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void toggleReception(entry)}
                            className="rounded-md border border-white/10 px-2 py-1.5 text-xs text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                          >
                            受付
                          </button>
                          <button
                            type="button"
                            onClick={() => setQrEntry(entry)}
                            className="rounded-md border border-white/10 px-2 py-1.5 text-xs text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                          >
                            QR
                          </button>
                          <button
                            type="button"
                            onClick={() => openMailModal(entry)}
                            className="rounded-md border border-white/10 px-2 py-1.5 text-xs text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                          >
                            メール
                          </button>
                          <DeleteEntryButton
                            entry={entry}
                            canDelete={canDeleteEntries}
                            isDeleting={deletingEntryIds.includes(entry.entryId)}
                            onDelete={(target) => void deleteEntry(target)}
                            size="small"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {qrEntry ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-alma-gold/40 bg-zinc-950 p-5 text-center shadow-2xl shadow-black">
            <p className="text-sm font-semibold text-alma-gold">受付QRコード</p>
            <h2 className="mt-2 text-lg font-bold text-white">{qrEntry.name}</h2>
            <img
              alt={`${qrEntry.entryId} のQRコード`}
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrEntry.entryId)}`}
              className="mx-auto mt-5 rounded-md bg-white p-3"
            />
            <p className="mt-4 break-all font-mono text-xs text-zinc-400">
              {qrEntry.entryId}
            </p>
            <button
              type="button"
              onClick={() => setQrEntry(null)}
              className="mt-5 min-h-11 w-full rounded-md bg-alma-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d7b760]"
            >
              閉じる
            </button>
          </div>
        </div>
      ) : null}

      {mailEntry ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-lg border border-alma-gold/40 bg-zinc-950 p-5 shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-alma-gold">個別メール</p>
                <h2 className="mt-2 text-lg font-bold text-white">{mailEntry.name}</h2>
                <p className="mt-1 break-all text-sm text-zinc-400">
                  {mailEntry.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMailEntry(null)}
                className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:text-white"
              >
                キャンセル
              </button>
            </div>

            {mailError ? (
              <div className="mt-4 rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
                {mailError}
              </div>
            ) : null}

            <div className="mt-5 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-zinc-400">件名</span>
                <input
                  value={mailSubject}
                  onChange={(event) => setMailSubject(event.target.value)}
                  className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-zinc-400">本文</span>
                <textarea
                  value={mailBody}
                  onChange={(event) => setMailBody(event.target.value)}
                  rows={9}
                  className="w-full rounded-md border border-white/10 bg-black px-3 py-3 text-sm leading-6 text-white outline-none focus:border-alma-gold"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setMailEntry(null)}
                className="min-h-11 rounded-md border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:text-white"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void handleIndividualMailSend()}
                disabled={isSendingMail || !mailSubject.trim() || !mailBody.trim()}
                className="min-h-11 rounded-md bg-alma-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSendingMail ? "送信中..." : "送信"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isBulkMailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-lg border border-alma-gold/40 bg-zinc-950 p-5 shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-alma-gold">一括メール</p>
                <h2 className="mt-2 text-lg font-bold text-white">
                  選択中 {selectedEntries.length}名
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  選択した選手に同じ内容のメールを送信します。
                </p>
              </div>
              <button
                type="button"
                onClick={closeBulkMailModal}
                disabled={isSendingBulkMail}
                className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                キャンセル
              </button>
            </div>

            {bulkMailError ? (
              <div className="mt-4 rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
                {bulkMailError}
              </div>
            ) : null}

            <div className="mt-5 max-h-28 overflow-y-auto rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-zinc-300">
              {selectedEntries.map((entry) => (
                <div key={entry.id} className="flex justify-between gap-3 py-1">
                  <span className="font-semibold text-white">{entry.name}</span>
                  <span className="break-all text-xs text-zinc-500">{entry.email}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-zinc-400">件名</span>
                <input
                  value={bulkMailSubject}
                  onChange={(event) => setBulkMailSubject(event.target.value)}
                  disabled={isSendingBulkMail}
                  className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-zinc-400">本文</span>
                <textarea
                  value={bulkMailBody}
                  onChange={(event) => setBulkMailBody(event.target.value)}
                  rows={9}
                  disabled={isSendingBulkMail}
                  className="w-full rounded-md border border-white/10 bg-black px-3 py-3 text-sm leading-6 text-white outline-none focus:border-alma-gold disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeBulkMailModal}
                disabled={isSendingBulkMail}
                className="min-h-11 rounded-md border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={openBulkConfirmModal}
                disabled={
                  isSendingBulkMail ||
                  selectedEntries.length === 0 ||
                  !bulkMailSubject.trim() ||
                  !bulkMailBody.trim()
                }
                className="min-h-11 rounded-md bg-alma-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-50"
              >
                送信確認へ
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {testEntryDialog && isOwner ? (
        <TestEntryActionDialog
          action={testEntryDialog.action}
          targets={testEntryDialog.targets}
          results={testEntryDialog.results}
          isRunning={isRunningTestAction}
          onConfirm={() => void runTestEntryAction()}
          onClose={() => setTestEntryDialog(null)}
        />
      ) : null}

      {isBulkConfirmOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-alma-gold/40 bg-zinc-950 p-5 shadow-2xl shadow-black">
            <p className="text-sm font-semibold text-alma-gold">送信確認</p>
            <h2 className="mt-2 text-lg font-bold text-white">
              {selectedEntries.length}名に一括メールを送信します
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              送信後は各宛先ごとにメール履歴へ「一括メール」として保存されます。
            </p>
            <div className="mt-4 rounded-md border border-white/10 bg-black px-3 py-2">
              <p className="text-xs font-semibold text-zinc-500">件名</p>
              <p className="mt-1 break-all text-sm text-white">{bulkMailSubject}</p>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsBulkConfirmOpen(false)}
                disabled={isSendingBulkMail}
                className="min-h-11 rounded-md border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={() => void handleBulkMailSend()}
                disabled={isSendingBulkMail}
                className="min-h-11 rounded-md bg-alma-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSendingBulkMail ? "送信中..." : "送信する"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
