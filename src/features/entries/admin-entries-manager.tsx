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
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import { useAdminAuth } from "@/features/admin-auth";
import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import type { EntryType, ReceptionStatus } from "@/types/entry";

type PaymentStatus = "pending" | "paid" | "failed";
type PaymentStatusFilter = "all" | PaymentStatus;
type ReceptionStatusFilter = "all" | ReceptionStatus;
type WeightClassFilter = "all" | string;
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
  category: string;
  weightClass: string;
  paymentStatus: PaymentStatus;
  stripeSessionId: string;
  stripePaymentIntentId: string;
  receptionStatus: ReceptionStatus;
  checkedInAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "未払い",
  paid: "支払い済み",
  failed: "失敗",
};

const paymentStatusTones: Record<PaymentStatus, "neutral" | "success" | "danger"> = {
  pending: "neutral",
  paid: "success",
  failed: "danger",
};

const entryTypeLabels: Record<EntryType, string> = {
  individual: "個人",
  representative: "代表者",
};

const receptionStatusLabels: Record<ReceptionStatus, string> = {
  not_checked_in: "未受付",
  checked_in: "受付済",
};

const unsetWeightClassLabel = "階級未設定";

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
  return value === "paid" || value === "failed" ? value : "pending";
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

function getWeightClassName(entry: AdminEntry) {
  return entry.weightClass.trim() || unsetWeightClassLabel;
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
    stripeSessionId:
      stringField(data, "stripeSessionId") ||
      stringField(data, "stripeCheckoutSessionId"),
    stripePaymentIntentId: stringField(data, "stripePaymentIntentId"),
    receptionStatus: toReceptionStatus(data.receptionStatus),
    checkedInAt: toDate(data.checkedInAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };

  if (entryType === "representative" && Array.isArray(data.athletes)) {
    const athletes = data.athletes.filter(
      (athlete): athlete is Record<string, unknown> =>
        Boolean(athlete) && typeof athlete === "object" && !Array.isArray(athlete),
    );

    if (athletes.length > 0) {
      return athletes.map((athlete, index) => ({
        ...baseEntry,
        id: `${entryId}__athlete_${index}`,
        name: stringField(athlete, "name"),
        kana: stringField(athlete, "kana"),
        birthDate: toDate(athlete.birthDate),
        category: stringField(athlete, "category"),
        weightClass: stringField(athlete, "weightClass"),
      }));
    }
  }

  return [
    {
      ...baseEntry,
      id: entryId,
      name: stringField(data, "name"),
      kana: stringField(data, "kana"),
      birthDate: toDate(data.birthDate),
      category: stringField(data, "category"),
      weightClass: stringField(data, "weightClass"),
    },
  ];
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
  const { firebaseUser } = useAdminAuth();
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] =
    useState<PaymentStatusFilter>("all");
  const [receptionStatusFilter, setReceptionStatusFilter] =
    useState<ReceptionStatusFilter>("all");
  const [weightClassFilter, setWeightClassFilter] =
    useState<WeightClassFilter>("all");
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
        setError(null);
      },
      (caughtError) => {
        console.error(caughtError);
        setError("エントリー一覧の取得に失敗しました。");
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

  const weightClassOptions = useMemo(() => {
    const map = new Map<string, number>();

    for (const entry of entries) {
      const weightClassName = getWeightClassName(entry);
      map.set(weightClassName, (map.get(weightClassName) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === unsetWeightClassLabel) {
          return 1;
        }
        if (b === unsetWeightClassLabel) {
          return -1;
        }
        return a.localeCompare(b, "ja-JP");
      })
      .map(([weightClassName, count]) => ({ weightClassName, count }));
  }, [entries]);

  const visibleEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return entries.filter((entry) => {
      const weightClassName = getWeightClassName(entry);
      const matchesSearch =
        query.length === 0 ||
        [
          entry.id,
          entry.name,
          entry.kana,
          entry.email,
          entry.phone,
          entry.category,
          entry.gym,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesPayment =
        paymentStatusFilter === "all" || entry.paymentStatus === paymentStatusFilter;
      const matchesReception =
        receptionStatusFilter === "all" ||
        entry.receptionStatus === receptionStatusFilter;
      const matchesWeightClass =
        weightClassFilter === "all" || weightClassName === weightClassFilter;
      const matchesEvent = eventFilter === "all" || entry.eventId === eventFilter;

      return (
        matchesSearch &&
        matchesPayment &&
        matchesReception &&
        matchesWeightClass &&
        matchesEvent
      );
    });
  }, [
    entries,
    eventFilter,
    paymentStatusFilter,
    receptionStatusFilter,
    searchQuery,
    weightClassFilter,
  ]);

  const visibleEntriesByWeightClass = useMemo(() => {
    const map = new Map<string, AdminEntry[]>();

    for (const entry of visibleEntries) {
      const weightClassName = getWeightClassName(entry);
      const group = map.get(weightClassName) ?? [];
      group.push(entry);
      map.set(weightClassName, group);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === unsetWeightClassLabel) {
          return 1;
        }
        if (b === unsetWeightClassLabel) {
          return -1;
        }
        return a.localeCompare(b, "ja-JP");
      })
      .map(([weightClassName, groupEntries]) => ({
        weightClassName,
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
      "カテゴリ",
      "階級",
      "決済状態",
      "受付状態",
      "受付日時",
    ];
    const rows = visibleEntries.map((entry) => [
      entry.entryId,
      entry.eventTitle,
      entryTypeLabels[entry.entryType],
      entry.name,
      entry.kana,
      entry.email,
      entry.phone,
      formatDate(entry.birthDate),
      entry.gym,
      entry.category,
      getWeightClassName(entry),
      paymentStatusLabels[entry.paymentStatus],
      receptionStatusLabels[entry.receptionStatus],
      formatDateTime(entry.checkedInAt),
    ]);
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

  async function deleteEntry(entry: AdminEntry) {
    const confirmed = window.confirm(
      `「${entry.name}」のエントリーを削除しますか？同じメールアドレスで再エントリー可能になります。`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);

    try {
      await deleteDoc(doc(db, collections.entries, entry.entryId));
      setToast("エントリーを削除しました。");
    } catch (caughtError) {
      console.error(caughtError);
      setError("エントリーの削除に失敗しました。管理者権限を確認してください。");
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

      {error ? (
        <div className="rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {toast ? (
        <div className="rounded-md border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-100">
          {toast}
        </div>
      ) : null}

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_180px]">
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
            <span className="text-xs font-semibold text-zinc-400">階級</span>
            <select
              value={weightClassFilter}
              onChange={(event) => setWeightClassFilter(event.target.value)}
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">すべて</option>
              {weightClassOptions.map((option) => (
                <option
                  key={option.weightClassName}
                  value={option.weightClassName}
                >
                  {option.weightClassName}（{option.count}名）
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">決済状態</span>
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
                階級別
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
                key={group.weightClassName}
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
                        aria-label={`${group.weightClassName}を全選択`}
                      />
                      <div>
                        <h2 className="text-lg font-bold text-white">
                          {group.weightClassName}（{group.entries.length}名）
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
                            <h3 className="font-semibold text-white">{entry.name}</h3>
                            <p className="mt-1 text-sm text-zinc-400">
                              {entry.eventTitle}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {entry.email}
                            </p>
                          </div>
                        </label>
                        <StatusBadge
                          label={paymentStatusLabels[entry.paymentStatus]}
                          tone={paymentStatusTones[entry.paymentStatus]}
                        />
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-xs text-zinc-500">階級</dt>
                          <dd className="mt-1 text-zinc-200">
                            {getWeightClassName(entry)}
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
                        <button
                          type="button"
                          onClick={() => void deleteEntry(entry)}
                          className="rounded-md border border-red-800/70 px-3 py-2 text-sm text-red-200 hover:border-red-500 hover:text-red-100"
                        >
                          削除
                        </button>
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
                        <th className="px-4 py-3 font-semibold">決済</th>
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
                            <p className="font-semibold text-white">{entry.name}</p>
                            <p className="mt-1 text-xs text-zinc-500">{entry.kana}</p>
                            <p className="mt-1 text-xs text-zinc-500">{entry.email}</p>
                          </td>
                          <td className="px-4 py-4 text-zinc-300">
                            {entry.eventTitle}
                          </td>
                          <td className="px-4 py-4 text-zinc-300">
                            {entryTypeLabels[entry.entryType]}
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge
                              label={paymentStatusLabels[entry.paymentStatus]}
                              tone={paymentStatusTones[entry.paymentStatus]}
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
                              <button
                                type="button"
                                onClick={() => void deleteEntry(entry)}
                                className="rounded-md border border-red-800/70 px-2 py-1.5 text-xs text-red-200 hover:border-red-500 hover:text-red-100"
                              >
                                削除
                              </button>
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
                      <h2 className="font-semibold text-white">{entry.name}</h2>
                      <p className="mt-1 text-sm text-zinc-400">{entry.eventTitle}</p>
                    </div>
                  </label>
                  <div className="shrink-0">
                    <StatusBadge
                      label={paymentStatusLabels[entry.paymentStatus]}
                      tone={paymentStatusTones[entry.paymentStatus]}
                    />
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-zinc-500">種別 / 階級</dt>
                    <dd className="mt-1 text-zinc-200">
                      {entryTypeLabels[entry.entryType]} / {getWeightClassName(entry)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">受付</dt>
                    <dd className="mt-1 text-zinc-200">
                      {receptionStatusLabels[entry.receptionStatus]}
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
                  <button
                    type="button"
                    onClick={() => void deleteEntry(entry)}
                    className="rounded-md border border-red-800/70 px-3 py-2 text-sm text-red-200 hover:border-red-500 hover:text-red-100"
                  >
                    削除
                  </button>
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
                    <th className="px-4 py-3 font-semibold">階級</th>
                    <th className="px-4 py-3 font-semibold">決済</th>
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
                        <p className="font-semibold text-white">{entry.name}</p>
                        <p className="mt-1 text-xs text-zinc-500">{entry.kana}</p>
                        <p className="mt-1 text-xs text-zinc-500">{entry.email}</p>
                      </td>
                      <td className="px-4 py-4 text-zinc-300">{entry.eventTitle}</td>
                      <td className="px-4 py-4 text-zinc-300">
                        {entryTypeLabels[entry.entryType]}
                      </td>
                      <td className="px-4 py-4 text-zinc-300">
                        {getWeightClassName(entry)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge
                          label={paymentStatusLabels[entry.paymentStatus]}
                          tone={paymentStatusTones[entry.paymentStatus]}
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
                          <button
                            type="button"
                            onClick={() => void deleteEntry(entry)}
                            className="rounded-md border border-red-800/70 px-2 py-1.5 text-xs text-red-200 hover:border-red-500 hover:text-red-100"
                          >
                            削除
                          </button>
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
