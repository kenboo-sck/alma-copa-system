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
import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import type { EntryType, ReceptionStatus } from "@/types/entry";

type PaymentStatus = "pending" | "paid" | "failed";
type PaymentStatusFilter = "all" | PaymentStatus;

type AdminEntry = {
  id: string;
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
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] =
    useState<PaymentStatusFilter>("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [qrEntry, setQrEntry] = useState<AdminEntry | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, collections.entries),
      (snapshot) => {
        const nextEntries = snapshot.docs
          .map((entrySnapshot) => {
            const data = entrySnapshot.data();

            return {
              id: entrySnapshot.id,
              eventId: typeof data.eventId === "string" ? data.eventId : "",
              eventTitle:
                typeof data.eventTitle === "string" ? data.eventTitle : "大会未設定",
              entryType: toEntryType(data.entryType),
              name: typeof data.name === "string" ? data.name : "",
              kana: typeof data.kana === "string" ? data.kana : "",
              email: typeof data.email === "string" ? data.email : "",
              phone: typeof data.phone === "string" ? data.phone : "",
              birthDate: toDate(data.birthDate),
              gym: typeof data.gym === "string" ? data.gym : "",
              category: typeof data.category === "string" ? data.category : "",
              paymentStatus: toPaymentStatus(data.paymentStatus),
              stripeSessionId:
                typeof data.stripeSessionId === "string"
                  ? data.stripeSessionId
                  : typeof data.stripeCheckoutSessionId === "string"
                    ? data.stripeCheckoutSessionId
                    : "",
              stripePaymentIntentId:
                typeof data.stripePaymentIntentId === "string"
                  ? data.stripePaymentIntentId
                  : "",
              receptionStatus: toReceptionStatus(data.receptionStatus),
              checkedInAt: toDate(data.checkedInAt),
              createdAt: toDate(data.createdAt),
              updatedAt: toDate(data.updatedAt),
            };
          })
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

  const visibleEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return entries.filter((entry) => {
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
      const matchesEvent = eventFilter === "all" || entry.eventId === eventFilter;

      return matchesSearch && matchesPayment && matchesEvent;
    });
  }, [entries, eventFilter, paymentStatusFilter, searchQuery]);

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
      "決済状態",
      "受付状態",
      "受付日時",
    ];
    const rows = visibleEntries.map((entry) => [
      entry.id,
      entry.eventTitle,
      entryTypeLabels[entry.entryType],
      entry.name,
      entry.kana,
      entry.email,
      entry.phone,
      formatDate(entry.birthDate),
      entry.gym,
      entry.category,
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

    return updateEntry(entry.id, {
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
      await deleteDoc(doc(db, collections.entries, entry.id));
      setToast("エントリーを削除しました。");
    } catch (caughtError) {
      console.error(caughtError);
      setError("エントリーの削除に失敗しました。管理者権限を確認してください。");
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
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_220px]">
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
      ) : (
        <>
          <div className="grid gap-3 xl:hidden">
            {visibleEntries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-white">{entry.name}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{entry.eventTitle}</p>
                  </div>
                  <StatusBadge
                    label={paymentStatusLabels[entry.paymentStatus]}
                    tone={paymentStatusTones[entry.paymentStatus]}
                  />
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-zinc-500">種別 / カテゴリ</dt>
                    <dd className="mt-1 text-zinc-200">
                      {entryTypeLabels[entry.entryType]} / {entry.category}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">受付</dt>
                    <dd className="mt-1 text-zinc-200">
                      {receptionStatusLabels[entry.receptionStatus]}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
                    <th className="px-4 py-3 font-semibold">氏名</th>
                    <th className="px-4 py-3 font-semibold">大会</th>
                    <th className="px-4 py-3 font-semibold">種別</th>
                    <th className="px-4 py-3 font-semibold">カテゴリ</th>
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
                        <p className="font-semibold text-white">{entry.name}</p>
                        <p className="mt-1 text-xs text-zinc-500">{entry.kana}</p>
                        <p className="mt-1 text-xs text-zinc-500">{entry.email}</p>
                      </td>
                      <td className="px-4 py-4 text-zinc-300">{entry.eventTitle}</td>
                      <td className="px-4 py-4 text-zinc-300">
                        {entryTypeLabels[entry.entryType]}
                      </td>
                      <td className="px-4 py-4 text-zinc-300">{entry.category}</td>
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
              alt={`${qrEntry.id} のQRコード`}
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrEntry.id)}`}
              className="mx-auto mt-5 rounded-md bg-white p-3"
            />
            <p className="mt-4 break-all font-mono text-xs text-zinc-400">
              {qrEntry.id}
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
    </section>
  );
}
