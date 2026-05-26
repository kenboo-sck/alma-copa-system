export type EmailStatus = "sent" | "failed";
export type EmailRecipientType = "user" | "admin";
export type EmailMailType =
  | "entry_completed"
  | "manual_individual"
  | "manual_bulk"
  | "inquiry_reply";

export type EmailLogDocument = {
  logId: string;
  entryId: string | null;
  eventId: string | null;
  eventTitle: string | null;
  recipientEmail: string;
  recipientName: string;
  recipientType: EmailRecipientType;
  mailType: EmailMailType;
  subject: string;
  bodyPreview: string;
  status: EmailStatus;
  errorMessage: string | null;
  provider: string;
  sentAt: Date;
  createdAt: Date;
  createdByAdminUid: string | null;
  createdByAdminEmail: string | null;
};
