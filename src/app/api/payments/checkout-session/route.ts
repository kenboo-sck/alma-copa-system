import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore/lite";
import { z } from "zod";

import {
  buildAgeCategoryFieldErrors,
  buildDuplicateEmailFieldError,
  buildEntryDocumentId,
  mapZodIssuesToFieldErrors,
  maskEmail,
  normalizeEmail,
  sanitizeValidationInput,
  type EntryValidationFieldError,
  type EntryValidationFailure,
} from "@/lib/entries/entry-validation";
import { collections } from "@/lib/firebase/collections";
import {
  getMissingPublicFirestoreEnvNames,
  getPublicFirestore,
} from "@/lib/firebase/public-firestore";
import { getSiteUrl } from "@/lib/site-url";
import { paymentService } from "@/lib/payments";
import {
  getCurrentEntryFee,
  mapPublicEvent,
} from "@/features/events/public-event-utils";

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
  itemName: z.string().min(1).max(120).default("COPA ALMA エントリー費"),
  customerEmail: z.email().optional(),
  normalizedEmail: z.string().max(320).optional(),
  successUrl: z.url().optional(),
  cancelUrl: z.url().optional(),
});

const checkoutSessionStatusSchema = z.object({
  session_id: z.string().min(1),
});

function toDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  return null;
}

function buildFailure(
  status: number,
  stage: EntryValidationFailure["stage"],
  message: string,
  fieldErrors: EntryValidationFieldError[],
): EntryValidationFailure {
  return {
    ok: false,
    status,
    stage,
    message,
    fieldErrors,
  };
}

function logValidationFailure(
  stage: EntryValidationFailure["stage"],
  message: string,
  input: ReturnType<typeof sanitizeValidationInput>,
  fieldErrors: EntryValidationFieldError[],
  error?: unknown,
) {
  console.error("Stripe Checkout validation failed", {
    stage,
    message,
    validationResult: {
      ok: false,
      stage,
      message,
      fieldErrors,
    },
    formData: input,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : (error ?? null),
  });
}

function logSchemaFailure(
  message: string,
  input: ReturnType<typeof sanitizeValidationInput>,
  issues: ReturnType<typeof mapZodIssuesToFieldErrors>,
) {
  console.error("Stripe Checkout validation failed", {
    stage: "schema_validation",
    message,
    validationResult: {
      ok: false,
      stage: "schema_validation",
      message,
      fieldErrors: issues,
    },
    formData: input,
  });
}

function isConfirmedEntry(data: Record<string, unknown>) {
  return data.entryStatus === "confirmed" && data.paymentStatus === "paid";
}

function getSafeDuplicateDiagnosticValue(value: string) {
  if (process.env.NODE_ENV === "production") {
    return maskEmail(value);
  }

  return value;
}

function getSafeEntryIdForLog(eventId: string, normalizedEmail: string) {
  if (process.env.NODE_ENV === "production") {
    return buildEntryDocumentId(eventId, maskEmail(normalizedEmail));
  }

  return buildEntryDocumentId(eventId, normalizedEmail);
}

function logDuplicateDiagnostic({
  eventId,
  normalizedEmail,
  entryId,
  exists,
  paymentStatus,
  entryStatus,
  reason,
  writeError,
}: {
  eventId: string;
  normalizedEmail: string;
  entryId: string;
  exists: boolean | null;
  paymentStatus: unknown;
  entryStatus: unknown;
  reason: string;
  writeError?: unknown;
}) {
  console.error("Entry duplicate check diagnostic", {
    collectionName: collections.entries,
    path: `${collections.entries}/${entryId}`,
    eventId,
    normalizedEmail: getSafeDuplicateDiagnosticValue(normalizedEmail),
    entryId,
    exists,
    paymentStatus:
      typeof paymentStatus === "string" || paymentStatus === null
        ? paymentStatus
        : typeof paymentStatus,
    entryStatus:
      typeof entryStatus === "string" || entryStatus === null
        ? entryStatus
        : typeof entryStatus,
    reason,
    error:
      writeError instanceof Error
        ? {
            name: writeError.name,
            message: writeError.message,
          }
        : (writeError ?? null),
  });
}

