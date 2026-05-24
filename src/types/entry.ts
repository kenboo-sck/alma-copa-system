export type EntryType = "individual" | "representative";

export type EntryStatus =
  | "draft"
  | "pending_payment"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "refunded";

export type ReceptionStatus = "not_checked_in" | "checked_in";

export type WeighInStatus = "not_weighed" | "weighed";

export type EntryAthlete = {
  name: string;
  kana: string;
  gender: string;
  birthDate: Date;
  category: string;
  ageCategory: string;
  weightClass: string;
  openClass: "yes" | "no";
};

export type EntryRepresentative = {
  name: string;
  email: string;
  phone: string;
  gym: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
};

export type EntryDocument = {
  eventId: string;
  eventTitle: string;
  entryType: EntryType;
  entryStatus: EntryStatus;
  paymentStatus: "pending" | "paid" | "failed";
  name: string;
  kana: string;
  email: string;
  normalizedEmail?: string;
  phone: string;
  gender: string;
  birthDate: Date;
  gym: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
  category: string;
  ageCategory: string;
  weightClass: string;
  openClass: "yes" | "no";
  athlete?: EntryAthlete | null;
  representative?: EntryRepresentative | null;
  athletes?: EntryAthlete[];
  entryFee: number;
  priceType: "early" | "regular" | "late";
  athleteCount: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  receptionStatus: ReceptionStatus;
  weighInStatus: WeighInStatus;
  bibNumber: string;
  bracketPosition: string;
  checkedInAt?: Date | null;
  weighInAt?: Date | null;
  participantCount: number;
  categoryEntryCount: number;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: "JPY";
};
