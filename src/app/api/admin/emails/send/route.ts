import { z } from "zod";

import { requireAdminRequest } from "@/lib/auth/admin-server";
import { EmailProviderError, emailService } from "@/lib/email";
import {
  buildBodyPreview,
  createMailLogId,
  toMailLogProvider,
  type MailLogType,
} from "@/lib/email/mail-logs";
import { collections } from "@/lib/firebase/collections";
import {
  createFirestoreDocumentWithAuth,
  getFirestoreDocumentWithAuth,
} from "@/lib/firebase/firestore-rest";

export const runtime = "nodejs";

const recipientSchema = z.object({
  entryId: z.string().trim().min(1, "entryId is required."),
  eventId: z.string().trim().optional(),
  eventTitle: z.string().trim().optional(),
  recipientEmail: z.email().optional(),
  recipientName: z.string().trim().optional(),
});

const manualEmailSchema = z.object({
  mailType: z.enum(["manual_individual", "manual_bulk"]),
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10000),
  recipients: z.array(recipientSchema).min(1).max(500),
});

type ResolvedRecipient = {
  entryId: string;
  eventId: string;
  eventTitle: string;
  recipientEmail: string;
  recipientName: string;
};

type RecipientInput = z.infer<typeof recipientSchema>;

function stringField(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function fallbackRecipient(input: RecipientInput): ResolvedRecipient | null {
  const entryId = input.entryId.trim();
  const eventId = input.eventId?.trim() ?? "";
  const eventTitle = input.eventTitle?.trim() ?? "";
  const recipientEmail = input.recipientEmail?.trim() ?? "";
  const recipientName = input.recipientName?.trim() ?? "";

  if (!entryId || !eventId || !eventTitle || !recipientEmail || !recipientName) {
    return null;
  }

  return {
    entryId,
    eventId,
    eventTitle,
    recipientEmail,
    recipientName,
  };
}

function assertResolvedRecipient(recipient: ResolvedRecipient) {
  if (!recipient.entryId) {
    throw new Error("ENTRY_ID_REQUIRED");
  }
  if (!recipient.recipientEmail) {
    throw new Error("RECIPIENT_EMAIL_REQUIRED");
  }
  if (!recipient.recipientName) {
    throw new Error("RECIPIENT_NAME_REQUIRED");
  }
  if (!recipient.eventTitle) {
    throw new Error("EVENT_TITLE_REQUIRED");
  }
}

async function resolveRecipient(input: RecipientInput, idToken: string) {
  const entryId = input.entryId.trim();
  const entry = await getFirestoreDocumentWithAuth(
    `${collections.entries}/${entryId}`,
    idToken,
  );

  if (!entry) {
    const fallback = fallbackRecipient(input);
    if (fallback) {
      return fallback;
    }

    throw new Error("ENTRY_NOT_FOUND");
  }

  const recipient: ResolvedRecipient = {
    entryId,
    eventId: stringField(entry, "eventId"),
    eventTitle: stringField(entry, "eventTitle"),
    recipientEmail: stringField(entry, "email"),
    recipientName: stringField(entry, "name"),
  };

  if (!recipient.recipientEmail || !recipient.recipientName) {
    const fallback = fallbackRecipient(input);
    if (fallback) {
      return fallback;
    }

    throw new Error("ENTRY_EMAIL_MISSING");
  }

  if (!recipient.eventTitle) {
    const fallback = fallbackRecipient(input);
    if (fallback) {
      return fallback;
    }

    throw new Error("EVENT_TITLE_REQUIRED");
  }

  assertResolvedRecipient(recipient);
  return recipient;
}

async function writeManualMailLog(input: {
  idToken: string;
  adminUid: string;
  adminEmail: string;
  recipient: ResolvedRecipient | null;
  fallbackEntryId: string;
  mailType: MailLogType;
  subject: string;
  body: string;
  status: "sent" | "failed";
  errorMessage: string | null;
  provider: string;
}) {
  const logId = createMailLogId();
  const hasRequiredRecipientFields =
    Boolean(input.recipient?.recipientEmail) && Boolean(input.recipient?.eventTitle);
  const logStatus = hasRequiredRecipientFields ? input.status : "failed";
  const logErrorMessage = hasRequiredRecipientFields
    ? input.errorMessage
    : (input.errorMessage ?? "RECIPIENT_LOG_FIELDS_MISSING");

  await createFirestoreDocumentWithAuth(
    collections.emailLogs,
    logId,
    {
      logId,
      entryId: input.recipient?.entryId ?? input.fallbackEntryId,
      eventId: input.recipient?.eventId ?? null,
      eventTitle: input.recipient?.eventTitle ?? null,
      recipientEmail: input.recipient?.recipientEmail ?? "",
      recipientName: input.recipient?.recipientName ?? "",
      recipientType: "user",
      mailType: input.mailType,
      subject: input.subject,
      bodyPreview: buildBodyPreview(input.body),
      status: logStatus,
      errorMessage: logErrorMessage,
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
    console.error("Manual email admin authorization failed", { error });
    return Response.json(
      { error: "管理者権限を確認できませんでした。" },
      { status: 401 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = manualEmailSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      {
        error: "メール送信に必要な情報が不足しています。",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const status = emailService.getEnvironmentStatus();
  if (!status.isConfigured) {
    return Response.json(
      {
        error: "EMAIL_SERVICE_NOT_CONFIGURED",
        missingKeys: status.missingKeys,
        provider: status.provider,
        phpMailApiUrl: status.phpMailApiUrl,
      },
      { status: 500 },
    );
  }

  const uniqueRecipients = Array.from(
    new Map(
      parsed.data.recipients.map((recipient) => [recipient.entryId.trim(), recipient]),
    ).values(),
  );
  const resolvedRecipients: ResolvedRecipient[] = [];
  const failedResults: Array<{
    entryId: string;
    recipientEmail: string;
    status: "failed";
    errorMessage: string;
  }> = [];

  for (const recipientInput of uniqueRecipients) {
    const entryId = recipientInput.entryId.trim();
    try {
      if (!entryId) {
        throw new Error("ENTRY_ID_REQUIRED");
      }

      const recipient = await resolveRecipient(recipientInput, verifiedAdmin.idToken);
      const normalizedEmail = recipient.recipientEmail.trim().toLowerCase();
      const isDuplicate = resolvedRecipients.some(
        (item) => item.recipientEmail.trim().toLowerCase() === normalizedEmail,
      );

      if (!isDuplicate) {
        resolvedRecipients.push(recipient);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      failedResults.push({
        entryId,
        recipientEmail: "",
        status: "failed",
        errorMessage,
      });

      const fallback = fallbackRecipient(recipientInput);
      await writeManualMailLog({
        idToken: verifiedAdmin.idToken,
        adminUid: verifiedAdmin.adminUser.uid,
        adminEmail: verifiedAdmin.adminUser.email,
        recipient: fallback,
        fallbackEntryId: entryId,
        mailType: parsed.data.mailType,
        subject: parsed.data.subject,
        body: parsed.data.body,
        status: "failed",
        errorMessage,
        provider: toMailLogProvider(status.provider),
      }).catch((logError) => {
        console.error("Manual email recipient resolution failure log failed", {
          entryId,
          error: logError,
        });
      });
    }
  }

  const sentResults: Array<{
    entryId: string;
    recipientEmail: string;
    status: "sent";
  }> = [];

  for (const recipient of resolvedRecipients) {
    try {
      await emailService.sendManualEmail({
        recipientEmail: recipient.recipientEmail,
        subject: parsed.data.subject,
        body: parsed.data.body,
      });

      await writeManualMailLog({
        idToken: verifiedAdmin.idToken,
        adminUid: verifiedAdmin.adminUser.uid,
        adminEmail: verifiedAdmin.adminUser.email,
        recipient,
        fallbackEntryId: recipient.entryId,
        mailType: parsed.data.mailType,
        subject: parsed.data.subject,
        body: parsed.data.body,
        status: "sent",
        errorMessage: null,
        provider: toMailLogProvider(status.provider),
      }).catch((logError) => {
        console.error("Manual email sent log failed", {
          entryId: recipient.entryId,
          recipientEmail: recipient.recipientEmail,
          error: logError,
        });
      });

      sentResults.push({
        entryId: recipient.entryId,
        recipientEmail: recipient.recipientEmail,
        status: "sent",
      });
    } catch (error) {
      const errorMessage =
        error instanceof EmailProviderError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);

      await writeManualMailLog({
        idToken: verifiedAdmin.idToken,
        adminUid: verifiedAdmin.adminUser.uid,
        adminEmail: verifiedAdmin.adminUser.email,
        recipient,
        fallbackEntryId: recipient.entryId,
        mailType: parsed.data.mailType,
        subject: parsed.data.subject,
        body: parsed.data.body,
        status: "failed",
        errorMessage,
        provider: toMailLogProvider(status.provider),
      }).catch((logError) => {
        console.error("Manual email failure log failed", {
          entryId: recipient.entryId,
          recipientEmail: recipient.recipientEmail,
          error: logError,
        });
      });

      failedResults.push({
        entryId: recipient.entryId,
        recipientEmail: recipient.recipientEmail,
        status: "failed",
        errorMessage,
      });
    }
  }

  console.info("Manual email send completed", {
    mailType: parsed.data.mailType,
    requestedCount: parsed.data.recipients.length,
    targetCount: resolvedRecipients.length,
    sentCount: sentResults.length,
    failedCount: failedResults.length,
    adminUid: verifiedAdmin.adminUser.uid,
  });

  return Response.json({
    ok: failedResults.length === 0,
    requestedCount: parsed.data.recipients.length,
    targetCount: resolvedRecipients.length,
    sentCount: sentResults.length,
    failedCount: failedResults.length,
    sent: sentResults,
    failed: failedResults,
  });
}
