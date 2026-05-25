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

function getEnvValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

function getStripeEnvironmentStatus(): PaymentEnvironmentStatus {
  const secretKey = getEnvValue("STRIPE_SECRET_KEY");
  const testMode = getEnvValue("NEXT_PUBLIC_STRIPE_TEST_MODE").toLowerCase() === "true";

  const missingKeys = requiredStripeKeys.filter((key) => !getEnvValue(key));
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
    debug: {
      hasSecretKey: Boolean(secretKey),
      secretKeyLooksTest: Boolean(secretKey?.startsWith("sk_test_")),
      testMode,
    },
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

    return new Stripe(getEnvValue("STRIPE_SECRET_KEY"));
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSessionResult> {
    const stripe = this.getClient();
    const baseUrl = getSiteUrl();
    const fallbackSuccessParams = [
      `entry_id=${encodeURIComponent(input.entryId)}`,
      "session_id={CHECKOUT_SESSION_ID}",
      `event_id=${encodeURIComponent(input.eventId)}`,
      `event_title=${encodeURIComponent(input.eventTitle)}`,
      input.entryType ? `entry_type=${encodeURIComponent(input.entryType)}` : null,
    ]
      .filter(Boolean)
      .join("&");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: input.customerEmail,
      success_url:
        input.successUrl ??
        `${baseUrl}/payment/success?${fallbackSuccessParams.toString()}`,
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
        email: input.email ?? input.customerEmail ?? "",
        applicantName: input.applicantName ?? "",
      },
      payment_intent_data: {
        metadata: {
          entryId: input.entryId,
          eventId: input.eventId,
          eventTitle: input.eventTitle,
          entryType: input.entryType ?? "",
          email: input.email ?? input.customerEmail ?? "",
          applicantName: input.applicantName ?? "",
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

  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionDetails> {
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
      email: session.metadata?.email,
    };
  }

  constructWebhookEvent(
    body: string,
    signature: string | null,
  ): StripeWebhookEventResult {
    const webhookSecret = getEnvValue("STRIPE_WEBHOOK_SECRET");

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
      const entryType = session.metadata?.entryType;

      return {
        type: event.type,
        entryId: session.metadata?.entryId,
        eventId: session.metadata?.eventId,
        email: session.metadata?.email,
        applicantName: session.metadata?.applicantName,
        eventTitle: session.metadata?.eventTitle,
        entryType:
          entryType === "individual" || entryType === "representative"
            ? entryType
            : undefined,
        sessionId: session.id,
        paymentIntentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id,
      };
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      const entryType = paymentIntent.metadata?.entryType;

      return {
        type: event.type,
        entryId: paymentIntent.metadata?.entryId,
        eventId: paymentIntent.metadata?.eventId,
        email: paymentIntent.metadata?.email,
        applicantName: paymentIntent.metadata?.applicantName,
        eventTitle: paymentIntent.metadata?.eventTitle,
        entryType:
          entryType === "individual" || entryType === "representative"
            ? entryType
            : undefined,
        paymentIntentId: paymentIntent.id,
      };
    }

    return {
      type: event.type,
    };
  }
}
