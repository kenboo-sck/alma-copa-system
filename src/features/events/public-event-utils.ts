import { Timestamp, type DocumentData } from "firebase/firestore";

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
  if (value instanceof Timestamp) {
    return value.toDate();
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

function isWithinPeriod(now: Date, startAt: Date | null, endAt: Date | null) {
  return Boolean(startAt && endAt && now >= startAt && now <= endAt);
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

  return { label: "受付中", canEnter: true };
}
