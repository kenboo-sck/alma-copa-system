// 一般公開用のエントリーリスト。
// 公開するのは「エントリーカテゴリー（性別を含む）」「所属」「名前」の 3 項目だけ。
// 保存済みエントリーから、この 3 項目以外を含まない形に組み立てる。
// メール・電話番号・生年月日・住所・支払情報・管理者メモなどはここで捨て、
// 画面にも API の応答にも渡さない。

import {
  ADULT_BELTS,
  ADULT_GRADES,
  ADULT_WEIGHT_CLASSES,
  ATHLETE_CLASS_LABELS,
  KIDS_BELTS,
  KIDS_GRADES,
  KIDS_WEIGHT_CLASSES,
  PROVISIONAL_SETTINGS,
  type AthleteClass,
} from "./entry-divisions";
import {
  ATHLETE_GENDER_LABELS,
  ATHLETE_GENDERS,
  getAgeCategoryLabel,
  getAthleteGender,
  getRankLabel,
  getWeightClassLabel,
  mapEntryAthletes,
  type AthleteGender,
  type DivisionEntryRecord,
  type RecordDivision,
} from "./entry-records";

export type PublicEntryListAthlete = {
  name: string;
  gym: string;
};

export type PublicEntryListCategory = {
  // 並び替え・React の key 用。表示名と同じ内容から作る。
  key: string;
  division: RecordDivision;
  divisionLabel: string;
  // 選手ごとに保存された性別（male / female 以外は "unset"）。
  gender: AthleteGender;
  genderLabel: string;
  // 例: 「男性 / 大人 / アダルト / 白帯 / ライト」「女性 / 大人 / アダルト / 白帯 / 無差別級」
  label: string;
  // label を区切りごとに分けたもの（先頭は性別）。画面で区切りの位置で折り返すために使う。
  labelParts: string[];
  athletes: PublicEntryListAthlete[];
};

export type PublicEntryList = {
  eventId: string;
  eventTitle: string;
  // 掲載している選手の人数（複数カテゴリーに出場する選手も 1 人と数える）。
  athleteCount: number;
  categories: PublicEntryListCategory[];
};

export const PUBLIC_DIVISION_LABELS: Record<RecordDivision, string> = {
  gi: "Gi",
  nogi: "No-Gi",
  legacy: "部門区別なし",
};

const OPEN_CLASS_LABEL = "無差別級";

type DataRecord = Record<string, unknown>;
type ToDate = (value: unknown) => Date | null;

function isRecord(value: unknown): value is DataRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimmed(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// 大会のエントリーリストを一般公開してよいか。
// 公開中（published）かつ削除されておらず、公開設定が明示的に true の大会だけ。
// 設定のない既存の大会は非公開として扱う。
export function isEntryListPublic(eventData: unknown) {
  return (
    isRecord(eventData) &&
    eventData.status === "published" &&
    !eventData.deletedAt &&
    eventData.entryListPublic === true
  );
}

// 掲載の対象にする申込。受付済み（confirmed）の申込だけを対象にし、支払状況は見ない。
// カード決済の手続き中（pending_payment）・キャンセル・期限切れ・返金済みは掲載しない。
export function isListableEntry(entryData: DataRecord) {
  return entryData.entryStatus === "confirmed";
}

// 所属は申込単位で入力される（代表者申込では全選手に共通）。
function getEntryGym(entryData: DataRecord) {
  const gym = trimmed(entryData.gym);
  if (gym) {
    return gym;
  }

  return isRecord(entryData.representative)
    ? trimmed(entryData.representative.gym)
    : "";
}

// ---------------------------------------------------------------------------
// カテゴリー名と並び順
// ---------------------------------------------------------------------------

const DIVISION_ORDER: RecordDivision[] = ["gi", "nogi", "legacy"];

function orderOf(list: readonly string[], value: string) {
  const index = list.indexOf(value);
  return index === -1 ? list.length : index;
}

function ageCategoryOrder(athleteClass: AthleteClass | null, ageCategory: string) {
  const rules =
    athleteClass === "kids"
      ? PROVISIONAL_SETTINGS.kidsAgeCategories
      : PROVISIONAL_SETTINGS.adultAgeCategories;
  return orderOf(
    rules.map((rule) => rule.label),
    ageCategory,
  );
}

function rankOrder(entry: DivisionEntryRecord) {
  const isKids = entry.athleteClass === "kids";

  if (entry.division === "gi") {
    return orderOf(isKids ? KIDS_BELTS : ADULT_BELTS, entry.belt);
  }

  if (entry.division === "nogi") {
    return orderOf(isKids ? KIDS_GRADES : ADULT_GRADES, entry.grade);
  }

  return orderOf(["ビギナー", "アドバンス", "エキスパート"], entry.legacyCategory);
}

function weightOrder(entry: DivisionEntryRecord, isOpenClass: boolean) {
  const weights: readonly string[] =
    entry.athleteClass === "kids" ? KIDS_WEIGHT_CLASSES : ADULT_WEIGHT_CLASSES;

  // 無差別級は同じ区分の各階級の後に並べる。
  return isOpenClass ? weights.length + 1 : orderOf(weights, entry.weightClass);
}

function publicRankLabel(entry: DivisionEntryRecord) {
  if (entry.division === "legacy") {
    return entry.legacyCategory.trim() || "未設定";
  }

  return getRankLabel(entry);
}

type CategoryDescriptor = {
  key: string;
  division: RecordDivision;
  gender: AthleteGender;
  label: string;
  labelParts: string[];
  sortKey: (number | string)[];
};

// 性別は申込者ではなく、選手ごとに保存された値で分ける（氏名などから推測しない）。
function describeCategory(
  entry: DivisionEntryRecord,
  gender: AthleteGender,
  isOpenClass: boolean,
): CategoryDescriptor {
  const parts: string[] = [ATHLETE_GENDER_LABELS[gender]];

  if (entry.athleteClass) {
    parts.push(ATHLETE_CLASS_LABELS[entry.athleteClass]);
  }

  const ageLabel = getAgeCategoryLabel(entry);
  const rankLabel = publicRankLabel(entry);
  const weightLabel = isOpenClass ? OPEN_CLASS_LABEL : getWeightClassLabel(entry);
  parts.push(ageLabel, rankLabel, weightLabel);

  const label = parts.join(" / ");

  return {
    key: `${entry.division}|${label}`,
    division: entry.division,
    gender,
    label,
    labelParts: parts,
    // 部門の中で男性 → 女性 → 未設定の順にまとめて並べるよう、性別は部門の次に比べる。
    sortKey: [
      DIVISION_ORDER.indexOf(entry.division),
      ATHLETE_GENDERS.indexOf(gender),
      entry.athleteClass === "adult" ? 0 : entry.athleteClass === "kids" ? 1 : 2,
      ageCategoryOrder(entry.athleteClass, entry.ageCategory),
      ageLabel,
      rankOrder(entry),
      rankLabel,
      weightOrder(entry, isOpenClass),
      weightLabel,
    ],
  };
}

function compareSortKeys(a: (number | string)[], b: (number | string)[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index];
    const right = b[index];

    if (left === right) {
      continue;
    }

    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }

    return String(left).localeCompare(String(right), "ja");
  }

  return 0;
}

