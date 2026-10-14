import { z } from "zod";

import { athleteInputSchema } from "@/lib/entries/entry-athlete-schema";
import { calculateAgeOnDate } from "@/lib/entries/entry-divisions";
import {
  confirmCardPayment,
  createEntry,
  deliverEntryEmails,
  getEntryPaymentSummary,
  recordCheckoutSession,
} from "@/lib/entries/entry-server";
import { packEntrySummaryMetadata } from "@/lib/entries/entry-summary-metadata";
import {
  mapZodIssuesToFieldErrors,
  sanitizeValidationInput,
  type EntryValidationFailure,
  type EntryValidationFieldError,
} from "@/lib/entries/entry-validation";
import { getMissingAdminEnvNames } from "@/lib/firebase/admin";
import { paymentService } from "@/lib/payments";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  buildPaymentGuidanceSections,
} from "@/lib/payments/payment-methods";
import { getSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

const contactSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.email(),
  phone: z.string().min(10).max(20),
  gym: z.string().min(1).max(120),
  postalCode: z.string().min(1).max(12),
  prefecture: z.string().min(1).max(20),
  city: z.string().min(1).max(80),
  addressLine: z.string().min(1).max(160),
});

// 個人エントリーは athletes が 1 名、代表者エントリーは representative が必須。
// 金額・品目名・大会名・支払案内はクライアントの値を使わず、サーバー側で決める
// （amount は画面表示との一致確認にだけ使う）。
// paymentMethod を送らない古い画面からの申込は、カード決済として扱う。
const checkoutSessionSchema = z
  .object({
    eventId: z.string().min(1),
    entryType: z.enum(["individual", "representative"]),
    paymentMethod: z.enum(PAYMENT_METHODS).default("card"),
    email: z.email(),
    phone: z.string().min(10).max(20),
    gym: z.string().min(1).max(120),
    postalCode: z.string().min(1).max(12),
    prefecture: z.string().min(1).max(20),
    city: z.string().min(1).max(80),
    addressLine: z.string().min(1).max(160),
    representative: contactSchema.optional(),
    athletes: z.array(athleteInputSchema).min(1).max(100),
    amount: z.number().int().positive(),
    normalizedEmail: z.string().max(320).optional(),
  })
  .superRefine((data, context) => {
    if (data.entryType === "individual" && data.athletes.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["athletes"],
        message: "個人エントリーの選手は1名です。",
      });
    }

    if (data.entryType === "representative" && !data.representative) {
      context.addIssue({
        code: "custom",
        path: ["representative"],
        message: "代表者情報を入力してください。",
      });
    }
  });

const checkoutSessionStatusSchema = z.object({
  session_id: z.string().min(1),
});

function buildFailure(
  status: number,
  stage: EntryValidationFailure["stage"],
  message: string,
  fieldErrors: EntryValidationFieldError[],
): EntryValidationFailure {
  return { ok: false, status, stage, message, fieldErrors };
}

function logFailure(
  failure: EntryValidationFailure,
  input: ReturnType<typeof sanitizeValidationInput>,
  error?: unknown,
) {
  console.error("Entry application failed", {
    stage: failure.stage,
    message: failure.message,
    fieldErrors: failure.fieldErrors,
    formData: input,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : (error ?? null),
  });
}

function buildServerConfigFailure() {
  const message = "現在、サーバー設定の確認中です。時間をおいて再度お試しください。";
  return buildFailure(503, "unexpected_error", message, [
    { field: "form", message, code: "firebase_admin_configuration_missing" },
  ]);
}

