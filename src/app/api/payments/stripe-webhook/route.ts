import { doc, serverTimestamp, updateDoc } from "firebase/firestore/lite";

import { collections } from "@/lib/firebase/collections";
import { getPublicFirestore } from "@/lib/firebase/public-firestore";
import { paymentService } from "@/lib/payments";

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
