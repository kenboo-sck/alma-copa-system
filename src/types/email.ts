export type EmailStatus = "queued" | "sent" | "failed";

export type EmailLogDocument = {
  eventId: string;
  entryId?: string;
  to: string[];
  subject: string;
  templateType: string;
  status: EmailStatus;
};
