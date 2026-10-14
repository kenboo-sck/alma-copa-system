export type PaymentProviderId = "stripe" | "other";

// Stripe の動作モード。NEXT_PUBLIC_STRIPE_TEST_MODE（true = テスト、false = 本番）で指定する。
export type StripeMode = "test" | "live";

export type PaymentEnvironmentStatus = {
  isConfigured: boolean;
  // 指定されたモード。未指定・不正な値の場合は null。
  mode: StripeMode | null;
  // モードと秘密鍵の種類（テスト用／本番用）が一致しているか。
  // 一致していない場合、Stripe を使う処理はすべて拒否する。
  isModeConsistent: boolean;
  isTestMode: boolean;
  missingKeys: string[];
  warnings: string[];
  // 秘密鍵そのものは含めない（有無と種類だけ）。
  debug: {
    hasSecretKey: boolean;
    secretKeyLooksTest: boolean;
    secretKeyMode: StripeMode | null;
    testMode: boolean;
  };
};

export type CreateCheckoutSessionInput = {
  entryId: string;
  eventId: string;
  eventTitle: string;
  entryType?: "individual" | "representative";
  amount: number;
  currency: "JPY";
  itemName: string;
  customerEmail?: string;
  email?: string;
  applicantName?: string;
  successUrl?: string;
  cancelUrl?: string;
  // Checkout Session にだけ付ける追加メタデータ（出場内容の要約など）。
  metadata?: Record<string, string>;
};

export type StripeWebhookEventResult = {
  type: string;
  entryId?: string;
  eventId?: string;
  email?: string;
  applicantName?: string;
  eventTitle?: string;
  entryType?: "individual" | "representative";
  sessionId?: string;
  paymentIntentId?: string;
  metadata?: Record<string, string>;
  // checkout.session.* のイベントのみ。支払済みにする前の照合に使う。
  paymentStatus?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
};

export type CheckoutSessionResult = {
  provider: "stripe";
  sessionId: string;
  url: string;
};

export type CheckoutSessionDetails = {
  sessionId: string;
  status: string;
  paymentIntentId?: string;
  entryId?: string;
  eventId?: string;
  eventTitle?: string;
  email?: string;
  metadata?: Record<string, string>;
  paymentStatus?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
};
