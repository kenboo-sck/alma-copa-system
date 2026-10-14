import "server-only";

import Stripe from "stripe";

import type {
  CheckoutSessionDetails,
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  PaymentEnvironmentStatus,
  StripeMode,
  StripeWebhookEventResult,
} from "./types";
import { getStripeApiHost } from "@/lib/firebase/emulator";
import { getSiteUrl } from "@/lib/site-url";

const requiredStripeKeys = ["STRIPE_SECRET_KEY"] as const;

function getEnvValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

// 秘密鍵の種類を、接頭辞だけで判定する（鍵そのものは返さない・ログに出さない）。
// sk_ は標準の秘密鍵、rk_ は制限付きキー。
function getSecretKeyMode(secretKey: string): StripeMode | null {
  if (secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_")) {
    return "test";
  }

  if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) {
    return "live";
  }

  return null;
}

// NEXT_PUBLIC_STRIPE_TEST_MODE で指定されたモード。
// 明示的に true / false が指定されていない場合は、どちらとも扱わない。
function getConfiguredMode(): StripeMode | null {
  const value = getEnvValue("NEXT_PUBLIC_STRIPE_TEST_MODE").toLowerCase();

  if (value === "true") {
    return "test";
  }

  if (value === "false") {
    return "live";
  }

  return null;
}

// テストモードではテスト用キー、本番モードでは本番用キーだけを許可する。
// モードとキーが食い違う場合（テストのつもりで本番キー、本番のつもりでテストキー）は、
// 意図しない実決済や、本番でテスト決済を受け付ける事故を防ぐために拒否する。
function getStripeEnvironmentStatus(): PaymentEnvironmentStatus {
  const secretKey = getEnvValue("STRIPE_SECRET_KEY");
  const mode = getConfiguredMode();
  const secretKeyMode = getSecretKeyMode(secretKey);
  const isModeConsistent = mode !== null && mode === secretKeyMode;

  const missingKeys = requiredStripeKeys.filter((key) => !getEnvValue(key));
  const warnings: string[] = [];

  if (mode === null) {
    warnings.push(
      "NEXT_PUBLIC_STRIPE_TEST_MODE を true（テスト）または false（本番）に設定してください。",
    );
  }

  if (secretKey && secretKeyMode === null) {
    warnings.push("STRIPE_SECRET_KEY の形式を確認してください。");
  }

  if (mode !== null && secretKeyMode !== null && mode !== secretKeyMode) {
    warnings.push(
      mode === "test"
        ? "テストモードですが、STRIPE_SECRET_KEY が本番用キーです。"
        : "本番モードですが、STRIPE_SECRET_KEY がテスト用キーです。",
    );
  }

  return {
    isConfigured: missingKeys.length === 0,
    mode,
    isModeConsistent,
    isTestMode: isModeConsistent && mode === "test",
    missingKeys,
    warnings,
    debug: {
      hasSecretKey: Boolean(secretKey),
      secretKeyLooksTest: secretKeyMode === "test",
      secretKeyMode,
      testMode: mode === "test",
    },
  };
}

// Stripe から受け取った決済・イベントが、現在のモードのものかを確認する
// （本番環境でテスト決済を、テスト環境で本番決済を処理しない）。
function assertLivemode(livemode: unknown, mode: StripeMode) {
  if (typeof livemode === "boolean" && livemode !== (mode === "live")) {
    throw new Error("Stripe object mode does not match the configured mode.");
  }
}

export class StripeProvider {
  readonly id = "stripe" as const;

  getEnvironmentStatus() {
    return getStripeEnvironmentStatus();
  }

  // getClient でモードとキーの一致を確認したあとに使う。
  private getMode(): StripeMode {
    return this.getEnvironmentStatus().mode ?? "test";
  }

  private getClient() {
    const status = this.getEnvironmentStatus();

    if (!status.isConfigured) {
      throw new Error(
        `Stripe is not configured. Missing: ${status.missingKeys.join(", ")}`,
      );
    }

    if (!status.isModeConsistent) {
      // 設定の内容（鍵の値）は含めず、食い違いの種類だけを伝える。
      throw new Error(
        `Stripe mode and key do not match. ${status.warnings.join(" ")}`.trim(),
      );
    }

    // ローカル検証では、Stripe へ通信せずローカルの代替サーバーを呼び出す
    // （テストモードのときだけ。本番モードでは代替サーバーを使わない）。
    const stripeApiHost = status.mode === "test" ? getStripeApiHost() : "";
    if (stripeApiHost) {
      const [host, port] = stripeApiHost.split(":");
      return new Stripe(getEnvValue("STRIPE_SECRET_KEY"), {
        host,
        port: Number(port),
        protocol: "http",
        maxNetworkRetries: 0,
      });
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
      client_reference_id: input.entryId,
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
        ...input.metadata,
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
    assertLivemode(session.livemode, this.getMode());

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
      metadata: session.metadata ?? undefined,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
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
    assertLivemode(event.livemode, this.getMode());

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
        metadata: session.metadata ?? undefined,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
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
