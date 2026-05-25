import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore/lite";

import { EmailProviderError, emailService } from "@/lib/email";
import {
  buildBodyPreview,
  createPublicMailLog,
  toMailLogProvider,
} from "@/lib/email/mail-logs";
import { collections } from "@/lib/firebase/collections";
import { getPublicFirestore } from "@/lib/firebase/public-firestore";
import { paymentService } from "@/lib/payments";
import type { StripeWebhookEventResult } from "@/lib/payments/types";

export const runtime = "nodejs";

function logWebhookEvent(
  message: string,
  details: {
    type?: string;
    sessionId?: string | null;
    entryId?: string | null;
    eventId?: string | null;
    paymentIntentId?: string | null;
    error?: unknown;
  },
) {
  console.info(message, {
    type: details.type ?? null,
    sessionId: details.sessionId ?? null,
    entryId: details.entryId ?? null,
    eventId: details.eventId ?? null,
    paymentIntentId: details.paymentIntentId ?? null,
    error:
      details.error instanceof Error
        ? {
            name: details.error.name,
            message: details.error.message,
            stack: details.error.stack,
          }
        : (details.error ?? null),
  });
}

async function getEntryEmailPayload(
  db: ReturnType<typeof getPublicFirestore>,
  event: StripeWebhookEventResult,
) {
  const snapshot = event.entryId
    ? await getDoc(doc(db, collections.entries, event.entryId)).catch(() => null)
    : null;
  const data = snapshot?.exists() ? (snapshot.data() as Record<string, unknown>) : {};

  const eventId =
    event.eventId ?? (typeof data.eventId === "string" ? data.eventId : "");
  const eventTitle =
    event.eventTitle ?? (typeof data.eventTitle === "string" ? data.eventTitle : "");
  const entryType =
    event.entryType ??
    (data.entryType === "individual" || data.entryType === "representative"
      ? data.entryType
      : undefined);
  const applicantName =
    event.applicantName ?? (typeof data.name === "string" ? data.name : "");
  const applicantEmail =
    event.email ?? (typeof data.email === "string" ? data.email : "");

  if (
    !event.entryId ||
    !eventId ||
    !eventTitle ||
    !entryType ||
    !applicantName ||
    !applicantEmail
  ) {
    return null;
  }

  return {
    entryId: event.entryId,
    eventId,
    eventTitle,
    entryType,
    applicantName,
    applicantEmail,
    paymentStatus: "paid" as const,
    sessionId: event.sessionId,
  };
}

