// エントリーの部門（Gi / No-Gi）・カテゴリー・料金に関する共通設定。
// 選択肢は「カテゴリー一覧.xlsx」（シート: 申し込みフォーム）を基準にしている。
// フォーム、確認画面、API、管理画面、メールのすべてがこのファイルを参照する。

export const ENTRY_FORMAT_VERSION = 2;

export const DIVISIONS = ["gi", "nogi"] as const;
export type Division = (typeof DIVISIONS)[number];

export const DIVISION_LABELS: Record<Division, string> = {
  gi: "Gi",
  nogi: "No-Gi",
};

export const DIVISION_SELECTIONS = ["gi", "nogi", "both"] as const;
export type DivisionSelection = (typeof DIVISION_SELECTIONS)[number];

export const DIVISION_SELECTION_LABELS: Record<DivisionSelection, string> = {
  gi: "Giのみ",
  nogi: "No-Giのみ",
  both: "両方（Gi・No-Gi）",
};

export const ATHLETE_CLASSES = ["adult", "kids"] as const;
export type AthleteClass = (typeof ATHLETE_CLASSES)[number];

export const ATHLETE_CLASS_LABELS: Record<AthleteClass, string> = {
  adult: "大人",
  kids: "キッズ",
};

export const GENDER_LABELS: Record<string, string> = {
  male: "男性",
  female: "女性",
};

// ---------------------------------------------------------------------------
// 確定設定
// ---------------------------------------------------------------------------

// 無差別級の追加料金（Gi / No-Gi それぞれ 1 件あたり）。
// firestore.rules の openClassFee の検証値と揃えること。
export const OPEN_CLASS_FEE = 2000;

export const ADULT_WEIGHT_CLASSES = [
  "ルースター",
  "ライトフェザー",
  "フェザー",
  "ライト",
  "ミドル",
  "ミディアムヘビー",
  "ヘビー",
  "ウルトラヘビー",
] as const;

// 符号は Excel の表記どおり全角（CSV を Excel で開いたときに数式と解釈されないため）。
export const KIDS_WEIGHT_CLASSES = [
  "－27kg",
  "－34kg",
  "－41kg",
  "－48kg",
  "－55kg",
  "－62kg",
  "＋62kg",
] as const;

export const ADULT_BELTS = ["白", "青", "紫", "茶", "黒"] as const;
export const KIDS_BELTS = ["白", "灰", "黄", "オレンジ", "緑"] as const;

export const ADULT_GRADES = ["ビギナー", "アドバンス", "エキスパート"] as const;
export const KIDS_GRADES = ["ビギナー", "アドバンス"] as const;

// ---------------------------------------------------------------------------
// 暫定設定（クライアント確認待ち）
// ここにある値は仮の設定。確定したらこのブロックだけ書き換えれば、
// フォームの選択肢・サーバー側の年齢チェック・表示のすべてに反映される。
// ---------------------------------------------------------------------------

export type AgeCategoryRule = {
  label: string;
  minAge: number;
  // null は上限なし。
  maxAge: number | null;
  // true の場合、区分の上限より年上の選手も出場できる
  // （実年齢より若いカテゴリーへの出場を認める）。
  allowOlder: boolean;
};

