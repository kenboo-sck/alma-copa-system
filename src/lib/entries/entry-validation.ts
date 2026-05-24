import type { ZodIssue } from "zod";

export const AGE_CATEGORY_LABELS = [
  "キッズ（同じ年齢で試合組みます。）",
  "ジュベニウ 15歳から17歳",
  "アダルト 18歳から29歳",
  "マスター1 30歳から35歳",
  "マスター2 36歳から40歳",
  "マスター3 41歳から45歳",
  "マスター4 46歳から50歳",
  "マスター5 51歳以上",
] as const;

export type AgeCategoryLabel = (typeof AGE_CATEGORY_LABELS)[number];

export type AgeCategoryCheckInput = {
  birthDate: string;
  ageCategory: string;
};

export type AgeCategoryCheckResult = {
  isValid: boolean;
  calculatedAge: number | null;
  expectedAgeCategory: AgeCategoryLabel | null;
};

export type EntryValidationStage =
  | "schema_validation"
  | "event_lookup"
  | "event_status"
  | "event_date"
  | "age_category_check"
  | "duplicate_email_check"
  | "server_configuration"
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
    ageCategory: string;
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
    applicants?: Array<{ birthDate?: string; ageCategory?: string }>;
  } = {},
): SanitizedValidationInput {
  return {
    eventId: input.eventId ?? "",
    entryType: input.entryType ?? "individual",
    email: input.email ? maskEmail(input.email) : "",
    applicantCount: input.applicants?.length ?? 0,
    applicants: (input.applicants ?? []).map((applicant) => ({
      birthDate: applicant.birthDate ?? "",
      ageCategory: applicant.ageCategory ?? "",
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

function parseDateInput(value: string) {
  const parts = value.split("-").map((part) => Number(part));

  if (parts.length !== 3) {
    return null;
  }

  const [year, month, day] = parts;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function calculateAgeOnDate(birthDate: string, referenceDate: Date) {
  const parsedBirthDate = parseDateInput(birthDate);

  if (!parsedBirthDate) {
    return null;
  }

  const birthYear = parsedBirthDate.getFullYear();
  const birthMonth = parsedBirthDate.getMonth();
  const birthDay = parsedBirthDate.getDate();

  const referenceYear = referenceDate.getFullYear();
  const referenceMonth = referenceDate.getMonth();
  const referenceDay = referenceDate.getDate();

  let age = referenceYear - birthYear;

  if (
    referenceMonth < birthMonth ||
    (referenceMonth === birthMonth && referenceDay < birthDay)
  ) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export function getAgeCategoryForAge(age: number): AgeCategoryLabel | null {
  if (age <= 14) {
    return "キッズ（同じ年齢で試合組みます。）";
  }

  if (age >= 15 && age <= 17) {
    return "ジュベニウ 15歳から17歳";
  }

  if (age >= 18 && age <= 29) {
    return "アダルト 18歳から29歳";
  }

  if (age >= 30 && age <= 35) {
    return "マスター1 30歳から35歳";
  }

  if (age >= 36 && age <= 40) {
    return "マスター2 36歳から40歳";
  }

  if (age >= 41 && age <= 45) {
    return "マスター3 41歳から45歳";
  }

  if (age >= 46 && age <= 50) {
    return "マスター4 46歳から50歳";
  }

  return "マスター5 51歳以上";
}

export function checkAgeCategory(
  { birthDate, ageCategory }: AgeCategoryCheckInput,
  referenceDate: Date,
): AgeCategoryCheckResult {
  const calculatedAge = calculateAgeOnDate(birthDate, referenceDate);

  if (calculatedAge === null) {
    return {
      isValid: false,
      calculatedAge: null,
      expectedAgeCategory: null,
    };
  }

  const expectedAgeCategory = getAgeCategoryForAge(calculatedAge);
  const normalizedAgeCategory = ageCategory.trim();

  return {
    isValid: expectedAgeCategory === normalizedAgeCategory,
    calculatedAge,
    expectedAgeCategory,
  };
}

export function buildAgeCategoryFieldErrors(
  applicants: AgeCategoryCheckInput[],
  referenceDate: Date,
  entryType: "individual" | "representative",
) {
  return applicants.flatMap((applicant, index) => {
    const result = checkAgeCategory(applicant, referenceDate);
    if (result.isValid) {
      return [];
    }

    const fieldPrefix = entryType === "representative" ? `athletes.${index}` : "";

    return [
      {
        field: fieldPrefix ? `${fieldPrefix}.birthDate` : "birthDate",
        message:
          "生年月日から計算した年齢と、選択された年齢カテゴリーが一致していません。",
        code: "age_category_mismatch",
        applicantIndex: index,
      },
      {
        field: fieldPrefix ? `${fieldPrefix}.ageCategory` : "ageCategory",
        message:
          "生年月日から計算した年齢と、選択された年齢カテゴリーが一致していません。",
        code: "age_category_mismatch",
        applicantIndex: index,
      },
    ];
  });
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
