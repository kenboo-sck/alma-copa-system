"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  parseEntryCompletion,
  readEntryCompletionRaw,
} from "@/lib/entries/entry-storage";

// sessionStorage は外部から変更されないため、購読は不要。
function subscribeToNothing() {
  return () => {};
}

type EntryAcceptedDetailsProps = {
  entryId?: string;
};

// 銀行振込・現金払いの受付完了内容。
// 申込直後に API から受け取った内容（申込時に保存した支払案内）を表示する。
// 画面を開き直した場合など内容が残っていないときは、受付メールの確認を案内する。
export function EntryAcceptedDetails({ entryId }: EntryAcceptedDetailsProps) {
  // サーバーでの描画中は undefined（未読込）、ブラウザでは保存内容（なければ null）。
  const raw = useSyncExternalStore(
    subscribeToNothing,
    () => (entryId ? readEntryCompletionRaw(entryId) : null),
    () => undefined,
  );
  const completion = useMemo(
    () => (entryId && raw ? parseEntryCompletion(entryId, raw) : null),
    [entryId, raw],
  );

  if (raw === undefined) {
    return null;
  }

  if (!completion) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/25 p-4 sm:p-5">
        <p className="text-sm leading-7 text-zinc-200 sm:text-base">
          お申し込みを受け付けました。お支払い方法・金額・お支払いのご案内は、
          お送りした受付メールをご確認ください。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-alma-gold/30 bg-alma-gold/10 p-4 sm:p-5">
        <p className="text-base font-bold leading-7 text-white">
          お申し込みを受け付けました。参加費のお支払いはまだ完了していません。
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-200">
          下記のご案内に沿ってお支払いをお願いいたします。同じ内容を受付メールでもお送りしています。
        </p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md bg-white/[0.04] p-3">
          <dt className="text-xs font-semibold text-zinc-500">大会名</dt>
          <dd className="mt-1 break-words font-semibold text-white">
            {completion.eventTitle}
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] p-3">
          <dt className="text-xs font-semibold text-zinc-500">お申込者</dt>
          <dd className="mt-1 break-words font-semibold text-white">
            {completion.applicantName}
          </dd>
        </div>
        <div className="rounded-md bg-white/[0.04] p-3">
          <dt className="text-xs font-semibold text-zinc-500">お支払い方法</dt>
          <dd className="mt-1 font-semibold text-white">
            {completion.paymentMethodLabel}（未払い）
          </dd>
        </div>
        <div className="rounded-md border border-alma-gold/30 bg-black/30 p-3 sm:col-span-2">
          <dt className="text-xs font-semibold text-alma-gold">お支払い金額（確定）</dt>
          <dd className="mt-1 text-2xl font-black text-white">
            {completion.totalAmount.toLocaleString("ja-JP")}円
          </dd>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            お申し込み時点で確定した金額です。お支払い日によって変わることはありません。
          </p>
        </div>
        {completion.summaryLines.length > 0 ? (
          <div className="rounded-md bg-white/[0.04] p-3 sm:col-span-2">
            <dt className="text-xs font-semibold text-zinc-500">出場内容</dt>
            <dd className="mt-1 space-y-1 font-semibold text-white">
              {completion.summaryLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </dd>
          </div>
        ) : null}
        {completion.paymentGuidance.map((section) => (
          <div
            key={section.label}
            className="rounded-md border border-white/10 bg-black/30 p-3 sm:col-span-2"
          >
            <dt className="text-xs font-semibold text-alma-gold">{section.label}</dt>
            <dd className="mt-1 whitespace-pre-line break-words font-semibold leading-7 text-white">
              {section.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