function getErrorDetails(error: unknown) {
  if (error && typeof error === "object") {
    const maybeError = error as {
      code?: unknown;
      name?: unknown;
      message?: unknown;
      stack?: unknown;
    };

    return {
      code: typeof maybeError.code === "string" ? maybeError.code : undefined,
      name: typeof maybeError.name === "string" ? maybeError.name : undefined,
      message:
        typeof maybeError.message === "string" ? maybeError.message : String(error),
      stack: typeof maybeError.stack === "string" ? maybeError.stack : undefined,
    };
  }

  return {
    code: undefined,
    name: undefined,
    message: String(error),
    stack: undefined,
  };
}

function findUnsupportedPayloadPaths(value: unknown, path = "payload"): string[] {
  if (value === undefined) {
    return [path];
  }

  if (typeof value === "number" && Number.isNaN(value)) {
    return [path];
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? [path] : [];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findUnsupportedPayloadPaths(item, `${path}[${index}]`),
    );
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
    findUnsupportedPayloadPaths(item, `${path}.${key}`),
  );
}

async function inspectEntryDocument(entryId: string) {
  const db = getPublicFirestore();
  const entryRef = doc(db, collections.entries, entryId);
  const entrySnapshot = await getDoc(entryRef);

  if (!entrySnapshot.exists()) {
    return {
      ok: true as const,
      exists: false,
      paymentStatus: null,
      entryStatus: null,
      ref: entryRef,
    };
  }

  const data = (entrySnapshot.data() as Record<string, unknown>) ?? {};

  return {
    ok: true as const,
    exists: true,
    paymentStatus: data.paymentStatus ?? null,
    entryStatus: data.entryStatus ?? null,
    isConfirmed: isConfirmedEntry(data),
    ref: entryRef,
  };
}

async function inspectConfirmedEntryAfterWriteFailure(entryId: string) {
  try {
    return await inspectEntryDocument(entryId);
  } catch (error) {
    return {
      ok: false as const,
      reason: "duplicate_inspection_failed" as const,
      error,
    };
  }
}

