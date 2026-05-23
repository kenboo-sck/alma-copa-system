import { paymentService } from "@/lib/payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.info("Stripe webhook disabled in client-only mode");

    return Response.json({ received: true, clientOnly: true });
  }

  try {
    const event = paymentService.constructStripeWebhookEvent(body, signature);

    console.info("Stripe webhook received in client-only mode", {
      type: event.type,
      entryId: event.entryId ?? null,
      eventId: event.eventId ?? null,
      sessionId: event.sessionId ?? null,
      paymentIntentId: event.paymentIntentId ?? null,
    });

    return Response.json({ received: true, type: event.type });
  } catch (error) {
    console.error("Stripe webhook handling failed", error);

    return Response.json({ received: true, clientOnly: true });
  }
}
