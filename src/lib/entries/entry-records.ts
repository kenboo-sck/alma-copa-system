// 保存済みエントリー（Firestore のドキュメント）を、管理画面・CSV 用の
// 「選手ごと・部門ごと」の形に読み替える。新形式と旧形式の両方を扱う。
// 旧形式には Gi / No-Gi の区別がないため、推測で振り分けず「旧形式」として扱う。

import {
  ATHLETE_CLASS_LABELS,
  DIVISION_LABELS,
  getOpenClassLabel,
  getSelectedDivisions,
  isAthleteClass,
  isDivisionSelection,
  type AthleteClass,
  type Division,
} from "./entry-divisions";

export type RecordDivision = Division | "legacy";

export const RECORD_DIVISION_LABELS: Record<RecordDivision, string> = {
  ...DIVISION_LABELS,
  legacy: "旧形式（部門区別なし）",
};

export const UNSET_LABEL = "未設定";

export type DivisionEntryRecord = {
  division: RecordDivision;
  // 旧形式には大人／キッズの区別がないため null。
  athleteClass: AthleteClass | null;
  ageCategory: string;
  weightClass: string;
  // Gi のみ。
  belt: string;
  // No-Gi のみ。
  grade: string;
  // 旧形式の「カテゴリー」（エキスパート / アドバンス / ビギナー）。
  legacyCategory: string;
  openClass: "yes" | "no";
  // 取消済みの出場（部門・選手・申込のいずれかが取消）は "cancelled"。削除はしない。
  status: RecordStatus;
  cancelledAt: Date | null;
};

export type RecordStatus = "active" | "cancelled";

export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  active: "有効",
  cancelled: "取消済み",
};

export type AthleteRecord = {
  // 代表者エントリーの選手番号（0 始まり）。個人エントリーは null。
  athleteIndex: number | null;
  format: "v2" | "legacy";
  name: string;
  kana: string;
  gender: string;
  birthDate: Date | null;
  guardianName: string;
  // 選手または申込全体が取消済みの場合は "cancelled"。
  status: RecordStatus;
  cancelledAt: Date | null;
  divisionEntries: DivisionEntryRecord[];
};

// 申込・選手・部門のどれかが取消済みかどうかと、その日時。
type CancelContext = { isCancelled: boolean; cancelledAt: Date | null };

function readCancel(
  value: unknown,
  parent: CancelContext,
  toDate: ToDate,
): CancelContext {
  if (parent.isCancelled) {
    return parent;
  }

  if (isRecord(value) && value.status === "cancelled") {
    return { isCancelled: true, cancelledAt: toDate(value.cancelledAt) };
  }

  return parent;
}

function toStatus(context: CancelContext) {
  return {
    status: (context.isCancelled ? "cancelled" : "active") as RecordStatus,
    cancelledAt: context.cancelledAt,
  };
}

type DataRecord = Record<string, unknown>;
type ToDate = (value: unknown) => Date | null;

