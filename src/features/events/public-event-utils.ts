import type { DocumentData } from "firebase/firestore";

import {
  getAvailablePaymentMethods,
  getEventPaymentSettings,
  type EventPaymentSettings,
} from "@/lib/payments/payment-methods";
import type { EventStatus } from "@/types/event";

export type PublicEvent = {
  id: string;
  title: string;
  description: string;
  category: string;
  heroImage: string;
  imageUrl: string;
  imagePath: string;
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
  // 大会ごとの支払設定。設定がない既存の大会はカードのみ。
  paymentSettings: EventPaymentSettings;
  // エントリーリストの一般公開。設定のない既存の大会は非公開。
  entryListPublic: boolean;
  aboutSection: {
    enabled: boolean;
    concept: string;
    level: string;
    classes: string;
    atmosphere: string;
    beginnerWelcome: string;
  };
};

export type PriceType = "early" | "regular" | "late";

export const defaultEventCardImage = "/images/event-card-bg.jpg";
export const defaultEventHeroImage = "/images/event-detail-hero.jpg";

export function getEventImageUrl(
  event: Pick<PublicEvent, "imageUrl" | "heroImage">,
  fallback = defaultEventHeroImage,
) {
  return event.imageUrl || event.heroImage || fallback;
}

export function toCssUrl(imageUrl: string) {
  return imageUrl.replace(/'/g, "\\'");
}

export function toDate(value: unknown): Date | null {
  // API ルートは firebase/firestore/lite で大会を読むため、Timestamp のクラスが
  // firebase/firestore のものと一致しない。instanceof では判定せず、toDate の有無で判定する。
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

export function mapPublicEvent(id: string, data: DocumentData): PublicEvent {
  const aboutSection: Record<string, unknown> =
    data.aboutSection && typeof data.aboutSection === "object"
      ? (data.aboutSection as Record<string, unknown>)
      : {};

  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
    category: typeof data.category === "string" ? data.category : "BJJ TOURNAMENT",
    heroImage: typeof data.heroImage === "string" ? data.heroImage : "",
    imageUrl:
      typeof data.imageUrl === "string"
        ? data.imageUrl
        : typeof data.heroImage === "string"
          ? data.heroImage
          : "",
    imagePath: typeof data.imagePath === "string" ? data.imagePath : "",
    eventDate: toDate(data.eventDate),
    venue: typeof data.venue === "string" ? data.venue : "",
    entryStartAt: toDate(data.entryStartAt),
    entryEndAt: toDate(data.entryEndAt),
    earlyBirdPrice:
      typeof data.earlyBirdPrice === "number" ? data.earlyBirdPrice : 5000,
    earlyBirdStartAt: toDate(data.earlyBirdStartAt),
    earlyBirdEndAt: toDate(data.earlyBirdEndAt),
    regularPrice: typeof data.regularPrice === "number" ? data.regularPrice : 5000,
    regularStartAt: toDate(data.regularStartAt),
    regularEndAt: toDate(data.regularEndAt),
    latePrice: typeof data.latePrice === "number" ? data.latePrice : 5000,
    lateStartAt: toDate(data.lateStartAt),
    lateEndAt: toDate(data.lateEndAt),
    status:
      data.status === "published" || data.status === "closed" ? data.status : "draft",
    paymentSettings: getEventPaymentSettings(data),
    entryListPublic: data.entryListPublic === true,
    aboutSection: {
      enabled: aboutSection.enabled === true,
      concept: typeof aboutSection.concept === "string" ? aboutSection.concept : "",
      level: typeof aboutSection.level === "string" ? aboutSection.level : "",
      classes: typeof aboutSection.classes === "string" ? aboutSection.classes : "",
      atmosphere:
        typeof aboutSection.atmosphere === "string" ? aboutSection.atmosphere : "",
      beginnerWelcome:
        typeof aboutSection.beginnerWelcome === "string"
          ? aboutSection.beginnerWelcome
          : "",
    },
  };
}

const MINUTE_MS = 60 * 1000;

// 料金期間に含まれるか。期間は管理画面で分単位に設定するため、終了日時はその「分」の
// 終わりまでを含める（例: 終了 23:59 → 23:59:59.999 まで）。次の期間の開始（翌 0:00）とは
// 重ならず、境目に料金期間のない時間ができない。
// 申込画面・確認画面・サーバーの料金計算と、大会詳細の「現在受付中」表示で共通に使う。
export function isWithinPeriod(now: Date, startAt: Date | null, endAt: Date | null) {
  if (!startAt || !endAt) {
    return false;
  }

  const endExclusive = Math.floor(endAt.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  return now.getTime() >= startAt.getTime() && now.getTime() < endExclusive;
}

export function getCurrentEntryFee(event: PublicEvent, now = new Date()) {
  if (isWithinPeriod(now, event.earlyBirdStartAt, event.earlyBirdEndAt)) {
    return {
      entryFee: event.earlyBirdPrice,
      priceType: "early" as PriceType,
      label: "早期割引",
    };
  }

  if (isWithinPeriod(now, event.regularStartAt, event.regularEndAt)) {
    return {
      entryFee: event.regularPrice,
      priceType: "regular" as PriceType,
      label: "通常価格",
    };
  }

  if (isWithinPeriod(now, event.lateStartAt, event.lateEndAt)) {
    return {
      entryFee: event.latePrice,
      priceType: "late" as PriceType,
      label: "最終価格",
    };
  }

  return {
    entryFee: event.regularPrice || 5000,
    priceType: "regular" as PriceType,
    label: "通常価格",
  };
}

export function formatDate(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function formatDateTime(value: Date | null) {
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

export function getEntryState(event: PublicEvent) {
  const now = new Date();

  if (event.status === "closed") {
    return { label: "受付終了", canEnter: false };
  }

  if (event.status !== "published") {
    return { label: "非公開", canEnter: false };
  }

  if (event.entryStartAt && now < event.entryStartAt) {
    return { label: "受付前", canEnter: false };
  }

  if (event.entryEndAt && now > event.entryEndAt) {
    return { label: "受付終了", canEnter: false };
  }

  // 受付期間中でも、選択できる支払方法がない大会（支払方法が未設定など）は申込できない。
  // 「受付中」とは表示せず、管理者が支払方法を設定するまで「受付準備中」とする。
  if (getAvailablePaymentMethods(event.paymentSettings, now).length === 0) {
    return { label: "受付準備中", canEnter: false };
  }

  return { label: "受付中", canEnter: true };
}