export const PROVISIONAL_SETTINGS = {
  // 【暫定】年齢の算定日。従来の実装どおり「大会開催日時点の満年齢」とする。
  ageReferenceLabel: "大会開催日時点の満年齢",

  // 【暫定】キッズ用の階級表記。Gi / No-Gi とも「ユニフォーム込み」とする。
  kidsWeightNote: "ユニフォーム込み",

  // 【暫定】大人／キッズの境界。従来の実装（キッズ: 14歳以下、
  // ジュベニウ: 15〜17歳）を引き継いでいる。
  kidsMaxAge: 14,

  // 【暫定】大人の年齢区分。ジュブナイル〜マスター5の下限は従来の実装を
  // 引き継ぎ、マスター6（56歳以上）は Excel に年齢の記載がないための仮の値。
  // ジュブナイルは該当年齢の選手のみ。それ以外は実年齢より若い区分へ出場できる。
  adultAgeCategories: [
    { label: "ジュブナイル", minAge: 15, maxAge: 17, allowOlder: false },
    { label: "アダルト", minAge: 18, maxAge: 29, allowOlder: true },
    { label: "マスター1", minAge: 30, maxAge: 35, allowOlder: true },
    { label: "マスター2", minAge: 36, maxAge: 40, allowOlder: true },
    { label: "マスター3", minAge: 41, maxAge: 45, allowOlder: true },
    { label: "マスター4", minAge: 46, maxAge: 50, allowOlder: true },
    { label: "マスター5", minAge: 51, maxAge: 55, allowOlder: true },
    { label: "マスター6", minAge: 56, maxAge: null, allowOlder: true },
  ] as AgeCategoryRule[],

  // 【暫定】キッズの年齢区分。「U◯＝◯歳未満」と解釈した仮の値
  // （U15 の上限 14歳は、従来のキッズ／ジュベニウ境界と一致させている）。
  // キッズは実年齢に該当する区分のみ選択できる。
  kidsAgeCategories: [
    { label: "U5", minAge: 0, maxAge: 4, allowOlder: false },
    { label: "U7", minAge: 5, maxAge: 6, allowOlder: false },
    { label: "U9", minAge: 7, maxAge: 8, allowOlder: false },
    { label: "U11", minAge: 9, maxAge: 10, allowOlder: false },
    { label: "U15", minAge: 11, maxAge: 14, allowOlder: false },
  ] as AgeCategoryRule[],
};

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

// フォーム・API で受け渡す部門ごとの出場情報（すべて文字列）。
export type GiEntryInput = {
  ageCategory: string;
  weightClass: string;
  belt: string;
  openClass: string;
};

export type NogiEntryInput = {
  ageCategory: string;
  weightClass: string;
  grade: string;
  openClass: string;
};

export type AthleteInput = {
  name: string;
  kana: string;
  gender: string;
  birthDate: string;
  athleteClass: string;
  guardianName: string;
  divisionSelection: string;
  gi: GiEntryInput;
  nogi: NogiEntryInput;
};

// 保存用に正規化した部門ごとの出場情報。
export type GiEntry = {
  ageCategory: string;
  weightClass: string;
  belt: string;
  openClass: "yes" | "no";
};

export type NogiEntry = {
  ageCategory: string;
  weightClass: string;
  grade: string;
  openClass: "yes" | "no";
};

export type NormalizedAthlete = {
  name: string;
  kana: string;
  gender: string;
  birthDate: string;
  athleteClass: AthleteClass;
  guardianName: string;
  divisionSelection: DivisionSelection;
  // 出場しない部門は null。
  gi: GiEntry | null;
  nogi: NogiEntry | null;
};

export type AthleteIssue = {
  path: string[];
  message: string;
};

export const emptyGiEntryInput: GiEntryInput = {
  ageCategory: "",
  weightClass: "",
  belt: "",
  openClass: "",
};

export const emptyNogiEntryInput: NogiEntryInput = {
  ageCategory: "",
  weightClass: "",
  grade: "",
  openClass: "",
};

export const emptyAthleteInput: AthleteInput = {
  name: "",
  kana: "",
  gender: "",
  birthDate: "",
  athleteClass: "",
  guardianName: "",
  divisionSelection: "",
  gi: emptyGiEntryInput,
  nogi: emptyNogiEntryInput,
};

// ---------------------------------------------------------------------------
// 選択肢
// ---------------------------------------------------------------------------

export function isAthleteClass(value: unknown): value is AthleteClass {
  return value === "adult" || value === "kids";
}

export function isDivisionSelection(value: unknown): value is DivisionSelection {
  return value === "gi" || value === "nogi" || value === "both";
}

export function getSelectedDivisions(divisionSelection: unknown): Division[] {
  if (divisionSelection === "both") {
    return ["gi", "nogi"];
  }

  if (divisionSelection === "gi" || divisionSelection === "nogi") {
    return [divisionSelection];
  }

  return [];
}

export function getAgeCategoryRules(athleteClass: AthleteClass): AgeCategoryRule[] {
  return athleteClass === "kids"
    ? PROVISIONAL_SETTINGS.kidsAgeCategories
    : PROVISIONAL_SETTINGS.adultAgeCategories;
}

export function getCategoryOptions(athleteClass: AthleteClass) {
  const isKids = athleteClass === "kids";

  return {
    ageCategories: getAgeCategoryRules(athleteClass).map((rule) => rule.label),
    weightClasses: [...(isKids ? KIDS_WEIGHT_CLASSES : ADULT_WEIGHT_CLASSES)],
    belts: [...(isKids ? KIDS_BELTS : ADULT_BELTS)],
    grades: [...(isKids ? KIDS_GRADES : ADULT_GRADES)],
    // 無差別級は大人のみ。
    hasOpenClass: !isKids,
    weightClassLabel: isKids
      ? `階級（${PROVISIONAL_SETTINGS.kidsWeightNote}）`
      : "階級",
  };
}

