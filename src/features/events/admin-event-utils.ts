import { serverTimestamp, Timestamp, type DocumentData } from "firebase/firestore";
import { z } from "zod";

import type { EntryStatus } from "@/types/entry";
import type { EventStatus } from "@/types/event";

import type { AdminEvent, EventFormValues } from "./admin-event-types";

export const eventFormSchema = z
  .object({
    title: z.string().min(1, "大会名を入力してください。").max(120),
    description: z.string().max(2000, "説明は2000文字以内で入力してください。"),
    eventDate: z.string().min(1, "開催日を入力してください。"),
    venue: z.string().min(1, "会場を入力してください。").max(120),
    entryStartAt: z.string().min(1, "エントリー開始日を入力してください。"),
    entryEndAt: z.string().min(1, "エントリー終了日を入力してください。"),
    earlyBirdPrice: z.string().min(1, "早期割引価格を入力してください。"),
    earlyBirdStartAt: z.string().min(1, "早期割引開始日を入力してください。"),
    earlyBirdEndAt: z.string().min(1, "早期割引終了日を入力してください。"),
    regularPrice: z.string().min(1, "通常価格を入力してください。"),
    regularStartAt: z.string().min(1, "通常価格開始日を入力してください。"),
    regularEndAt: z.string().min(1, "通常価格終了日を入力してください。"),
    latePrice: z.string().min(1, "最終価格を入力してください。"),
    lateStartAt: z.string().min(1, "最終価格開始日を入力してください。"),
    lateEndAt: z.string().min(1, "最終価格終了日を入力してください。"),
    status: z.enum(["draft", "published", "closed"]),
    aboutSection: z.object({
      enabled: z.enum(["true", "false"]),
      concept: z.string().max(1200, "大会コンセプトは1200文字以内で入力してください。"),
      level: z.string().max(1200, "レベルは1200文字以内で入力してください。"),
      classes: z.string().max(1200, "クラスは1200文字以内で入力してください。"),
      atmosphere: z.string().max(1200, "雰囲気は1200文字以内で入力してください。"),
      beginnerWelcome: z
        .string()
        .max(1200, "初参加歓迎は1200文字以内で入力してください。"),
    }),
  })
  .refine((value) => Number(value.earlyBirdPrice) > 0, {
    message: "早期割引価格は1円以上で入力してください。",
    path: ["earlyBirdPrice"],
  })
  .refine((value) => Number(value.regularPrice) > 0, {
    message: "通常価格は1円以上で入力してください。",
    path: ["regularPrice"],
  })
  .refine((value) => Number(value.latePrice) > 0, {
    message: "最終価格は1円以上で入力してください。",
    path: ["latePrice"],
  })
  .refine((value) => new Date(value.entryEndAt) > new Date(value.entryStartAt), {
    message: "エントリー終了日は開始日より後にしてください。",
    path: ["entryEndAt"],
  })
  .refine(
    (value) => new Date(value.earlyBirdEndAt) > new Date(value.earlyBirdStartAt),
    {
      message: "早期割引終了日は開始日より後にしてください。",
      path: ["earlyBirdEndAt"],
    },
  )
  .refine((value) => new Date(value.regularEndAt) > new Date(value.regularStartAt), {
    message: "通常価格終了日は開始日より後にしてください。",
    path: ["regularEndAt"],
  })
  .refine((value) => new Date(value.lateEndAt) > new Date(value.lateStartAt), {
    message: "最終価格終了日は開始日より後にしてください。",
    path: ["lateEndAt"],
  });

export const defaultEventFormValues: EventFormValues = {
  title: "",
  description: "",
  eventDate: "",
  venue: "",
  entryStartAt: "",
  entryEndAt: "",
  earlyBirdPrice: "5000",
  earlyBirdStartAt: "",
  earlyBirdEndAt: "",
  regularPrice: "5000",
  regularStartAt: "",
  regularEndAt: "",
  latePrice: "5000",
  lateStartAt: "",
  lateEndAt: "",
  status: "draft",
  aboutSection: {
    enabled: "false",
    concept: "",
    level: "",
    classes: "",
    atmosphere: "",
    beginnerWelcome: "",
  },
};

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

