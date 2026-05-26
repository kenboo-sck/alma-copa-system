"use client";

import { collection, doc, onSnapshot, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import type { InquiryStatus, InquiryType } from "@/types/inquiry";

type AdminInquiry = {
  id: string;
  name: string;
  email: string;
  phone: string;
  inquiryType: InquiryType;
  message: string;
  status: InquiryStatus;
  adminNotified: boolean;
  userNotified: boolean;
  emailError: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type InquiryStatusFilter = "all" | InquiryStatus;

const inquiryTypeLabels: Record<InquiryType, string> = {
  "": "未選択",
  entry: "エントリーについて",
  payment: "決済について",
  event: "大会について",
  other: "その他",
};

const statusLabels: Record<InquiryStatus, string> = {
  unhandled: "未対応",
  in_progress: "対応中",
  resolved: "対応済み",
};

const statusTones: Record<InquiryStatus, "neutral" | "success" | "danger"> = {
  unhandled: "danger",
  in_progress: "neutral",
  resolved: "success",
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

function toInquiryType(value: unknown): InquiryType {
  if (value === "entry" || value === "payment" || value === "event" || value === "other") {
    return value;
  }
  return "";
}

function toInquiryStatus(value: unknown): InquiryStatus {
  if (value === "in_progress" || value === "resolved") {
    return value;
  }
  return "unhandled";
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

export function AdminInquiriesManager() {
  const [inquiries, setInquiries] = useState<AdminInquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<AdminInquiry | null>(null);
  const [statusFilter, setStatusFilter] = useState<InquiryStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, collections.inquiries),
      (snapshot) => {
        const nextInquiries = snapshot.docs
          .map((inquirySnapshot) => {
            const data = inquirySnapshot.data();

            return {
              id: inquirySnapshot.id,
              name: typeof data.name === "string" ? data.name : "",
              email: typeof data.email === "string" ? data.email : "",
              phone: typeof data.phone === "string" ? data.phone : "",
              inquiryType: toInquiryType(data.inquiryType),
              message: typeof data.message === "string" ? data.message : "",
              status: toInquiryStatus(data.status),
              adminNotified: data.adminNotified === true,
              userNotified: data.userNotified === true,
              emailError: typeof data.emailError === "string" ? data.emailError : "",
              createdAt: toDate(data.createdAt),
              updatedAt: toDate(data.updatedAt),
            };
          })
          .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

        setInquiries(nextInquiries);
        setIsLoading(false);
        setError(null);
      },
      (caughtError) => {
        console.error(caughtError);
        setError("お問い合わせの取得に失敗しました。");
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

  const visibleInquiries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return inquiries.filter((inquiry) => {
      const matchesStatus = statusFilter === "all" || inquiry.status === statusFilter;
      const matchesSearch =
        !query ||
        [
          inquiry.name,
          inquiry.email,
          inquiry.phone,
          inquiry.message,
          inquiryTypeLabels[inquiry.inquiryType],
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [inquiries, searchQuery, statusFilter]);

  const summary = useMemo(
    () => ({
      unhandled: inquiries.filter((item) => item.status === "unhandled").length,
      inProgress: inquiries.filter((item) => item.status === "in_progress").length,
      resolved: inquiries.filter((item) => item.status === "resolved").length,
    }),
    [inquiries],
  );

  async function updateStatus(inquiry: AdminInquiry, status: InquiryStatus) {
    try {
      await updateDoc(doc(db, collections.inquiries, inquiry.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      setToast("対応状況を更新しました。");
      setSelectedInquiry((current) =>
        current?.id === inquiry.id ? { ...current, status } : current,
      );
    } catch (caughtError) {
      console.error(caughtError);
      setError("対応状況の更新に失敗しました。");
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-alma-gold">お問い合わせ管理</p>
        <h1 className="mt-2 text-2xl font-bold text-white">お問い合わせ</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
          公開フォームから届いたお問い合わせを確認し、対応状況を管理します。
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-zinc-400">未対応</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.unhandled}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-zinc-400">対応中</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.inProgress}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-zinc-400">対応済み</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.resolved}</p>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">検索</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="名前、メール、本文で検索"
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">対応状況</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as InquiryStatusFilter)
              }
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            >
              <option value="all">すべて</option>
              <option value="unhandled">未対応</option>
              <option value="in_progress">対応中</option>
              <option value="resolved">対応済み</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
        {isLoading ? (
          <div className="p-6 text-sm text-zinc-400">
            お問い合わせを読み込んでいます。
          </div>
        ) : visibleInquiries.length === 0 ? (
          <div className="p-6 text-sm text-zinc-400">
            条件に一致するお問い合わせはありません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-white/10 bg-black/50 text-xs text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">日時</th>
                  <th className="px-4 py-3 font-semibold">お名前</th>
                  <th className="px-4 py-3 font-semibold">種別</th>
                  <th className="px-4 py-3 font-semibold">内容</th>
                  <th className="px-4 py-3 font-semibold">状況</th>
                  <th className="px-4 py-3 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleInquiries.map((inquiry) => (
                  <tr key={inquiry.id} className="border-b border-white/5 align-top">
                    <td className="px-4 py-4 text-zinc-300">
                      {formatDateTime(inquiry.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-white">{inquiry.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">{inquiry.email}</p>
                    </td>
                    <td className="px-4 py-4 text-zinc-300">
                      {inquiryTypeLabels[inquiry.inquiryType]}
                    </td>
                    <td className="px-4 py-4 text-zinc-300">
                      <p className="line-clamp-2 max-w-md">{inquiry.message}</p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge
                        label={statusLabels[inquiry.status]}
                        tone={statusTones[inquiry.status]}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedInquiry(inquiry)}
                        className="rounded-md border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                      >
                        詳細
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedInquiry ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-alma-gold/40 bg-zinc-950 p-5 shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-alma-gold">お問い合わせ詳細</p>
                <h2 className="mt-2 text-lg font-bold text-white">
                  {selectedInquiry.name}
                </h2>
                <p className="mt-1 break-all text-sm text-zinc-400">
                  {selectedInquiry.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInquiry(null)}
                className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:text-white"
              >
                閉じる
              </button>
            </div>

            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-zinc-500">電話番号</dt>
                <dd className="mt-1 text-zinc-200">{selectedInquiry.phone || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">種別</dt>
                <dd className="mt-1 text-zinc-200">
                  {inquiryTypeLabels[selectedInquiry.inquiryType]}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">通知メール</dt>
                <dd className="mt-1 text-zinc-200">
                  管理者: {selectedInquiry.adminNotified ? "送信済み" : "未送信"} /
                  ユーザー: {selectedInquiry.userNotified ? "送信済み" : "未送信"}
                </dd>
              </div>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-zinc-400">対応状況</span>
                <select
                  value={selectedInquiry.status}
                  onChange={(event) =>
                    void updateStatus(
                      selectedInquiry,
                      event.target.value as InquiryStatus,
                    )
                  }
                  className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
                >
                  <option value="unhandled">未対応</option>
                  <option value="in_progress">対応中</option>
                  <option value="resolved">対応済み</option>
                </select>
              </label>
            </dl>

            {selectedInquiry.emailError ? (
              <div className="mt-4 rounded-md border border-red-800/70 bg-red-950 px-4 py-3 text-xs text-red-100">
                {selectedInquiry.emailError}
              </div>
            ) : null}

            <div className="mt-5 rounded-md border border-white/10 bg-black px-4 py-3">
              <p className="text-xs font-semibold text-zinc-500">お問い合わせ内容</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-100">
                {selectedInquiry.message}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
