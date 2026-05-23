export type PaymentStatus =
  | "not_started"
  | "checkout_created"
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded"
  | "partially_refunded"
  | "amount_mismatch";

export type PaymentDocument = {
  eventId: string;
  entryId: string;
  provider: "stripe" | "other";
  status: PaymentStatus;
  amount: number;
  currency: "JPY";
};
