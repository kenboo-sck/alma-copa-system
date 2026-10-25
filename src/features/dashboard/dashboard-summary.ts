// 管理画面ダッシュボードの集計。Firestore から読んだ大会・申込のデータを数えるだけで、書き込みはしない。
// 判定は大会一覧・エントリー管理画面と同じ共通処理を使い、画面ごとに数え方がずれないようにする。

import {
  getPaymentState,
  isRecord,
  readEntryAccounting,
  summarizeActiveEntry,
} from "@/lib/entries/entry-accounting";
import {
  PAYMENT_METHODS,
  isBankTransferOverdue,
  toEntryPaymentStatus,
  toPaymentMethod,
  type PaymentMethod,
} from "@/lib/payments/payment-methods";

import { getEntryState, mapPublicEvent } from "../events/public-event-utils";

type DataRecord = Record<string, unknown>;

export type DashboardEventOption = { id: string; title: string };

export type DashboardEventSummary = {
  // 公開中・受付期間内・選択できる支払方法がある大会（公開ページで「受付中」と表示される大会）。
  openEvents: { id: string; title: string; entryEndAt: Date | null }[];
  // 公開中・受付期間内だが、選択できる支払方法がないため申込を受け付けていない大会。
  preparingCount: number;
  // 公開中で、受付開始前の大会。
  upcomingCount: number;
  // 削除済みを除く大会の数。
  totalCount: number;
};

function stringField(data: DataRecord, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

export function summarizeEvents(
  events: { id: string; data: DataRecord }[],
  now: Date,
): DashboardEventSummary {
  const summary: DashboardEventSummary = {
    openEvents: [],
    preparingCount: 0,
    upcomingCount: 0,
    totalCount: 0,
  };

  for (const { id, data } of events) {
    if (data.deletedAt) {
      continue;
    }

    summary.totalCount += 1;
    const event = mapPublicEvent(id, data);
    const { label } = getEntryState(event, now);

    if (label === "受付中") {
      summary.openEvents.push({
        id,
        title: event.title || "大会名未設定",
        entryEndAt: event.entryEndAt,
      });
    } else if (label === "受付準備中") {
      summary.preparingCount += 1;
    } else if (label === "受付前") {
      summary.upcomingCount += 1;
    }
  }

  summary.openEvents.sort(
    (a, b) =>
      (a.entryEndAt?.getTime() ?? Infinity) - (b.entryEndAt?.getTime() ?? Infinity),
  );

  return summary;
}

export type DashboardEntrySummary = {
  // 申込（ドキュメント）の件数。代表者申込は複数の選手を含んでも 1 件。
  total: number;
  // 申込状態ごとの件数。
  confirmed: number;
  pendingPayment: number;
  cancelled: number;
  // 期限切れ・返金済み・未確定など、上記以外の状態。
  otherStatus: number;
  // 受付済み申込に含まれる、出場中（取消済みを除く）の選手の人数。
  confirmedAthletes: number;
  // 以下の支払状況は、受付済み申込だけを数える。
  unpaid: {
    count: number;
    // うち一部入金（残額あり）。
    partialCount: number;
    byMethod: Record<PaymentMethod, number>;
    // 未収額の合計。
    dueAmount: number;
  };
  paid: {
    count: number;
    byMethod: Record<PaymentMethod, number>;
    // 入金済み額（返金済み額を差し引いた額）の合計。
    netPaidAmount: number;
  };
  // 受付済みのうち、未払い・支払い済みのどちらでもない申込（請求なし・返金関連）。
  confirmedOtherPayment: number;
  // 要確認（申込状態を問わない）。1 件が複数の理由に当てはまる場合、count は 1 件として数える。
  review: {
    count: number;
    paymentIssue: number;
    bankTransferOverdue: number;
    overpaid: number;
    refundPending: number;
  };
};

function emptyByMethod(): Record<PaymentMethod, number> {
  return Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0])) as Record<
    PaymentMethod,
    number
  >;
}

