export type EmailSendResult = {
  ok: boolean;
  provider: "php" | "resend";
  recipient: string;
  id?: string;
  error?: string;
};

export type EmailRecipientType = "user" | "admin";

export type EntryEmailMessage = {
  recipientEmail: string;
  recipientName: string;
  recipientType: EmailRecipientType;
  subject: string;
  text: string;
  html: string;
};

export type EntryEmailPayload = {
  entryId: string;
  eventId: string;
  eventTitle: string;
  entryType: "individual" | "representative";
  applicantName: string;
  applicantEmail: string;
  paymentStatus: "paid" | "failed" | "pending";
  sessionId?: string;
  // 出場内容の要約（1 行 = 1 部門）と合計金額。決済開始時にサーバーが作成し、
  // Stripe の metadata 経由で受け取る。取得できない場合は省略される。
  entryDetailLines?: string[];
  totalAmount?: number;
  // 支払方法と支払案内（申込時に保存した内容）。旧形式の申込では省略される。
  paymentMethodLabel?: string;
  // 金額欄の見出し。支払済みは「お支払い金額」、未払いは「お支払い予定金額」。
  amountLabel?: string;
  // 管理者向けメールに載せる支払状態（例: 「未払い」「支払い済み」）。
  paymentStatusLabel?: string;
  // 振込先・支払期限・現金払いの案内など（value は改行を含む場合がある）。
  paymentGuidance?: Array<{ label: string; value: string }>;
};
