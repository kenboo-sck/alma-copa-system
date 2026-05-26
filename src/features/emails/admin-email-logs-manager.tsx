"use client";

import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import { useAdminAuth } from "@/features/admin-auth";
import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import type { EntryType } from "@/types/entry";

type MailLogStatus = "sent" | "failed";
type MailType = "entry_completed" | "manual_individual" | "manual_bulk" | "inquiry_reply";
type PaymentStatus = "pending" | "paid" | "failed";

type MailLog = {
  id: string;
  logId: string;
  entryId: string;
  eventId: string;
  eventTitle: string;
  recipientEmail: string;
  recipientName: string;
  recipientType: "user" | "admin";
  mailType: MailType;
  subject: string;
  bodyPreview: string;
  status: MailLogStatus;
  errorMessage: string;
  provider: string;
  sentAt: Date | null;
  createdByAdminEmail: string;
};

type EntryRecipient = {
  id: string;
  eventId: string;
  eventTitle: string;
  entryType: EntryType;
  paymentStatus: PaymentStatus;
  name: string;
  email: string;
};

type BulkPaymentFilter = "all" | "paid" | "pending";
type BulkEntryTypeFilter = "all" | EntryType;
type MailStatusFilter = "all" | MailLogStatus;

const mailTypeLabels: Record<MailType, string> = {
  entry_completed: "エントリー完了",
  manual_individual: "個別送信",
  manual_bulk: "一括メール",
  inquiry_reply: "問い合わせ返信",
};

const statusLabels: Record<MailLogStatus, string> = {
  sent: "送信済み",
  failed: "失敗",
};

