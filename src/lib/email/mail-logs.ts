import "server-only";

import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore/lite";

import { collections } from "@/lib/firebase/collections";
import type { getPublicFirestore } from "@/lib/firebase/public-firestore";

export type MailLogStatus = "sent" | "failed";
export type MailLogRecipientType = "user" | "admin";
export type MailLogType = "entry_completed" | "manual_individual" | "manual_bulk";

export type MailLogInput = {
  entryId: string | null;
  eventId: string | null;
  eventTitle: string | null;
  recipientEmail: string;
  recipientName: string;
  recipientType: MailLogRecipientType;
  mailType: MailLogType;
  subject: string;
  bodyPreview: string;
  status: MailLogStatus;
  errorMessage: string | null;
  provider: string;
  createdByAdminUid: string | null;
  createdByAdminEmail: string | null;
};

export function createMailLogId() {
  return `mail_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function buildBodyPreview(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

export function toMailLogProvider(provider: string) {
  return provider === "php" ? "php-mail-api" : provider;
}

export async function createPublicMailLog(
  db: ReturnType<typeof getPublicFirestore>,
  input: MailLogInput,
) {
  const logRef = doc(collection(db, collections.emailLogs));

  await setDoc(logRef, {
    logId: logRef.id,
    entryId: input.entryId,
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName,
    recipientType: input.recipientType,
    mailType: input.mailType,
    subject: input.subject,
    bodyPreview: input.bodyPreview,
    status: input.status,
    errorMessage: input.errorMessage,
    provider: input.provider,
    sentAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    createdByAdminUid: input.createdByAdminUid,
    createdByAdminEmail: input.createdByAdminEmail,
  });
}
