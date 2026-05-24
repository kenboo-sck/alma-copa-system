import { z } from "zod";

import {
  buildAgeCategoryFieldErrors,
  buildDuplicateEmailFieldError,
  mapZodIssuesToFieldErrors,
  normalizeEmail,
  sanitizeValidationInput,
  type EntryValidationFieldError,
  type EntryValidationFailure,
  type EntryValidationSuccess,
} from "@/lib/entries/entry-validation";
import {
  getAdminFirestore,
  getMissingAdminFirestoreEnvNames,
  isAdminFirestoreConfigured,
} from "@/lib/firebase/admin";
import { collections } from "@/lib/firebase/collections";

export const runtime = "nodejs";

const validationApplicantSchema = z.object({
  birthDate: z.string().min(1, "生年月日を入力してください。"),
  ageCategory: z.string().min(1, "年齢カテゴリーを選択してください。"),
});

const validationSchema = z.object({
  eventId: z.string().min(1, "大会を選択してください。"),
  email: z.email("メールアドレスの形式が正しくありません。"),
  entryType: z.enum(["individual", "representative"]),
  applicants: z.array(validationApplicantSchema).min(1, "選手情報を入力してください。"),
});

type ValidationPayload =
  | (EntryValidationSuccess & { ok: true })
  | EntryValidationFailure;

function isPublishedEvent(data: Record<string, unknown>) {
  return (
    data.status === "published" && ("deletedAt" in data ? data.deletedAt == null : true)
  );
}

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
  console.error("Entry validation failed", {
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

function buildServerConfigFailure() {
  return buildFailure(
    503,
    "server_configuration",
    "現在、サーバー設定の確認中です。時間をおいて再度お試しください。",
    [
      {
        field: "form",
        message: "現在、サーバー設定の確認中です。時間をおいて再度お試しください。",
        code: "server_configuration_missing",
      },
    ],
  );
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = validationSchema.safeParse(json);
  const rawInput = sanitizeValidationInput({
    eventId: typeof json?.eventId === "string" ? json.eventId : "",
    entryType: json?.entryType === "representative" ? "representative" : "individual",
    email: typeof json?.email === "string" ? json.email : "",
    applicants: Array.isArray(json?.applicants) ? json.applicants : [],
    entryId: typeof json?.entryId === "string" ? json.entryId : undefined,
  });

  if (!parsed.success) {
    const fieldErrors = mapZodIssuesToFieldErrors(parsed.error.issues);
    const failure = buildFailure(
      400,
      "schema_validation",
      fieldErrors.some((item) => item.field === "email")
        ? "メールアドレスの形式が正しくありません。"
        : fieldErrors.some((item) => item.field.includes("birthDate"))
          ? "生年月日が未入力です。"
          : "入力内容に不備があります。必須項目を確認してください。",
      fieldErrors,
    );

    logValidationFailure(failure.stage, failure.message, rawInput, fieldErrors);

    return Response.json(failure, { status: failure.status });
  }

  try {
    if (!isAdminFirestoreConfigured()) {
      const failure = buildServerConfigFailure();

      console.error("Entry validation server configuration missing", {
        stage: failure.stage,
        missingEnvironmentVariables: getMissingAdminFirestoreEnvNames(),
        validationResult: failure,
        formData: rawInput,
      });

      return Response.json(failure, { status: failure.status });
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
    if (!isPublishedEvent(eventData)) {
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

    const applicants = parsed.data.applicants.map((applicant) => ({
      birthDate: applicant.birthDate,
      ageCategory: applicant.ageCategory,
    }));

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

    const normalizedEmail = normalizeEmail(parsed.data.email);
    const duplicateSnapshot = await db
      .collection(collections.entries)
      .where("eventId", "==", parsed.data.eventId)
      .get();

    const duplicateExists = duplicateSnapshot.docs.some((entryDoc) => {
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
        applicant.birthDate
          ? sanitizeCalculatedAge(applicant.birthDate, eventDate)
          : null,
      ),
    };

    return Response.json(success);
  } catch (error) {
    const failure = buildFailure(
      500,
      "unexpected_error",
      "入力内容の検証に失敗しました。",
      [
        {
          field: "form",
          message: "入力内容の検証に失敗しました。",
          code: "unexpected_error",
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

    return Response.json(failure, { status: failure.status });
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
