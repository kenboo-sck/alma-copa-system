export type EventStatus = "draft" | "published" | "closed";

export type EventDocument = {
  title: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  imagePath?: string;
  heroImage?: string;
  venue: string;
  eventDate: Date;
  entryStartAt: Date;
  entryEndAt: Date;
  earlyBirdPrice: number;
  earlyBirdStartAt: Date;
  earlyBirdEndAt: Date;
  regularPrice: number;
  regularStartAt: Date;
  regularEndAt: Date;
  latePrice: number;
  lateStartAt: Date;
  lateEndAt: Date;
  status: EventStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};
