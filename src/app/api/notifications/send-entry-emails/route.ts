import { z } from "zod";

import { EmailProviderError, emailService } from "@/lib/email";
import {
  buildBodyPreview,
  createPublicMailLog,
  toMailLogProvider,
} from "@/lib/email/mail-logs";
import { getPublicFirestore } from "@/lib/firebase/public-firestore";

export const runtime = "nodejs";

const sendEntryEmailsSchema = z.object({
  entryId: z.string().min(1),
  eventId: z.string().min(1),
  eventTitle: z.string().min(1),
  entryType: z.enum(["individual", "representative"]),
  applicantName: z.string().min(1),
  applicantEmail: z.email(),
  paymentStatus: z.enum(["paid", "failed", "pending"]),
  sessionId: z.string().optional(),
});

export async function GET() {
  const status = emailService.getEnvironmentStatus();

  return Response.json({
    provider: status.provider,
    email: status,
  });
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = sendEntryEmailsSchema.safeParse(json);

  if (!parsed.success) {
    console.warn("Entry email request validation failed", {
      issues: parsed.error.issues,
    });

    return Response.json(
      {
        error: "メール送信に必要な情報が不足しています。",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const status = emailService.getEnvironmentStatus();
  console.info("Entry email request received", {
    entryId: parsed.data.entryId,
    eventId: parsed.data.eventId,
    eventTitle: parsed.data.eventTitle,
    entryType: parsed.data.entryType,
    applicantEmail: parsed.data.applicantEmail,
    paymentStatus: parsed.data.paymentStatus,
    sessionId: parsed.data.sessionId ?? null,
    provider: status.provider,
    isConfigured: status.isConfigured,
    missingKeys: status.missingKeys,
    warnings: status.warnings,
    phpMailApiUrl: status.phpMailApiUrl,
  });

  if (!status.isConfigured) {
    const isResendApiKeyMissing = status.missingKeys.includes("MAIL_PROVIDER_API_KEY");
    const isPhpMailApiUrlMissing = status.missingKeys.includes("PHP_MAIL_API_URL");

    console.error("Entry email service is not configured", {
      entryId: parsed.data.entryId,
      eventId: parsed.data.eventId,
      provider: status.provider,
      missingKeys: status.missingKeys,
      warnings: status.warnings,
      phpMailApiUrl: status.phpMailApiUrl,
    });

    return Response.json(
      {
        error: "EMAIL_SERVICE_NOT_CONFIGURED",
        message:
          status.provider === "php" && isPhpMailApiUrlMissing
            ? "PHP mail API URL is not configured. Set PHP_MAIL_API_URL."
            : isResendApiKeyMissing
              ? "Resend API key is not configured. Set MAIL_PROVIDER_API_KEY."
              : "Email service settings are not configured.",
        provider: status.provider,
        missingKeys: status.missingKeys,
        warnings: status.warnings,
        fromAddress: status.fromAddress,
        phpMailApiUrl: status.phpMailApiUrl,
      },
      { status: 500 },
    );
  }

  try {
    const results = await emailService.sendEntryEmails(parsed.data);
    const db = getPublicFirestore();
    const messages = emailService.getEntryEmailMessages(parsed.data);

    const logResults = await Promise.allSettled(
      messages.map((message) =>
        createPublicMailLog(db, {
          entryId: parsed.data.entryId,
          eventId: parsed.data.eventId,
          eventTitle: parsed.data.eventTitle,
          recipientEmail: message.recipientEmail,
          recipientName: message.recipientName,
          recipientType: message.recipientType,
          mailType: "entry_completed",
          subject: message.subject,
          bodyPreview: buildBodyPreview(message.text),
          status: "sent",
          errorMessage: null,
          provider: toMailLogProvider(status.provider),
          createdByAdminUid: null,
          createdByAdminEmail: null,
        }),
      ),
    );

    for (const logResult of logResults) {
      if (logResult.status === "rejected") {
        console.error("Entry email sent log write failed", {
          entryId: parsed.data.entryId,
          eventId: parsed.data.eventId,
          error: logResult.reason,
        });
      }
    }

    console.info("Entry emails sent successfully", {
      entryId: parsed.data.entryId,
      eventId: parsed.data.eventId,
      eventTitle: parsed.data.eventTitle,
      provider: status.provider,
      recipients: results.map((result) => result.recipient),
      results,
    });

    return Response.json({
      ok: true,
      results,
      provider: status.provider,
      warnings: status.warnings,
      fromAddress: status.fromAddress,
      phpMailApiUrl: status.phpMailApiUrl,
    });
  } catch (error) {
    const db = getPublicFirestore();
    const failedRecipient =
      error instanceof EmailProviderError
        ? error.details.recipient
        : parsed.data.applicantEmail;
    const failedMessage = emailService
      .getEntryEmailMessages(parsed.data)
      .find((message) => message.recipientEmail === failedRecipient);

    if (failedMessage) {
      await createPublicMailLog(db, {
        entryId: parsed.data.entryId,
        eventId: parsed.data.eventId,
        eventTitle: parsed.data.eventTitle,
        recipientEmail: failedMessage.recipientEmail,
        recipientName: failedMessage.recipientName,
        recipientType: failedMessage.recipientType,
        mailType: "entry_completed",
        subject: failedMessage.subject,
        bodyPreview: buildBodyPreview(failedMessage.text),
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        provider: toMailLogProvider(status.provider),
        createdByAdminUid: null,
        createdByAdminEmail: null,
      }).catch((logError) => {
        console.error("Entry email failure log write failed", {
          entryId: parsed.data.entryId,
          eventId: parsed.data.eventId,
          recipient: failedMessage.recipientEmail,
          error: logError,
        });
      });
    }

    console.error("Entry email sending failed", {
      error,
      entryId: parsed.data.entryId,
      eventId: parsed.data.eventId,
      eventTitle: parsed.data.eventTitle,
      provider: status.provider,
      providerDetails: error instanceof EmailProviderError ? error.details : null,
    });

    if (error instanceof EmailProviderError) {
      return Response.json(
        {
          error:
            error.details.provider === "php"
              ? "PHP_MAIL_API_REQUEST_FAILED"
              : "RESEND_REQUEST_FAILED",
          message: error.message,
          provider: error.details.provider,
          providerStatus: error.details.status,
          providerStatusText: error.details.statusText,
          providerBody: error.details.body,
          recipient: error.details.recipient,
          warnings: status.warnings,
          fromAddress: status.fromAddress,
          phpMailApiUrl: status.phpMailApiUrl,
        },
        { status: 502 },
      );
    }

    return Response.json(
      {
        error: "メール送信に失敗しました。",
        provider: status.provider,
        warnings: status.warnings,
        fromAddress: status.fromAddress,
        phpMailApiUrl: status.phpMailApiUrl,
      },
      { status: 503 },
    );
  }
}