// ---------------------------------------------------------------------------
// 組み立て
// ---------------------------------------------------------------------------

type ListedAthlete = PublicEntryListAthlete & { sortName: string };

export type EntryListSource = {
  id: string;
  data: DataRecord;
};

// 申込の一覧から、カテゴリー別の公開エントリーリストを組み立てる。
// ・代表者申込は、代表者ではなく出場選手ごとに掲載する。
// ・カテゴリーは性別ごとに分ける。性別は選手ごとに判定し、未保存の旧形式は「未設定」にする。
// ・複数部門・無差別級に出場する選手は、該当する各カテゴリーに掲載する。
// ・取消済みの申込・選手・部門は掲載しない。
export function buildPublicEntryList(
  event: { id: string; title: string },
  entries: EntryListSource[],
  toDate: ToDate,
): PublicEntryList {
  const categories = new Map<
    string,
    CategoryDescriptor & { athletes: ListedAthlete[] }
  >();
  const listedAthleteKeys = new Set<string>();

  for (const entry of entries) {
    if (!isListableEntry(entry.data)) {
      continue;
    }

    const gym = getEntryGym(entry.data);

    for (const athlete of mapEntryAthletes(entry.data, toDate)) {
      const name = athlete.name.trim();
      const gender = getAthleteGender(athlete.gender);

      if (athlete.status !== "active" || !name) {
        continue;
      }

      // 読み仮名は並び替えにだけ使い、公開データには含めない。
      const listed: ListedAthlete = {
        name,
        gym,
        sortName: athlete.kana.trim() || name,
      };

      for (const divisionEntry of athlete.divisionEntries) {
        if (divisionEntry.status !== "active") {
          continue;
        }

        const targets = [describeCategory(divisionEntry, gender, false)];

        // キッズには無差別級がない。
        if (
          divisionEntry.openClass === "yes" &&
          divisionEntry.athleteClass !== "kids"
        ) {
          targets.push(describeCategory(divisionEntry, gender, true));
        }

        for (const target of targets) {
          const category = categories.get(target.key) ?? { ...target, athletes: [] };
          category.athletes.push(listed);
          categories.set(target.key, category);
        }

        listedAthleteKeys.add(`${entry.id}#${athlete.athleteIndex ?? "self"}`);
      }
    }
  }

  const sortedCategories = [...categories.values()].sort((a, b) =>
    compareSortKeys(a.sortKey, b.sortKey),
  );

  return {
    eventId: event.id,
    eventTitle: event.title,
    athleteCount: listedAthleteKeys.size,
    categories: sortedCategories.map((category) => ({
      key: category.key,
      division: category.division,
      divisionLabel: PUBLIC_DIVISION_LABELS[category.division],
      gender: category.gender,
      genderLabel: ATHLETE_GENDER_LABELS[category.gender],
      label: category.label,
      labelParts: category.labelParts,
      // 公開する項目（名前・所属）だけを新しいオブジェクトに詰め直す。
      athletes: [...category.athletes]
        .sort(
          (a, b) =>
            a.sortName.localeCompare(b.sortName, "ja") ||
            a.gym.localeCompare(b.gym, "ja"),
        )
        .map(({ name, gym }) => ({ name, gym })),
    })),
  };
}
