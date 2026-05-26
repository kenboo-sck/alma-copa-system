import { z } from "zod";

import { requireAdminRequest } from "@/lib/auth/admin-server";
import { EmailProviderError, emailService } from "@/lib/email";
import { buildBodyPreview, createMailLogId, toMailLogProvider } from "@/lib/email/mail-logs";
import { collections } from "@/lib/firebase/collections";
import {
  createFirestoreDocumentWithAuth,
  getFirestoreDocumentWithAuth,
  updateFirestoreDocumentWithAuth,
} from "@/lib/firebase/firestore-rest";
import {
  inquiryReplySubject,
} from "@/lib/inquiries/reply-template";

export const runtime = "nodejs";

const inquiryReplySchema = z.object({
  inquiryId: z.string().trim().min(1, "inquiryId is required."),
  recipientEmail: z.email(),
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10000),
  nextStatus: z.enum(["in_progress", "resolved"]).default("in_progress"),
});

function stringField(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function numberField(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function writeInquiryReplyLog(input: {
  idToken: string;
  adminUid: string;
  adminEmail: string;
  inquiryId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  status: "sent" | "failed";
  errorMessage: string | null;
  provider: string;
}) {
  const logId = createMailLogId();

  await createFirestoreDocumentWithAuth(
    collections.emailLogs,
    logId,
    {
      logId,
      entryId: input.inquiryId,
      eventId: null,
      eventTitle: "お問い合わせ",
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName,
      recipientType: "user",
      mailType: "inquiry_reply",
      subject: input.subject,
      bodyPreview: buildBodyPreview(input.body),
      status: input.status,
      errorMessage: input.errorMessage,
      provider: input.provider,
      sentAt: new Date(),
      createdAt: new Date(),
      createdByAdminUid: input.adminUid,
      createdByAdminEmail: input.adminEmail,
    },
    input.idToken,
  );
}

export async function POST(request: Request) {
  let verifiedAdmin;

  try {
    verifiedAdmin = await requireAdminRequest(request, "emails:send");
  } catch (error) {
    console.error("Inquiry reply admin authorization failed", { error });
    return Response.json({ error: "管理者権限を確認できませんでした。" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = inquiryReplySchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      {
        error: "返信に必要な情報が不足しています。",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const inquiryPath = `${collections.inquiries}/${parsed.data.inquiryId}`;
  const inquiry = await getFirestoreDocumentWithAuth(inquiryPath, verifiedAdmin.idToken);

  if (!inquiry) {
    return Response.json({ error: "お問い合わせが見つかりませんでした。" }, { status: 404 });
  }

  const savedRecipientEmail = stringField(inquiry, "email");
  const recipientEmail = parsed.data.recipientEmail.trim();

  if (!savedRecipientEmail || savedRecipientEmail.toLowerCase() !== recipientEmail.toLowerCase()) {
    return Response.json(
      { error: "宛先メールアドレスが一致しません。" },
      { status: 400 },
    );
  }

  const recipientName = stringField(inquiry, "name") || "お客様";
  const currentStatus = stringField(inquiry, "status");
  const currentReplyCount = numberField(inquiry, "replyCount");
  const emailStatus = emailService.getEnvironmentStatus();
  const now = new Date();
  const body = parsed.data.body.trim();
  const subject = parsed.data.subject.trim() || inquiryReplySubject;
  let mailLogged = false;
  let inquiryUpdated = false;
  let emailError: string | null = null;

  if (!emailStatus.isConfigured) {
    return Response.json(
      {
        error: "EMAIL_SERVICE_NOT_CONFIGURED",
        missingKeys: emailStatus.missingKeys,
        provider: emailStatus.provider,
        phpMailApiUrl: emailStatus.phpMailApiUrl,
      },
      { status: 500 },
    );
  }

  try {
    await emailService.sendManualEmail({
      recipientEmail: savedRecipientEmail,
      subject,
      body,
    });
  } catch (error) {
    emailError =
      error instanceof EmailProviderError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);

    try {
      await writeInquiryReplyLog({
        idToken: verifiedAdmin.idToken,
        adminUid: verifiedAdmin.adminUser.uid,
        adminEmail: verifiedAdmin.adminUser.email,
        inquiryId: parsed.data.inquiryId,
        recipientEmail: savedRecipientEmail,
        recipientName,
        subject,
        body,
        status: "failed",
        errorMessage: emailError,
        provider: toMailLogProvider(emailStatus.provider),
      });
      mailLogged = true;
    } catch (logError) {
      console.error("Inquiry reply failure log failed", {
        inquiryId: parsed.data.inquiryId,
        error: logError,
      });
    }

    console.error("Inquiry reply email failed", {
      inquiryId: parsed.data.inquiryId,
      error: emailError,
    });

    return Response.json(
      {
        success: false,
        ok: false,
        error: emailError ?? "お問い合わせ返信メールの送信に失敗しました。",
        mailLogged,
        inquiryUpdated,
      },
      { status: 500 },
    );
  }

  try {
    await writeInquiryReplyLog({
      idToken: verifiedAdmin.idToken,
      adminUid: verifiedAdmin.adminUser.uid,
      adminEmail: verifiedAdmin.adminUser.email,
      inquiryId: parsed.data.inquiryId,
      recipientEmail: savedRecipientEmail,
      recipientName,
      subject,
      body,
      status: "sent",
      errorMessage: null,
      provider: toMailLogProvider(emailStatus.provider),
    });
    mailLogged = true;
  } catch (error) {
    console.error("Inquiry reply sent log failed", {
      inquiryId: parsed.data.inquiryId,
      error,
    });
  }

  try {
    await updateFirestoreDocumentWithAuth(
      inquiryPath,
      {
        status: parsed.data.nextStatus,
        updatedAt: now,
        replyCount: currentReplyCount + 1,
        lastReplyAt: now,
        lastReplySubject: subject,
        lastReplyBodyPreview: buildBodyPreview(body),
        lastReplyRecipientEmail: savedRecipientEmail,
        lastReplyByUid: verifiedAdmin.adminUser.uid,
        lastReplyByEmail: verifiedAdmin.adminUser.email,
      },
      verifiedAdmin.idToken,
    );
    inquiryUpdated = true;
  } catch (error) {
    console.error("Inquiry reply metadata update failed", {
      inquiryId: parsed.data.inquiryId,
      error,
    });
  }

  return Response.json({
    success: true,
    ok: true,
    inquiryId: parsed.data.inquiryId,
    mailLogged,
    inquiryUpdated,
    updatedStatus: parsed.data.nextStatus,
    updatedAt: now.toISOString(),
    replyCount: currentReplyCount + 1,
    lastReplyAt: now.toISOString(),
    lastReplySubject: subject,
    lastReplyBodyPreview: buildBodyPreview(body),
    lastReplyRecipientEmail: savedRecipientEmail,
    lastReplyByUid: verifiedAdmin.adminUser.uid,
    lastReplyByEmail: verifiedAdmin.adminUser.email,
    previousStatus: currentStatus,
    subject,
  });
}
