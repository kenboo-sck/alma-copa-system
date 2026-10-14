"use client";

import { useEffect, useState } from "react";

import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/lib/payments/payment-methods";

type PaymentSuccessStatusProps = {
  sessionId?: string;
};

type PaymentSummaryResponse = {
  entryId?: string;
  eventTitle?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: "paid" | "pending";
  totalAmount?: number;
  confirmation?: string;
  error?: string;
};

type ViewState =
  | { kind: "checking" }
  | { kind: "paid"; summary: PaymentSummaryResponse }
  | { kind: "pending" }
  | { kind: "needs_review" }
  | { kind: "error" };

const MAX_ATTEMPTS = 6;
const RETRY_INTERVAL_MS = 2500;

// 決済完了後に戻ってくる画面。支払状態はこの画面からは変更せず、
// サーバーが Stripe に確認して確定した結果を表示するだけにする。
export function PaymentSuccessStatus({ sessionId }: PaymentSuccessStatusProps) {
  const [state, setState] = useState<ViewState>(
    sessionId ? { kind: "checking" } : { kind: "error" },
  );

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let isActive = true;
    let timer: number | undefined;

    async function check(attempt: number) {
      try {
        const response = await fetch(
          `/api/payments/checkout-session?session_id=${encodeURIComponent(sessionId ?? "")}`,
          { cache: "no-store" },
        );
        const data = (await response
          .json()
          .catch(() => null)) as PaymentSummaryResponse | null;

        if (!isActive) {
          return;
        }

        if (response.ok && data?.paymentStatus === "paid") {
          setState({ kind: "paid", summary: data });
          return;
        }

        if (response.ok && data?.confirmation === "mismatch") {
          setState({ kind: "needs_review" });
          return;
        }
      } catch (error) {
        console.error("決済状態の確認に失敗しました", { sessionId, error });
      }

      if (!isActive) {
        return;
      }

      if (attempt >= MAX_ATTEMPTS) {
        setState({ kind: "pending" });
        return;
      }

      timer = window.setTimeout(() => void check(attempt + 1), RETRY_INTERVAL_MS);
    }

    void check(1);

    return () => {
      isActive = false;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [sessionId]);

  if (state.kind === "checking") {
    return (
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-alma-gold border-t-transparent" />
        <p className="text-sm leading-6 text-zinc-300 sm:text-base">
          お支払いの状態を確認しています。
        </p>
      </div>
    );
  }

  if (state.kind === "paid") {
    const { summary } = state;

    return (
      <div className="space-y-4">
        <p className="text-base font-bold leading-7 text-white">
          お支払いを確認しました。エントリーの受付が完了しています。
        </p>
        <p className="text-sm leading-6 text-zinc-300">
          確認メールをお送りしています。届かない場合は迷惑メールフォルダをご確認ください。
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md bg-white/[0.04] p-3">
            <dt className="text-xs font-semibold text-zinc-500">大会名</dt>
            <dd className="mt-1 break-words font-semibold text-white">
              {summary.eventTitle || "-"}
            </dd>
          </div>
          <div className="rounded-md bg-white/[0.04] p-3">
            <dt className="text-xs font-semibold text-zinc-500">お支払い方法</dt>
            <dd className="mt-1 font-semibold text-white">
              {PAYMENT_METHOD_LABELS[summary.paymentMethod ?? "card"]}
            </dd>
          </div>
          <div className="rounded-md bg-white/[0.04] p-3">
            <dt className="text-xs font-semibold text-zinc-500">お支払い金額</dt>
            <dd className="mt-1 font-semibold text-white">
              {(summary.totalAmount ?? 0).toLocaleString("ja-JP")}円
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  if (state.kind === "needs_review") {
    return (
      <p className="text-sm leading-7 text-zinc-200 sm:text-base">
        お支払いの内容とお申し込みの内容を照合できませんでした。運営にて確認いたしますので、
        お手数ですがお問い合わせフォームよりご連絡ください。
      </p>
    );
  }

  if (state.kind === "pending") {
    return (
      <p className="text-sm leading-7 text-zinc-200 sm:text-base">
        お支払いの確認に時間がかかっています。確認が完了すると確認メールをお送りします。
        しばらく経ってもメールが届かない場合は、お問い合わせフォームよりご連絡ください。
      </p>
    );
  }

  return (
    <p className="text-sm leading-7 text-zinc-200 sm:text-base">
      お支払いの状態を確認できませんでした。確認メールが届いていない場合は、
      お問い合わせフォームよりご連絡ください。
    </p>
  );
}
