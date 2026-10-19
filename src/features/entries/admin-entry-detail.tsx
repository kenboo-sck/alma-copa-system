"use client";

import Link from "next/link";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import { useAdminAuth } from "@/features/admin-auth";
import {
  ENTRY_HISTORY_COLLECTION,
  ENTRY_LEDGER_COLLECTION,
  LEDGER_METHOD_LABELS,
  LEDGER_TYPE_LABELS,
  MANUAL_PAYMENT_METHODS,
  OPEN_CLASS_FEE,
  PAYMENT_STATE_LABELS,
  PAYMENT_STATE_TONES,
  getActiveDivisions,
  getPaymentState,
  getStoredAthletes,
  isCancelledItem,
  isRecord,
  isV2StoredAthlete,
  readEntryAccounting,
  readUnitPrice,
  summarizeActiveEntry,
  type EntryAccounting,
  type LedgerType,
} from "@/lib/entries/entry-accounting";
import {
  ATHLETE_CLASS_LABELS,
  DIVISION_LABELS,
  emptyAthleteInput,
  getCategoryOptions,
  getGenderLabel,
  getOpenClassLabel,
  type AthleteClass,
  type Division,
} from "@/lib/entries/entry-divisions";
import {
  ENTRY_EMAIL_STATE_LABELS,
  getEntryEmailState,
} from "@/lib/entries/entry-email-status";
import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import {
  PAYMENT_METHOD_LABELS,
  formatPaymentDueDate,
  getEntryStatusLabel,
  toPaymentMethod,
} from "@/lib/payments/payment-methods";

type DataRecord = Record<string, unknown>;

type OperationKind =
  | "add_division"
  | "cancel_division"
  | "open_class_on"
  | "open_class_off"
  | "update_category"
  | "add_athlete"
  | "cancel_athlete"
  | "cancel_entry"
  | "record_payment"
  | "plan_refund"
  | "complete_refund"
  | "no_refund"
  | "adjust_charge"
  | "confirm_unit_price"
  | "switch_payment_method"
  | "migrate_legacy_athlete";

const KIND_LABELS: Record<OperationKind, string> = {
  add_division: "部門の追加",
  cancel_division: "部門の取消",
  open_class_on: "無差別級の追加",
  open_class_off: "無差別級の取消",
  update_category: "カテゴリーの変更",
  add_athlete: "選手の追加",
  cancel_athlete: "選手の取消",
  cancel_entry: "申込全体のキャンセル",
  record_payment: "入金の記録",
  plan_refund: "返金予定の記録",
  complete_refund: "返金完了の記録",
  no_refund: "返金しない判断の記録",
  adjust_charge: "料金の調整",
  confirm_unit_price: "単価の確認",
  switch_payment_method: "支払方法の切り替え",
  migrate_legacy_athlete: "旧形式から新形式への移行",
};

type Dialog = {
  kind: OperationKind;
  athleteIndex?: number;
  division?: Division;
  values: Record<string, string>;
  reason: string;
  step: "edit" | "confirm";
  preview: OperationPreview | null;
  error: string | null;
};

type OperationPreview = {
  label: string;
  summaryLines: string[];
  warnings: string[];
  chargeDelta: number;
  before: EntryAccounting;
  after: EntryAccounting;
};

type LedgerRow = {
  id: string;
  type: LedgerType;
  amount: number;
  method: string;
  note: string;
  source: string;
  adminEmail: string;
  createdAt: Date | null;
};

type HistoryRow = {
  id: string;
  label: string;
  summaryLines: string[];
  reason: string;
  chargeDelta: number;
  adminEmail: string;
  createdAt: Date | null;
};

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return value instanceof Date ? value : null;
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

