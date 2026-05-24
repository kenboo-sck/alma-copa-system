import "server-only";

import Stripe from "stripe";

import type {
  CheckoutSessionDetails,
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  PaymentEnvironmentStatus,
  StripeWebhookEventResult,
} from "./types";
import { getSiteUrl } from "@/lib/site-url";

const requiredStripeKeys = ["STRIPE_SECRET_KEY"] as const;

function getStripeEnvironmentStatus(): PaymentEnvironmentStatus {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const testMode = process.env.NEXT_PUBLIC_STRIPE_TEST_MODE === "true";

  const missingKeys = requiredStripeKeys.filter((key) => !process.env[key]);
  const warnings: string[] = [];

  if (!testMode) {
    warnings.push("NEXT_PUBLIC_STRIPE_TEST_MODE が true ではありません。");
  }

  if (secretKey && !secretKey.startsWith("sk_test_")) {
    warnings.push("STRIPE_SECRET_KEY がテストキーではありません。");
  }

  return {
    isConfigured: missingKeys.length === 0,
    isTestMode: testMode && Boolean(secretKey?.startsWith("sk_test_")),
    missingKeys,
    warnings,
  };
}

export class StripeProvider {
  readonly id = "stripe" as const;

  getEnvironmentStatus() {
    return getStripeEnvironmentStatus();
  }

  private getClient() {
    const status = this.getEnvironmentStatus();

    if (!status.isConfigured) {
      throw new Error(
        `Stripe is not configured. Missing: ${status.missingKeys.join(", ")}`,
      );
    }

    if (!status.isTestMode) {
      throw new Error("Stripe test mode keys are required for this environment.");
    }

    return new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSessionResult> {
    const stripe = this.getClient();
    const baseUrl = getSiteUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: input.customerEmail,
      success_url:
        input.successUrl ??
        `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: input.cancelUrl ?? `${baseUrl}/payment/cancel`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            product_data: {
              name: input.itemName,
            },
            unit_amount: input.amount,
          },
        },
      ],
      metadata: {
        entryId: input.entryId,
        eventId: input.eventId,
        eventTitle: input.eventTitle,
        entryType: input.entryType ?? "",
      },
      payment_intent_data: {
        metadata: {
          entryId: input.entryId,
          eventId: input.eventId,
          eventTitle: input.eventTitle,
          entryType: input.entryType ?? "",
        },
      },
    });

    if (!session.url) {
      throw new Error("Stripe Checkout Session URL was not returned.");
    }

    return {
      provider: "stripe",
      sessionId: session.id,
      url: session.url,
    };
  }

  async retrieveCheckoutSession(
    sessionId: string,
  ): Promise<CheckoutSessionDetails> {
    const stripe = this.getClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    return {
      sessionId: session.id,
      status: session.status ?? "unknown",
      paymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id,
      entryId: session.metadata?.entryId,
      eventId: session.metadata?.eventId,
      eventTitle: session.metadata?.eventTitle,
    };
  }

  constructWebhookEvent(
    body: string,
    signature: string | null,
  ): StripeWebhookEventResult {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
    }

    if (!signature) {
      throw new Error("Stripe signature header is missing.");
    }

    const stripe = this.getClient();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const session = event.data.object;

      return {
        type: event.type,
        entryId: session.metadata?.entryId,
        eventId: session.metadata?.eventId,
        sessionId: session.id,
        paymentIntentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id,
      };
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;

      return {
        type: event.type,
        entryId: paymentIntent.metadata?.entryId,
        eventId: paymentIntent.metadata?.eventId,
        paymentIntentId: paymentIntent.id,
      };
    }

    return {
      type: event.type,
    };
  }
}