export function formatAgeRange(rule: AgeCategoryRule) {
  if (rule.maxAge === null) {
    return `${rule.minAge}歳以上`;
  }

  if (rule.minAge <= 0) {
    return `${rule.maxAge}歳以下`;
  }

  return `${rule.minAge}〜${rule.maxAge}歳`;
}

// ---------------------------------------------------------------------------
// 入力チェック・正規化
// ---------------------------------------------------------------------------

// 部門・区分の選択に応じた必須チェック。出場しない部門の項目は検証しない。
export function validateAthleteInput(athlete: AthleteInput): AthleteIssue[] {
  const issues: AthleteIssue[] = [];

  if (!isDivisionSelection(athlete.divisionSelection)) {
    issues.push({
      path: ["divisionSelection"],
      message: "出場部門を選択してください。",
    });
  }

  if (!isAthleteClass(athlete.athleteClass)) {
    issues.push({
      path: ["athleteClass"],
      message: "大人／キッズを選択してください。",
    });
    return issues;
  }

  const options = getCategoryOptions(athlete.athleteClass);

  if (athlete.athleteClass === "kids" && !athlete.guardianName.trim()) {
    issues.push({
      path: ["guardianName"],
      message: "保護者氏名を入力してください。",
    });
  }

  for (const division of getSelectedDivisions(athlete.divisionSelection)) {
    const entry = athlete[division];
    const label = DIVISION_LABELS[division];

    if (!options.ageCategories.includes(entry.ageCategory)) {
      issues.push({
        path: [division, "ageCategory"],
        message: `${label}の年齢区分を選択してください。`,
      });
    }

    if (!(options.weightClasses as string[]).includes(entry.weightClass)) {
      issues.push({
        path: [division, "weightClass"],
        message: `${label}の階級を選択してください。`,
      });
    }

    if (division === "gi") {
      if (!(options.belts as string[]).includes(athlete.gi.belt)) {
        issues.push({
          path: ["gi", "belt"],
          message: "帯色を選択してください。",
        });
      }
    } else if (!(options.grades as string[]).includes(athlete.nogi.grade)) {
      issues.push({
        path: ["nogi", "grade"],
        message: "グレードを選択してください。",
      });
    }

    if (options.hasOpenClass && entry.openClass !== "yes" && entry.openClass !== "no") {
      issues.push({
        path: [division, "openClass"],
        message: `${label}の無差別級への参加・不参加を選択してください。`,
      });
    }
  }

  return issues;
}

function resolveOpenClass(athleteClass: AthleteClass, openClass: string) {
  return athleteClass === "adult" && openClass === "yes" ? "yes" : "no";
}

// 検証済みの入力を保存用に正規化する。
// 出場しない部門は null、キッズの無差別級は常に "no"、大人の保護者氏名は空にして、
// 選択していない情報が保存や課金に混入しないようにする。
export function normalizeAthlete(athlete: AthleteInput): NormalizedAthlete | null {
  if (
    !isAthleteClass(athlete.athleteClass) ||
    !isDivisionSelection(athlete.divisionSelection)
  ) {
    return null;
  }

  const athleteClass = athlete.athleteClass;
  const divisions = getSelectedDivisions(athlete.divisionSelection);

  return {
    name: athlete.name.trim(),
    kana: athlete.kana.trim(),
    gender: athlete.gender,
    birthDate: athlete.birthDate,
    athleteClass,
    guardianName: athleteClass === "kids" ? athlete.guardianName.trim() : "",
    divisionSelection: athlete.divisionSelection,
    gi: divisions.includes("gi")
      ? {
          ageCategory: athlete.gi.ageCategory,
          weightClass: athlete.gi.weightClass,
          belt: athlete.gi.belt,
          openClass: resolveOpenClass(athleteClass, athlete.gi.openClass),
        }
      : null,
    nogi: divisions.includes("nogi")
      ? {
          ageCategory: athlete.nogi.ageCategory,
          weightClass: athlete.nogi.weightClass,
          grade: athlete.nogi.grade,
          openClass: resolveOpenClass(athleteClass, athlete.nogi.openClass),
        }
      : null,
  };
}

