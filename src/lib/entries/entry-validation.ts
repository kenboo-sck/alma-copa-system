import type { ZodIssue } from "zod";

import { checkAthleteAge, type NormalizedAthlete } from "./entry-divisions";

export { calculateAgeOnDate } from "./entry-divisions";

export type EntryValidationStage =
  | "schema_validation"
  | "event_lookup"
  | "event_status"
  | "event_date"
  | "age_category_check"
  | "amount_check"
  | "payment_method_check"
  | "duplicate_email_check"
  | "unexpected_error";

export type EntryValidationFieldError = {
  field: string;
  message: string;
  code: string;
  applicantIndex?: number;
};

export type SanitizedValidationInput = {
  eventId: string;
  entryType: "individual" | "representative";
  email: string;
  applicantCount: number;
  applicants: Array<{
    birthDate: string;
    athleteClass: string;
    divisionSelection: string;
  }>;
  entryId?: string;
};

export type EntryValidationFailure = {
  ok: false;
  status: number;
  stage: EntryValidationStage;
  message: string;
  fieldErrors: EntryValidationFieldError[];
};

export type EntryValidationSuccess = {
  ok: true;
  normalizedEmail: string;
  eventDateIso: string;
  calculatedAges: Array<number | null>;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function buildEntryDocumentId(eventId: string, normalizedEmail: string) {
  return `${encodeURIComponent(eventId.trim())}__${encodeURIComponent(
    normalizeEmail(normalizedEmail),
  )}`;
}

export function maskEmail(email: string) {
  const normalized = normalizeEmail(email);
  const [localPart = "", domain = ""] = normalized.split("@");

  if (!domain) {
    return normalized ? `${normalized.slice(0, 2)}***` : "";
  }

  const prefix = localPart.slice(0, Math.min(2, localPart.length));
  return `${prefix}${localPart.length > 2 ? "***" : ""}@${domain}`;
}

export function sanitizeValidationInput(
  input: Partial<SanitizedValidationInput> & {
    email?: string;
    applicants?: Array<{
      birthDate?: unknown;
      athleteClass?: unknown;
      divisionSelection?: unknown;
    }>;
  } = {},
): SanitizedValidationInput {
  return {
    eventId: input.eventId ?? "",
    entryType: input.entryType ?? "individual",
    email: input.email ? maskEmail(input.email) : "",
    applicantCount: input.applicants?.length ?? 0,
    applicants: (input.applicants ?? []).map((applicant) => ({
      birthDate: typeof applicant?.birthDate === "string" ? applicant.birthDate : "",
      athleteClass:
        typeof applicant?.athleteClass === "string" ? applicant.athleteClass : "",
      divisionSelection:
        typeof applicant?.divisionSelection === "string"
          ? applicant.divisionSelection
          : "",
    })),
    entryId: input.entryId,
  };
}

export function mapZodIssuesToFieldErrors(issues: ZodIssue[]) {
  return issues.map((issue) => ({
    field: issue.path.map((part) => String(part)).join("."),
    message: issue.message,
    code: issue.code,
  }));
}

// 大会開催日時点の年齢と、大人／キッズ・年齢区分の整合を選手ごとに確認する。
// 年齢のルール自体は entry-divisions.ts の暫定設定にまとめている。
export function buildAgeCategoryFieldErrors(
  athletes: NormalizedAthlete[],
  referenceDate: Date,
  entryType: "individual" | "representative",
): EntryValidationFieldError[] {
  return athletes.flatMap((athlete, index) =>
    checkAthleteAge(athlete, referenceDate).map((issue) => ({
      field: ["athletes", String(index), ...issue.path].join("."),
      message:
        entryType === "representative"
          ? `選手${index + 1}（${athlete.name}）: ${issue.message}`
          : issue.message,
      code: "age_category_mismatch",
      applicantIndex: index,
    })),
  );
}

export function buildDuplicateEmailFieldError(
  entryType: "individual" | "representative",
) {
  return {
    field: entryType === "representative" ? "representativeEmail" : "email",
    message:
      "このメールアドレスでは、すでにこの大会へエントリー済みです。内容の確認や変更をご希望の場合は、運営までお問い合わせください。",
    code: "duplicate_email",
  };
}
