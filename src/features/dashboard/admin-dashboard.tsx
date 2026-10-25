"use client";

import { collection, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments/payment-methods";

import {
  buildEventOptions,
  summarizeEntries,
  summarizeEvents,
  type DashboardEntrySummary,
} from "./dashboard-summary";

type DataRecord = Record<string, unknown>;
type SnapshotDoc = { id: string; data: DataRecord };

// 読み込み中・取得失敗を 0 件と区別するため、データと状態を一緒に持つ。
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; docs: SnapshotDoc[]; loadedAt: Date };

// 受付期間・振込期限の判定に使う現在時刻の更新間隔。
const NOW_REFRESH_MS = 60 * 1000;

function useCollection(name: string, errorMessage: string): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    // 読み取り専用（onSnapshot のみ）。ダッシュボードからは書き込まない。
    const unsubscribe = onSnapshot(
      collection(db, name),
      (snapshot) => {
        setState({
          status: "ready",
          docs: snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            data: docSnapshot.data(),
          })),
          loadedAt: new Date(),
        });
      },
      (caughtError) => {
        console.error(caughtError);
        setState({ status: "error", message: errorMessage });
      },
    );

    return unsubscribe;
  }, [name, errorMessage]);

  return state;
}

function formatYen(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatByMethod(byMethod: DashboardEntrySummary["paid"]["byMethod"]) {
  const parts = (["cash", "bank_transfer", "card"] as const)
    .filter((method) => byMethod[method] > 0)
    .map((method) => `${PAYMENT_METHOD_LABELS[method]} ${byMethod[method]}件`);

  return parts.length > 0 ? parts.join(" / ") : "なし";
}

function MetricValue({
  state,
  value,
  unit,
}: {
  state: LoadState["status"];
  value: number | null;
  unit: string;
}) {
  if (state === "loading") {
    return (
      <p className="mt-3 text-base font-semibold text-zinc-500" aria-busy="true">
        読み込み中…
      </p>
    );
  }

  if (state === "error" || value === null) {
    return (
      <p className="mt-3 text-base font-semibold text-red-300">取得できませんでした</p>
    );
  }

  return (
    <p className="mt-3 text-3xl font-bold text-white">
      {value.toLocaleString("ja-JP")}
      <span className="ml-1 text-base font-semibold text-zinc-400">{unit}</span>
    </p>
  );
}

function MetricCard({
  label,
  state,
  value,
  unit,
  criteria,
  href,
  tone = "default",
  children,
}: {
  label: string;
  state: LoadState["status"];
  value: number | null;
  unit: string;
  // 集計の対象と条件（管理者向けの説明）。
  criteria: string;
  href: string;
  tone?: "default" | "warning";
  children?: ReactNode;
}) {
  const highlight = tone === "warning" && state === "ready" && (value ?? 0) > 0;

  return (
    <div
      className={`flex flex-col rounded-lg border p-5 ${
        highlight
          ? "border-amber-700/70 bg-amber-950/30"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <p className="text-sm font-semibold text-zinc-300">{label}</p>
      <MetricValue state={state} value={value} unit={unit} />
      {state === "ready" && children ? (
        <div className="mt-3 space-y-1 text-xs leading-5 text-zinc-300">{children}</div>
      ) : null}
      <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-zinc-500">
        {criteria}
      </p>
      <Link
        href={href}
        className="mt-auto pt-3 text-xs font-semibold text-alma-gold hover:underline"
      >
        詳細を見る
      </Link>
    </div>
  );
}

export function AdminDashboard() {
  const eventsState = useCollection(
    collections.events,
    "大会情報の取得に失敗しました。",
  );
  const entriesState = useCollection(
    collections.entries,
    "申込情報の取得に失敗しました。",
  );
  const [now, setNow] = useState(() => new Date());
  const [eventFilter, setEventFilter] = useState("all");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), NOW_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const eventSummary = useMemo(
    () =>
      eventsState.status === "ready" ? summarizeEvents(eventsState.docs, now) : null,
    [eventsState, now],
  );

  const eventOptions = useMemo(
    () =>
      buildEventOptions(
        eventsState.status === "ready" ? eventsState.docs : [],
        entriesState.status === "ready" ? entriesState.docs : [],
      ),
    [eventsState, entriesState],
  );

  const entrySummary = useMemo(() => {
    if (entriesState.status !== "ready") {
      return null;
    }

    const docs =
      eventFilter === "all"
        ? entriesState.docs
        : entriesState.docs.filter((entry) => entry.data.eventId === eventFilter);

    return summarizeEntries(docs, now);
  }, [entriesState, eventFilter, now]);

  const errors = [eventsState, entriesState].flatMap((state) =>
    state.status === "error" ? [state.message] : [],
  );
  const scopeLabel =
    eventFilter === "all"
      ? "すべての大会"
      : (eventOptions.find((option) => option.id === eventFilter)?.title ??
        "選択した大会");

  return (
    <section>
      <p className="text-sm font-semibold text-alma-gold">管理メニュー</p>
      <h1 className="mt-2 text-2xl font-bold text-white">ダッシュボード</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
        大会と申込の現在の状況を集計して表示します。数値は申込の件数（代表者申込は選手が複数でも
        1 件）で、選手の人数は別に表示します。
      </p>

      {errors.length > 0 ? (
        <div className="mt-6 space-y-1 rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
          <p className="text-xs text-red-200">
            表示できない項目は 0 件ではありません。時間をおいて再読み込みしてください。
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <label className="block max-w-sm flex-1 text-xs text-zinc-400">
          申込の集計対象
          <select
            value={eventFilter}
            onChange={(event) => setEventFilter(event.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
          >
            <option value="all">すべての大会</option>
            {eventOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-zinc-500">
          {entriesState.status === "ready"
            ? `最終更新 ${formatDateTime(entriesState.loadedAt)}（自動更新）`
            : null}
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="受付中大会"
          state={eventsState.status}
          value={eventSummary?.openEvents.length ?? null}
          unit="大会"
          criteria="公開中、かつ受付期間内（開始〜終了日時）で、選択できる支払方法がある大会。公開ページで「受付中」と表示される大会と同じです。集計対象の選択に関係なく全大会が対象です。"
          href="/admin/events"
        >
          {eventSummary?.openEvents.map((event) => (
            <p key={event.id} className="truncate">
              {event.title}
              <span className="text-zinc-500">
                （〜{formatDateTime(event.entryEndAt)}）
              </span>
            </p>
          ))}
          {eventSummary && eventSummary.preparingCount > 0 ? (
            <p className="text-amber-300">
              受付準備中 {eventSummary.preparingCount}大会（期間内だが支払方法が未設定）
            </p>
          ) : null}
          {eventSummary && eventSummary.upcomingCount > 0 ? (
            <p className="text-zinc-400">受付前 {eventSummary.upcomingCount}大会</p>
          ) : null}
        </MetricCard>

        <MetricCard
          label="受付済み申込"
          state={entriesState.status}
          value={entrySummary?.confirmed ?? null}
          unit="件"
          criteria={`${scopeLabel}の申込のうち、申込状態が「受付済み」のもの（銀行振込・現金払いは申込時点、カードは決済完了時点で受付済み）。キャンセル済み・カード決済の手続き待ちは含みません。`}
          href="/admin/entries"
        >
          {entrySummary ? (
            <>
              <p>
                選手 {entrySummary.confirmedAthletes.toLocaleString("ja-JP")}名
                <span className="text-zinc-500">（取消済みの選手を除く）</span>
              </p>
              <p className="text-zinc-400">
                カード決済の手続き待ち {entrySummary.pendingPayment}件
              </p>
              <p className="text-zinc-400">キャンセル済み {entrySummary.cancelled}件</p>
              {entrySummary.otherStatus > 0 ? (
                <p className="text-zinc-400">
                  その他（期限切れ・返金済みなど） {entrySummary.otherStatus}件
                </p>
              ) : null}
              <p className="text-zinc-500">申込の総数 {entrySummary.total}件</p>
            </>
          ) : null}
        </MetricCard>

        <MetricCard
          label="未払い"
          state={entriesState.status}
          value={entrySummary?.unpaid.count ?? null}
          unit="件"
          criteria="受付済み申込のうち、請求額に対して入金が不足しているもの（一部入金を含む）。振込の入金・現金の受領を記録すると「支払い済み」に移ります。"
          href="/admin/entries"
          tone="warning"
        >
          {entrySummary ? (
            <>
              <p>{formatByMethod(entrySummary.unpaid.byMethod)}</p>
              <p>未収額 {formatYen(entrySummary.unpaid.dueAmount)}</p>
              {entrySummary.unpaid.partialCount > 0 ? (
                <p className="text-zinc-400">
                  うち一部入金（残額あり） {entrySummary.unpaid.partialCount}件
                </p>
              ) : null}
            </>
          ) : null}
        </MetricCard>

        <MetricCard
          label="支払い済み"
          state={entriesState.status}
          value={entrySummary?.paid.count ?? null}
          unit="件"
          criteria="受付済み申込のうち、請求額の全額が入金済みのもの（カード決済の完了、振込入金・現金受領の記録を含む）。"
          href="/admin/payments"
        >
          {entrySummary ? (
            <>
              <p>{formatByMethod(entrySummary.paid.byMethod)}</p>
              <p>入金額 {formatYen(entrySummary.paid.netPaidAmount)}</p>
              {entrySummary.confirmedOtherPayment > 0 ? (
                <p className="text-zinc-400">
                  未払い・支払い済み以外（請求なし・返金関連）{" "}
                  {entrySummary.confirmedOtherPayment}件
                </p>
              ) : null}
            </>
          ) : null}
        </MetricCard>

        <MetricCard
          label="要確認"
          state={entriesState.status}
          value={entrySummary?.review.count ?? null}
          unit="件"
          criteria="管理者の対応が必要な申込（申込状態を問わない）。カード決済の金額・申込の照合に失敗したもの、振込期限を過ぎても未払いのもの、過入金、返金待ち。1 件が複数に当てはまっても 1 件と数えます。"
          href="/admin/entries"
          tone="warning"
        >
          {entrySummary ? (
            <>
              <p>決済要確認 {entrySummary.review.paymentIssue}件</p>
              <p>振込期限超過 {entrySummary.review.bankTransferOverdue}件</p>
              <p>過入金（精算要確認） {entrySummary.review.overpaid}件</p>
              <p>返金待ち {entrySummary.review.refundPending}件</p>
            </>
          ) : null}
        </MetricCard>
      </div>
    </section>
  );
}
