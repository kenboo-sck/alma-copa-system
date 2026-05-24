import { z } from "zod";

import { EmailProviderError, emailService } from "@/lib/email";

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
    console.error("Entry email sending failed", {
      error,
      entryId: parsed.data.entryId,
      eventId: parsed.data.eventId,
      eventTitle: parsed.data.eventTitle,
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