function buildServerConfigFailure() {
  return buildFailure(
    503,
    "unexpected_error",
    "現在、サーバー設定の確認中です。時間をおいて再度お試しください。",
    [
      {
        field: "form",
        message: "現在、サーバー設定の確認中です。時間をおいて再度お試しください。",
        code: "firebase_public_configuration_missing",
      },
    ],
  );
}

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
    const session = await paymentService.retrieveCheckoutSession(
      parsed.data.session_id,
    );

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
  console.info("Stripe checkout environment debug", {
    isConfigured: stripeStatus.isConfigured,
    isTestMode: stripeStatus.isTestMode,
    missingKeys: stripeStatus.missingKeys,
    warnings: stripeStatus.warnings,
    debug: stripeStatus.debug,
  });

  const json = await request.json().catch(() => null);
  const parsed = checkoutSessionSchema.safeParse(json);
  const rawInput = sanitizeValidationInput({
    eventId: typeof json?.eventId === "string" ? json.eventId : "",
    entryType: json?.entryType === "representative" ? "representative" : "individual",
    email: typeof json?.email === "string" ? json.email : "",
    applicants: Array.isArray(json?.athletes)
      ? json.athletes
      : json?.birthDate
        ? [{ birthDate: json.birthDate, ageCategory: json.ageCategory ?? "" }]
        : [],
    entryId: typeof json?.entryId === "string" ? json.entryId : undefined,
  });

  if (!parsed.success) {
    const fieldErrors = mapZodIssuesToFieldErrors(parsed.error.issues);
    const message = fieldErrors.some((item) => item.field === "email")
      ? "メールアドレスの形式が正しくありません。"
      : fieldErrors.some((item) => item.field.includes("birthDate"))
        ? "生年月日が未入力です。"
        : "入力内容に不備があります。必須項目を確認してください。";

    logSchemaFailure(message, rawInput, fieldErrors);

    const failure = buildFailure(400, "schema_validation", message, fieldErrors);
    return Response.json(failure, { status: failure.status });
  }

  try {
    const missingPublicEnv = getMissingPublicFirestoreEnvNames();
    if (missingPublicEnv.length > 0) {
      const failure = buildServerConfigFailure();
      console.error("Stripe Checkout public Firestore configuration missing", {
        missingEnvironmentVariables: missingPublicEnv,
        validationResult: failure,
        formData: rawInput,
      });

      return Response.json(
        {
          ...failure,
          stripe: stripeStatus,
        },
        { status: failure.status },
      );
    }

    const db = getPublicFirestore();
    const eventSnapshot = await getDoc(
      doc(db, collections.events, parsed.data.eventId),
    );

    if (!eventSnapshot.exists()) {
      const failure = buildFailure(404, "event_lookup", "大会が見つかりません。", [
        {
          field: "eventId",
          message: "大会が見つかりません。",
          code: "event_not_found",
        },
      ]);

      logValidationFailure(
        failure.stage,
        failure.message,
        rawInput,
        failure.fieldErrors,
      );
      return Response.json(failure, { status: failure.status });
    }

    const eventData = eventSnapshot.data() as Record<string, unknown>;
    if (
      eventData.status !== "published" ||
      ("deletedAt" in eventData && eventData.deletedAt != null)
    ) {
      const failure = buildFailure(
        400,
        "event_status",
        "この大会は現在公開されていません。",
        [
          {
            field: "eventId",
            message: "この大会は現在公開されていません。",
            code: "event_not_published",
          },
        ],
      );

      logValidationFailure(
        failure.stage,
        failure.message,
        rawInput,
        failure.fieldErrors,
      );
      return Response.json(failure, { status: failure.status });
    }

    const eventDate = toDate(eventData.eventDate);
    if (!eventDate) {
      const failure = buildFailure(
        400,
        "event_date",
        "大会開催日が設定されていないため、年齢カテゴリーを確認できません。",
        [
          {
            field: "eventDate",
            message:
              "大会開催日が設定されていないため、年齢カテゴリーを確認できません。",
            code: "event_date_missing",
          },
        ],
      );

      logValidationFailure(
        failure.stage,
        failure.message,
        rawInput,
        failure.fieldErrors,
      );
      return Response.json(failure, { status: failure.status });
    }

    const applicants =
      parsed.data.entryType === "representative"
        ? (parsed.data.athletes ?? [])
        : [
            {
              birthDate: parsed.data.birthDate,
              ageCategory: parsed.data.ageCategory,
            },
          ];

    if (applicants.length === 0) {
      const failure = buildFailure(
        400,
        "age_category_check",
        "選手情報が見つかりません。入力内容をご確認ください。",
        [
          {
            field: "birthDate",
            message: "選手情報が見つかりません。入力内容をご確認ください。",
            code: "applicant_missing",
          },
        ],
      );

      logValidationFailure(
        failure.stage,
        failure.message,
        rawInput,
        failure.fieldErrors,
      );
      return Response.json(failure, { status: failure.status });
    }

    const ageFieldErrors = buildAgeCategoryFieldErrors(
      applicants,
      eventDate,
      parsed.data.entryType,
    );

    if (ageFieldErrors.length > 0) {
      const failure = buildFailure(
        400,
        "age_category_check",
        "生年月日から計算した年齢と、選択された年齢カテゴリーが一致していません。年齢カテゴリーをご確認ください。",
        ageFieldErrors,
      );

      logValidationFailure(
        failure.stage,
        failure.message,
        rawInput,
        failure.fieldErrors,
      );
      return Response.json(failure, { status: failure.status });
    }

    const athleteCount =
      parsed.data.entryType === "representative"
        ? (parsed.data.athletes?.length ?? 0)
        : 1;
    const pricingNow = getCurrentEntryFee(
      mapPublicEvent(parsed.data.eventId, eventData),
    );
    const totalAmountNow = pricingNow.entryFee * athleteCount;
    const normalizedEmail =
      parsed.data.normalizedEmail ?? normalizeEmail(parsed.data.email);
    const resolvedEntryId = buildEntryDocumentId(parsed.data.eventId, normalizedEmail);

    if (parsed.data.entryId !== resolvedEntryId) {
      console.error("Stripe Checkout entryId mismatch detected", {
        submittedEntryId: parsed.data.entryId,
        resolvedEntryId,
        eventId: parsed.data.eventId,
        normalizedEmail,
      });
    }

    const entryPayload = {
      eventId: parsed.data.eventId,
      eventTitle: parsed.data.eventTitle,
      entryType: parsed.data.entryType,
      entryStatus: "pending_payment",
      paymentStatus: "pending",
      paymentProvider: "stripe",
      name: parsed.data.name,
      kana: parsed.data.kana,
      email: parsed.data.email,
      normalizedEmail,
      phone: parsed.data.phone,
      gender: parsed.data.gender,
      birthDate: new Date(parsed.data.birthDate),
      gym:
        parsed.data.entryType === "representative" && parsed.data.representative
          ? parsed.data.representative.gym
          : parsed.data.gym,
      postalCode:
        parsed.data.entryType === "representative" && parsed.data.representative
          ? parsed.data.representative.postalCode
          : parsed.data.postalCode,
      prefecture:
        parsed.data.entryType === "representative" && parsed.data.representative
          ? parsed.data.representative.prefecture
          : parsed.data.prefecture,
      city:
        parsed.data.entryType === "representative" && parsed.data.representative
          ? parsed.data.representative.city
          : parsed.data.city,
      addressLine:
        parsed.data.entryType === "representative" && parsed.data.representative
          ? parsed.data.representative.addressLine
          : parsed.data.addressLine,
      category: parsed.data.category,
      ageCategory: parsed.data.ageCategory,
      weightClass: parsed.data.weightClass,
      openClass: parsed.data.openClass ?? "no",
      athlete:
        parsed.data.entryType === "individual"
          ? {
              name: parsed.data.name,
              kana: parsed.data.kana,
              gender: parsed.data.gender,
              birthDate: new Date(parsed.data.birthDate),
              category: parsed.data.category,
              ageCategory: parsed.data.ageCategory,
              weightClass: parsed.data.weightClass,
              openClass: parsed.data.openClass ?? "no",
            }
          : null,
      representative: parsed.data.representative ?? null,
      athletes: parsed.data.athletes ?? [],
      entryFee: pricingNow.entryFee,
      priceType: pricingNow.priceType,
      athleteCount,
      receptionStatus: "not_checked_in",
      weighInStatus: "not_weighed",
      bibNumber: "",
      bracketPosition: "",
      checkedInAt: null,
      weighInAt: null,
      participantCount: athleteCount,
      categoryEntryCount: athleteCount,
      subtotalAmount: totalAmountNow,
      discountAmount: 0,
      totalAmount: totalAmountNow,
      currency: "JPY",
      stripeSessionId: "",
      stripeCheckoutSessionId: "",
      stripePaymentIntentId: "",
      paymentFailedAt: null,
      paidAt: null,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    const unsupportedPayloadPaths = findUnsupportedPayloadPaths(entryPayload);
    if (unsupportedPayloadPaths.length > 0) {
      const failure = buildFailure(
        500,
        "unexpected_error",
        "エントリー情報の作成に失敗しました。時間をおいて再度お試しください。",
        [
          {
            field: "form",
            message:
              "エントリー情報の作成に失敗しました。時間をおいて再度お試しください。",
            code: "entry_payload_invalid",
          },
        ],
      );

      console.error("Stripe Checkout entry payload contains unsupported values", {
        entryId: getSafeEntryIdForLog(parsed.data.eventId, normalizedEmail),
        eventId: parsed.data.eventId,
        normalizedEmail: getSafeDuplicateDiagnosticValue(normalizedEmail),
        unsupportedPayloadPaths,
        validationResult: failure,
        formData: rawInput,
      });

      return Response.json(failure, { status: failure.status });
    }

    const entryRef = doc(db, collections.entries, resolvedEntryId);

    try {
      await setDoc(entryRef, entryPayload);
    } catch (writeError) {
      const duplicateInspection =
        await inspectConfirmedEntryAfterWriteFailure(resolvedEntryId);

      if (
        duplicateInspection.ok &&
        duplicateInspection.exists &&
        duplicateInspection.isConfirmed
      ) {
        const duplicateError = buildDuplicateEmailFieldError(parsed.data.entryType);
        const failure = buildFailure(
          409,
          "duplicate_email_check",
          duplicateError.message,
          [duplicateError],
        );

        logDuplicateDiagnostic({
          eventId: parsed.data.eventId,
          normalizedEmail,
          entryId: getSafeEntryIdForLog(parsed.data.eventId, normalizedEmail),
          exists: duplicateInspection.exists,
          paymentStatus: duplicateInspection.paymentStatus,
          entryStatus: duplicateInspection.entryStatus,
          reason: "confirmed_entry_exists",
          writeError,
        });
        console.error("Stripe Checkout duplicate entry blocked", {
          entryId: getSafeEntryIdForLog(parsed.data.eventId, normalizedEmail),
          eventId: parsed.data.eventId,
          normalizedEmail: getSafeDuplicateDiagnosticValue(normalizedEmail),
          duplicateCheck: {
            exists: duplicateInspection.exists,
            paymentStatus: duplicateInspection.paymentStatus,
            entryStatus: duplicateInspection.entryStatus,
            reason: "confirmed_entry_exists",
          },
          validationResult: failure,
          formData: rawInput,
        });

        return Response.json(failure, { status: failure.status });
      }

      const failure = buildFailure(
        500,
        "unexpected_error",
        "エントリー情報の作成に失敗しました。時間をおいて再度お試しください。",
        [
          {
            field: "form",
            message:
              "エントリー情報の作成に失敗しました。時間をおいて再度お試しください。",
            code: "entry_create_failed",
          },
        ],
      );

      logDuplicateDiagnostic({
        eventId: parsed.data.eventId,
        normalizedEmail,
        entryId: getSafeEntryIdForLog(parsed.data.eventId, normalizedEmail),
        exists: duplicateInspection.ok ? duplicateInspection.exists : null,
        paymentStatus: duplicateInspection.ok
          ? duplicateInspection.paymentStatus
          : null,
        entryStatus: duplicateInspection.ok ? duplicateInspection.entryStatus : null,
        reason: "public_entry_set_failed",
        writeError,
      });
      console.error("Stripe Checkout entry create failed", {
        entryId: getSafeEntryIdForLog(parsed.data.eventId, normalizedEmail),
        eventId: parsed.data.eventId,
        normalizedEmail: getSafeDuplicateDiagnosticValue(normalizedEmail),
        firestorePath: `${collections.entries}/${getSafeEntryIdForLog(parsed.data.eventId, normalizedEmail)}`,
        error: getErrorDetails(writeError),
        duplicateInspection,
        validationResult: failure,
        formData: rawInput,
      });

      return Response.json(failure, { status: failure.status });
    }

    const successUrl =
      parsed.data.successUrl ??
      `${getSiteUrl()}/payment/success?entry_id=${resolvedEntryId}&session_id={CHECKOUT_SESSION_ID}&applicant_name=${encodeURIComponent(parsed.data.name)}&applicant_email=${encodeURIComponent(parsed.data.email)}&event_id=${encodeURIComponent(parsed.data.eventId)}&event_title=${encodeURIComponent(parsed.data.eventTitle)}&entry_type=${encodeURIComponent(parsed.data.entryType)}`;
    const cancelUrl =
      parsed.data.cancelUrl ??
      `${getSiteUrl()}/payment/cancel?entry_id=${resolvedEntryId}`;

    const session = await paymentService.createCheckoutSession({
      entryId: resolvedEntryId,
      eventId: parsed.data.eventId,
      eventTitle: parsed.data.eventTitle,
      entryType: parsed.data.entryType,
      amount: totalAmountNow,
      currency: parsed.data.currency,
      itemName: parsed.data.itemName,
      email: parsed.data.email,
      applicantName: parsed.data.name,
      customerEmail: parsed.data.customerEmail ?? parsed.data.email,
      successUrl,
      cancelUrl,
    });

    return Response.json({
      ok: true,
      normalizedEmail,
      eventDateIso: eventDate.toISOString(),
      calculatedAges: applicants.map((applicant) =>
        sanitizeCalculatedAge(applicant.birthDate, eventDate),
      ),
      sessionId: session.sessionId,
      url: session.url,
    });
  } catch (error) {
    const failure = buildFailure(
      500,
      "unexpected_error",
      "Stripe Checkout Sessionの作成に失敗しました。",
      [
        {
          field: "form",
          message: "Stripe Checkout Sessionの作成に失敗しました。",
          code: "stripe_checkout_failed",
        },
      ],
    );

    logValidationFailure(
      failure.stage,
      failure.message,
      rawInput,
      failure.fieldErrors,
      error,
    );

    return Response.json(
      {
        ...failure,
        stripe: stripeStatus,
      },
      { status: failure.status },
    );
  }
}

function sanitizeCalculatedAge(birthDate: string, eventDate: Date) {
  const parts = birthDate.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  const [year, month, day] = parts;
  const birth = new Date(year, month - 1, day);
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }

  let age = eventDate.getFullYear() - birth.getFullYear();
  if (
    eventDate.getMonth() < birth.getMonth() ||
    (eventDate.getMonth() === birth.getMonth() && eventDate.getDate() < birth.getDate())
  ) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}
