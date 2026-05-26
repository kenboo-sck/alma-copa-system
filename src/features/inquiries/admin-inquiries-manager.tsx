"use client";

import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import { auth, db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import {
  inquiryReplySubject,
  inquiryReplyTemplate,
} from "@/lib/inquiries/reply-template";
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
  replyCount: number;
  lastReplyAt: Date | null;
  lastReplySubject: string;
  lastReplyBodyPreview: string;
  lastReplyRecipientEmail: string;
  lastReplyByUid: string;
  lastReplyByEmail: string;
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

function buildExcerpt(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "-";
  }

  return normalized.length > 90 ? `${normalized.slice(0, 90)}…` : normalized;
}

export function AdminInquiriesManager() {
  const [inquiries, setInquiries] = useState<AdminInquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<AdminInquiry | null>(null);
  const [statusFilter, setStatusFilter] = useState<InquiryStatusFilter>("all");
  const [nameQuery, setNameQuery] = useState("");
  const [emailQuery, setEmailQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [replySubject, setReplySubject] = useState(inquiryReplySubject);
  const [replyBody, setReplyBody] = useState(inquiryReplyTemplate());
  const [replyNextStatus, setReplyNextStatus] =
    useState<Exclude<InquiryStatus, "unhandled">>("in_progress");
  const [isReplySending, setIsReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

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
              replyCount:
                typeof data.replyCount === "number" && Number.isFinite(data.replyCount)
                  ? data.replyCount
                  : 0,
              lastReplyAt: toDate(data.lastReplyAt),
              lastReplySubject:
                typeof data.lastReplySubject === "string" ? data.lastReplySubject : "",
              lastReplyBodyPreview:
                typeof data.lastReplyBodyPreview === "string"
                  ? data.lastReplyBodyPreview
                  : "",
              lastReplyRecipientEmail:
                typeof data.lastReplyRecipientEmail === "string"
                  ? data.lastReplyRecipientEmail
                  : "",
              lastReplyByUid:
                typeof data.lastReplyByUid === "string" ? data.lastReplyByUid : "",
              lastReplyByEmail:
                typeof data.lastReplyByEmail === "string" ? data.lastReplyByEmail : "",
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

  useEffect(() => {
    if (!selectedInquiry) {
      return;
    }

    setReplySubject(inquiryReplySubject);
    setReplyBody(inquiryReplyTemplate());
    setReplyNextStatus(
      selectedInquiry.status === "resolved" ? "resolved" : "in_progress",
    );
    setReplyError(null);
  }, [selectedInquiry?.id]);

  const visibleInquiries = useMemo(() => {
    const normalizedName = nameQuery.trim().toLowerCase();
    const normalizedEmail = emailQuery.trim().toLowerCase();

    return inquiries.filter((inquiry) => {
      const matchesStatus = statusFilter === "all" || inquiry.status === statusFilter;
      const matchesName =
        !normalizedName || inquiry.name.toLowerCase().includes(normalizedName);
      const matchesEmail =
        !normalizedEmail || inquiry.email.toLowerCase().includes(normalizedEmail);

      return matchesStatus && matchesName && matchesEmail;
    });
  }, [emailQuery, inquiries, nameQuery, statusFilter]);

  const summary = useMemo(
    () => ({
      total: inquiries.length,
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

  async function handleReplySend() {
    if (!selectedInquiry || isReplySending) {
      return;
    }

    const subject = replySubject.trim();
    const body = replyBody.trim();

    if (!subject || !body) {
      setReplyError("件名と本文を入力してください。");
      return;
    }

    setReplyError(null);
    setIsReplySending(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error("管理者認証を確認できませんでした。");
      }

      const response = await fetch("/api/admin/inquiries/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          recipientEmail: selectedInquiry.email,
          subject,
          body,
          nextStatus: replyNextStatus,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        success?: boolean;
        inquiryUpdated?: boolean;
        mailLogged?: boolean;
        updatedStatus?: InquiryStatus;
        lastReplyAt?: string;
        replyCount?: number;
        subject?: string;
        lastReplySubject?: string;
        lastReplyBodyPreview?: string;
        lastReplyRecipientEmail?: string;
        lastReplyByUid?: string;
        lastReplyByEmail?: string;
      } | null;

      if (!response.ok || data?.success !== true) {
        throw new Error(data?.error ?? "問い合わせ返信メールの送信に失敗しました。");
      }

      setToast("問い合わせ返信メールを送信しました。");
      setSelectedInquiry((current) =>
        current?.id === selectedInquiry.id
          ? {
              ...current,
              status: data.updatedStatus ?? replyNextStatus,
              replyCount: data.replyCount ?? current.replyCount + 1,
              lastReplyAt: data.lastReplyAt ? new Date(data.lastReplyAt) : new Date(),
              lastReplySubject: data.lastReplySubject ?? subject,
              lastReplyBodyPreview:
                data.lastReplyBodyPreview ??
                body.replace(/\s+/g, " ").trim().slice(0, 160),
              lastReplyRecipientEmail:
                data.lastReplyRecipientEmail ?? selectedInquiry.email,
              lastReplyByUid: data.lastReplyByUid ?? current.lastReplyByUid,
              lastReplyByEmail: data.lastReplyByEmail ?? current.lastReplyByEmail,
            }
          : current,
      );
      setReplySubject(inquiryReplySubject);
      setReplyBody(inquiryReplyTemplate());
      setReplyNextStatus(
        data.updatedStatus === "resolved" ? "resolved" : "in_progress",
      );
    } catch (caughtError) {
      console.error(caughtError);
      setReplyError(
        caughtError instanceof Error
          ? caughtError.message
          : "問い合わせ返信メールの送信に失敗しました。",
      );
    } finally {
      setIsReplySending(false);
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-zinc-400">合計</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.total}</p>
        </div>
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
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_180px]">
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">名前検索</span>
            <input
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder="名前で絞り込み"
              className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">メール検索</span>
            <input
              value={emailQuery}
              onChange={(event) => setEmailQuery(event.target.value)}
              placeholder="メールで絞り込み"
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
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/50 text-xs text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">日時</th>
                    <th className="px-4 py-3 font-semibold">名前</th>
                    <th className="px-4 py-3 font-semibold">メール</th>
                    <th className="px-4 py-3 font-semibold">電話番号</th>
                    <th className="px-4 py-3 font-semibold">問い合わせ種別</th>
                    <th className="px-4 py-3 font-semibold">問い合わせ内容</th>
                    <th className="px-4 py-3 font-semibold">対応状況</th>
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
                      </td>
                      <td className="px-4 py-4 text-zinc-300">{inquiry.email}</td>
                      <td className="px-4 py-4 text-zinc-300">
                        {inquiry.phone || "-"}
                      </td>
                      <td className="px-4 py-4 text-zinc-300">
                        {inquiryTypeLabels[inquiry.inquiryType]}
                      </td>
                      <td className="px-4 py-4 text-zinc-300">
                        <button
                          type="button"
                          onClick={() => setSelectedInquiry(inquiry)}
                          className="block max-w-[420px] text-left hover:text-alma-gold"
                        >
                          <span className="line-clamp-2">{buildExcerpt(inquiry.message)}</span>
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <select
                          value={inquiry.status}
                          onChange={(event) =>
                            void updateStatus(
                              inquiry,
                              event.target.value as InquiryStatus,
                            )
                          }
                          className="h-10 rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
                        >
                          <option value="unhandled">未対応</option>
                          <option value="in_progress">対応中</option>
                          <option value="resolved">対応済み</option>
                        </select>
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

            <div className="space-y-3 p-3 lg:hidden">
              {visibleInquiries.map((inquiry) => (
                <article
                  key={inquiry.id}
                  className="rounded-lg border border-white/10 bg-black/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-zinc-500">
                        {formatDateTime(inquiry.createdAt)}
                      </p>
                      <h2 className="mt-1 text-base font-semibold text-white">
                        {inquiry.name}
                      </h2>
                      <p className="mt-1 break-all text-sm text-zinc-400">
                        {inquiry.email}
                      </p>
                    </div>
                    <StatusBadge
                      label={statusLabels[inquiry.status]}
                      tone={statusTones[inquiry.status]}
                    />
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-zinc-500">電話番号</dt>
                      <dd className="text-right text-zinc-200">
                        {inquiry.phone || "-"}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-zinc-500">種別</dt>
                      <dd className="text-right text-zinc-200">
                        {inquiryTypeLabels[inquiry.inquiryType]}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">問い合わせ内容</dt>
                      <dd className="mt-1 line-clamp-3 whitespace-pre-wrap text-zinc-200">
                        {buildExcerpt(inquiry.message)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <select
                      value={inquiry.status}
                      onChange={(event) =>
                        void updateStatus(inquiry, event.target.value as InquiryStatus)
                      }
                      className="h-11 rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
                    >
                      <option value="unhandled">未対応</option>
                      <option value="in_progress">対応中</option>
                      <option value="resolved">対応済み</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setSelectedInquiry(inquiry)}
                      className="h-11 rounded-md border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:border-alma-gold hover:text-alma-gold"
                    >
                      詳細
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
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
                <p className="mt-1 text-sm text-zinc-400">
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

            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge
                label={statusLabels[selectedInquiry.status]}
                tone={statusTones[selectedInquiry.status]}
              />
              <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-semibold text-zinc-300">
                種別: {inquiryTypeLabels[selectedInquiry.inquiryType]}
              </span>
              <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-semibold text-zinc-300">
                返信済み: {selectedInquiry.replyCount > 0 ? "はい" : "いいえ"}
              </span>
            </div>

            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-zinc-500">送信日時</dt>
                <dd className="mt-1 text-zinc-200">
                  {formatDateTime(selectedInquiry.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">更新日時</dt>
                <dd className="mt-1 text-zinc-200">
                  {formatDateTime(selectedInquiry.updatedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">電話番号</dt>
                <dd className="mt-1 text-zinc-200">{selectedInquiry.phone || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">通知メール</dt>
                <dd className="mt-1 text-zinc-200">
                  管理者: {selectedInquiry.adminNotified ? "送信済み" : "未送信"} /{" "}
                  ユーザー: {selectedInquiry.userNotified ? "送信済み" : "未送信"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">最終返信日時</dt>
                <dd className="mt-1 text-zinc-200">
                  {formatDateTime(selectedInquiry.lastReplyAt)}
                </dd>
              </div>
              <label className="space-y-2 sm:col-span-2">
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

            <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-alma-gold">返信</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    この返信内容はメール履歴へ保存されます。
                  </p>
                </div>
                <label className="space-y-2 sm:w-56">
                  <span className="text-xs font-semibold text-zinc-400">返信後の対応状況</span>
                  <select
                    value={replyNextStatus}
                    onChange={(event) =>
                      setReplyNextStatus(
                        event.target.value as Exclude<InquiryStatus, "unhandled">,
                      )
                    }
                    className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
                  >
                    <option value="in_progress">対応中にする</option>
                    <option value="resolved">対応済みにする</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 grid gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-zinc-400">宛先メールアドレス</span>
                  <input
                    value={selectedInquiry.email}
                    readOnly
                    className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-zinc-300 outline-none"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-zinc-400">件名</span>
                  <input
                    value={replySubject}
                    onChange={(event) => setReplySubject(event.target.value)}
                    className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-zinc-400">本文</span>
                  <textarea
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    rows={12}
                    className="w-full rounded-md border border-white/10 bg-black px-3 py-3 text-sm leading-6 text-white outline-none focus:border-alma-gold"
                  />
                </label>
              </div>

              {replyError ? (
                <div className="mt-4 rounded-md border border-red-800/70 bg-red-950 px-4 py-3 text-sm text-red-100">
                  {replyError}
                </div>
              ) : null}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleReplySend()}
                  disabled={isReplySending}
                  className="min-h-11 rounded-md bg-alma-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isReplySending ? "送信中..." : "返信を送信"}
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-md border border-white/10 bg-black px-4 py-3">
              <p className="text-xs font-semibold text-zinc-500">問い合わせ本文</p>
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