// フォームの入力値から、出場しない部門・対象外の項目を消したものを返す。
// 下書き保存・API 送信の前に通す。
export function sanitizeAthleteInput(athlete: AthleteInput): AthleteInput {
  const normalized = normalizeAthlete(athlete);

  if (!normalized) {
    return athlete;
  }

  return {
    name: normalized.name,
    kana: normalized.kana,
    gender: normalized.gender,
    birthDate: normalized.birthDate,
    athleteClass: normalized.athleteClass,
    guardianName: normalized.guardianName,
    divisionSelection: normalized.divisionSelection,
    gi: normalized.gi ?? emptyGiEntryInput,
    nogi: normalized.nogi ?? emptyNogiEntryInput,
  };
}

// ---------------------------------------------------------------------------
// 年齢チェック
// ---------------------------------------------------------------------------

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

export function isAgeCategoryAllowed(rule: AgeCategoryRule, age: number) {
  if (age < rule.minAge) {
    return false;
  }

  if (rule.maxAge === null || age <= rule.maxAge) {
    return true;
  }

  return rule.allowOlder;
}

// 指定した年齢の選手が選択できる年齢区分。
// 年上の出場を認めない区分（ジュブナイル）に該当する年齢の選手は、
// その区分のみ選択できる。
export function getAllowedAgeCategories(athleteClass: AthleteClass, age: number) {
  const rules = getAgeCategoryRules(athleteClass);
  const exclusiveRule = rules.find(
    (rule) =>
      !rule.allowOlder &&
      age >= rule.minAge &&
      (rule.maxAge === null || age <= rule.maxAge),
  );

  if (exclusiveRule) {
    return [exclusiveRule.label];
  }

  return rules
    .filter((rule) => isAgeCategoryAllowed(rule, age))
    .map((rule) => rule.label);
}

