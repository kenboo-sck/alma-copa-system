import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  ENTRY_HISTORY_COLLECTION,
  LEDGER_METHOD_LABELS,
  OPEN_CLASS_FEE,
  getActiveDivisions,
  getStoredAthletes,
  isCancelledItem,
  isEntryCancelled,
  isRecord,
  isV2StoredAthlete,
  readEntryAccounting,
  readUnitPrice,
  summarizeActiveEntry,
  type EntryAccounting,
  type ManualPaymentMethod,
} from "@/lib/entries/entry-accounting";
import type { AthleteInputValues } from "@/lib/entries/entry-athlete-schema";
import {
  ATHLETE_CLASS_LABELS,
  DIVISION_LABELS,
  buildLegacySummaryFields,
  checkAthleteAge,
  describeAthleteEntries,
  describeDivisionEntry,
  getCategoryOptions,
  normalizeAthlete,
  type AthleteClass,
  type Division,
  type NormalizedAthlete,
} from "@/lib/entries/entry-divisions";
import {
  accountingFields,
  ensureAccountingInitialized,
  recalculate,
  writeLedgerRecord,
  type LedgerRecordInput,
} from "@/lib/entries/entry-ledger";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { collections } from "@/lib/firebase/collections";
import { toDate } from "@/features/events/public-event-utils";
import {
  PAYMENT_METHOD_LABELS,
  buildEntryPaymentInfo,
  formatPaymentDueDate,
  getAvailablePaymentMethods,
  getEventPaymentSettings,
  getPaymentDueAt,
  toPaymentMethod,
} from "@/lib/payments/payment-methods";

// 管理者によるエントリーの追加・変更・キャンセルと、入金・返金・料金調整の記録。
// すべて 1 回の操作 = 1 件の履歴として残し、金額が動く場合は台帳にも追記する。
// 取消は削除せず、選手・部門・申込に状態と日時を残す。

type DataRecord = Record<string, unknown>;

type DivisionEntryInput = {
  ageCategory: string;
  weightClass: string;
  // Gi は帯色、No-Gi はグレード。
  rank: string;
  openClass: "yes" | "no";
};

export type EntryOperation =
  | {
      type: "add_division";
      athleteIndex: number;
      division: Division;
      entry: DivisionEntryInput;
    }
  | {
      type: "cancel_division";
      athleteIndex: number;
      division: Division;
      chargeReduction: number;
    }
  | {
      type: "set_open_class";
      athleteIndex: number;
      division: Division;
      openClass: "yes" | "no";
      chargeReduction?: number;
    }
  | {
      type: "update_category";
      athleteIndex: number;
      division: Division;
      ageCategory: string;
      weightClass: string;
      rank: string;
    }
  | { type: "add_athlete"; athlete: AthleteInputValues }
  | { type: "cancel_athlete"; athleteIndex: number; chargeReduction: number }
  | { type: "cancel_entry"; chargeReduction: number }
  | { type: "record_payment"; amount: number; method: ManualPaymentMethod }
  | { type: "plan_refund"; amount: number }
  | { type: "complete_refund"; amount: number }
  | { type: "no_refund" }
  | { type: "adjust_charge"; amount: number }
  | { type: "confirm_unit_price"; unitPrice: number; basis: string }
  | { type: "switch_payment_method"; method: "cash" | "bank_transfer" };

// 金額の記録（入金・返金・料金調整・請求が変わる取消）は payments:write が必要。
export const MONEY_OPERATION_TYPES: EntryOperation["type"][] = [
  "cancel_division",
  "cancel_athlete",
  "cancel_entry",
  "record_payment",
  "plan_refund",
  "complete_refund",
  "no_refund",
  "adjust_charge",
  "confirm_unit_price",
  "switch_payment_method",
];

export const OPERATION_LABELS: Record<EntryOperation["type"], string> = {
  add_division: "部門の追加",
  cancel_division: "部門の取消",
  set_open_class: "無差別級の変更",
  update_category: "カテゴリーの変更",
  add_athlete: "選手の追加",
  cancel_athlete: "選手の取消",
  cancel_entry: "申込全体のキャンセル",
  record_payment: "入金の記録",
  plan_refund: "返金予定の記録",
  complete_refund: "返金完了の記録",
  no_refund: "返金しない判断の記録",
  adjust_charge: "料金の調整",
  confirm_unit_price: "単価の確認",
  switch_payment_method: "支払方法の切り替え",
};

export type OperationPreview = {
  type: EntryOperation["type"];
  label: string;
  summaryLines: string[];
  warnings: string[];
  chargeDelta: number;
  before: EntryAccounting;
  after: EntryAccounting;
  revision: number;
};

export type OperationResult =
  | {
      ok: true;
      dryRun: boolean;
      preview: OperationPreview;
      notificationDraft?: { subject: string; body: string };
    }
  | { ok: false; status: number; code: string; message: string };

class OperationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(status: number, code: string, message: string): never {
  throw new OperationError(status, code, message);
}

