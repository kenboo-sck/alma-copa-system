export type PaymentProviderId = "stripe" | "other";

export type PaymentEnvironmentStatus = {
  isConfigured: boolean;
  isTestMode: boolean;
  missingKeys: string[];
  warnings: string[];
  debug: {
    hasSecretKey: boolean;
    secretKeyLooksTest: boolean;
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
  successUrl?: string;
  cancelUrl?: string;
};

export type StripeWebhookEventResult = {
  type: string;
  entryId?: string;
  eventId?: string;
  email?: string;
  sessionId?: string;
  paymentIntentId?: string;
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
};
