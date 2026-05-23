import "server-only";

import type {
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  PaymentEnvironmentStatus,
} from "./types";
import { StripeProvider } from "./stripe-provider";

export class PaymentService {
  constructor(private readonly stripeProvider = new StripeProvider()) {}

  getStripeEnvironmentStatus(): PaymentEnvironmentStatus {
    return this.stripeProvider.getEnvironmentStatus();
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSessionResult> {
    return this.stripeProvider.createCheckoutSession(input);
  }

  async retrieveCheckoutSession(sessionId: string) {
    return this.stripeProvider.retrieveCheckoutSession(sessionId);
  }

  constructStripeWebhookEvent(body: string, signature: string | null) {
    return this.stripeProvider.constructWebhookEvent(body, signature);
  }
}

export const paymentService = new PaymentService();
