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
};
