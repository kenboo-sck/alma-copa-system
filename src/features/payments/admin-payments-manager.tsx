"use client";

import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";

type PaymentStatus = "pending" | "paid" | "failed";

type PaymentEntry = {
  id: string;
  eventId: string;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  currency: "JPY";
  stripeCheckoutSessionId?: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "未払い",
  paid: "支払い済み",
  failed: "失敗",
};

const paymentStatusTones: Record<
  PaymentStatus,
  "neutral" | "success" | "danger"
> = {
  pending: "neutral",
  paid: "success",
  failed: "danger",
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
  if (value === "paid" || value === "failed") {
    return value;
  }

  return "pending";
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

export function AdminPaymentsManager() {
  const [entries, setEntries] = useState<PaymentEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, collections.entries),
      (snapshot) => {
        const nextEntries = snapshot.docs
          .map((entrySnapshot) => {
            const data = entrySnapshot.data();

            return {
              id: entrySnapshot.id,
              eventId: typeof data.eventId === "string" ? data.eventId : "-",
              paymentStatus: toPaymentStatus(data.paymentStatus),
              totalAmount:
                typeof data.totalAmount === "number" ? data.totalAmount : 0,
              currency: "JPY" as const,
              stripeCheckoutSessionId:
                typeof data.stripeCheckoutSessionId === "string"
                  ? data.stripeCheckoutSessionId
                  : undefined,
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
        setError("決済情報の取得に失敗しました。");
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const summary = useMemo(
    () => ({
      pending: entries.filter((entry) => entry.paymentStatus === "pending").length,
      paid: entries.filter((entry) => entry.paymentStatus === "paid").length,
      failed: entries.filter((entry) => entry.paymentStatus === "failed").length,
    }),
    [entries],
  );

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-alma-gold">決済管理</p>
        <h1 className="mt-2 text-2xl font-bold text-white">決済</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
          Stripe Checkoutの決済状態を確認します。
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-zinc-400">未払い</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.pending}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-zinc-400">支払い済み</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.paid}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-zinc-400">失敗</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.failed}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
        {isLoading ? (
          <div className="p-6 text-sm text-zinc-400">決済情報を読み込んでいます。</div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-sm text-zinc-400">決済情報はまだありません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-white/10 bg-black/50 text-xs text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">エントリーID</th>
                  <th className="px-4 py-3 font-semibold">大会ID</th>
                  <th className="px-4 py-3 font-semibold">決済状態</th>
                  <th className="px-4 py-3 text-right font-semibold">金額</th>
                  <th className="px-4 py-3 font-semibold">Stripe Session</th>
                  <th className="px-4 py-3 font-semibold">更新日時</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/5">
                    <td className="px-4 py-4 font-mono text-xs text-zinc-300">
                      {entry.id}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-zinc-300">
                      {entry.eventId}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge
                        label={paymentStatusLabels[entry.paymentStatus]}
                        tone={paymentStatusTones[entry.paymentStatus]}
                      />
                    </td>
                    <td className="px-4 py-4 text-right text-zinc-200">
                      {entry.totalAmount.toLocaleString("ja-JP")}円
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-zinc-500">
                      {entry.stripeCheckoutSessionId ?? "-"}
                    </td>
                    <td className="px-4 py-4 text-zinc-300">
                      {formatDateTime(entry.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