function yen(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

function str(data: DataRecord, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

const inputClassName =
  "h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold";
const buttonClassName =
  "rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-alma-gold hover:text-alma-gold disabled:cursor-not-allowed disabled:opacity-50";
const dangerButtonClassName =
  "rounded-md border border-red-800/70 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-500 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50";

function AmountCard({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: number;
  note?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-red-300"
      : tone === "warning"
        ? "text-alma-gold"
        : "text-white";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs font-semibold text-zinc-400">{label}</p>
      <p className={`mt-2 text-xl font-bold ${color}`}>{yen(value)}</p>
      {note ? <p className="mt-1 text-xs leading-5 text-zinc-500">{note}</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function AccountingTable({
  before,
  after,
}: {
  before: EntryAccounting;
  after: EntryAccounting;
}) {
  const rows: Array<[string, number, number]> = [
    ["請求額", before.billedAmount, after.billedAmount],
    ["入金済み額", before.paidAmount, after.paidAmount],
    ["返金予定額", before.refundPlannedAmount, after.refundPlannedAmount],
    ["返金済み額", before.refundedAmount, after.refundedAmount],
    ["追加支払額（未収）", before.dueAmount, after.dueAmount],
    ["過入金額", before.overpaidAmount, after.overpaidAmount],
  ];

  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs text-zinc-500">
        <tr>
          <th className="py-1 font-semibold">項目</th>
          <th className="py-1 text-right font-semibold">変更前</th>
          <th className="py-1 text-right font-semibold">変更後</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, beforeValue, afterValue]) => (
          <tr key={label} className="border-t border-white/5">
            <td className="py-1.5 text-zinc-300">{label}</td>
            <td className="py-1.5 text-right text-zinc-400">{yen(beforeValue)}</td>
            <td
              className={`py-1.5 text-right font-semibold ${
                beforeValue === afterValue ? "text-zinc-200" : "text-alma-gold"
              }`}
            >
              {yen(afterValue)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AdminEntryDetail({ entryId }: { entryId: string }) {
  const { firebaseUser, adminUser } = useAdminAuth();
  const [entry, setEntry] = useState<DataRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailMessage, setMailMessage] = useState<string | null>(null);
  const [isSendingMail, setIsSendingMail] = useState(false);
  // 受付メールの再送。
  const [resendIncludeAdmin, setResendIncludeAdmin] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  // 出場内容の変更には entries:write、金額が動く操作には payments:write が必要（owner は常に可）。
  const permissions = adminUser?.permissions ?? [];
  const isOwner = adminUser?.role === "owner";
  const canEdit = isOwner || permissions.includes("entries:write");
  const canMoney = canEdit && (isOwner || permissions.includes("payments:write"));
  const canSendMail = isOwner || permissions.includes("emails:send");

  useEffect(() => {
    const entryRef = doc(db, collections.entries, entryId);
    const unsubscribeEntry = onSnapshot(
      entryRef,
      (snapshot) => {
        setEntry(snapshot.exists() ? snapshot.data() : null);
        setIsLoading(false);
        setLoadError(null);
      },
      (error) => {
        console.error(error);
        setLoadError("エントリーの取得に失敗しました。管理者権限を確認してください。");
        setIsLoading(false);
      },
    );
    const unsubscribeLedger = onSnapshot(
      query(collection(entryRef, ENTRY_LEDGER_COLLECTION), orderBy("createdAt", "asc")),
      (snapshot) => {
        setLedger(
          // 申込時点の請求・入金（最初の記録）を先頭に、その後は記録順に並べる。
          [...snapshot.docs]
            .sort(
              (left, right) =>
                Number(right.id.startsWith("opening_")) -
                Number(left.id.startsWith("opening_")),
            )
            .map((item) => {
              const data = item.data();
              return {
                id: item.id,
                type: data.type as LedgerType,
                amount: typeof data.amount === "number" ? data.amount : 0,
                method: typeof data.method === "string" ? data.method : "",
                note: typeof data.note === "string" ? data.note : "",
                source: typeof data.source === "string" ? data.source : "",
                adminEmail: typeof data.adminEmail === "string" ? data.adminEmail : "",
                createdAt: toDate(data.createdAt),
              };
            }),
        );
      },
      (error) => console.error(error),
    );
    const unsubscribeHistory = onSnapshot(
      query(
        collection(entryRef, ENTRY_HISTORY_COLLECTION),
        orderBy("createdAt", "desc"),
      ),
      (snapshot) => {
        setHistory(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              label: typeof data.label === "string" ? data.label : "",
              summaryLines: Array.isArray(data.summaryLines)
                ? data.summaryLines.filter(
                    (line): line is string => typeof line === "string",
                  )
                : [],
              reason: typeof data.reason === "string" ? data.reason : "",
              chargeDelta: typeof data.chargeDelta === "number" ? data.chargeDelta : 0,
              adminEmail: typeof data.adminEmail === "string" ? data.adminEmail : "",
              createdAt: toDate(data.createdAt),
            };
          }),
        );
      },
      (error) => console.error(error),
    );

    return () => {
      unsubscribeEntry();
      unsubscribeLedger();
      unsubscribeHistory();
    };
  }, [entryId]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const accounting = useMemo(
    () => (entry ? readEntryAccounting(entry) : null),
    [entry],
  );
  const athletes = useMemo(() => (entry ? getStoredAthletes(entry) : []), [entry]);
  const unitPrice = useMemo(() => (entry ? readUnitPrice(entry) : null), [entry]);
  const activeSummary = useMemo(
    () => (entry ? summarizeActiveEntry(entry) : null),
    [entry],
  );

  if (isLoading) {
    return <p className="text-sm text-zinc-400">エントリーを読み込んでいます。</p>;
  }

  if (loadError || !entry || !accounting || !unitPrice || !activeSummary) {
    return (
      <section className="space-y-4">
        <Link href="/admin/entries" className="text-sm text-alma-gold">
          ← エントリー一覧へ戻る
        </Link>
        <p className="rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
          {loadError ?? "エントリーが見つかりません。"}
        </p>
      </section>
    );
  }

  const revision = typeof entry.revision === "number" ? entry.revision : 0;
  const isCancelled = entry.entryStatus === "cancelled";
  const isRepresentative = entry.entryType === "representative";
  const paymentState = getPaymentState(accounting);
  const paymentIssue = isRecord(entry.paymentIssue) ? entry.paymentIssue : null;
  const refundDecision = isRecord(entry.refundDecision) ? entry.refundDecision : null;
  // カード決済の手続き待ちで、入金も Stripe の決済手続きもない申込だけ、現金・振込に切り替えられる
  // （サーバーでも同じ条件と、大会で受け付けている支払方法かどうかを確認する）。
  const canSwitchPaymentMethod =
    entry.entryStatus === "pending_payment" &&
    toPaymentMethod(entry.paymentMethod) === "card" &&
    accounting.paidAmount === 0 &&
    !["stripeSessionId", "stripeCheckoutSessionId", "stripePaymentIntentId"].some(
      (key) => str(entry, key).trim() !== "",
    );

  function openDialog(
    kind: OperationKind,
    target: { athleteIndex?: number; division?: Division } = {},
    values: Record<string, string> = {},
  ) {
    setDialog({
      kind,
      ...target,
      values,
      reason: "",
      step: "edit",
      preview: null,
      error: null,
    });
  }

  function setValue(key: string, value: string) {
    setDialog((current) =>
      current ? { ...current, values: { ...current.values, [key]: value } } : current,
    );
  }

  function toInt(value: string | undefined) {
    const normalized = (value ?? "").replace(/[,\s]/g, "");
    return /^-?\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
  }

  // 画面の入力から、API に送る操作を組み立てる。
  function buildOperation(target: Dialog): Record<string, unknown> | string {
    const { values, athleteIndex, division } = target;

    switch (target.kind) {
      case "add_division":
        return {
          type: "add_division",
          athleteIndex,
          division,
          entry: {
            ageCategory: values.ageCategory ?? "",
            weightClass: values.weightClass ?? "",
            rank: values.rank ?? "",
            openClass: values.openClass === "yes" ? "yes" : "no",
          },
        };
      case "update_category":
        return {
          type: "update_category",
          athleteIndex,
          division,
          ageCategory: values.ageCategory ?? "",
          weightClass: values.weightClass ?? "",
          rank: values.rank ?? "",
        };
      case "open_class_on":
        return { type: "set_open_class", athleteIndex, division, openClass: "yes" };
      case "open_class_off":
      case "cancel_division":
      case "cancel_athlete":
      case "cancel_entry": {
        const chargeReduction = toInt(values.chargeReduction);
        if (Number.isNaN(chargeReduction) || chargeReduction < 0) {
          return "請求の減額を入力してください（減額しない場合は 0）。";
        }
        if (target.kind === "open_class_off") {
          return {
            type: "set_open_class",
            athleteIndex,
            division,
            openClass: "no",
            chargeReduction,
          };
        }
        return target.kind === "cancel_entry"
          ? { type: "cancel_entry", chargeReduction }
          : target.kind === "cancel_athlete"
            ? { type: "cancel_athlete", athleteIndex, chargeReduction }
            : { type: "cancel_division", athleteIndex, division, chargeReduction };
      }
      case "add_athlete": {
        const selection = values.divisionSelection ?? "";
        const includes = (target: Division) =>
          selection === target || selection === "both";
        return {
          type: "add_athlete",
          athlete: {
            ...emptyAthleteInput,
            name: values.name ?? "",
            kana: values.kana ?? "",
            gender: values.gender ?? "",
            birthDate: values.birthDate ?? "",
            athleteClass: values.athleteClass ?? "",
            guardianName: values.guardianName ?? "",
            divisionSelection: selection,
            gi: includes("gi")
              ? {
                  ageCategory: values.giAgeCategory ?? "",
                  weightClass: values.giWeightClass ?? "",
                  belt: values.giRank ?? "",
                  openClass: values.giOpenClass === "yes" ? "yes" : "no",
                }
              : emptyAthleteInput.gi,
            nogi: includes("nogi")
              ? {
                  ageCategory: values.nogiAgeCategory ?? "",
                  weightClass: values.nogiWeightClass ?? "",
                  grade: values.nogiRank ?? "",
                  openClass: values.nogiOpenClass === "yes" ? "yes" : "no",
                }
              : emptyAthleteInput.nogi,
          },
        };
      }
      case "record_payment": {
        const amount = toInt(values.amount);
        if (Number.isNaN(amount) || amount <= 0) {
          return "入金額を入力してください。";
        }
        return {
          type: "record_payment",
          amount,
          method: values.method ?? "bank_transfer",
        };
      }
      case "plan_refund":
      case "complete_refund": {
        const amount = toInt(values.amount);
        if (Number.isNaN(amount) || amount <= 0) {
          return "金額を入力してください。";
        }
        return { type: target.kind, amount };
      }
      case "no_refund":
        return { type: "no_refund" };
      case "adjust_charge": {
        const amount = toInt(values.amount);
        if (Number.isNaN(amount) || amount === 0) {
          return "調整額を入力してください（増額は正、減額は負の数）。";
        }
        return { type: "adjust_charge", amount };
      }
      case "confirm_unit_price": {
        const price = toInt(values.unitPrice);
        if (Number.isNaN(price) || price <= 0) {
          return "単価を入力してください。";
        }
        return {
          type: "confirm_unit_price",
          unitPrice: price,
          basis: values.basis ?? "",
        };
      }
      case "switch_payment_method": {
        if (values.method !== "cash" && values.method !== "bank_transfer") {
          return "切り替え後の支払方法を選択してください。";
        }
        return { type: "switch_payment_method", method: values.method };
      }
      case "migrate_legacy_athlete": {
        const athleteClass = values.athleteClass;
        const selection = values.divisionSelection;
        if (athleteClass !== "adult" && athleteClass !== "kids") {
          return "大人／キッズを選択してください。";
        }
        if (selection !== "gi" && selection !== "nogi" && selection !== "both") {
          return "出場部門を選択してください。";
        }
        const divisionInput = (prefix: "gi" | "nogi") => {
          const used = selection === "both" || selection === prefix;
          return {
            ageCategory: used ? (values[`${prefix}AgeCategory`] ?? "") : "",
            weightClass: used ? (values[`${prefix}WeightClass`] ?? "") : "",
            rank: used ? (values[`${prefix}Rank`] ?? "") : "",
            openClass:
              used && athleteClass === "adult"
                ? (values[`${prefix}OpenClass`] ?? "")
                : "",
          };
        };
        const gi = divisionInput("gi");
        const nogi = divisionInput("nogi");
        if (
          athleteClass === "adult" &&
          [gi, nogi].some(
            (entry, i) =>
              (selection === "both" || selection === (i === 0 ? "gi" : "nogi")) &&
              entry.openClass !== "yes" &&
              entry.openClass !== "no",
          )
        ) {
          return "無差別級の参加有無を、出場する部門ごとに選択してください。";
        }
        return {
          type: "migrate_legacy_athlete",
          athleteIndex,
          athleteClass,
          divisionSelection: selection,
          gi,
          nogi,
        };
      }
    }
  }

  // dryRun: true で確認画面用の内容を取得し、false で確定する。
  async function submitDialog(dryRun: boolean) {
    if (!dialog || busyRef.current) {
      return;
    }

    const operation = buildOperation(dialog);
    if (typeof operation === "string") {
      setDialog({ ...dialog, error: operation });
      return;
    }
    if (!dialog.reason.trim()) {
      setDialog({ ...dialog, error: "理由を入力してください。" });
      return;
    }

    busyRef.current = true;
    setIsBusy(true);

    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) {
        throw new Error("管理者認証を確認できませんでした。");
      }

      const response = await fetch("/api/admin/entries/operation", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "apply",
          entryId,
          expectedRevision: revision,
          reason: dialog.reason,
          dryRun,
          operation,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        preview?: OperationPreview;
        notificationDraft?: { subject: string; body: string };
      } | null;

      if (!response.ok || !data?.preview) {
        throw new Error(data?.error ?? "操作に失敗しました。");
      }

      if (dryRun) {
        setDialog({ ...dialog, step: "confirm", preview: data.preview, error: null });
        return;
      }

      setDialog(null);
      setToast(`${KIND_LABELS[dialog.kind]}を記録しました。`);
      if (data.notificationDraft) {
        setMailSubject(data.notificationDraft.subject);
        setMailBody(data.notificationDraft.body);
        setMailMessage(
          "変更内容を知らせるメールの文面を作成しました。内容を確認し、送信する場合だけ「送信」を押してください。",
        );
      }
    } catch (error) {
      setDialog((current) =>
        current
          ? {
              ...current,
              step: "edit",
              preview: null,
              error: error instanceof Error ? error.message : "操作に失敗しました。",
            }
          : current,
      );
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }

  async function createMailDraft() {
    setMailMessage(null);

    try {
      const token = await firebaseUser?.getIdToken();
      const response = await fetch("/api/admin/entries/operation", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "draft_notification", entryId }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        notificationDraft?: { subject: string; body: string };
      } | null;

      if (!response.ok || !data?.notificationDraft) {
        throw new Error(data?.error ?? "文面の作成に失敗しました。");
      }

      setMailSubject(data.notificationDraft.subject);
      setMailBody(data.notificationDraft.body);
      setMailMessage(
        "現在の申込内容から文面を作成しました。変更内容の欄を記入してください。",
      );
    } catch (error) {
      setMailMessage(
        error instanceof Error ? error.message : "文面の作成に失敗しました。",
      );
    }
  }

  // メールは、管理者が文面を確認して「送信」を押した場合だけ送る。
  // 申込時と同じ文面の受付メールを再送する（既定は申込者向けだけ）。
  async function resendEntryEmail() {
    if (!entry || isResending) {
      return;
    }

    const targets = resendIncludeAdmin
      ? `${str(entry, "email")} と管理者通知`
      : str(entry, "email");
    if (!window.confirm(`${targets} 宛に、受付メールを再送します。よろしいですか？`)) {
      return;
    }

    setIsResending(true);
    setResendMessage(null);

    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) {
        throw new Error("管理者認証を確認できませんでした。");
      }

      const response = await fetch("/api/admin/entries/resend-entry-email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entryId, includeAdmin: resendIncludeAdmin }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        results?: {
          recipientType: "user" | "admin";
          ok: boolean;
          error: string | null;
        }[];
      } | null;

      if (!response.ok || !data?.results) {
        throw new Error(data?.error ?? "受付メールの再送に失敗しました。");
      }

      const label = (type: "user" | "admin") =>
        type === "user" ? "申込者向け" : "管理者通知";
      const failed = data.results.filter((result) => !result.ok);
      setResendMessage(
        failed.length === 0
          ? {
              tone: "success",
              text: `受付メールを再送しました（${data.results.map((result) => label(result.recipientType)).join("・")}）。`,
            }
          : {
              tone: "error",
              text: `送信に失敗しました: ${failed
                .map(
                  (result) =>
                    `${label(result.recipientType)}（${result.error ?? "原因不明"}）`,
                )
                .join("、")}。メール履歴も確認してください。`,
            },
      );
    } catch (error) {
      setResendMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "受付メールの再送に失敗しました。",
      });
    } finally {
      setIsResending(false);
    }
  }

  async function sendMail() {
    if (!entry || isSendingMail || !mailSubject.trim() || !mailBody.trim()) {
      return;
    }

    if (
      !window.confirm(
        `${str(entry, "email")} 宛にこの内容でメールを送信します。よろしいですか？`,
      )
    ) {
      return;
    }

    setIsSendingMail(true);
    setMailMessage(null);

    try {
      const token = await firebaseUser?.getIdToken();
      const response = await fetch("/api/admin/emails/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mailType: "manual_individual",
          subject: mailSubject.trim(),
          body: mailBody.trim(),
          recipients: [
            {
              entryId,
              eventId: str(entry, "eventId"),
              eventTitle: str(entry, "eventTitle"),
              recipientEmail: str(entry, "email"),
              recipientName: str(entry, "name"),
            },
          ],
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        failedCount?: number;
      } | null;

      if (!response.ok || (data?.failedCount ?? 0) > 0) {
        throw new Error(data?.error ?? "メール送信に失敗しました。");
      }

      setMailMessage("メールを送信しました。");
    } catch (error) {
      setMailMessage(
        error instanceof Error ? error.message : "メール送信に失敗しました。",
      );
    } finally {
      setIsSendingMail(false);
    }
  }

  function categoryFields(athleteClass: AthleteClass, division: Division, prefix = "") {
    const options = getCategoryOptions(athleteClass);
    const key = (name: string) =>
      prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
    const select = (name: string, label: string, choices: string[]) => (
      <Field label={label}>
        <select
          value={dialog?.values[key(name)] ?? ""}
          onChange={(event) => setValue(key(name), event.target.value)}
          className={inputClassName}
        >
          <option value="">選択してください</option>
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      </Field>
    );

    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {select("ageCategory", "年齢区分", options.ageCategories)}
        {select("weightClass", options.weightClassLabel, options.weightClasses)}
        {division === "gi"
          ? select("rank", "帯色", options.belts)
          : select("rank", "グレード", options.grades)}
      </div>
    );
  }

  function openClassField(key: string) {
    return (
      <Field label={`無差別級（参加は +${yen(OPEN_CLASS_FEE)}）`}>
        <select
          value={dialog?.values[key] ?? "no"}
          onChange={(event) => setValue(key, event.target.value)}
          className={inputClassName}
        >
          <option value="no">不参加</option>
          <option value="yes">参加</option>
        </select>
      </Field>
    );
  }

  function reductionField(hint: string) {
    return (
      <Field label="請求の減額（円）">
        <input
          inputMode="numeric"
          value={dialog?.values.chargeReduction ?? ""}
          onChange={(event) => setValue("chargeReduction", event.target.value)}
          placeholder="減額しない場合は 0"
          className={inputClassName}
        />
        <span className="block text-xs leading-5 text-zinc-500">
          {hint}{" "}
          取消だけでは請求額・入金済み額は自動で変わりません。減額する金額を判断して入力してください。
          返金する場合は、取消のあとに「返金予定」を別に記録します。
        </span>
      </Field>
    );
  }

  function amountField(label: string, hint?: string) {
    return (
      <Field label={label}>
        <input
          inputMode="numeric"
          value={dialog?.values.amount ?? ""}
          onChange={(event) => setValue("amount", event.target.value)}
          className={inputClassName}
        />
        {hint ? (
          <span className="block text-xs leading-5 text-zinc-500">{hint}</span>
        ) : null}
      </Field>
    );
  }

  function renderDialogFields(target: Dialog) {
    const athlete =
      target.athleteIndex === undefined
        ? null
        : (athletes[target.athleteIndex] ?? null);
    const athleteClass = (athlete?.athleteClass ?? "adult") as AthleteClass;
    const price = unitPrice?.unitPrice ?? 0;
    const divisionEntry =
      athlete && target.division && isRecord(athlete[target.division])
        ? (athlete[target.division] as DataRecord)
        : null;
    const divisionValue =
      price +
      (divisionEntry?.openClass === "yes" && athleteClass === "adult"
        ? OPEN_CLASS_FEE
        : 0);

    switch (target.kind) {
      case "add_division":
        return (
          <div className="space-y-3">
            {categoryFields(athleteClass, target.division ?? "gi")}
            {athleteClass === "adult" ? openClassField("openClass") : null}
            <p className="text-xs leading-5 text-zinc-500">
              追加分には、最初の申込時の参加費（{yen(price)}）を適用します。
            </p>
          </div>
        );
      case "update_category":
        return (
          <div className="space-y-3">
            {categoryFields(athleteClass, target.division ?? "gi")}
            <p className="text-xs leading-5 text-zinc-500">
              カテゴリーの変更では料金は変わりません。
            </p>
          </div>
        );
      case "open_class_on":
        return (
          <p className="text-sm leading-6 text-zinc-300">
            無差別級を追加します。請求額に {yen(OPEN_CLASS_FEE)} を加算します。
          </p>
        );
      case "open_class_off":
        return reductionField(`無差別級の料金は ${yen(OPEN_CLASS_FEE)} です。`);
      case "cancel_division":
        return reductionField(
          unitPrice?.isTrusted
            ? `この部門の計算上の金額は ${yen(divisionValue)} です。`
            : "単価を特定できない申込のため、取消分の金額は計算していません。",
        );
      case "cancel_athlete": {
        const value = athlete
          ? getActiveDivisions(athlete).reduce(
              (sum, division) =>
                sum +
                price +
                (athlete.athleteClass === "adult" &&
                (athlete[division] as DataRecord).openClass === "yes"
                  ? OPEN_CLASS_FEE
                  : 0),
              0,
            )
          : 0;
        return reductionField(
          unitPrice?.isTrusted
            ? `この選手の計算上の金額は ${yen(value)} です。`
            : "単価を特定できない申込のため、取消分の金額は計算していません（請求を減らす場合は「料金の調整」で記録します）。",
        );
      }
      case "cancel_entry":
        return (
          <div className="space-y-3">
            {reductionField(
              `現在の請求額は ${yen(accounting?.billedAmount ?? 0)}、入金済み額は ${yen(accounting?.paidAmount ?? 0)} です。`,
            )}
            <p className="text-xs leading-5 text-zinc-500">
              未払いの申込で請求を残さない場合は、請求額と同じ金額を減額してください。
              キャンセル料を残す場合は、その分を除いた金額を入力します。
            </p>
          </div>
        );
      case "add_athlete": {
        const selectedClass = target.values.athleteClass as AthleteClass | "";
        const selection = target.values.divisionSelection ?? "";
        const text = (key: string, label: string, type = "text") => (
          <Field label={label}>
            <input
              type={type}
              value={target.values[key] ?? ""}
              onChange={(event) => setValue(key, event.target.value)}
              className={inputClassName}
            />
          </Field>
        );
        const choice = (
          key: string,
          label: string,
          choices: Array<[string, string]>,
        ) => (
          <Field label={label}>
            <select
              value={target.values[key] ?? ""}
              onChange={(event) => setValue(key, event.target.value)}
              className={inputClassName}
            >
              <option value="">選択してください</option>
              {choices.map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        );

        return (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {text("name", "氏名")}
              {text("kana", "フリガナ")}
              {choice("gender", "性別", [
                ["male", "男性"],
                ["female", "女性"],
              ])}
              {text("birthDate", "生年月日", "date")}
              {choice("athleteClass", "大人／キッズ", [
                ["adult", "大人"],
                ["kids", "キッズ"],
              ])}
              {selectedClass === "kids" ? text("guardianName", "保護者氏名") : null}
              {choice("divisionSelection", "出場部門", [
                ["gi", "Giのみ"],
                ["nogi", "No-Giのみ"],
                ["both", "両方（Gi・No-Gi）"],
              ])}
            </div>
            {selectedClass
              ? (["gi", "nogi"] as const)
                  .filter((division) => selection === division || selection === "both")
                  .map((division) => (
                    <div
                      key={division}
                      className="space-y-3 rounded-md border border-alma-gold/25 p-3"
                    >
                      <p className="text-xs font-bold text-alma-gold">
                        {DIVISION_LABELS[division]}
                      </p>
                      {categoryFields(selectedClass, division, division)}
                      {selectedClass === "adult"
                        ? openClassField(`${division}OpenClass`)
                        : null}
                    </div>
                  ))
              : null}
            <p className="text-xs leading-5 text-zinc-500">
              追加分には、最初の申込時の参加費（1 部門 {yen(price)}）を適用します。
            </p>
          </div>
        );
      }
      case "record_payment":
        return (
          <div className="space-y-3">
            {amountField(
              "入金額（円）",
              `現在の追加支払額（未収）は ${yen(accounting?.dueAmount ?? 0)} です。`,
            )}
            <Field label="入金方法">
              <select
                value={target.values.method ?? "bank_transfer"}
                onChange={(event) => setValue("method", event.target.value)}
                className={inputClassName}
              >
                {MANUAL_PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {LEDGER_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        );
      case "plan_refund":
        return amountField(
          "返金予定額（円）",
          `入金済み ${yen(accounting?.paidAmount ?? 0)} ／ 過入金 ${yen(accounting?.overpaidAmount ?? 0)}。この記録だけでは返金は実行されません。`,
        );
      case "complete_refund":
        return amountField(
          "返金した金額（円）",
          `返金予定のうち未完了: ${yen(accounting?.refundPendingAmount ?? 0)}。実際に返金した後に記録してください。`,
        );
      case "no_refund":
        return (
          <p className="text-sm leading-6 text-zinc-300">
            返金しないことを記録します。理由（規約上の扱い、申込者との合意内容など）を下の欄に入力してください。
          </p>
        );
      case "adjust_charge":
        return amountField(
          "調整額（円）",
          "増額は正の数、減額は負の数（例: -2000）。キャンセル料の設定や、個別の値引き・追加請求に使います。",
        );
      case "confirm_unit_price":
        return (
          <div className="space-y-3">
            <Field label="1 部門あたりの単価（円）">
              <input
                inputMode="numeric"
                value={target.values.unitPrice ?? ""}
                onChange={(event) => setValue("unitPrice", event.target.value)}
                className={inputClassName}
              />
            </Field>
            <Field label="根拠（確認した資料・申込時の料金表など）">
              <textarea
                value={target.values.basis ?? ""}
                onChange={(event) => setValue("basis", event.target.value)}
                rows={3}
                className="w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-alma-gold"
              />
            </Field>
            <p className="text-xs leading-5 text-zinc-500">
              保存されている参加費:{" "}
              {unitPrice?.unitPrice ? yen(unitPrice.unitPrice) : "なし"}
              。旧形式の申込は「参加費 ×
              選手数」で保存されており、部門ごとの単価としては扱えないため、
              推測せず、確認した金額を入力してください。既存の出場分の請求額は変更しません。
            </p>
          </div>
        );
      case "switch_payment_method":
        return (
          <div className="space-y-3">
            <Field label="切り替え後の支払方法">
              <select
                value={target.values.method ?? ""}
                onChange={(event) => setValue("method", event.target.value)}
                className={inputClassName}
              >
                <option value="">選択してください</option>
                <option value="cash">現金払い</option>
                <option value="bank_transfer">銀行振込</option>
              </select>
            </Field>
            <p className="text-xs leading-5 text-zinc-500">
              「カード決済の手続き待ち」の申込を「受付済み・未払い」にします。請求額と支払状態は変わりません。
              実際に受け取ったら「入金を記録」で記録してください。大会で受け付けていない支払方法には切り替えられません。
              メールは自動では送信されません。
            </p>
          </div>
        );
      case "migrate_legacy_athlete": {
        const values = target.values;
        const migrateClass: AthleteClass =
          values.athleteClass === "kids" ? "kids" : "adult";
        const selection = values.divisionSelection ?? "";
        const explicitSelect = (
          key: string,
          label: string,
          choices: Array<[string, string]>,
        ) => (
          <Field label={label}>
            <select
              value={values[key] ?? ""}
              onChange={(event) => setValue(key, event.target.value)}
              className={inputClassName}
            >
              <option value="">選択してください</option>
              {choices.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </Field>
        );
        const divisionBlock = (division: Division) =>
          selection === "both" || selection === division ? (
            <div className="space-y-3 rounded-md border border-white/10 p-3">
              <p className="text-sm font-semibold text-white">
                {DIVISION_LABELS[division]}
              </p>
              {categoryFields(migrateClass, division, division)}
              {migrateClass === "adult"
                ? explicitSelect(`${division}OpenClass`, "無差別級の参加", [
                    ["yes", `参加（+${yen(OPEN_CLASS_FEE)}）`],
                    ["no", "不参加"],
                  ])
                : null}
            </div>
          ) : null;

        return (
          <div className="space-y-3">
            <div className="rounded-md border border-white/10 bg-black/40 p-3 text-sm leading-6 text-zinc-300">
              <p className="text-xs font-semibold text-zinc-400">
                保存されている旧形式の内容
              </p>
              <p>
                {[athlete?.category, athlete?.ageCategory, athlete?.weightClass]
                  .filter((value) => typeof value === "string" && value)
                  .join(" / ") || "カテゴリー情報なし"}
                {" / 無差別級: "}
                {athlete?.openClass === "yes"
                  ? "参加"
                  : athlete?.openClass === "no"
                    ? "不参加"
                    : "記録なし"}
              </p>
            </div>
            {explicitSelect("athleteClass", "区分", [
              ["adult", "大人"],
              ["kids", "キッズ"],
            ])}
            {explicitSelect("divisionSelection", "出場部門", [
              ["gi", "Giのみ"],
              ["nogi", "No-Giのみ"],
              ["both", "両方（Gi・No-Gi）"],
            ])}
            {divisionBlock("gi")}
            {divisionBlock("nogi")}
            <p className="text-xs leading-5 text-zinc-500">
              部門・帯（グレード）・年齢区分・階級・無差別級は、申込者への確認などで分かった内容を指定してください。
              保存されていない情報は推測で補いません（氏名・性別・生年月日は保存済みの値を使います）。
              移行だけでは請求額・入金記録は変わりません。次の画面で移行前後を比較してから確定します。
            </p>
          </div>
        );
      }
    }
  }

  const dialogTarget =
    dialog && dialog.athleteIndex !== undefined
      ? `${isRepresentative ? `選手${dialog.athleteIndex + 1} ` : ""}${str(athletes[dialog.athleteIndex] ?? {}, "name")}${
          dialog.division ? ` / ${DIVISION_LABELS[dialog.division]}` : ""
        }`
      : "";

  return (
    <section className="space-y-6">
      <div>
        <Link href="/admin/entries" className="text-sm text-alma-gold">
          ← エントリー一覧へ戻る
        </Link>
        <p className="mt-4 text-sm font-semibold text-alma-gold">エントリー詳細</p>
        <h1 className="mt-2 text-2xl font-bold text-white">{str(entry, "name")}</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {str(entry, "eventTitle")} / {isRepresentative ? "代表者申込" : "個人申込"} /{" "}
          {str(entry, "email")}
        </p>
        <p className="mt-1 break-all font-mono text-xs text-zinc-500">{entryId}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge
            label={`申込: ${getEntryStatusLabel(str(entry, "entryStatus"))}`}
            tone={isCancelled ? "danger" : "neutral"}
          />
          <StatusBadge
            label={`支払: ${PAYMENT_STATE_LABELS[paymentState]}`}
            tone={PAYMENT_STATE_TONES[paymentState]}
          />
          <StatusBadge
            label={`支払方法: ${PAYMENT_METHOD_LABELS[toPaymentMethod(entry.paymentMethod)]}`}
          />
          {paymentIssue ? <StatusBadge label="決済要確認" tone="danger" /> : null}
        </div>
        {isCancelled ? (
          <p className="mt-3 text-sm text-red-200">
            キャンセル日時: {formatDateTime(toDate(entry.cancelledAt))} / 理由:{" "}
            {str(entry, "cancelReason") || "-"}
          </p>
        ) : null}
        {paymentIssue ? (
          <p className="mt-3 rounded-md border border-red-700/70 bg-red-950/60 px-4 py-3 text-sm leading-6 text-red-100">
            カード決済の内容が、現在の申込と一致しませんでした（
            {str(paymentIssue, "reason")} / 決済金額{" "}
            {typeof paymentIssue.stripeAmountTotal === "number"
              ? yen(paymentIssue.stripeAmountTotal)
              : "-"}
            ）。この決済は入金として記録していません。Stripe
            管理画面で確認し、受け取っている場合は
            「入金の記録」で理由を付けて記録してください。
          </p>
        ) : null}
        {(() => {
          const emailState = getEntryEmailState(entry);
          const entryEmail = isRecord(entry.entryEmail) ? entry.entryEmail : null;
          const isProblem = emailState === "failed" || emailState === "stalled";
          const canResend = canSendMail && entry.entryStatus === "confirmed";

          return (
            <div
              className={`mt-3 rounded-md border px-4 py-3 text-sm leading-6 ${
                isProblem
                  ? "border-red-700/70 bg-red-950/60 text-red-100"
                  : "border-white/10 bg-white/[0.03] text-zinc-300"
              }`}
            >
              <p>
                <span className="font-semibold">受付メール: </span>
                {ENTRY_EMAIL_STATE_LABELS[emailState]}
                {entryEmail && toDate(entryEmail.finishedAt)
                  ? `（${formatDateTime(toDate(entryEmail.finishedAt))}）`
                  : ""}
                {entryEmail && str(entryEmail, "resentByEmail")
                  ? ` / 管理画面から再送: ${str(entryEmail, "resentByEmail")}`
                  : ""}
              </p>
              {isProblem ? (
                <p>
                  {emailState === "failed"
                    ? `原因: ${str(entryEmail ?? {}, "error") || "不明"}。`
                    : "送信の処理が途中で止まっています。"}
                  申込者に受付メールが届いていない可能性があります。
                </p>
              ) : null}
              {emailState === "unknown" ? (
                <p className="text-xs text-zinc-500">
                  旧アプリでの申込など、送信状況の記録がない申込です。送信状況はメール履歴で確認してください。
                </p>
              ) : null}
              {canResend ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void resendEntryEmail()}
                    disabled={isResending}
                    className={buttonClassName}
                  >
                    {isResending ? "送信中..." : "受付メールを再送"}
                  </button>
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={resendIncludeAdmin}
                      onChange={(event) => setResendIncludeAdmin(event.target.checked)}
                      className="h-4 w-4 accent-alma-gold"
                    />
                    管理者通知も送る
                  </label>
                </div>
              ) : null}
              {resendMessage ? (
                <p
                  role={resendMessage.tone === "error" ? "alert" : "status"}
                  className={`mt-2 ${resendMessage.tone === "error" ? "text-red-200" : "text-emerald-200"}`}
                >
                  {resendMessage.text}
                </p>
              ) : null}
            </div>
          );
        })()}
        {!canEdit ? (
          <p className="mt-3 text-sm text-zinc-400">
            このアカウントには変更の権限がないため、内容の確認のみ行えます。
          </p>
        ) : null}
      </div>

      {toast ? (
        <div className="rounded-md border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-100">
          {toast}
        </div>
      ) : null}

      <div>
        <h2 className="text-lg font-bold text-white">金額</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <AmountCard label="請求額" value={accounting.billedAmount} />
          <AmountCard label="入金済み額" value={accounting.paidAmount} />
          <AmountCard
            label="返金予定額"
            value={accounting.refundPlannedAmount}
            note={
              accounting.refundPendingAmount > 0
                ? `うち未返金 ${yen(accounting.refundPendingAmount)}`
                : undefined
            }
            tone={accounting.refundPendingAmount > 0 ? "warning" : "default"}
          />
          <AmountCard label="返金済み額" value={accounting.refundedAmount} />
          <AmountCard
            label="追加支払額（未収）"
            value={accounting.dueAmount}
            tone={accounting.dueAmount > 0 ? "warning" : "default"}
          />
        </div>
        {accounting.overpaidAmount > 0 ? (
          <p className="mt-3 rounded-md border border-red-700/70 bg-red-950/60 px-4 py-3 text-sm leading-6 text-red-100">
            請求額より {yen(accounting.overpaidAmount)}{" "}
            多く入金されています。返金するかどうかを判断し、
            「返金予定」または「返金しない判断」を記録してください（自動では返金されません）。
          </p>
        ) : null}
        {refundDecision ? (
          <p className="mt-3 text-sm text-zinc-400">
            返金しない判断を記録済み: {str(refundDecision, "reason")}（
            {formatDateTime(toDate(refundDecision.decidedAt))}）
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          追加分に適用する単価（1 部門）:{" "}
          {unitPrice.isTrusted && unitPrice.unitPrice
            ? `${yen(unitPrice.unitPrice)}（${unitPrice.basis}）`
            : "未確認（追加の前に「単価の確認」が必要です）"}{" "}
          / 無差別級: 各部門 +{yen(OPEN_CLASS_FEE)}
          {toPaymentMethod(entry.paymentMethod) === "bank_transfer" &&
          str(entry, "paymentDueDate")
            ? ` / 振込期限: ${formatPaymentDueDate(str(entry, "paymentDueDate"))}`
            : ""}
        </p>
        {canMoney ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClassName}
              onClick={() =>
                openDialog(
                  "record_payment",
                  {},
                  {
                    amount:
                      accounting.dueAmount > 0 ? String(accounting.dueAmount) : "",
                    method:
                      toPaymentMethod(entry.paymentMethod) === "cash"
                        ? "cash"
                        : "bank_transfer",
                  },
                )
              }
            >
              入金を記録
            </button>
            <button
              type="button"
              className={buttonClassName}
              onClick={() =>
                openDialog(
                  "plan_refund",
                  {},
                  {
                    amount:
                      accounting.overpaidAmount > 0
                        ? String(accounting.overpaidAmount)
                        : "",
                  },
                )
              }
            >
              返金予定を記録
            </button>
            <button
              type="button"
              className={buttonClassName}
              disabled={accounting.refundPendingAmount <= 0}
              onClick={() =>
                openDialog(
                  "complete_refund",
                  {},
                  { amount: String(accounting.refundPendingAmount) },
                )
              }
            >
              返金完了を記録
            </button>
            <button
              type="button"
              className={buttonClassName}
              onClick={() => openDialog("no_refund")}
            >
              返金しない判断を記録
            </button>
            <button
              type="button"
              className={buttonClassName}
              onClick={() => openDialog("adjust_charge")}
            >
              料金を調整
            </button>
            <button
              type="button"
              className={buttonClassName}
              onClick={() =>
                openDialog(
                  "confirm_unit_price",
                  {},
                  { unitPrice: unitPrice.unitPrice ? String(unitPrice.unitPrice) : "" },
                )
              }
            >
              単価を確認
            </button>
            {canSwitchPaymentMethod ? (
              <button
                type="button"
                className={buttonClassName}
                onClick={() =>
                  openDialog("switch_payment_method", {}, { method: "cash" })
                }
              >
                支払方法を切り替え（現金・振込）
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">出場内容</h2>
          <p className="text-xs text-zinc-500">
            有効: {activeSummary.athleteCount}名 / {activeSummary.divisionEntryCount}
            部門 / 無差別級 {activeSummary.openClassEntryCount}件
          </p>
        </div>
        <div className="mt-3 space-y-3">
          {athletes.map((athlete, index) => {
            const athleteCancelled = isCancelled || isCancelledItem(athlete);
            const isV2 = isV2StoredAthlete(athlete);
            const athleteClass = athlete.athleteClass as AthleteClass;
            const editable = canEdit && !athleteCancelled && isV2;

            return (
              <article
                key={index}
                className={`rounded-lg border p-4 ${
                  athleteCancelled
                    ? "border-white/5 bg-black/40 opacity-70"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">
                        {isRepresentative ? `選手${index + 1}: ` : ""}
                        {str(athlete, "name")}
                      </h3>
                      <StatusBadge
                        label={athleteCancelled ? "取消済み" : "有効"}
                        tone={athleteCancelled ? "danger" : "success"}
                      />
                      {isV2 ? null : <StatusBadge label="旧形式" tone="warning" />}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {str(athlete, "kana")} / {getGenderLabel(str(athlete, "gender"))}{" "}
                      / {isV2 ? ATHLETE_CLASS_LABELS[athleteClass] : "区分なし"}
                      {str(athlete, "guardianName")
                        ? ` / 保護者: ${str(athlete, "guardianName")}`
                        : ""}
                      {isCancelledItem(athlete)
                        ? ` / 取消: ${formatDateTime(toDate(athlete.cancelledAt))}`
                        : ""}
                    </p>
                  </div>
                  {canMoney && isRepresentative && !athleteCancelled ? (
                    <button
                      type="button"
                      className={dangerButtonClassName}
                      onClick={() =>
                        openDialog("cancel_athlete", { athleteIndex: index })
                      }
                    >
                      選手を取消
                    </button>
                  ) : null}
                </div>

                {isV2 ? (
                  <div className="mt-3 space-y-2">
                    {(["gi", "nogi"] as const).map((division) => {
                      const divisionEntry = isRecord(athlete[division])
                        ? (athlete[division] as DataRecord)
                        : null;
                      const divisionCancelled =
                        athleteCancelled || isCancelledItem(divisionEntry);
                      const rank =
                        division === "gi"
                          ? `${str(divisionEntry ?? {}, "belt")}帯`
                          : str(divisionEntry ?? {}, "grade");

                      if (!divisionEntry) {
                        return editable ? (
                          <div
                            key={division}
                            className="flex items-center justify-between gap-3 rounded-md border border-dashed border-white/10 px-3 py-2"
                          >
                            <p className="text-sm text-zinc-500">
                              {DIVISION_LABELS[division]}: 出場なし
                            </p>
                            <button
                              type="button"
                              className={buttonClassName}
                              onClick={() =>
                                openDialog("add_division", {
                                  athleteIndex: index,
                                  division,
                                })
                              }
                            >
                              {DIVISION_LABELS[division]}を追加
                            </button>
                          </div>
                        ) : null;
                      }

                      return (
                        <div
                          key={division}
                          className="rounded-md border border-white/10 bg-black/30 px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
                              <span className="font-bold text-alma-gold">
                                {DIVISION_LABELS[division]}
                              </span>
                              <span>
                                {str(divisionEntry, "ageCategory")} /{" "}
                                {str(divisionEntry, "weightClass")} / {rank}
                                {athleteClass === "adult"
                                  ? ` / 無差別級 ${getOpenClassLabel(str(divisionEntry, "openClass"))}`
                                  : ""}
                              </span>
                              {isCancelledItem(divisionEntry) ? (
                                <StatusBadge
                                  label={`取消済み（${formatDateTime(toDate(divisionEntry.cancelledAt))}）`}
                                  tone="danger"
                                />
                              ) : null}
                            </div>
                            {editable && !divisionCancelled ? (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className={buttonClassName}
                                  onClick={() =>
                                    openDialog(
                                      "update_category",
                                      { athleteIndex: index, division },
                                      {
                                        ageCategory: str(divisionEntry, "ageCategory"),
                                        weightClass: str(divisionEntry, "weightClass"),
                                        rank:
                                          division === "gi"
                                            ? str(divisionEntry, "belt")
                                            : str(divisionEntry, "grade"),
                                      },
                                    )
                                  }
                                >
                                  カテゴリー変更
                                </button>
                                {athleteClass === "adult" ? (
                                  divisionEntry.openClass === "yes" ? (
                                    canMoney ? (
                                      <button
                                        type="button"
                                        className={buttonClassName}
                                        onClick={() =>
                                          openDialog("open_class_off", {
                                            athleteIndex: index,
                                            division,
                                          })
                                        }
                                      >
                                        無差別級を取消
                                      </button>
                                    ) : null
                                  ) : (
                                    <button
                                      type="button"
                                      className={buttonClassName}
                                      onClick={() =>
                                        openDialog("open_class_on", {
                                          athleteIndex: index,
                                          division,
                                        })
                                      }
                                    >
                                      無差別級を追加
                                    </button>
                                  )
                                ) : null}
                                {canMoney ? (
                                  <button
                                    type="button"
                                    className={dangerButtonClassName}
                                    onClick={() =>
                                      openDialog("cancel_division", {
                                        athleteIndex: index,
                                        division,
                                      })
                                    }
                                  >
                                    部門を取消
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                            {editable && isCancelledItem(divisionEntry) ? (
                              <button
                                type="button"
                                className={buttonClassName}
                                onClick={() =>
                                  openDialog(
                                    "add_division",
                                    { athleteIndex: index, division },
                                    {
                                      ageCategory: str(divisionEntry, "ageCategory"),
                                      weightClass: str(divisionEntry, "weightClass"),
                                      rank:
                                        division === "gi"
                                          ? str(divisionEntry, "belt")
                                          : str(divisionEntry, "grade"),
                                    },
                                  )
                                }
                              >
                                {DIVISION_LABELS[division]}を再度追加
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {[
                      str(athlete, "category"),
                      str(athlete, "ageCategory"),
                      str(athlete, "weightClass"),
                    ]
                      .filter(Boolean)
                      .join(" / ") || "カテゴリー情報なし"}
                    <span className="block text-xs text-zinc-500">
                      旧形式（Gi / No-Gi
                      の区別なし）のため、部門・カテゴリーの変更はできません。
                      取消・入金・返金・料金調整は記録できます。
                      部門・カテゴリーを変更する場合は、先に新形式へ移行してください。
                    </span>
                    {canEdit && !athleteCancelled ? (
                      <button
                        type="button"
                        className={`${buttonClassName} mt-2`}
                        onClick={() =>
                          openDialog("migrate_legacy_athlete", { athleteIndex: index })
                        }
                      >
                        新形式に移行（部門・カテゴリーを指定）
                      </button>
                    ) : null}
                  </p>
                )}
              </article>
            );
          })}
        </div>
        {canEdit && !isCancelled ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {isRepresentative ? (
              <button
                type="button"
                className={buttonClassName}
                onClick={() => openDialog("add_athlete")}
              >
                選手を追加
              </button>
            ) : null}
            {canMoney ? (
              <button
                type="button"
                className={dangerButtonClassName}
                onClick={() => openDialog("cancel_entry")}
              >
                申込全体をキャンセル
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="text-lg font-bold text-white">入金・返金・請求の記録</h2>
        {ledger.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            個別の記録はまだありません。上の金額は、申込時の請求額と支払状態から表示しています
            （最初の操作時に、その内容を 1 件目の記録として残します）。
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-white/10 bg-black/50 text-xs text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">日時</th>
                  <th className="px-3 py-2 font-semibold">種別</th>
                  <th className="px-3 py-2 text-right font-semibold">金額</th>
                  <th className="px-3 py-2 font-semibold">方法</th>
                  <th className="px-3 py-2 font-semibold">内容・理由</th>
                  <th className="px-3 py-2 font-semibold">記録者</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id} className="border-b border-white/5 align-top">
                    <td className="px-3 py-2 text-zinc-400">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-zinc-200">
                      {LEDGER_TYPE_LABELS[row.type] ?? row.type}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-white">
                      {row.type === "refund_decision"
                        ? "-"
                        : `${row.amount < 0 ? "−" : ""}${yen(Math.abs(row.amount))}`}
                    </td>
                    <td className="px-3 py-2 text-zinc-300">
                      {LEDGER_METHOD_LABELS[row.method] ?? (row.method || "-")}
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{row.note}</td>
                    <td className="px-3 py-2 text-zinc-400">
                      {row.adminEmail ||
                        (row.source === "stripe" ? "Stripe" : "システム")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-white">操作履歴</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            変更・取消・精算の履歴はまだありません。
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {history.map((row) => (
              <article
                key={row.id}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{row.label}</p>
                  <p className="text-xs text-zinc-500">
                    {formatDateTime(row.createdAt)} / {row.adminEmail}
                  </p>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                  {row.summaryLines.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-zinc-400">
                  理由: {row.reason}
                  {row.chargeDelta !== 0
                    ? ` / 請求額の増減: ${row.chargeDelta > 0 ? "+" : "−"}${yen(Math.abs(row.chargeDelta))}`
                    : ""}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-lg font-bold text-white">変更内容の通知メール</h2>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          変更を記録すると文面の下書きを作成します。メールは自動では送信されません。
          文面を確認・編集し、「送信」を押した場合だけ {str(entry, "email")}{" "}
          宛に送信します。
        </p>
        {mailMessage ? (
          <p className="mt-3 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200">
            {mailMessage}
          </p>
        ) : null}
        <div className="mt-3 space-y-3">
          <Field label="件名">
            <input
              value={mailSubject}
              onChange={(event) => setMailSubject(event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="本文">
            <textarea
              value={mailBody}
              onChange={(event) => setMailBody(event.target.value)}
              rows={12}
              className="w-full rounded-md border border-white/10 bg-black px-3 py-3 text-sm leading-6 text-white outline-none focus:border-alma-gold"
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {canEdit ? (
            <button
              type="button"
              className={buttonClassName}
              onClick={() => void createMailDraft()}
            >
              現在の内容で文面を作成
            </button>
          ) : null}
          {canSendMail ? (
            <button
              type="button"
              onClick={() => void sendMail()}
              disabled={isSendingMail || !mailSubject.trim() || !mailBody.trim()}
              className="rounded-md bg-alma-gold px-4 py-2 text-xs font-semibold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSendingMail ? "送信中..." : "送信"}
            </button>
          ) : null}
        </div>
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-alma-gold/40 bg-zinc-950 p-5 shadow-2xl shadow-black">
            <p className="text-sm font-semibold text-alma-gold">
              {dialog.step === "confirm" ? "確認" : "入力"}
            </p>
            <h2 className="mt-2 text-lg font-bold text-white">
              {KIND_LABELS[dialog.kind]}
            </h2>
            {dialogTarget ? (
              <p className="mt-1 text-sm text-zinc-400">{dialogTarget}</p>
            ) : null}

            {dialog.error ? (
              <div className="mt-4 rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
                {dialog.error}
              </div>
            ) : null}

            {dialog.step === "edit" ? (
              <div className="mt-4 space-y-4">
                {renderDialogFields(dialog)}
                <Field label="理由（必須。履歴に記録されます）">
                  <textarea
                    value={dialog.reason}
                    onChange={(event) =>
                      setDialog({ ...dialog, reason: event.target.value })
                    }
                    rows={3}
                    placeholder="例: 申込者からの依頼（10/20 メール）"
                    className="w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-alma-gold"
                  />
                </Field>
              </div>
            ) : dialog.preview ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-md border border-white/10 bg-black/40 p-3">
                  <p className="text-xs font-semibold text-zinc-400">変更内容</p>
                  <ul className="mt-2 space-y-1 text-sm text-white">
                    {dialog.preview.summaryLines.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-zinc-400">理由: {dialog.reason}</p>
                </div>
                <div className="rounded-md border border-white/10 bg-black/40 p-3">
                  <p className="text-xs font-semibold text-zinc-400">金額</p>
                  <div className="mt-2">
                    <AccountingTable
                      before={dialog.preview.before}
                      after={dialog.preview.after}
                    />
                  </div>
                </div>
                {dialog.preview.warnings.map((warning, index) => (
                  <p
                    key={index}
                    className="rounded-md border border-alma-gold/40 bg-alma-gold/10 px-3 py-2 text-sm leading-6 text-zinc-100"
                  >
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDialog(null)}
                disabled={isBusy}
                className="min-h-11 rounded-md border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:text-white disabled:opacity-50"
              >
                キャンセル
              </button>
              {dialog.step === "confirm" ? (
                <button
                  type="button"
                  onClick={() => setDialog({ ...dialog, step: "edit", preview: null })}
                  disabled={isBusy}
                  className="min-h-11 rounded-md border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:text-white disabled:opacity-50"
                >
                  入力に戻る
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void submitDialog(dialog.step === "edit")}
                disabled={isBusy}
                className="min-h-11 rounded-md bg-alma-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy
                  ? "処理中..."
                  : dialog.step === "edit"
                    ? "内容を確認する"
                    : "この内容で確定する"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
