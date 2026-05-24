import { z } from "zod";

import {
  buildAgeCategoryFieldErrors,
  buildDuplicateEmailFieldError,
  mapZodIssuesToFieldErrors,
  normalizeEmail,
  sanitizeValidationInput,
  type EntryValidationFieldError,
  type EntryValidationFailure,
} from "@/lib/entries/entry-validation";
import { getAdminFirestore, isAdminFirestoreConfigured } from "@/lib/firebase/admin";
import { collections } from "@/lib/firebase/collections";
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
  normalizedEmail: z.string().max(320).optional(),
  successUrl: z.url().optional(),
  cancelUrl: z.url().optional(),
});

const checkoutSessionStatusSchema = z.object({
  session_id: z.string().min(1),
});

type ValidationPayload =
  | (EntryValidationFailure & { ok: false })
  | {
      ok: true;
      normalizedEmail: string;
      eventDateIso: string;
      calculatedAges: Array<number | null>;
    };

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

function buildServerConfigFailure() {
  return buildFailure(
    503,
    "server_configuration",
    "サーバー側の検証設定が不足しています。FIREBASE_CLIENT_EMAIL と FIREBASE_PRIVATE_KEY を設定してください。",
    [
      {
        field: "form",
        message:
          "サーバー側の検証設定が不足しています。FIREBASE_CLIENT_EMAIL と FIREBASE_PRIVATE_KEY を設定してください。",
        code: "server_configuration_missing",
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
    if (!isAdminFirestoreConfigured()) {
      const failure = buildServerConfigFailure();
      logValidationFailure(
        failure.stage,
        failure.message,
        rawInput,
        failure.fieldErrors,
      );
      return Response.json(
        {
          ...failure,
          stripe: stripeStatus,
        },
        { status: failure.status },
      );
    }

    const db = getAdminFirestore();
    const eventSnapshot = await db
      .collection(collections.events)
      .doc(parsed.data.eventId)
      .get();

    if (!eventSnapshot.exists) {
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

    const normalizedEmail =
      parsed.data.normalizedEmail ?? normalizeEmail(parsed.data.email);

    const duplicateSnapshot = await db
      .collection(collections.entries)
      .where("eventId", "==", parsed.data.eventId)
      .get();

    const duplicateExists = duplicateSnapshot.docs.some((entryDoc) => {
      if (entryDoc.id === parsed.data.entryId) {
        return false;
      }

      const entryData = entryDoc.data() as {
        email?: unknown;
        normalizedEmail?: unknown;
      };
      const entryEmail =
        typeof entryData.normalizedEmail === "string"
          ? entryData.normalizedEmail
          : typeof entryData.email === "string"
            ? normalizeEmail(entryData.email)
            : "";

      return entryEmail === normalizedEmail;
    });

    if (duplicateExists) {
      const duplicateError = buildDuplicateEmailFieldError(parsed.data.entryType);
      const failure = buildFailure(
        409,
        "duplicate_email_check",
        duplicateError.message,
        [duplicateError],
      );

      logValidationFailure(
        failure.stage,
        failure.message,
        rawInput,
        failure.fieldErrors,
      );
      return Response.json(failure, { status: failure.status });
    }

    const success: ValidationPayload = {
      ok: true,
      normalizedEmail,
      eventDateIso: eventDate.toISOString(),
      calculatedAges: applicants.map((applicant) =>
        sanitizeCalculatedAge(applicant.birthDate, eventDate),
      ),
    };

    return Response.json(success);
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