async function sendEntryEmailsAfterPayment(
  db: ReturnType<typeof getPublicFirestore>,
  event: StripeWebhookEventResult,
) {
  const status = emailService.getEnvironmentStatus();
  console.info("Stripe webhook entry email send started", {
    type: event.type,
    sessionId: event.sessionId ?? null,
    entryId: event.entryId ?? null,
    eventId: event.eventId ?? null,
    provider: status.provider,
    isConfigured: status.isConfigured,
    missingKeys: status.missingKeys,
    warnings: status.warnings,
    phpMailApiUrl: status.phpMailApiUrl,
  });

  const payload = await getEntryEmailPayload(db, event);
  if (!payload) {
    console.error("Stripe webhook entry email payload missing", {
      type: event.type,
      sessionId: event.sessionId ?? null,
      entryId: event.entryId ?? null,
      eventId: event.eventId ?? null,
      hasEventTitle: Boolean(event.eventTitle),
      hasEntryType: Boolean(event.entryType),
      hasApplicantName: Boolean(event.applicantName),
      hasApplicantEmail: Boolean(event.email),
      provider: status.provider,
      phpMailApiUrl: status.phpMailApiUrl,
    });
    return;
  }

  if (!status.isConfigured) {
    console.error("Stripe webhook entry email service is not configured", {
      entryId: payload.entryId,
      eventId: payload.eventId,
      sessionId: payload.sessionId ?? null,
      provider: status.provider,
      missingKeys: status.missingKeys,
      warnings: status.warnings,
      phpMailApiUrl: status.phpMailApiUrl,
    });
    return;
  }

  try {
    const results = await emailService.sendEntryEmails(payload);
    const messages = emailService.getEntryEmailMessages(payload);

    await Promise.allSettled(
      messages.map((message) =>
        createPublicMailLog(db, {
          entryId: payload.entryId,
          eventId: payload.eventId,
          eventTitle: payload.eventTitle,
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

    console.info("Stripe webhook entry emails sent", {
      entryId: payload.entryId,
      eventId: payload.eventId,
      sessionId: payload.sessionId ?? null,
      provider: status.provider,
      phpMailApiUrl: status.phpMailApiUrl,
      recipients: results.map((result) => result.recipient),
      results,
    });
  } catch (error) {
    const failedRecipient =
      error instanceof EmailProviderError
        ? error.details.recipient
        : payload.applicantEmail;
    const failedMessage = emailService
      .getEntryEmailMessages(payload)
      .find((message) => message.recipientEmail === failedRecipient);

    if (failedMessage) {
      await createPublicMailLog(db, {
        entryId: payload.entryId,
        eventId: payload.eventId,
        eventTitle: payload.eventTitle,
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
        console.error("Stripe webhook entry email failure log write failed", {
          entryId: payload.entryId,
          eventId: payload.eventId,
          recipient: failedMessage.recipientEmail,
          error: logError,
        });
      });
    }

    console.error("Stripe webhook entry emails failed", {
      entryId: payload.entryId,
      eventId: payload.eventId,
      sessionId: payload.sessionId ?? null,
      provider: status.provider,
      phpMailApiUrl: status.phpMailApiUrl,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    });
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("Stripe webhook secret is not configured");

    return Response.json(
      { received: false, error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 },
    );
  }

  try {
    const event = paymentService.constructStripeWebhookEvent(body, signature);

    logWebhookEvent("Stripe webhook received", {
      type: event.type,
      entryId: event.entryId ?? null,
      eventId: event.eventId ?? null,
      sessionId: event.sessionId ?? null,
      paymentIntentId: event.paymentIntentId ?? null,
    });

    if (event.type === "checkout.session.completed") {
      if (!event.entryId) {
        logWebhookEvent("Stripe webhook missing entryId", {
          type: event.type,
          sessionId: event.sessionId ?? null,
          eventId: event.eventId ?? null,
          paymentIntentId: event.paymentIntentId ?? null,
        });

        return Response.json(
          { received: false, error: "Checkout Session metadata.entryId is missing." },
          { status: 400 },
        );
      }

      try {
        const db = getPublicFirestore();
        await updateDoc(doc(db, collections.entries, event.entryId), {
          paymentStatus: "paid",
          entryStatus: "confirmed",
          stripeCheckoutSessionId: event.sessionId ?? "",
          stripeSessionId: event.sessionId ?? "",
          stripePaymentIntentId: event.paymentIntentId ?? "",
          paidAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        logWebhookEvent("Stripe webhook entry update success", {
          type: event.type,
          entryId: event.entryId,
          eventId: event.eventId ?? null,
          sessionId: event.sessionId ?? null,
          paymentIntentId: event.paymentIntentId ?? null,
        });

        await sendEntryEmailsAfterPayment(db, event);
      } catch (error) {
        logWebhookEvent("Stripe webhook entry update failed", {
          type: event.type,
          entryId: event.entryId,
          eventId: event.eventId ?? null,
          sessionId: event.sessionId ?? null,
          paymentIntentId: event.paymentIntentId ?? null,
          error,
        });

        return Response.json(
          { received: false, error: "Entry payment status update failed." },
          { status: 500 },
        );
      }
    }

    return Response.json({ received: true, type: event.type });
  } catch (error) {
    logWebhookEvent("Stripe webhook handling failed", { error });

    return Response.json(
      { received: false, error: "Stripe webhook handling failed." },
      { status: 400 },
    );
  }
}
