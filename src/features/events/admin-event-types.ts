import type { EventPaymentSettings } from "@/lib/payments/payment-methods";
import type { EventStatus } from "@/types/event";

export type AdminEvent = {
  id: string;
  title: string;
  description: string;
  eventDate: Date | null;
  venue: string;
  entryStartAt: Date | null;
  entryEndAt: Date | null;
  earlyBirdPrice: number;
  earlyBirdStartAt: Date | null;
  earlyBirdEndAt: Date | null;
  regularPrice: number;
  regularStartAt: Date | null;
  regularEndAt: Date | null;
  latePrice: number;
  lateStartAt: Date | null;
  lateEndAt: Date | null;
  status: EventStatus;
  // 支払設定。設定がない既存の大会はカードのみ。
  paymentSettings: EventPaymentSettings;
  // エントリーリストの一般公開。設定のない既存の大会は非公開。
  entryListPublic: boolean;
  imageUrl: string;
  imagePath: string;
  aboutSection: {
    enabled: boolean;
    concept: string;
    level: string;
    classes: string;
    atmosphere: string;
    beginnerWelcome: string;
  };
  createdAt: Date | null;
  updatedAt: Date | null;
  entryCount: number;
};

export type EventFormValues = {
  title: string;
  description: string;
  eventDate: string;
  venue: string;
  entryStartAt: string;
  entryEndAt: string;
  earlyBirdPrice: string;
  earlyBirdStartAt: string;
  earlyBirdEndAt: string;
  regularPrice: string;
  regularStartAt: string;
  regularEndAt: string;
  latePrice: string;
  lateStartAt: string;
  lateEndAt: string;
  status: EventStatus;
  // 支払方法（複数選択。少なくとも 1 つ有効にする）。
  paymentCard: boolean;
  paymentBankTransfer: boolean;
  paymentCash: boolean;
  bankAccountInfo: string;
  bankNote: string;
  // 振込期限日（日本時間の "YYYY-MM-DD"。当日中を期限とする）。
  bankDueDate: string;
  cashNote: string;
  entryListPublic: boolean;
  aboutSection: {
    enabled: "true" | "false";
    concept: string;
    level: string;
    classes: string;
    atmosphere: string;
    beginnerWelcome: string;
  };
};

export type EventStatusFilter = "all" | EventStatus;

export type EventSortKey = "eventDateAsc" | "eventDateDesc" | "createdAtDesc";

export const eventStatusLabels: Record<EventStatus, string> = {
  draft: "下書き",
  published: "公開中",
  closed: "受付終了",
};

export const eventStatusTones: Record<EventStatus, "neutral" | "success" | "warning"> =
  {
    draft: "neutral",
    published: "success",
    closed: "warning",
  };
