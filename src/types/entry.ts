import type { PaymentMethod } from "@/lib/payments/payment-methods";
import type {
  AthleteClass,
  DivisionSelection,
  GiEntry,
  NogiEntry,
} from "@/lib/entries/entry-divisions";

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

// 旧形式（formatVersion なし）の選手情報。Gi / No-Gi の区別を持たない。
export type LegacyEntryAthlete = {
  name: string;
  kana: string;
  gender: string;
  birthDate: Date | string;
  category: string;
  ageCategory: string;
  weightClass: string;
  openClass: "yes" | "no";
};

// 新形式（formatVersion: 2）の選手情報。出場しない部門は null。
export type EntryAthleteV2 = {
  name: string;
  kana: string;
  gender: string;
  birthDate: Date;
  athleteClass: AthleteClass;
  guardianName: string;
  divisionSelection: DivisionSelection;
  gi: GiEntry | null;
  nogi: NogiEntry | null;
};

export type EntryAthlete = LegacyEntryAthlete | EntryAthleteV2;

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
  // 2: Gi / No-Gi 対応の新形式。旧形式のドキュメントには存在しない。
  formatVersion?: 2;
  eventId: string;
  eventTitle: string;
  entryType: EntryType;
  // 申込状態と支払状態は別に持つ。
  // カード: 決済完了まで pending_payment、完了後に confirmed。
  // 銀行振込・現金払い: 申込時点で confirmed（支払状態は pending のまま）。
  entryStatus: EntryStatus;
  paymentStatus: "pending" | "paid" | "failed";
  // 以下の支払関連の項目は、支払方法の追加前の申込には存在しない（カードとして扱う）。
  paymentMethod?: PaymentMethod;
  // 申込時点の支払案内（大会設定を後から変えても変わらない）。
  paymentInfo?: { bankAccountInfo: string; note: string; dueDate: string };
  // 銀行振込の支払期限（日本時間の "YYYY-MM-DD"）と、その日の終わりの時刻。
  paymentDueDate?: string;
  paymentDueAt?: Date | null;
  paidAt?: Date | null;
  // 支払済みにした処理と、確認した管理者・日時（サーバーが記録する）。
  paymentConfirmedAt?: Date | null;
  paymentConfirmedVia?: "stripe" | "admin" | null;
  paymentConfirmedByUid?: string | null;
  paymentConfirmedByEmail?: string | null;
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
  // 以下 3 項目は新形式のみ。
  divisionEntryCount?: number;
  openClassEntryCount?: number;
  openClassFee?: number;
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
