import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { z } from "zod";

import { emailService } from "@/lib/email";
import { collections } from "@/lib/firebase/collections";
import {
  getAdminFirestore,
  getFirebaseAdminConfigStatus,
} from "@/lib/firebase/admin";
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

  let inquiryRef: DocumentReference;

  try {
    const db = getAdminFirestore();
    inquiryRef = db.collection(collections.inquiries).doc();

    await inquiryRef.set({
      inquiryId: inquiryRef.id,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      inquiryType: parsed.data.inquiryType,
      message: parsed.data.message,
      status: "unhandled",
      adminNotified: false,
      userNotified: false,
      emailError: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    const adminStatus = getFirebaseAdminConfigStatus();
    console.error("Contact inquiry Firestore create failed", {
      adminStatus,
      error,
    });

    return Response.json(
      {
        success: false,
        ok: false,
        code: "CONTACT_INQUIRY_SAVE_FAILED",
        error: "お問い合わせの保存に失敗しました。時間をおいて再度お試しください。",
      },
      { status: 500 },
    );
  }

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
        adminNotified,
        userNotified,
        error,
      });
      emailError = error instanceof Error ? error.message : String(error);
    }
  } else {
    emailError = "EMAIL_SERVICE_NOT_CONFIGURED";
  }

  let notificationStatusSaved = true;

  try {
    await inquiryRef.update({
      adminNotified,
      userNotified,
      emailError,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    notificationStatusSaved = false;
    console.error("Contact inquiry notification status update failed", {
      inquiryId: inquiryRef.id,
      adminNotified,
      userNotified,
      emailError,
      error,
    });
  }

  if (!adminNotified || !userNotified) {
    return Response.json({
      success: true,
      ok: true,
      inquirySaved: true,
      inquiryId: inquiryRef.id,
      adminNotified,
      userNotified,
      notificationStatusSaved,
      emailError,
      emailWarning:
        "お問い合わせは受け付けましたが、控えメールの送信に失敗した可能性があります。",
    });
  }

  return Response.json({
    success: true,
    ok: true,
    inquirySaved: true,
    inquiryId: inquiryRef.id,
    adminNotified,
    userNotified,
    notificationStatusSaved,
    emailError,
  });
}