function isRecord(value: unknown): value is DataRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(data: DataRecord, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function toOpenClass(value: unknown) {
  return value === "yes" ? "yes" : "no";
}

// 旧形式の代表者エントリーでは生年月日が "YYYY-MM-DD" の文字列で保存されている。
function parseBirthDate(value: unknown, toDate: ToDate) {
  const converted = toDate(value);
  if (converted) {
    return converted;
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isV2Athlete(athlete: DataRecord) {
  return (
    isAthleteClass(athlete.athleteClass) &&
    isDivisionSelection(athlete.divisionSelection)
  );
}

function mapV2Athlete(
  athlete: DataRecord,
  athleteIndex: number | null,
  toDate: ToDate,
  entryCancel: CancelContext,
): AthleteRecord {
  const athleteClass = athlete.athleteClass as AthleteClass;
  const divisionEntries: DivisionEntryRecord[] = [];
  const athleteCancel = readCancel(athlete, entryCancel, toDate);

  for (const division of getSelectedDivisions(athlete.divisionSelection)) {
    const entry = athlete[division];

    // 出場する部門の情報だけを読む。
    if (!isRecord(entry)) {
      continue;
    }

    divisionEntries.push({
      division,
      athleteClass,
      ageCategory: stringField(entry, "ageCategory"),
      weightClass: stringField(entry, "weightClass"),
      belt: division === "gi" ? stringField(entry, "belt") : "",
      grade: division === "nogi" ? stringField(entry, "grade") : "",
      legacyCategory: "",
      openClass: toOpenClass(entry.openClass),
      ...toStatus(readCancel(entry, athleteCancel, toDate)),
    });
  }

  return {
    athleteIndex,
    format: "v2",
    name: stringField(athlete, "name"),
    kana: stringField(athlete, "kana"),
    gender: stringField(athlete, "gender"),
    birthDate: parseBirthDate(athlete.birthDate, toDate),
    guardianName: stringField(athlete, "guardianName"),
    ...toStatus(athleteCancel),
    divisionEntries,
  };
}

function mapLegacyAthlete(
  athlete: DataRecord,
  athleteIndex: number | null,
  toDate: ToDate,
  entryCancel: CancelContext,
): AthleteRecord {
  // 旧形式の個人申込はドキュメント自体が選手情報のため、選手単位の取消は読まない。
  const athleteCancel =
    athleteIndex === null ? entryCancel : readCancel(athlete, entryCancel, toDate);

  return {
    athleteIndex,
    format: "legacy",
    name: stringField(athlete, "name"),
    kana: stringField(athlete, "kana"),
    gender: stringField(athlete, "gender"),
    birthDate: parseBirthDate(athlete.birthDate, toDate),
    guardianName: "",
    ...toStatus(athleteCancel),
    divisionEntries: [
      {
        division: "legacy",
        athleteClass: null,
        ageCategory: stringField(athlete, "ageCategory"),
        weightClass: stringField(athlete, "weightClass"),
        belt: "",
        grade: "",
        legacyCategory: stringField(athlete, "category"),
        openClass: toOpenClass(athlete.openClass),
        ...toStatus(athleteCancel),
      },
    ],
  };
}

function mapAthlete(
  athlete: DataRecord,
  athleteIndex: number | null,
  toDate: ToDate,
  entryCancel: CancelContext,
) {
  return isV2Athlete(athlete)
    ? mapV2Athlete(athlete, athleteIndex, toDate, entryCancel)
    : mapLegacyAthlete(athlete, athleteIndex, toDate, entryCancel);
}

// エントリー 1 件から選手の一覧を取り出す。
// 取消済みの選手・部門も、状態付きで含める（一覧・CSV で確認できるようにするため）。
// 人数の集計や受付の対象にするのは status が "active" のものだけ。
export function mapEntryAthletes(data: DataRecord, toDate: ToDate): AthleteRecord[] {
  const entryCancel: CancelContext =
    data.entryStatus === "cancelled"
      ? { isCancelled: true, cancelledAt: toDate(data.cancelledAt) }
      : { isCancelled: false, cancelledAt: null };

  if (data.entryType === "representative" && Array.isArray(data.athletes)) {
    const athletes = data.athletes.filter(isRecord);

    if (athletes.length > 0) {
      return athletes.map((athlete, index) =>
        mapAthlete(athlete, index, toDate, entryCancel),
      );
    }
  }

  if (isRecord(data.athlete) && isV2Athlete(data.athlete)) {
    return [mapV2Athlete(data.athlete, null, toDate, entryCancel)];
  }

  // 旧形式の個人エントリーは、選手情報がドキュメント直下にある。
  return [mapLegacyAthlete(data, null, toDate, entryCancel)];
}

// ---------------------------------------------------------------------------
// 表示・絞り込み
// ---------------------------------------------------------------------------

export function getAthleteClassLabel(entry: DivisionEntryRecord) {
  return entry.athleteClass
    ? ATHLETE_CLASS_LABELS[entry.athleteClass]
    : "区分なし（旧形式）";
}

// 帯色（Gi）／グレード（No-Gi）／旧形式のカテゴリー。
export function getRankLabel(entry: DivisionEntryRecord) {
  if (entry.division === "gi") {
    return entry.belt ? `${entry.belt}帯` : UNSET_LABEL;
  }

  if (entry.division === "nogi") {
    return entry.grade || UNSET_LABEL;
  }

  return entry.legacyCategory ? `${entry.legacyCategory}（旧形式）` : UNSET_LABEL;
}

export function getWeightClassLabel(entry: DivisionEntryRecord) {
  return entry.weightClass.trim() || UNSET_LABEL;
}

export function getAgeCategoryLabel(entry: DivisionEntryRecord) {
  return entry.ageCategory.trim() || UNSET_LABEL;
}

// 選手の性別（絞り込み・グループ分け用）。各選手に保存された値だけで判定し、氏名などから推測しない。
// male / female 以外（未保存の旧形式、空欄、"other" など）は「未設定」として扱う。
export const ATHLETE_GENDERS = ["male", "female", "unset"] as const;
export type AthleteGender = (typeof ATHLETE_GENDERS)[number];

export const ATHLETE_GENDER_LABELS: Record<AthleteGender, string> = {
  male: "男性",
  female: "女性",
  unset: UNSET_LABEL,
};

export function getAthleteGender(gender: string): AthleteGender {
  return gender === "male" || gender === "female" ? gender : "unset";
}

// 一覧・CSV の表示。male / female 以外の値が保存されている場合は、その値も併記する。
export function getAthleteGenderLabel(gender: string) {
  const key = getAthleteGender(gender);
  const raw = gender.trim();
  return key === "unset" && raw
    ? `${UNSET_LABEL}（${raw}）`
    : ATHLETE_GENDER_LABELS[key];
}

// 部門・階級別表示の見出し。例: 「Gi / ライト」
export function getDivisionWeightGroupLabel(entry: DivisionEntryRecord) {
  return `${RECORD_DIVISION_LABELS[entry.division]} / ${getWeightClassLabel(entry)}`;
}

// 一覧に表示する 1 部門分の要約。
export function describeDivisionEntryRecord(entry: DivisionEntryRecord) {
  const parts = [RECORD_DIVISION_LABELS[entry.division]];

  if (entry.athleteClass) {
    parts.push(ATHLETE_CLASS_LABELS[entry.athleteClass]);
  }

  parts.push(
    getAgeCategoryLabel(entry),
    getWeightClassLabel(entry),
    getRankLabel(entry),
  );

  // キッズには無差別級がない。
  if (entry.athleteClass !== "kids") {
    parts.push(`無差別級 ${getOpenClassLabel(entry.openClass)}`);
  }

  return parts.join(" / ");
}

export type DivisionEntryFilters = {
  division: "all" | RecordDivision;
  athleteClass: "all" | AthleteClass | "legacy";
  ageCategory: string;
  weightClass: string;
  rank: string;
  openClass: "all" | "yes" | "no";
};

export const emptyDivisionEntryFilters: DivisionEntryFilters = {
  division: "all",
  athleteClass: "all",
  ageCategory: "all",
  weightClass: "all",
  rank: "all",
  openClass: "all",
};

// すべての条件を「同じ 1 部門」が満たす場合だけ一致とする
// （Gi の階級と No-Gi の帯色のような組み合わせで誤って一致させない）。
export function matchesDivisionEntryFilters(
  entry: DivisionEntryRecord,
  filters: DivisionEntryFilters,
) {
  return (
    (filters.division === "all" || entry.division === filters.division) &&
    (filters.athleteClass === "all" ||
      (entry.athleteClass ?? "legacy") === filters.athleteClass) &&
    (filters.ageCategory === "all" ||
      getAgeCategoryLabel(entry) === filters.ageCategory) &&
    (filters.weightClass === "all" ||
      getWeightClassLabel(entry) === filters.weightClass) &&
    (filters.rank === "all" || getRankLabel(entry) === filters.rank) &&
    (filters.openClass === "all" || entry.openClass === filters.openClass)
  );
}

// CSV の出場情報列。見出しは DIVISION_CSV_HEADERS と同じ並び。
export const DIVISION_CSV_HEADERS = [
  "性別",
  "保護者氏名",
  "部門",
  "大人/キッズ",
  "年齢区分",
  "階級",
  "帯色",
  "グレード",
  "無差別級",
  "カテゴリ（旧形式）",
  "出場状態",
  "取消日時",
];

export function buildDivisionCsvCells(
  athlete: Pick<AthleteRecord, "gender" | "guardianName">,
  entry: DivisionEntryRecord,
) {
  return [
    getAthleteGenderLabel(athlete.gender),
    athlete.guardianName,
    RECORD_DIVISION_LABELS[entry.division],
    entry.athleteClass ? ATHLETE_CLASS_LABELS[entry.athleteClass] : "",
    entry.ageCategory,
    entry.weightClass,
    entry.belt,
    entry.grade,
    // キッズには無差別級がないため空欄にする。
    entry.athleteClass === "kids" ? "" : getOpenClassLabel(entry.openClass),
    entry.legacyCategory,
    RECORD_STATUS_LABELS[entry.status],
    entry.cancelledAt
      ? new Intl.DateTimeFormat("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(entry.cancelledAt)
      : "",
  ];
}
