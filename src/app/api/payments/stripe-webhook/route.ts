import { confirmCardPayment, deliverEntryEmails } from "@/lib/entries/entry-server";
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
    result?: string;
    reason?: string;
    error?: unknown;
  },
) {
  console.info(message, {
    type: details.type ?? null,
    sessionId: details.sessionId ?? null,
    entryId: details.entryId ?? null,
    eventId: details.eventId ?? null,
    paymentIntentId: details.paymentIntentId ?? null,
    result: details.result ?? null,
    reason: details.reason ?? null,
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

// Stripe の署名を検証した Webhook だけが、カード決済を支払済みにできる
// （同じ確認処理を、決済完了画面からの問い合わせでもサーバー側で行う）。
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

  let event: ReturnType<typeof paymentService.constructStripeWebhookEvent>;

  try {
    event = paymentService.constructStripeWebhookEvent(body, signature);
  } catch (error) {
    logWebhookEvent("Stripe webhook signature verification failed", { error });

    return Response.json(
      { received: false, error: "Stripe webhook handling failed." },
      { status: 400 },
    );
  }

  const details = {
    type: event.type,
    entryId: event.entryId ?? null,
    eventId: event.eventId ?? null,
    sessionId: event.sessionId ?? null,
    paymentIntentId: event.paymentIntentId ?? null,
  };

  logWebhookEvent("Stripe webhook received", details);

  if (event.type !== "checkout.session.completed") {
    return Response.json({ received: true, type: event.type });
  }

  if (!event.entryId || !event.sessionId) {
    logWebhookEvent("Stripe webhook missing entryId", details);

    return Response.json(
      { received: false, error: "Checkout Session metadata.entryId is missing." },
      { status: 400 },
    );
  }

  try {
    const result = await confirmCardPayment({
      sessionId: event.sessionId,
      entryId: event.entryId,
      eventId: event.eventId,
      paymentStatus: event.paymentStatus,
      amountTotal: event.amountTotal,
      currency: event.currency,
      paymentIntentId: event.paymentIntentId,
    });

    logWebhookEvent("Stripe webhook entry payment checked", {
      ...details,
      result: result.status,
      reason: result.status === "mismatch" ? result.reason : undefined,
    });

    if (result.status === "mismatch") {
      // 金額・通貨・申込との対応が一致しない決済は支払済みにしない。
      // 再送しても結果は変わらないため 200 を返し、エントリーに記録した内容を管理者が確認する。
      console.error("Stripe payment could not be matched to the entry", {
        ...details,
        reason: result.reason,
      });
    }

    // 完了メールは、最初に支払済みにした処理だけが送る（再送では送らない）。
    if (
      (result.status === "confirmed" || result.status === "already_confirmed") &&
      result.sendEmail
    ) {
      await deliverEntryEmails(event.entryId, event.sessionId);
    }

    return Response.json({ received: true, type: event.type, result: result.status });
  } catch (error) {
    logWebhookEvent("Stripe webhook entry update failed", { ...details, error });

    // 一時的な失敗は Stripe の再送に任せる。
    return Response.json(
      { received: false, error: "Entry payment status update failed." },
      { status: 500 },
    );
  }
}
