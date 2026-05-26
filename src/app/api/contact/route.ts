import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore/lite";
import { z } from "zod";

import { emailService } from "@/lib/email";
import { collections } from "@/lib/firebase/collections";
import { getPublicFirestore } from "@/lib/firebase/public-firestore";
import type { InquiryType } from "@/types/inquiry";

export const runtime = "nodejs";

const inquiryTypeLabels: Record<Exclude<InquiryType, "">, string> = {
  entry: "エントリーについて",
  payment: "決済について",
  event: "大会について",
  other: "その他",
};

const contactSchema = z.object({
  name: z.string().trim().min(1, "お名前を入力してください。").max(80),
  email: z.email("メールアドレスを正しく入力してください。").max(160),
  phone: z.string().trim().max(40).optional().default(""),
  inquiryType: z.enum(["entry", "payment", "event", "other", ""]).optional().default(""),
  message: z.string().trim().min(1, "お問い合わせ内容を入力してください。").max(5000),
});

function getInquiryTypeLabel(value: InquiryType) {
  return value ? inquiryTypeLabels[value] : "未選択";
}

function buildAdminNotification(input: z.infer<typeof contactSchema>) {
  return [
    "ALMA COPA 公式サイトからお問い合わせが届きました。",
    "",
    `お名前: ${input.name}`,
    `メールアドレス: ${input.email}`,
    `電話番号: ${input.phone || "-"}`,
    `お問い合わせ種別: ${getInquiryTypeLabel(input.inquiryType)}`,
    "",
    "お問い合わせ内容:",
    input.message,
  ].join("\n");
}

function buildUserReceipt(input: z.infer<typeof contactSchema>) {
  return [
    `${input.name} 様`,
    "",
    "COPA ALMA 運営事務局です。",
    "お問い合わせを受け付けました。内容を確認のうえ、必要に応じて担当者よりご連絡いたします。",
    "",
    "お問い合わせ内容:",
    input.message,
    "",
    "このメールは自動送信です。",
  ].join("\n");
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = contactSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      {
        error: "入力内容を確認してください。",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const db = getPublicFirestore();
  const inquiryRef = doc(collection(db, collections.inquiries));

  let adminNotified = false;
  let userNotified = false;
  let emailError: string | null = null;
  const emailStatus = emailService.getEnvironmentStatus();
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();

  if (emailStatus.isConfigured && adminEmail) {
    try {
      await emailService.sendManualEmail({
        recipientEmail: adminEmail,
        subject: "【COPA ALMA】お問い合わせが届きました",
        body: buildAdminNotification(parsed.data),
      });
      adminNotified = true;

      await emailService.sendManualEmail({
        recipientEmail: parsed.data.email,
        subject: "【COPA ALMA】お問い合わせを受け付けました",
        body: buildUserReceipt(parsed.data),
      });
      userNotified = true;
    } catch (error) {
      console.error("Contact inquiry email failed", {
        inquiryId: inquiryRef.id,
        error,
      });
      emailError = error instanceof Error ? error.message : String(error);
    }
  } else {
    emailError = "EMAIL_SERVICE_NOT_CONFIGURED";
  }

  await setDoc(inquiryRef, {
    inquiryId: inquiryRef.id,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone || null,
    inquiryType: parsed.data.inquiryType,
    message: parsed.data.message,
    status: "unhandled",
    adminNotified,
    userNotified,
    emailError,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return Response.json({
    ok: true,
    inquiryId: inquiryRef.id,
    adminNotified,
    userNotified,
    emailError,
  });
}