const entryTypeLabels: Record<EntryType, string> = {
  individual: "個人",
  representative: "代表者",
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

function toMailStatus(value: unknown): MailLogStatus {
  return value === "failed" ? "failed" : "sent";
}

function toMailType(value: unknown): MailType {
  if (value === "manual_individual" || value === "manual_bulk") {
    return value;
  }

  if (value === "inquiry_reply") {
    return value;
  }

  return "entry_completed";
}

function toRecipientType(value: unknown): MailLog["recipientType"] {
  return value === "admin" ? "admin" : "user";
}

function toEntryType(value: unknown): EntryType {
  return value === "representative" ? "representative" : "individual";
}

function toPaymentStatus(value: unknown): PaymentStatus {
  return value === "paid" || value === "failed" ? value : "pending";
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

async function sendManualEmails(input: {
  token: string;
  mailType: "manual_bulk";
  subject: string;
  body: string;
  entries: EntryRecipient[];
}) {
  const response = await fetch("/api/admin/emails/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mailType: input.mailType,
      subject: input.subject,
      body: input.body,
      recipients: input.entries.map((entry) => ({
        entryId: entry.id,
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

export function AdminEmailLogsManager() {
  const { firebaseUser } = useAdminAuth();
  const [logs, setLogs] = useState<MailLog[]>([]);
  const [entries, setEntries] = useState<EntryRecipient[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MailStatusFilter>("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [bulkPaymentFilter, setBulkPaymentFilter] = useState<BulkPaymentFilter>("all");
  const [bulkEventFilter, setBulkEventFilter] = useState("all");
  const [bulkEntryTypeFilter, setBulkEntryTypeFilter] =
    useState<BulkEntryTypeFilter>("all");
  const [bulkSubject, setBulkSubject] = useState("");
  const [bulkBody, setBulkBody] = useState("");
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, collections.emailLogs),
      (snapshot) => {
        const nextLogs = snapshot.docs
          .map((logSnapshot) => {
            const data = logSnapshot.data();

            return {
              id: logSnapshot.id,
              logId: typeof data.logId === "string" ? data.logId : logSnapshot.id,
              entryId: typeof data.entryId === "string" ? data.entryId : "",
              eventId: typeof data.eventId === "string" ? data.eventId : "",
              eventTitle:
                typeof data.eventTitle === "string" ? data.eventTitle : "大会未設定",
              recipientEmail:
                typeof data.recipientEmail === "string" ? data.recipientEmail : "",
              recipientName:
                typeof data.recipientName === "string" ? data.recipientName : "",
              recipientType: toRecipientType(data.recipientType),
              mailType: toMailType(data.mailType),
              subject: typeof data.subject === "string" ? data.subject : "",
              bodyPreview: typeof data.bodyPreview === "string" ? data.bodyPreview : "",
              status: toMailStatus(data.status),
              errorMessage:
                typeof data.errorMessage === "string" ? data.errorMessage : "",
              provider: typeof data.provider === "string" ? data.provider : "",
              sentAt: toDate(data.sentAt ?? data.createdAt),
              createdByAdminEmail:
                typeof data.createdByAdminEmail === "string"
                  ? data.createdByAdminEmail
                  : "",
            };
          })
          .sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0));

        setLogs(nextLogs);
        setIsLoadingLogs(false);
      },
      (caughtError) => {
        console.error(caughtError);
        setError("メール履歴の取得に失敗しました。");
        setIsLoadingLogs(false);
      },
    );

    return unsubscribe;
  }, []);

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
              paymentStatus: toPaymentStatus(data.paymentStatus),
              name: typeof data.name === "string" ? data.name : "",
              email: typeof data.email === "string" ? data.email : "",
            };
          })
          .filter((entry) => entry.email);

        setEntries(nextEntries);
        setIsLoadingEntries(false);
      },
      (caughtError) => {
        console.error(caughtError);
        setError("一斉送信対象の取得に失敗しました。");
        setIsLoadingEntries(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const eventOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const entry of entries) {
      if (entry.eventId) {
        map.set(entry.eventId, entry.eventTitle);
      }
    }

    for (const log of logs) {
      if (log.eventId) {
        map.set(log.eventId, log.eventTitle);
      }
    }

    return Array.from(map.entries()).map(([eventId, eventTitle]) => ({
      eventId,
      eventTitle,
    }));
  }, [entries, logs]);

  const visibleLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return logs.filter((log) => {
      const matchesSearch =
        !query ||
        [
          log.recipientEmail,
          log.recipientName,
          log.subject,
          log.bodyPreview,
          log.eventTitle,
          log.entryId,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesStatus = statusFilter === "all" || log.status === statusFilter;
      const matchesEvent = eventFilter === "all" || log.eventId === eventFilter;

      return matchesSearch && matchesStatus && matchesEvent;
    });
  }, [eventFilter, logs, searchQuery, statusFilter]);

  const bulkTargets = useMemo(() => {
    const filteredEntries = entries.filter((entry) => {
      const matchesPayment =
        bulkPaymentFilter === "all" ||
        (bulkPaymentFilter === "paid" && entry.paymentStatus === "paid") ||
        (bulkPaymentFilter === "pending" && entry.paymentStatus === "pending");
      const matchesEvent =
        bulkEventFilter === "all" || entry.eventId === bulkEventFilter;
      const matchesEntryType =
        bulkEntryTypeFilter === "all" || entry.entryType === bulkEntryTypeFilter;

      return matchesPayment && matchesEvent && matchesEntryType;
    });
    const map = new Map<string, EntryRecipient>();

    for (const entry of filteredEntries) {
      const key = entry.email.trim().toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, entry);
      }
    }

    return Array.from(map.values());
  }, [bulkEntryTypeFilter, bulkEventFilter, bulkPaymentFilter, entries]);

  async function handleBulkSend() {
    const subject = bulkSubject.trim();
    const body = bulkBody.trim();

    if (!subject || !body) {
      setError("件名と本文を入力してください。");
      return;
    }

    if (bulkTargets.length === 0) {
      setError("送信対象がありません。");
      return;
    }

    const confirmed = window.confirm(
      `対象者 ${bulkTargets.length}名 にメールを送信します。よろしいですか？`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setBulkResult(null);
    setIsSendingBulk(true);

    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) {
        throw new Error("管理者認証を確認できませんでした。");
      }

      const result = await sendManualEmails({
        token,
        mailType: "manual_bulk",
        subject,
        body,
        entries: bulkTargets,
      });
      const sentCount = result?.sentCount ?? 0;
      const failedCount = result?.failedCount ?? 0;

      setBulkResult(`送信結果: sent ${sentCount}件 / failed ${failedCount}件`);
      setToast("一斉メール送信を実行しました。");
    } catch (caughtError) {
      console.error(caughtError);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "一斉メール送信に失敗しました。",
      );
    } finally {
      setIsSendingBulk(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-alma-gold">メール管理</p>
        <h1 className="mt-2 text-2xl font-bold text-white">メール履歴</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
          自動送信メールと管理者による手動送信の履歴を確認し、エントリー者へ一斉メールを送信します。
        </p>
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

      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">一斉メール送信</h2>
            <p className="mt-1 text-sm text-zinc-400">
              条件に一致するエントリー者へ送信します。重複メールアドレスは除外します。
            </p>
          </div>
          <div className="rounded-md border border-alma-gold/40 bg-black px-3 py-2 text-sm font-semibold text-alma-gold">
            対象 {bulkTargets.length}名
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">対象</span>
            <select
              value={bulkPaymentFilter}
              onChange={(event) =>
                setBulkPaymentFilter(event.target.value as BulkPaymentFilter)
              }
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">全エントリー者</option>
              <option value="paid">支払い済みのみ</option>
              <option value="pending">未払いのみ</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">大会</span>
            <select
              value={bulkEventFilter}
              onChange={(event) => setBulkEventFilter(event.target.value)}
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
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">種別</span>
            <select
              value={bulkEntryTypeFilter}
              onChange={(event) =>
                setBulkEntryTypeFilter(event.target.value as BulkEntryTypeFilter)
              }
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">個人 / 代表者すべて</option>
              <option value="individual">個人</option>
              <option value="representative">代表者</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">件名</span>
            <input
              value={bulkSubject}
              onChange={(event) => setBulkSubject(event.target.value)}
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">本文</span>
            <textarea
              value={bulkBody}
              onChange={(event) => setBulkBody(event.target.value)}
              rows={7}
              className="w-full rounded-md border border-white/10 bg-black px-3 py-3 text-sm leading-6 text-white outline-none focus:border-alma-gold"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-400">
            {isLoadingEntries
              ? "対象者を読み込んでいます。"
              : `送信対象 ${bulkTargets.length}名`}
          </p>
          <button
            type="button"
            onClick={() => void handleBulkSend()}
            disabled={
              isSendingBulk ||
              bulkTargets.length === 0 ||
              !bulkSubject.trim() ||
              !bulkBody.trim()
            }
            className="min-h-11 rounded-md bg-alma-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSendingBulk ? "送信中..." : "一斉送信"}
          </button>
        </div>
        {bulkResult ? (
          <p className="mt-3 text-sm font-semibold text-emerald-300">{bulkResult}</p>
        ) : null}
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_220px]">
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">検索</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="宛先、件名、大会、エントリーIDで検索"
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">ステータス</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as MailStatusFilter)
              }
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">すべて</option>
              <option value="sent">送信済み</option>
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
      </section>

      {isLoadingLogs ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-alma-gold border-t-transparent" />
          <p className="mt-4 text-sm text-zinc-400">メール履歴を読み込んでいます。</p>
        </div>
      ) : visibleLogs.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-zinc-400">
          条件に一致するメール履歴はありません。
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="border-b border-white/10 bg-black/50 text-xs text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">送信日時</th>
                  <th className="px-4 py-3 font-semibold">宛先</th>
                  <th className="px-4 py-3 font-semibold">種別</th>
                  <th className="px-4 py-3 font-semibold">件名</th>
                  <th className="px-4 py-3 font-semibold">ステータス</th>
                  <th className="px-4 py-3 font-semibold">エラー内容</th>
                  <th className="px-4 py-3 font-semibold">対象大会</th>
                </tr>
              </thead>
              <tbody>
                {visibleLogs.map((log) => (
                  <tr key={log.id} className="border-b border-white/5 align-top">
                    <td className="px-4 py-4 text-zinc-300">
                      {formatDateTime(log.sentAt)}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-white">
                        {log.recipientName || "-"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {log.recipientEmail || "-"}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-zinc-300">
                      {mailTypeLabels[log.mailType]}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-white">{log.subject || "-"}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                        {log.bodyPreview}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge
                        label={statusLabels[log.status]}
                        tone={log.status === "sent" ? "success" : "danger"}
                      />
                    </td>
                    <td className="px-4 py-4 text-xs text-red-200">
                      {log.errorMessage || "-"}
                    </td>
                    <td className="px-4 py-4 text-zinc-300">{log.eventTitle || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