export function summarizeEntries(
  entries: { id: string; data: DataRecord }[],
  now: Date,
): DashboardEntrySummary {
  const summary: DashboardEntrySummary = {
    total: 0,
    confirmed: 0,
    pendingPayment: 0,
    cancelled: 0,
    otherStatus: 0,
    confirmedAthletes: 0,
    unpaid: { count: 0, partialCount: 0, byMethod: emptyByMethod(), dueAmount: 0 },
    paid: { count: 0, byMethod: emptyByMethod(), netPaidAmount: 0 },
    confirmedOtherPayment: 0,
    review: {
      count: 0,
      paymentIssue: 0,
      bankTransferOverdue: 0,
      overpaid: 0,
      refundPending: 0,
    },
  };

  for (const { data } of entries) {
    summary.total += 1;

    const entryStatus = stringField(data, "entryStatus");
    const paymentMethod = toPaymentMethod(data.paymentMethod);
    const accounting = readEntryAccounting(data);
    const paymentState = getPaymentState(accounting);

    if (entryStatus === "confirmed") {
      summary.confirmed += 1;
      summary.confirmedAthletes += summarizeActiveEntry(data).athleteCount;

      if (paymentState === "unpaid" || paymentState === "partially_paid") {
        summary.unpaid.count += 1;
        summary.unpaid.byMethod[paymentMethod] += 1;
        summary.unpaid.dueAmount += accounting.dueAmount;
        if (paymentState === "partially_paid") {
          summary.unpaid.partialCount += 1;
        }
      } else if (paymentState === "paid") {
        summary.paid.count += 1;
        summary.paid.byMethod[paymentMethod] += 1;
        summary.paid.netPaidAmount += accounting.paidAmount - accounting.refundedAmount;
      } else {
        summary.confirmedOtherPayment += 1;
      }
    } else if (entryStatus === "pending_payment") {
      summary.pendingPayment += 1;
    } else if (entryStatus === "cancelled") {
      summary.cancelled += 1;
    } else {
      summary.otherStatus += 1;
    }

    // 要確認の判定はエントリー管理画面のバッジと同じ条件。
    const hasPaymentIssue =
      isRecord(data.paymentIssue) && stringField(data.paymentIssue, "reason") !== "";
    const isOverdue = isBankTransferOverdue(
      {
        paymentMethod,
        paymentStatus: toEntryPaymentStatus(data.paymentStatus),
        entryStatus,
        paymentDueDate: stringField(data, "paymentDueDate"),
      },
      now,
    );
    const isOverpaid = paymentState === "overpaid";
    const isRefundPending = paymentState === "refund_pending";

    summary.review.paymentIssue += Number(hasPaymentIssue);
    summary.review.bankTransferOverdue += Number(isOverdue);
    summary.review.overpaid += Number(isOverpaid);
    summary.review.refundPending += Number(isRefundPending);
    summary.review.count += Number(
      hasPaymentIssue || isOverdue || isOverpaid || isRefundPending,
    );
  }

  return summary;
}

// 絞り込み用の大会一覧。削除済みの大会は、申込が残っている場合だけ含める
// （その場合は申込側に残っている大会名を使う）。
export function buildEventOptions(
  events: { id: string; data: DataRecord }[],
  entries: { id: string; data: DataRecord }[],
): DashboardEventOption[] {
  const map = new Map<string, string>();

  for (const { id, data } of events) {
    if (!data.deletedAt) {
      map.set(id, stringField(data, "title") || "大会名未設定");
    }
  }

  for (const { data } of entries) {
    const eventId = stringField(data, "eventId");
    if (eventId && !map.has(eventId)) {
      map.set(eventId, stringField(data, "eventTitle") || "大会名未設定");
    }
  }

  return Array.from(map.entries())
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title, "ja-JP"));
}
