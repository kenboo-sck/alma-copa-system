import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/admin";
import { collections } from "@/lib/firebase/collections";

export type MailLogStatus = "sent" | "failed";
export type MailLogRecipientType = "user" | "admin";
export type MailLogType =
  | "entry_completed"
  | "manual_individual"
  | "manual_bulk"
  | "inquiry_reply";

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

// 受付メール／完了メールの送信履歴を、サーバー（Admin SDK）から記録する。
// 一般ユーザーからのメール履歴の書き込みは Firestore ルールで認めていない。
export async function createServerMailLog(input: MailLogInput) {
  const logRef = getAdminFirestore()
    .collection(collections.emailLogs)
    .doc(createMailLogId());

  await logRef.set({
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
    sentAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    createdByAdminUid: input.createdByAdminUid,
    createdByAdminEmail: input.createdByAdminEmail,
  });
}