export function toDateInputValue(value: Date | null) {
  if (!value) {
    return "";
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toDateTimeInputValue(value: Date | null) {
  if (!value) {
    return "";
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function mapEventData(
  id: string,
  data: DocumentData,
  entryCount = 0,
): AdminEvent {
  const aboutSection: Record<string, unknown> =
    data.aboutSection && typeof data.aboutSection === "object"
      ? (data.aboutSection as Record<string, unknown>)
      : {};

  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
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
    imageUrl:
      typeof data.imageUrl === "string"
        ? data.imageUrl
        : typeof data.heroImage === "string"
          ? data.heroImage
          : "",
    imagePath: typeof data.imagePath === "string" ? data.imagePath : "",
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
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    entryCount,
  };
}

export function createEventPayload(values: EventFormValues) {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    eventDate: Timestamp.fromDate(new Date(values.eventDate)),
    venue: values.venue.trim(),
    entryStartAt: Timestamp.fromDate(new Date(values.entryStartAt)),
    entryEndAt: Timestamp.fromDate(new Date(values.entryEndAt)),
    earlyBirdPrice: Number(values.earlyBirdPrice),
    earlyBirdStartAt: Timestamp.fromDate(new Date(values.earlyBirdStartAt)),
    earlyBirdEndAt: Timestamp.fromDate(new Date(values.earlyBirdEndAt)),
    regularPrice: Number(values.regularPrice),
    regularStartAt: Timestamp.fromDate(new Date(values.regularStartAt)),
    regularEndAt: Timestamp.fromDate(new Date(values.regularEndAt)),
    latePrice: Number(values.latePrice),
    lateStartAt: Timestamp.fromDate(new Date(values.lateStartAt)),
    lateEndAt: Timestamp.fromDate(new Date(values.lateEndAt)),
    status: values.status,
    aboutSection: {
      enabled: values.aboutSection.enabled === "true",
      concept: values.aboutSection.concept.trim(),
      level: values.aboutSection.level.trim(),
      classes: values.aboutSection.classes.trim(),
      atmosphere: values.aboutSection.atmosphere.trim(),
      beginnerWelcome: values.aboutSection.beginnerWelcome.trim(),
    },
    updatedAt: serverTimestamp(),
  };
}

export function getEventFormValues(event: AdminEvent): EventFormValues {
  return {
    title: event.title,
    description: event.description,
    eventDate: toDateInputValue(event.eventDate),
    venue: event.venue,
    entryStartAt: toDateTimeInputValue(event.entryStartAt),
    entryEndAt: toDateTimeInputValue(event.entryEndAt),
    earlyBirdPrice: String(event.earlyBirdPrice || 5000),
    earlyBirdStartAt: toDateTimeInputValue(event.earlyBirdStartAt),
    earlyBirdEndAt: toDateTimeInputValue(event.earlyBirdEndAt),
    regularPrice: String(event.regularPrice || 5000),
    regularStartAt: toDateTimeInputValue(event.regularStartAt),
    regularEndAt: toDateTimeInputValue(event.regularEndAt),
    latePrice: String(event.latePrice || 5000),
    lateStartAt: toDateTimeInputValue(event.lateStartAt),
    lateEndAt: toDateTimeInputValue(event.lateEndAt),
    status: event.status,
    aboutSection: {
      enabled: event.aboutSection.enabled ? "true" : "false",
      concept: event.aboutSection.concept,
      level: event.aboutSection.level,
      classes: event.aboutSection.classes,
      atmosphere: event.aboutSection.atmosphere,
      beginnerWelcome: event.aboutSection.beginnerWelcome,
    },
  };
}

export function isCountableEntryStatus(status: unknown) {
  const excluded: EntryStatus[] = ["cancelled", "expired", "refunded"];
  return typeof status !== "string" || !excluded.includes(status as EntryStatus);
}

export function isEventStatus(value: unknown): value is EventStatus {
  return value === "draft" || value === "published" || value === "closed";
}
