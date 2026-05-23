import { z } from "zod";

import { paymentService } from "@/lib/payments";

export const runtime = "nodejs";

const checkoutAthleteSchema = z.object({
  name: z.string().min(1).max(50),
  kana: z.string().min(1).max(80),
  gender: z.string().min(1),
  birthDate: z.string().min(1),
  category: z.string().min(1).max(120),
  ageCategory: z.string().min(1).max(80),
  weightClass: z.string().min(1).max(80),
  openClass: z.enum(["yes", "no"]),
});

const checkoutSessionSchema = z.object({
  entryId: z.string().min(1),
  eventId: z.string().min(1),
  eventTitle: z.string().min(1).max(200),
  entryType: z.enum(["individual", "representative"]),
  name: z.string().min(1).max(50),
  kana: z.string().max(80).optional().default(""),
  email: z.email(),
  phone: z.string().min(10).max(20),
  gender: z.string().optional().default(""),
  birthDate: z.string().optional().default(""),
  gym: z.string().min(1).max(120),
  postalCode: z.string().min(1).max(12),
  prefecture: z.string().min(1).max(20),
  city: z.string().min(1).max(80),
  addressLine: z.string().min(1).max(160),
  category: z.string().max(120).optional().default(""),
  ageCategory: z.string().max(80).optional().default(""),
  weightClass: z.string().max(80).optional().default(""),
  openClass: z.enum(["yes", "no"]).optional(),
  representative: z
    .object({
      name: z.string().min(1).max(50),
      email: z.email(),
      phone: z.string().min(10).max(20),
      gym: z.string().min(1).max(120),
      postalCode: z.string().min(1).max(12),
      prefecture: z.string().min(1).max(20),
      city: z.string().min(1).max(80),
      addressLine: z.string().min(1).max(160),
    })
    .optional(),
  athletes: z.array(checkoutAthleteSchema).optional(),
  amount: z.number().int().positive(),
  currency: z.literal("JPY").default("JPY"),
  itemName: z.string().min(1).max(120).default("ALMA COPA エントリー費"),
  customerEmail: z.email().optional(),
  successUrl: z.url().optional(),
  cancelUrl: z.url().optional(),
});

const checkoutSessionStatusSchema = z.object({
  session_id: z.string().min(1),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = checkoutSessionStatusSchema.safeParse({
    session_id: url.searchParams.get("session_id"),
  });

  if (!parsed.success) {
    return Response.json(
      {
        error: "session_id が指定されていません。",
      },
      { status: 400 },
    );
  }

  try {
    const session = await paymentService.retrieveCheckoutSession(parsed.data.session_id);

    return Response.json(session);
  } catch (error) {
    console.error("Stripe Checkout Session lookup failed", {
      error,
      sessionId: parsed.data.session_id,
    });

    return Response.json(
      {
        error: "Stripe Checkout Session の取得に失敗しました。",
      },
      { status: 404 },
    );
  }
}

export async function POST(request: Request) {
  const stripeStatus = paymentService.getStripeEnvironmentStatus();

  if (!stripeStatus.isConfigured || !stripeStatus.isTestMode) {
    return Response.json(
      {
        error:
          "Stripeテスト決済が未設定です。テストモードの環境変数を確認してください。",
        stripe: stripeStatus,
      },
      { status: 503 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = checkoutSessionSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      {
        error: "入力内容に不備があります。必須項目を確認してください。",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const session = await paymentService.createCheckoutSession({
      ...parsed.data,
      successUrl: parsed.data.successUrl ?? undefined,
      cancelUrl: parsed.data.cancelUrl ?? undefined,
      customerEmail: parsed.data.customerEmail ?? parsed.data.email,
    });

    return Response.json({
      entryId: parsed.data.entryId,
      sessionId: session.sessionId,
      url: session.url,
      provider: session.provider,
    });
  } catch (error) {
    console.error("Stripe Checkout Session creation failed", {
      error,
      eventId: parsed.data.eventId,
      eventTitle: parsed.data.eventTitle,
      entryId: parsed.data.entryId,
    });

    return Response.json(
      {
        error: "Stripe Checkout Sessionの作成に失敗しました。",
      },
      { status: 500 },
    );
  }
}
