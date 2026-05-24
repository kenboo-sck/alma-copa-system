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

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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