// 決済完了画面からの確認。ブラウザは支払状態を書き換えず、サーバーが Stripe に
// 問い合わせて確定した結果だけを受け取る（Webhook が遅れている場合はここで確定する）。
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = checkoutSessionStatusSchema.safeParse({
    session_id: url.searchParams.get("session_id"),
  });

  if (!parsed.success) {
    return Response.json(
      { error: "session_id が指定されていません。" },
      { status: 400 },
    );
  }

  try {
    const session = await paymentService.retrieveCheckoutSession(
      parsed.data.session_id,
    );

    if (!session.entryId) {
      return Response.json({ error: "エントリーが見つかりません。" }, { status: 404 });
    }

    const result = await confirmCardPayment({
      sessionId: session.sessionId,
      entryId: session.entryId,
      eventId: session.eventId,
      paymentStatus: session.paymentStatus,
      amountTotal: session.amountTotal,
      currency: session.currency,
      paymentIntentId: session.paymentIntentId,
    });

    if (
      (result.status === "confirmed" || result.status === "already_confirmed") &&
      result.sendEmail
    ) {
      await deliverEntryEmails(session.entryId, session.sessionId);
    }

    if (result.status === "mismatch") {
      console.error("Stripe payment could not be matched to the entry", {
        entryId: session.entryId,
        sessionId: session.sessionId,
        reason: result.reason,
      });
    }

    const summary = await getEntryPaymentSummary(session.entryId);

    if (!summary) {
      return Response.json({ error: "エントリーが見つかりません。" }, { status: 404 });
    }

    return Response.json({
      ...summary,
      sessionId: session.sessionId,
      confirmation: result.status,
    });
  } catch (error) {
    console.error("Checkout session status lookup failed", {
      sessionId: parsed.data.session_id,
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json({ error: "決済状態の確認に失敗しました。" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = checkoutSessionSchema.safeParse(json);
  const rawInput = sanitizeValidationInput({
    eventId: typeof json?.eventId === "string" ? json.eventId : "",
    entryType: json?.entryType === "representative" ? "representative" : "individual",
    email: typeof json?.email === "string" ? json.email : "",
    applicants: Array.isArray(json?.athletes) ? json.athletes : [],
  });

  if (!parsed.success) {
    const fieldErrors = mapZodIssuesToFieldErrors(parsed.error.issues);
    const message = fieldErrors.some((item) => item.field === "email")
      ? "メールアドレスの形式が正しくありません。"
      : fieldErrors.some((item) => item.field === "paymentMethod")
        ? "支払方法を選択してください。"
        : fieldErrors.some((item) => item.field.includes("birthDate"))
          ? "生年月日が未入力です。"
          : (fieldErrors.find((item) => item.code === "custom")?.message ??
            "入力内容に不備があります。必須項目を確認してください。");
    const failure = buildFailure(400, "schema_validation", message, fieldErrors);

    logFailure(failure, rawInput);
    return Response.json(failure, { status: failure.status });
  }

  const missingAdminEnv = getMissingAdminEnvNames();
  if (missingAdminEnv.length > 0) {
    const failure = buildServerConfigFailure();
    console.error("Firebase Admin SDK configuration missing", {
      missingEnvironmentVariables: missingAdminEnv,
      formData: rawInput,
    });
    return Response.json(failure, { status: failure.status });
  }

  // カード決済は、Stripe の設定（モードとキーの一致）を確認してから申込を保存する。
  // 設定に問題がある場合に、決済へ進めない申込だけが残るのを防ぐ。
  if (parsed.data.paymentMethod === "card") {
    const stripeStatus = paymentService.getStripeEnvironmentStatus();

    if (!stripeStatus.isConfigured || !stripeStatus.isModeConsistent) {
      const message =
        "現在、クレジットカード決済をご利用いただけません。時間をおいて再度お試しいただくか、他のお支払い方法をお選びください。";
      const failure = buildFailure(503, "unexpected_error", message, [
        { field: "paymentMethod", message, code: "stripe_configuration_invalid" },
      ]);

      // 鍵の値は含めず、不足している設定名と食い違いの種類だけを記録する。
      console.error("Stripe configuration is invalid", {
        missingKeys: stripeStatus.missingKeys,
        warnings: stripeStatus.warnings,
        mode: stripeStatus.mode,
        secretKeyMode: stripeStatus.debug.secretKeyMode,
      });
      return Response.json(failure, { status: failure.status });
    }
  }

  try {
    const created = await createEntry(parsed.data);

    if (!created.ok) {
      logFailure(created.failure, rawInput);
      return Response.json(created.failure, { status: created.failure.status });
    }

    const entry = created.entry;
    const base = {
      ok: true,
      entryId: entry.entryId,
      normalizedEmail: entry.normalizedEmail,
      paymentMethod: entry.paymentMethod,
      totalAmount: entry.totalAmount,
      feeCarriedOver: entry.feeCarriedOver,
      eventDateIso: entry.eventDate.toISOString(),
      calculatedAges: entry.athletes.map((athlete) =>
        calculateAgeOnDate(athlete.birthDate, entry.eventDate),
      ),
    };

    // 銀行振込・現金払い: Stripe を経由せず、未払いの状態で受付を完了する。
    if (entry.paymentMethod !== "card") {
      const emailOutcome = await deliverEntryEmails(entry.entryId);

      return Response.json({
        ...base,
        emailSent: emailOutcome === "sent",
        // 受付完了画面に表示する内容（申込時に保存した支払案内）。
        completion: {
          entryId: entry.entryId,
          eventTitle: entry.eventTitle,
          entryType: entry.entryType,
          applicantName: entry.applicantName,
          paymentMethod: entry.paymentMethod,
          paymentMethodLabel: PAYMENT_METHOD_LABELS[entry.paymentMethod],
          totalAmount: entry.totalAmount,
          summaryLines: entry.summaryLines,
          paymentGuidance: buildPaymentGuidanceSections(entry.paymentInfo),
        },
      });
    }

    const siteUrl = getSiteUrl();
    const session = await paymentService.createCheckoutSession({
      entryId: entry.entryId,
      eventId: entry.eventId,
      eventTitle: entry.eventTitle,
      entryType: entry.entryType,
      amount: entry.totalAmount,
      currency: "JPY",
      itemName: [
        `COPA ALMA エントリー費（${entry.priceLabel} / ${entry.athleteCount}名・${entry.divisionEntryCount}部門`,
        entry.openClassEntryCount > 0 ? `・無差別級${entry.openClassEntryCount}件` : "",
        "）",
      ].join(""),
      email: entry.applicantEmail,
      applicantName: entry.applicantName,
      metadata: {
        totalAmount: String(entry.totalAmount),
        ...packEntrySummaryMetadata(entry.summaryLines),
      },
      customerEmail: entry.applicantEmail,
      // 戻り先はサーバーが決める（リクエストで指定された URL は使わない）。
      successUrl: `${siteUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}/payment/cancel`,
    });

    await recordCheckoutSession(entry.entryId, session.sessionId).catch(
      (recordError: unknown) => {
        console.error("Checkout session record failed", {
          entryId: entry.entryId,
          sessionId: session.sessionId,
          recordError,
        });
      },
    );

    return Response.json({
      ...base,
      sessionId: session.sessionId,
      url: session.url,
    });
  } catch (error) {
    const message = "お申し込みの処理に失敗しました。時間をおいて再度お試しください。";
    const failure = buildFailure(500, "unexpected_error", message, [
      { field: "form", message, code: "entry_application_failed" },
    ]);

    logFailure(failure, rawInput, error);
    return Response.json(failure, { status: failure.status });
  }
}