// 大会開催日時点の年齢と、大人／キッズ・年齢区分の整合を確認する。
export function checkAthleteAge(
  athlete: NormalizedAthlete,
  referenceDate: Date,
): AthleteIssue[] {
  const age = calculateAgeOnDate(athlete.birthDate, referenceDate);

  if (age === null) {
    return [
      {
        path: ["birthDate"],
        message: "生年月日を正しく入力してください。",
      },
    ];
  }

  const { kidsMaxAge } = PROVISIONAL_SETTINGS;

  if (athlete.athleteClass === "kids" && age > kidsMaxAge) {
    return [
      {
        path: ["athleteClass"],
        message: `大会当日の年齢（${age}歳）ではキッズに出場できません。キッズは${kidsMaxAge}歳以下が対象です。「大人」を選択してください。`,
      },
    ];
  }

  if (athlete.athleteClass === "adult" && age <= kidsMaxAge) {
    return [
      {
        path: ["athleteClass"],
        message: `大会当日の年齢（${age}歳）では大人の部に出場できません。${kidsMaxAge}歳以下の選手は「キッズ」を選択してください。`,
      },
    ];
  }

  const allowed = getAllowedAgeCategories(athlete.athleteClass, age);
  const issues: AthleteIssue[] = [];

  for (const division of getSelectedDivisions(athlete.divisionSelection)) {
    const entry = athlete[division];

    if (entry && !allowed.includes(entry.ageCategory)) {
      issues.push({
        path: [division, "ageCategory"],
        message: `${DIVISION_LABELS[division]}の年齢区分「${entry.ageCategory}」は、大会当日の年齢（${age}歳）では選択できません。選択できる区分: ${allowed.join("、") || "なし"}`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 料金
// ---------------------------------------------------------------------------

type FeeAthlete = {
  athleteClass: string;
  divisionSelection: string;
  gi: { openClass: string } | null;
  nogi: { openClass: string } | null;
};

export type AthleteFee = {
  divisions: Division[];
  openClassDivisions: Division[];
  divisionSubtotal: number;
  openClassSubtotal: number;
  total: number;
};

export type EntryFeeSummary = {
  entryFee: number;
  openClassFee: number;
  athletes: AthleteFee[];
  divisionEntryCount: number;
  openClassEntryCount: number;
  divisionSubtotal: number;
  openClassSubtotal: number;
  totalAmount: number;
};

// 参加費 × 出場部門数 ＋ 無差別級 2,000円 × 参加数。
// 選択されていない部門・キッズの無差別級は数えない。
export function calculateEntryFees(
  entryFee: number,
  athletes: FeeAthlete[],
): EntryFeeSummary {
  const athleteFees = athletes.map((athlete): AthleteFee => {
    const divisions = getSelectedDivisions(athlete.divisionSelection);
    const openClassDivisions =
      athlete.athleteClass === "adult"
        ? divisions.filter((division) => athlete[division]?.openClass === "yes")
        : [];
    const divisionSubtotal = entryFee * divisions.length;
    const openClassSubtotal = OPEN_CLASS_FEE * openClassDivisions.length;

    return {
      divisions,
      openClassDivisions,
      divisionSubtotal,
      openClassSubtotal,
      total: divisionSubtotal + openClassSubtotal,
    };
  });

  const divisionEntryCount = athleteFees.reduce(
    (sum, fee) => sum + fee.divisions.length,
    0,
  );
  const openClassEntryCount = athleteFees.reduce(
    (sum, fee) => sum + fee.openClassDivisions.length,
    0,
  );

  return {
    entryFee,
    openClassFee: OPEN_CLASS_FEE,
    athletes: athleteFees,
    divisionEntryCount,
    openClassEntryCount,
    divisionSubtotal: entryFee * divisionEntryCount,
    openClassSubtotal: OPEN_CLASS_FEE * openClassEntryCount,
    totalAmount: entryFee * divisionEntryCount + OPEN_CLASS_FEE * openClassEntryCount,
  };
}

// ---------------------------------------------------------------------------
// 表示
// ---------------------------------------------------------------------------

export function getGenderLabel(gender: string) {
  return GENDER_LABELS[gender] ?? gender;
}

export function getOpenClassLabel(openClass: string) {
  return openClass === "yes" ? "参加" : "不参加";
}

// 例: 「Gi / 大人 / アダルト / ライト / 青帯 / 無差別級 参加」
export function describeDivisionEntry(
  athlete: Pick<NormalizedAthlete, "athleteClass" | "gi" | "nogi">,
  division: Division,
) {
  const entry = athlete[division];

  if (!entry) {
    return "";
  }

  const parts = [
    DIVISION_LABELS[division],
    ATHLETE_CLASS_LABELS[athlete.athleteClass],
    entry.ageCategory,
    entry.weightClass,
    division === "gi" ? `${athlete.gi?.belt ?? ""}帯` : (athlete.nogi?.grade ?? ""),
  ];

  if (athlete.athleteClass === "adult") {
    parts.push(`無差別級 ${getOpenClassLabel(entry.openClass)}`);
  }

  return parts.join(" / ");
}

export function describeAthleteEntries(
  athlete: Pick<
    NormalizedAthlete,
    "athleteClass" | "divisionSelection" | "gi" | "nogi"
  >,
) {
  return getSelectedDivisions(athlete.divisionSelection)
    .map((division) => describeDivisionEntry(athlete, division))
    .filter(Boolean);
}

// 旧形式から引き継いでいるトップレベル項目（category など）に入れる要約。
// Firestore ルールがこれらの項目を必須にしているため、新形式でも保存する。
export function buildLegacySummaryFields(athlete: NormalizedAthlete) {
  const divisions = getSelectedDivisions(athlete.divisionSelection);
  const join = (pick: (division: Division) => string) =>
    divisions
      .map((division) => `${DIVISION_LABELS[division]}: ${pick(division)}`)
      .join(" / ");

  return {
    category: join((division) =>
      division === "gi" ? `${athlete.gi?.belt ?? ""}帯` : (athlete.nogi?.grade ?? ""),
    ),
    ageCategory: join((division) => athlete[division]?.ageCategory ?? ""),
    weightClass: join((division) => athlete[division]?.weightClass ?? ""),
    openClass: divisions.some((division) => athlete[division]?.openClass === "yes")
      ? ("yes" as const)
      : ("no" as const),
  };
}

// メール・決済メタデータ用の出場内容の要約（1 行 = 1 部門）。
// 代表者エントリーでは「選手1」のように番号を付ける（氏名は含めない）。
export function buildEntrySummaryLines(
  athletes: NormalizedAthlete[],
  options: { numbered: boolean },
) {
  return athletes.flatMap((athlete, index) =>
    describeAthleteEntries(athlete).map((line) =>
      options.numbered ? `選手${index + 1}: ${line}` : line,
    ),
  );
}
