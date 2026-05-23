"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type CheckoutButtonProps = {
  eventId: string;
  amount?: number;
};

type CheckoutResponse = {
  url?: string;
  error?: string;
};

export function CheckoutButton({ eventId, amount = 5000 }: CheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function startCheckout() {
    setIsLoading(true);
    setError(null);
    setToast("Stripe Checkoutを準備しています。");

    try {
      const response = await fetch("/api/payments/checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          amount,
          currency: "JPY",
          itemName: "ALMA COPA エントリー費",
        }),
      });

      const data = (await response.json()) as CheckoutResponse;

      if (!response.ok || !data.url) {
        throw new Error(data.error || "決済ページの作成に失敗しました。");
      }

      setToast("Stripe Checkoutへ移動します。");
      window.location.href = data.url;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "決済ページの作成に失敗しました。";

      setError(message);
      setToast(null);
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-alma-gold/30 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-2xl shadow-black/30">
      {toast ? (
        <div className="mb-4 rounded-md border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-100">
          {toast}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-alma-gold">
            ALMA COPA エントリー費
          </p>
          <p className="mt-2 text-2xl font-bold text-white">
            {amount.toLocaleString("ja-JP")}円
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            テストカード 4242 4242 4242 4242 で決済確認できます。
          </p>
        </div>
        <Button onClick={() => void startCheckout()} disabled={isLoading}>
          {isLoading ? "決済ページを作成中..." : "支払いへ進む"}
        </Button>
      </div>
    </div>
  );
}
