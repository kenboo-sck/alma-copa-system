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
  imageUrl: string;
  imagePath: string;
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
};

export type EventStatusFilter = "all" | EventStatus;

export type EventSortKey = "eventDateAsc" | "eventDateDesc" | "createdAtDesc";

export const eventStatusLabels: Record<EventStatus, string> = {
  draft: "下書き",
  published: "公開中",
  closed: "受付終了",
};

export const eventStatusTones: Record<
  EventStatus,
  "neutral" | "success" | "warning"
> = {
  draft: "neutral",
  published: "success",
  closed: "warning",
};