function yen(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

function signedYen(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${yen(Math.abs(value))}`;
}

function assertAmount(value: number, label: string, options: { allowZero: boolean }) {
  if (!Number.isInteger(value) || value < 0 || (!options.allowZero && value === 0)) {
    fail(400, "invalid_amount", `${label}を正しく入力してください。`);
  }
}

// ---------------------------------------------------------------------------
// 出場内容の読み書き
// ---------------------------------------------------------------------------

function cloneAthletes(data: DataRecord): DataRecord[] {
  return getStoredAthletes(data).map((athlete) => ({
    ...athlete,
    ...(isRecord(athlete.gi) ? { gi: { ...athlete.gi } } : {}),
    ...(isRecord(athlete.nogi) ? { nogi: { ...athlete.nogi } } : {}),
  }));
}

function isLegacyIndividual(data: DataRecord) {
  return data.entryType !== "representative" && !isRecord(data.athlete);
}

function getAthlete(athletes: DataRecord[], index: number) {
  const athlete = athletes[index];
  if (!athlete) {
    fail(404, "athlete_not_found", "対象の選手が見つかりません。");
  }
  return athlete;
}

function requireV2Athlete(athlete: DataRecord) {
  if (!isV2StoredAthlete(athlete)) {
    fail(
      409,
      "legacy_format",
      "この選手は旧形式（Gi / No-Gi の区別なし）で保存されているため、部門・カテゴリーの変更はできません。取消・入金・返金・料金調整のみ記録できます。",
    );
  }
  if (isCancelledItem(athlete)) {
    fail(409, "athlete_cancelled", "取消済みの選手は変更できません。");
  }
}

function athleteName(athlete: DataRecord) {
  return typeof athlete.name === "string" && athlete.name ? athlete.name : "選手";
}

function birthDateInput(athlete: DataRecord) {
  const date = toDate(athlete.birthDate);
  return date ? date.toISOString().slice(0, 10) : "";
}

// 有効な部門だけを持つ、表示・検証用の選手情報。
function toActiveNormalized(athlete: DataRecord): NormalizedAthlete | null {
  if (!isV2StoredAthlete(athlete) || isCancelledItem(athlete)) {
    return null;
  }

  const divisions = getActiveDivisions(athlete);
  if (divisions.length === 0) {
    return null;
  }

  const pick = (division: Division) =>
    divisions.includes(division) ? (athlete[division] as DataRecord) : null;
  const gi = pick("gi");
  const nogi = pick("nogi");

  return {
    name: athleteName(athlete),
    kana: typeof athlete.kana === "string" ? athlete.kana : "",
    gender: typeof athlete.gender === "string" ? athlete.gender : "",
    birthDate: birthDateInput(athlete),
    athleteClass: athlete.athleteClass as AthleteClass,
    guardianName: typeof athlete.guardianName === "string" ? athlete.guardianName : "",
    divisionSelection: divisions.length === 2 ? "both" : divisions[0],
    gi: gi
      ? {
          ageCategory: String(gi.ageCategory ?? ""),
          weightClass: String(gi.weightClass ?? ""),
          belt: String(gi.belt ?? ""),
          openClass: gi.openClass === "yes" ? "yes" : "no",
        }
      : null,
    nogi: nogi
      ? {
          ageCategory: String(nogi.ageCategory ?? ""),
          weightClass: String(nogi.weightClass ?? ""),
          grade: String(nogi.grade ?? ""),
          openClass: nogi.openClass === "yes" ? "yes" : "no",
        }
      : null,
  };
}

// 現在有効な出場内容（1 行 = 1 部門）。旧形式の選手は従来のカテゴリーを表示する。
export function describeActiveEntries(data: DataRecord): string[] {
  if (isEntryCancelled(data)) {
    return [];
  }

  const isRepresentative = data.entryType === "representative";

  return getStoredAthletes(data).flatMap((athlete, index) => {
    if (isCancelledItem(athlete)) {
      return [];
    }

    const prefix = isRepresentative
      ? `選手${index + 1}（${athleteName(athlete)}）: `
      : "";
    const normalized = toActiveNormalized(athlete);

    if (normalized) {
      return describeAthleteEntries(normalized).map((line) => `${prefix}${line}`);
    }

    if (isV2StoredAthlete(athlete)) {
      return [];
    }

    const legacy = [athlete.category, athlete.ageCategory, athlete.weightClass]
      .filter((value) => typeof value === "string" && value)
      .join(" / ");
    return [`${prefix}${legacy || "旧形式の申込"}`];
  });
}

function validateDivisionEntry(
  athleteClass: AthleteClass,
  division: Division,
  entry: { ageCategory: string; weightClass: string; rank: string },
) {
  const options = getCategoryOptions(athleteClass);
  const label = DIVISION_LABELS[division];

  if (!options.ageCategories.includes(entry.ageCategory)) {
    fail(400, "invalid_age_category", `${label}の年齢区分を選択してください。`);
  }
  if (!(options.weightClasses as string[]).includes(entry.weightClass)) {
    fail(400, "invalid_weight_class", `${label}の階級を選択してください。`);
  }
  const ranks = (division === "gi" ? options.belts : options.grades) as string[];
  if (!ranks.includes(entry.rank)) {
    fail(
      400,
      "invalid_rank",
      division === "gi" ? "帯色を選択してください。" : "グレードを選択してください。",
    );
  }
}

function checkAge(athlete: DataRecord, eventDate: Date | null) {
  const normalized = toActiveNormalized(athlete);
  if (!normalized || !eventDate) {
    return;
  }

  const issues = checkAthleteAge(normalized, eventDate);
  if (issues.length > 0) {
    fail(400, "age_category_mismatch", issues[0].message);
  }
}

function divisionValue(athlete: DataRecord, division: Division, unitPrice: number) {
  const entry = athlete[division] as DataRecord;
  return (
    unitPrice +
    (athlete.athleteClass === "adult" && entry.openClass === "yes" ? OPEN_CLASS_FEE : 0)
  );
}

function requireTrustedUnitPrice(data: DataRecord) {
  const info = readUnitPrice(data);
  if (!info.isTrusted || info.unitPrice === null) {
    fail(
      409,
      "unit_price_unconfirmed",
      "この申込は申込時の単価を特定できません。先に「単価の確認」で、根拠と 1 部門あたりの単価を入力してください。",
    );
  }
  return info.unitPrice;
}

// 取消分の計算上の金額。単価を特定できない申込では 0（請求の減額は料金調整で記録する）。
function removalValue(data: DataRecord, compute: (unitPrice: number) => number) {
  const info = readUnitPrice(data);
  return info.isTrusted && info.unitPrice !== null ? compute(info.unitPrice) : 0;
}

function assertReduction(value: number, max: number, billed: number) {
  assertAmount(value, "請求の減額", { allowZero: true });
  const limit = Math.min(max, billed);
  if (value > limit) {
    fail(
      400,
      "reduction_too_large",
      `請求の減額は ${yen(limit)} までです。それ以上の調整は「料金の調整」で理由を付けて記録してください。`,
    );
  }
}

// ---------------------------------------------------------------------------
// 操作の計画（検証と、変更内容・金額の計算）
// ---------------------------------------------------------------------------

type Plan = {
  summaryLines: string[];
  warnings: string[];
  // 出場内容が変わる場合の、変更後の選手一覧。
  athletes?: DataRecord[];
  entryUpdate: DataRecord;
  accounting: EntryAccounting;
  chargeDelta: number;
  ledger: Omit<LedgerRecordInput, "historyId" | "adminUid" | "adminEmail" | "source">[];
  before: unknown;
  after: unknown;
};

function planOperation(
  data: DataRecord,
  operation: EntryOperation,
  reason: string,
  accounting: EntryAccounting,
  eventDate: Date | null,
  eventData: DataRecord | null,
): Plan {
  const athletes = cloneAthletes(data);
  const isRepresentative = data.entryType === "representative";
  const plan: Plan = {
    summaryLines: [],
    warnings: [],
    entryUpdate: {},
    accounting,
    chargeDelta: 0,
    ledger: [],
    before: null,
    after: null,
  };
  const who = (athlete: DataRecord, index: number) =>
    isRepresentative
      ? `選手${index + 1}（${athleteName(athlete)}）`
      : athleteName(athlete);
  const charge = (delta: number, note: string) => {
    if (delta === 0) {
      return;
    }
    plan.chargeDelta += delta;
    plan.accounting = recalculate(plan.accounting, {
      billedAmount: plan.accounting.billedAmount + delta,
    });
    plan.ledger.push({ type: "charge", amount: delta, note });
  };

  if (isEntryCancelled(data) && !MONEY_ONLY_AFTER_CANCEL.includes(operation.type)) {
    fail(
      409,
      "entry_cancelled",
      "キャンセル済みの申込です。入金・返金・料金調整の記録のみ行えます。",
    );
  }

  switch (operation.type) {
    case "add_division": {
      const athlete = getAthlete(athletes, operation.athleteIndex);
      requireV2Athlete(athlete);
      const unitPrice = requireTrustedUnitPrice(data);
      const athleteClass = athlete.athleteClass as AthleteClass;
      const existing = athlete[operation.division];

      if (isRecord(existing) && !isCancelledItem(existing)) {
        fail(409, "division_exists", "この部門にはすでに出場しています。");
      }

      validateDivisionEntry(athleteClass, operation.division, operation.entry);
      plan.before = existing ?? null;
      athlete[operation.division] = {
        ageCategory: operation.entry.ageCategory,
        weightClass: operation.entry.weightClass,
        ...(operation.division === "gi"
          ? { belt: operation.entry.rank }
          : { grade: operation.entry.rank }),
        // キッズには無差別級がない。
        openClass:
          athleteClass === "adult" && operation.entry.openClass === "yes"
            ? "yes"
            : "no",
        status: "active",
        addedAt: new Date(),
      };
      athlete.divisionSelection = "both";
      checkAge(athlete, eventDate);
      plan.after = athlete[operation.division];
      plan.athletes = athletes;
      const value = divisionValue(athlete, operation.division, unitPrice);
      const normalized = toActiveNormalized(athlete);
      plan.summaryLines.push(
        `${who(athlete, operation.athleteIndex)}に${DIVISION_LABELS[operation.division]}を追加: ${
          normalized ? describeDivisionEntry(normalized, operation.division) : ""
        }`,
        `追加の参加費: ${yen(value)}（申込時の参加費 ${yen(unitPrice)}${
          value > unitPrice ? ` ＋ 無差別級 ${yen(OPEN_CLASS_FEE)}` : ""
        }）`,
      );
      charge(value, `${DIVISION_LABELS[operation.division]}の追加`);
      break;
    }

    case "cancel_division": {
      const athlete = getAthlete(athletes, operation.athleteIndex);
      requireV2Athlete(athlete);
      const active = getActiveDivisions(athlete);

      if (!active.includes(operation.division)) {
        fail(409, "division_not_active", "この部門には出場していません。");
      }
      if (summarizeActiveEntry(data).divisionEntryCount <= 1) {
        fail(
          409,
          "last_division",
          "最後の出場を取り消す場合は「申込全体のキャンセル」を行ってください。",
        );
      }
      if (active.length === 1) {
        fail(
          409,
          "last_division_of_athlete",
          "この選手の最後の部門です。「選手の取消」を行ってください。",
        );
      }

      const max = removalValue(data, (unitPrice) =>
        divisionValue(athlete, operation.division, unitPrice),
      );
      assertReduction(operation.chargeReduction, max, accounting.billedAmount);
      plan.before = athlete[operation.division];
      athlete[operation.division] = {
        ...(athlete[operation.division] as DataRecord),
        status: "cancelled",
        cancelledAt: new Date(),
      };
      plan.after = athlete[operation.division];
      plan.athletes = athletes;
      plan.summaryLines.push(
        `${who(athlete, operation.athleteIndex)}の${DIVISION_LABELS[operation.division]}を取消`,
        `請求の減額: ${yen(operation.chargeReduction)}（取消分の計算上の金額 ${yen(max)}）`,
      );
      charge(
        -operation.chargeReduction,
        `${DIVISION_LABELS[operation.division]}の取消`,
      );
      break;
    }

    case "set_open_class": {
      const athlete = getAthlete(athletes, operation.athleteIndex);
      requireV2Athlete(athlete);

      if (!getActiveDivisions(athlete).includes(operation.division)) {
        fail(409, "division_not_active", "この部門には出場していません。");
      }
      if (athlete.athleteClass !== "adult") {
        fail(409, "kids_open_class", "キッズには無差別級がありません。");
      }

      const entry = athlete[operation.division] as DataRecord;
      const current = entry.openClass === "yes" ? "yes" : "no";
      if (current === operation.openClass) {
        fail(409, "no_change", "無差別級の参加状況は変更されていません。");
      }

      plan.before = { openClass: current };
      entry.openClass = operation.openClass;
      plan.after = { openClass: operation.openClass };
      plan.athletes = athletes;
      const label = `${who(athlete, operation.athleteIndex)}の${DIVISION_LABELS[operation.division]}無差別級`;

      if (operation.openClass === "yes") {
        requireTrustedUnitPrice(data);
        plan.summaryLines.push(`${label}を追加`, `追加料金: ${yen(OPEN_CLASS_FEE)}`);
        charge(OPEN_CLASS_FEE, `${DIVISION_LABELS[operation.division]}無差別級の追加`);
      } else {
        const reduction = operation.chargeReduction ?? -1;
        assertReduction(reduction, OPEN_CLASS_FEE, accounting.billedAmount);
        plan.summaryLines.push(
          `${label}を取消`,
          `請求の減額: ${yen(reduction)}（無差別級の料金 ${yen(OPEN_CLASS_FEE)}）`,
        );
        charge(-reduction, `${DIVISION_LABELS[operation.division]}無差別級の取消`);
      }
      break;
    }

    case "update_category": {
      const athlete = getAthlete(athletes, operation.athleteIndex);
      requireV2Athlete(athlete);

      if (!getActiveDivisions(athlete).includes(operation.division)) {
        fail(409, "division_not_active", "この部門には出場していません。");
      }

      validateDivisionEntry(
        athlete.athleteClass as AthleteClass,
        operation.division,
        operation,
      );
      const entry = athlete[operation.division] as DataRecord;
      const rankKey = operation.division === "gi" ? "belt" : "grade";
      const beforeValues = {
        ageCategory: entry.ageCategory,
        weightClass: entry.weightClass,
        [rankKey]: entry[rankKey],
      };
      const afterValues = {
        ageCategory: operation.ageCategory,
        weightClass: operation.weightClass,
        [rankKey]: operation.rank,
      };

      if (JSON.stringify(beforeValues) === JSON.stringify(afterValues)) {
        fail(409, "no_change", "カテゴリーは変更されていません。");
      }

      Object.assign(entry, afterValues);
      checkAge(athlete, eventDate);
      plan.before = beforeValues;
      plan.after = afterValues;
      plan.athletes = athletes;
      const labels: Record<string, string> = {
        ageCategory: "年齢区分",
        weightClass: "階級",
        belt: "帯色",
        grade: "グレード",
      };
      plan.summaryLines.push(
        `${who(athlete, operation.athleteIndex)}の${DIVISION_LABELS[operation.division]}を変更`,
        ...Object.keys(afterValues)
          .filter(
            (key) =>
              beforeValues[key as keyof typeof beforeValues] !==
              afterValues[key as keyof typeof afterValues],
          )
          .map(
            (key) =>
              `${labels[key]}: ${String(beforeValues[key as keyof typeof beforeValues])} → ${String(afterValues[key as keyof typeof afterValues])}`,
          ),
        "料金の変更はありません。",
      );
      break;
    }

    case "add_athlete": {
      if (!isRepresentative) {
        fail(409, "not_representative", "選手の追加は代表者申込でのみ行えます。");
      }
      const unitPrice = requireTrustedUnitPrice(data);
      const normalized = normalizeAthlete(operation.athlete);
      if (!normalized) {
        fail(400, "invalid_athlete", "選手情報を確認してください。");
      }
      if (eventDate) {
        const issues = checkAthleteAge(normalized, eventDate);
        if (issues.length > 0) {
          fail(400, "age_category_mismatch", issues[0].message);
        }
      }

      const stored: DataRecord = {
        ...normalized,
        birthDate: new Date(normalized.birthDate),
        status: "active",
        addedAt: new Date(),
      };
      athletes.push(stored);
      plan.athletes = athletes;
      plan.after = stored;
      const divisions = getActiveDivisions(stored);
      const value = divisions.reduce(
        (sum, division) => sum + divisionValue(stored, division, unitPrice),
        0,
      );
      plan.summaryLines.push(
        `選手${athletes.length}（${normalized.name}）を追加（${ATHLETE_CLASS_LABELS[normalized.athleteClass]}）`,
        ...describeAthleteEntries(normalized).map((line) => `  ${line}`),
        `追加の参加費: ${yen(value)}（申込時の参加費 ${yen(unitPrice)} × ${divisions.length}部門${
          value > unitPrice * divisions.length ? " ＋ 無差別級" : ""
        }）`,
      );
      charge(value, `選手の追加（${normalized.name}）`);
      break;
    }

    case "cancel_athlete": {
      if (!isRepresentative) {
        fail(
          409,
          "not_representative",
          "個人申込の取消は「申込全体のキャンセル」を行ってください。",
        );
      }
      const athlete = getAthlete(athletes, operation.athleteIndex);
      if (isCancelledItem(athlete)) {
        fail(409, "athlete_cancelled", "この選手はすでに取消済みです。");
      }
      if (summarizeActiveEntry(data).athleteCount <= 1) {
        fail(
          409,
          "last_athlete",
          "最後の選手を取り消す場合は「申込全体のキャンセル」を行ってください。",
        );
      }

      const max = removalValue(data, (unitPrice) =>
        getActiveDivisions(athlete).reduce(
          (sum, division) => sum + divisionValue(athlete, division, unitPrice),
          0,
        ),
      );
      assertReduction(operation.chargeReduction, max, accounting.billedAmount);
      plan.before = { status: athlete.status ?? "active" };
      athlete.status = "cancelled";
      athlete.cancelledAt = new Date();
      plan.after = { status: "cancelled" };
      plan.athletes = athletes;
      plan.summaryLines.push(
        `${who(athlete, operation.athleteIndex)}を取消`,
        `請求の減額: ${yen(operation.chargeReduction)}（取消分の計算上の金額 ${yen(max)}）`,
      );
      if (max === 0) {
        plan.warnings.push(
          "単価を特定できない申込のため、取消分の金額は計算していません。請求を減らす場合は「料金の調整」で記録してください。",
        );
      }
      charge(-operation.chargeReduction, `選手の取消（${athleteName(athlete)}）`);
      break;
    }

    case "cancel_entry": {
      assertReduction(
        operation.chargeReduction,
        accounting.billedAmount,
        accounting.billedAmount,
      );
      plan.before = { entryStatus: data.entryStatus ?? null };
      plan.after = { entryStatus: "cancelled" };
      plan.entryUpdate = {
        entryStatus: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelReason: reason,
        // 選手・部門の情報は残したまま、有効な出場の集計だけを 0 にする。
        athleteCount: 0,
        participantCount: 0,
        divisionEntryCount: 0,
        categoryEntryCount: 0,
        openClassEntryCount: 0,
      };
      plan.summaryLines.push(
        "申込全体をキャンセル",
        `請求の減額: ${yen(operation.chargeReduction)}（キャンセル後に残る請求額: ${yen(accounting.billedAmount - operation.chargeReduction)}）`,
      );
      charge(-operation.chargeReduction, "申込全体のキャンセル");
      break;
    }

    case "record_payment": {
      assertAmount(operation.amount, "入金額", { allowZero: false });
      plan.accounting = recalculate(plan.accounting, {
        paidAmount: plan.accounting.paidAmount + operation.amount,
      });
      plan.ledger.push({
        type: "payment",
        amount: operation.amount,
        method: operation.method,
        note: "入金の記録",
      });
      plan.summaryLines.push(
        `入金を記録: ${yen(operation.amount)}（${LEDGER_METHOD_LABELS[operation.method]}）`,
      );
      if (operation.amount > accounting.dueAmount) {
        plan.warnings.push(
          `入金額が、追加支払額（${yen(accounting.dueAmount)}）を超えています。超えた分は過入金として記録されます。`,
        );
      }
      break;
    }

    case "plan_refund": {
      assertAmount(operation.amount, "返金予定額", { allowZero: false });
      const refundable =
        accounting.paidAmount -
        accounting.refundedAmount -
        accounting.refundPendingAmount;
      if (operation.amount > refundable) {
        fail(
          400,
          "refund_too_large",
          `返金予定にできるのは ${yen(Math.max(0, refundable))} までです（入金済み額から、返金済み・返金予定の分を除いた金額）。`,
        );
      }
      plan.accounting = recalculate(plan.accounting, {
        refundPlannedAmount: plan.accounting.refundPlannedAmount + operation.amount,
      });
      plan.ledger.push({
        type: "refund_planned",
        amount: operation.amount,
        note: "返金予定の記録",
      });
      plan.summaryLines.push(
        `返金予定を記録: ${yen(operation.amount)}`,
        "この操作では返金は実行されません。実際に返金したあと「返金完了」を記録してください。",
      );
      if (operation.amount > accounting.overpaidAmount) {
        plan.warnings.push(
          `返金予定額が、過入金額（${yen(accounting.overpaidAmount)}）を超えています。請求額を下回る返金になる場合は、先に取消や料金調整で請求額を確認してください。`,
        );
      }
      break;
    }

    case "complete_refund": {
      assertAmount(operation.amount, "返金額", { allowZero: false });
      if (operation.amount > accounting.refundPendingAmount) {
        fail(
          400,
          "refund_not_planned",
          `返金完了にできるのは、返金予定のうち未完了の ${yen(accounting.refundPendingAmount)} までです。先に返金予定を記録してください。`,
        );
      }
      plan.accounting = recalculate(plan.accounting, {
        refundedAmount: plan.accounting.refundedAmount + operation.amount,
      });
      plan.ledger.push({
        type: "refund_completed",
        amount: operation.amount,
        note: "返金完了の記録",
      });
      plan.summaryLines.push(
        `返金完了を記録: ${yen(operation.amount)}`,
        "実際の返金（振込・現金・Stripe 管理画面での返金）は、この記録とは別に行ってください。",
      );
      break;
    }

    case "no_refund": {
      plan.entryUpdate = {
        refundDecision: {
          decision: "no_refund",
          reason,
          decidedAt: FieldValue.serverTimestamp(),
        },
      };
      plan.ledger.push({
        type: "refund_decision",
        amount: 0,
        note: "返金しない判断",
      });
      plan.summaryLines.push("返金しないことを記録", `理由: ${reason}`);
      break;
    }

    case "adjust_charge": {
      if (!Number.isInteger(operation.amount) || operation.amount === 0) {
        fail(
          400,
          "invalid_amount",
          "調整額を正しく入力してください（増額は正、減額は負）。",
        );
      }
      if (accounting.billedAmount + operation.amount < 0) {
        fail(400, "negative_charge", "請求額が 0 円未満になる調整はできません。");
      }
      plan.summaryLines.push(`請求額を調整: ${signedYen(operation.amount)}`);
      charge(operation.amount, "料金の調整");
      break;
    }

    case "confirm_unit_price": {
      assertAmount(operation.unitPrice, "単価", { allowZero: false });
      if (!operation.basis.trim()) {
        fail(400, "basis_required", "単価の根拠を入力してください。");
      }
      const current = readUnitPrice(data);
      plan.before = { unitPrice: current.unitPrice, isTrusted: current.isTrusted };
      plan.after = { unitPrice: operation.unitPrice, basis: operation.basis.trim() };
      plan.entryUpdate = {
        unitPriceConfirmation: {
          unitPrice: operation.unitPrice,
          basis: operation.basis.trim(),
          confirmedAt: FieldValue.serverTimestamp(),
        },
      };
      plan.summaryLines.push(
        `追加分に適用する 1 部門あたりの単価を ${yen(operation.unitPrice)} として確認`,
        `根拠: ${operation.basis.trim()}`,
        "既存の出場分の請求額は変更しません。",
      );
      break;
    }

    // カード決済の手続きが終わっていない申込を、現金払い・銀行振込の「受付済み・未払い」に切り替える
    // （例: 旧アプリでカード決済を選んだまま支払っていない申込）。支払状態・金額は変えず、
    // 入金は「入金の記録」で別に記録する。メールの送信や Stripe での取消は行わない。
    case "switch_payment_method": {
      if (data.entryStatus !== "pending_payment") {
        fail(
          409,
          "not_pending_payment",
          "支払方法を切り替えられるのは「カード決済の手続き待ち」の申込だけです。",
        );
      }
      if (toPaymentMethod(data.paymentMethod) !== "card") {
        fail(409, "not_card_entry", "カード決済の申込ではありません。");
      }
      if (
        data.paymentStatus === "paid" ||
        accounting.paidAmount > 0 ||
        accounting.refundPlannedAmount > 0 ||
        accounting.refundedAmount > 0
      ) {
        fail(
          409,
          "payment_recorded",
          "入金・返金の記録がある申込は、支払方法を切り替えられません。",
        );
      }
      // 決済ページが残っていると、切り替え後にカードで支払われるおそれがあるため切り替えない。
      if (
        [
          data.stripeSessionId,
          data.stripeCheckoutSessionId,
          data.stripePaymentIntentId,
        ].some((value) => typeof value === "string" && value.trim() !== "")
      ) {
        fail(
          409,
          "stripe_session_exists",
          "Stripe の決済手続きが作成済みのため、支払方法を切り替えられません。",
        );
      }

      const settings = getEventPaymentSettings(eventData ?? {});
      if (!getAvailablePaymentMethods(settings).includes(operation.method)) {
        fail(
          409,
          "method_not_available",
          `この大会では現在「${PAYMENT_METHOD_LABELS[operation.method]}」を受け付けていません。大会の支払設定を確認してください。`,
        );
      }

      const paymentInfo = buildEntryPaymentInfo(settings, operation.method);
      const paymentDueAt = getPaymentDueAt(paymentInfo.dueDate);
      plan.before = {
        paymentMethod: "card",
        entryStatus: data.entryStatus,
        paymentStatus: data.paymentStatus ?? null,
      };
      plan.after = {
        paymentMethod: operation.method,
        entryStatus: "confirmed",
        paymentStatus: data.paymentStatus ?? null,
      };
      plan.entryUpdate = {
        paymentMethod: operation.method,
        paymentProvider: "manual",
        entryStatus: "confirmed",
        // 切り替え時点の大会の支払案内を、申込時と同じ形で保存する。
        paymentInfo: {
          bankAccountInfo: paymentInfo.bankAccountInfo,
          note: paymentInfo.note,
          dueDate: paymentInfo.dueDate,
        },
        paymentDueDate: paymentInfo.dueDate,
        paymentDueAt: paymentDueAt ? Timestamp.fromDate(paymentDueAt) : null,
      };
      plan.summaryLines.push(
        `支払方法を切り替え: クレジットカード → ${PAYMENT_METHOD_LABELS[operation.method]}`,
        "申込状態: カード決済の手続き待ち → 受付済み",
        `支払状態は未払いのまま（請求額 ${yen(accounting.billedAmount)}、入金は「入金の記録」で記録）`,
        ...(paymentInfo.dueDate
          ? [`お支払い期限: ${formatPaymentDueDate(paymentInfo.dueDate)}`]
          : []),
      );
      plan.warnings.push(
        "メールは自動では送信されません。お支払い方法の変更を参加者へ案内する場合は、通知メール欄から送信してください。",
      );
      break;
    }
  }

  if (plan.accounting.overpaidAmount > 0 && operation.type !== "record_payment") {
    plan.warnings.push(
      `請求額より ${yen(plan.accounting.overpaidAmount)} 多く入金されています。返金するかどうかは別途判断し、「返金予定」または「返金しない判断」を記録してください（自動では返金されません）。`,
    );
  }
  if (plan.accounting.dueAmount > 0 && isManualAddition(operation.type)) {
    plan.warnings.push(
      `追加支払額は ${yen(plan.accounting.dueAmount)} です。入金を確認したら「入金の記録」を行ってください。`,
    );
  }
  if (operation.type === "cancel_entry" && plan.accounting.dueAmount > 0) {
    plan.warnings.push(
      `キャンセル後も ${yen(plan.accounting.dueAmount)} の請求（未収）が残ります。請求しない場合は、減額を見直してください。`,
    );
  }

  return plan;
}

const MONEY_ONLY_AFTER_CANCEL: EntryOperation["type"][] = [
  "record_payment",
  "plan_refund",
  "complete_refund",
  "no_refund",
  "adjust_charge",
];

function isManualAddition(type: EntryOperation["type"]) {
  return type === "add_division" || type === "add_athlete" || type === "set_open_class";
}

// 出場内容の変更後に、申込本体の集計項目を更新する。
function contentFields(data: DataRecord, athletes: DataRecord[], revision: number) {
  const isRepresentative = data.entryType === "representative";
  const nextData: DataRecord = isRepresentative
    ? { ...data, athletes }
    : isLegacyIndividual(data)
      ? data
      : { ...data, athlete: athletes[0] };
  const summary = summarizeActiveEntry(nextData);
  const firstActive = athletes
    .map(toActiveNormalized)
    .find((athlete) => athlete !== null);

  return {
    ...(isRepresentative
      ? { athletes }
      : isLegacyIndividual(data)
        ? {}
        : { athlete: athletes[0] }),
    athleteCount: summary.athleteCount,
    participantCount: summary.athleteCount,
    divisionEntryCount: summary.divisionEntryCount,
    categoryEntryCount: summary.divisionEntryCount,
    openClassEntryCount: summary.openClassEntryCount,
    ...(firstActive ? buildLegacySummaryFields(firstActive) : {}),
    // 管理者が変更した申込は、公開フォームからの申し込み直しで上書きさせない。
    contentKey: `admin-revision-${revision}`,
  };
}

// 変更結果を知らせるメールの文面（下書き）。送信は管理者が内容を確認して明示的に行う。
export function buildChangeNotificationDraft(
  data: DataRecord,
  accounting: EntryAccounting,
  changeLines: string[],
) {
  const name = typeof data.name === "string" ? data.name : "";
  const eventTitle = typeof data.eventTitle === "string" ? data.eventTitle : "";
  const activeLines = describeActiveEntries(data);
  const body = [
    `${name} 様`,
    "",
    "COPA ALMA 運営事務局です。",
    `「${eventTitle}」のお申し込み内容について、以下のとおり変更を承りましたのでお知らせいたします。`,
    "",
    "■ 変更内容",
    ...(changeLines.length > 0
      ? changeLines.map((line) => `・${line}`)
      : ["・（変更内容を記入してください）"]),
    "",
    "■ 現在の出場内容",
    ...(isEntryCancelled(data)
      ? ["・お申し込みはキャンセルとなりました。"]
      : activeLines.map((line) => `・${line}`)),
    "",
    "■ 参加費",
    `ご請求額: ${yen(accounting.billedAmount)}`,
    `お支払い済み: ${yen(accounting.paidAmount)}`,
    ...(accounting.dueAmount > 0
      ? [`追加でお支払いいただく金額: ${yen(accounting.dueAmount)}`]
      : []),
    ...(accounting.refundPlannedAmount > 0
      ? [`返金予定額: ${yen(accounting.refundPlannedAmount)}`]
      : []),
    ...(accounting.refundedAmount > 0
      ? [`返金済み額: ${yen(accounting.refundedAmount)}`]
      : []),
    "",
    "ご不明な点がございましたら、お問い合わせください。",
    "",
    "COPA ALMA 運営事務局",
  ].join("\n");

  return {
    subject: `【COPA ALMA】お申し込み内容の変更について: ${eventTitle}`,
    body,
  };
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------

export async function applyEntryOperation(input: {
  entryId: string;
  operation: EntryOperation;
  reason: string;
  // 画面が読み込んだ時点の版数。他の操作で更新されていた場合は実行しない。
  expectedRevision: number;
  adminUid: string;
  adminEmail: string;
  // true の場合は検証と金額の計算だけを行い、保存しない（確認画面用）。
  dryRun: boolean;
}): Promise<OperationResult> {
  const reason = input.reason.trim();
  if (!reason) {
    return {
      ok: false,
      status: 400,
      code: "reason_required",
      message: "理由を入力してください。",
    };
  }

  const db = getAdminFirestore();
  const entryRef = db.collection(collections.entries).doc(input.entryId);

  try {
    return await db.runTransaction<OperationResult>(async (transaction) => {
      const snapshot = await transaction.get(entryRef);
      if (!snapshot.exists) {
        fail(404, "entry_not_found", "エントリーが見つかりません。");
      }

      const data = snapshot.data() as DataRecord;
      const revision = typeof data.revision === "number" ? data.revision : 0;

      if (revision !== input.expectedRevision) {
        fail(
          409,
          "revision_conflict",
          "この申込は他の操作で更新されています。画面を確認してから、もう一度操作してください。",
        );
      }

      const eventId = typeof data.eventId === "string" ? data.eventId : "";
      const eventSnapshot = eventId
        ? await transaction.get(db.collection(collections.events).doc(eventId))
        : null;
      const eventDate = toDate(eventSnapshot?.data()?.eventDate);
      const before = readEntryAccounting(data);
      const plan = planOperation(
        data,
        input.operation,
        reason,
        before,
        eventDate,
        (eventSnapshot?.data() as DataRecord | undefined) ?? null,
      );
      const nextRevision = revision + 1;
      const preview: OperationPreview = {
        type: input.operation.type,
        label: OPERATION_LABELS[input.operation.type],
        summaryLines: plan.summaryLines,
        warnings: plan.warnings,
        chargeDelta: plan.chargeDelta,
        before,
        after: plan.accounting,
        revision: input.dryRun ? revision : nextRevision,
      };

      if (input.dryRun) {
        return { ok: true, dryRun: true, preview };
      }

      // ここから書き込み。台帳を持たない申込は、最初に既存の金額を記録する。
      ensureAccountingInitialized(transaction, entryRef, data);

      const historyRef = entryRef.collection(ENTRY_HISTORY_COLLECTION).doc();
      const actor = { adminUid: input.adminUid, adminEmail: input.adminEmail };

      for (const record of plan.ledger) {
        writeLedgerRecord(transaction, entryRef, {
          ...record,
          note: `${record.note}（理由: ${reason}）`,
          source: "admin",
          historyId: historyRef.id,
          ...actor,
        });
      }

      const content = plan.athletes
        ? contentFields(data, plan.athletes, nextRevision)
        : {};
      const isFullyPaidCardEntry =
        data.entryStatus === "pending_payment" &&
        input.operation.type === "record_payment" &&
        plan.accounting.dueAmount === 0;

      transaction.update(entryRef, {
        ...content,
        ...plan.entryUpdate,
        ...accountingFields(plan.accounting),
        ...(isFullyPaidCardEntry ? { entryStatus: "confirmed" } : {}),
        ...(input.operation.type === "record_payment"
          ? {
              paidAt: FieldValue.serverTimestamp(),
              paymentConfirmedAt: FieldValue.serverTimestamp(),
              paymentConfirmedVia: "admin",
              paymentConfirmedByUid: input.adminUid,
              paymentConfirmedByEmail: input.adminEmail,
            }
          : {}),
        revision: nextRevision,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.create(historyRef, {
        type: input.operation.type,
        label: OPERATION_LABELS[input.operation.type],
        summaryLines: plan.summaryLines,
        reason,
        chargeDelta: plan.chargeDelta,
        accountingBefore: before,
        accountingAfter: plan.accounting,
        before: plan.before ?? null,
        after: plan.after ?? null,
        revision: nextRevision,
        ...actor,
        createdAt: FieldValue.serverTimestamp(),
      });

      const afterData: DataRecord = { ...data, ...content, ...plan.entryUpdate };

      return {
        ok: true,
        dryRun: false,
        preview,
        notificationDraft: buildChangeNotificationDraft(
          afterData,
          plan.accounting,
          plan.summaryLines,
        ),
      };
    });
  } catch (error) {
    if (error instanceof OperationError) {
      return {
        ok: false,
        status: error.status,
        code: error.code,
        message: error.message,
      };
    }

    throw error;
  }
}
