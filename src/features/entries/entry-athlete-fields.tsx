"use client";

import type { ReactNode } from "react";
import {
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";

import {
  ATHLETE_CLASSES,
  ATHLETE_CLASS_LABELS,
  DIVISIONS,
  DIVISION_LABELS,
  DIVISION_SELECTIONS,
  DIVISION_SELECTION_LABELS,
  OPEN_CLASS_FEE,
  PROVISIONAL_SETTINGS,
  formatAgeRange,
  getAgeCategoryRules,
  getCategoryOptions,
  getSelectedDivisions,
  isAthleteClass,
  type AgeCategoryRule,
  type Division,
} from "@/lib/entries/entry-divisions";
import type { EntryDraftValues } from "@/lib/entries/entry-storage";

export const inputClassName =
  "h-[52px] w-full rounded-md border border-white/10 bg-black/55 px-4 text-sm text-white outline-none transition placeholder:text-zinc-600 hover:border-alma-gold/35 focus:border-alma-gold focus:bg-black/70 focus:shadow-[0_0_0_3px_rgba(214,173,69,0.13)]";

export const selectClassName = `${inputClassName} appearance-none pr-11`;

const radioCardClassName =
  "flex min-h-[52px] cursor-pointer items-center justify-between gap-3 rounded-md border border-white/10 bg-black/45 px-4 transition hover:border-alma-gold/40 has-[:checked]:border-alma-gold has-[:checked]:bg-alma-gold/10";

function SelectArrow() {
  return (
    <span className="pointer-events-none absolute right-4 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-b border-r border-alma-gold" />
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="text-xs text-red-300">{message}</span> : null;
}

function Field({
  label,
  error,
  children,
  className = "",
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`space-y-2 ${className}`}>
      <span className="text-sm font-semibold text-zinc-200">{label}</span>
      {children}
      <FieldError message={error} />
    </label>
  );
}

function formatAgeCategoryOption(rule: AgeCategoryRule) {
  const range = rule.allowOlder ? `${rule.minAge}歳以上` : formatAgeRange(rule);
  return `${rule.label}（${range}）`;
}

type AthleteFieldsProps = {
  index: number;
  control: Control<EntryDraftValues>;
  register: UseFormRegister<EntryDraftValues>;
  setValue: UseFormSetValue<EntryDraftValues>;
  errors: FieldErrors<EntryDraftValues>;
};

// 選手 1 名分の入力欄。個人エントリーでは athletes[0]、代表者エントリーでは
// 選手ごとに使う。出場部門 → 大人／キッズ → 共通情報 → 部門ごとの出場情報の順。
export function AthleteFields({
  index,
  control,
  register,
  setValue,
  errors,
}: AthleteFieldsProps) {
  const athleteClass = useWatch({ control, name: `athletes.${index}.athleteClass` });
  const divisionSelection = useWatch({
    control,
    name: `athletes.${index}.divisionSelection`,
  });
  const athleteErrors = errors.athletes?.[index];
  const options = isAthleteClass(athleteClass)
    ? getCategoryOptions(athleteClass)
    : null;
  const ageCategoryRules = isAthleteClass(athleteClass)
    ? getAgeCategoryRules(athleteClass)
    : [];
  const divisions = getSelectedDivisions(divisionSelection);

  // 大人とキッズでは選択肢が異なるため、切り替え時に部門ごとの選択をクリアする。
  function resetCategoryFields() {
    for (const division of DIVISIONS) {
      setValue(`athletes.${index}.${division}.ageCategory`, "");
      setValue(`athletes.${index}.${division}.weightClass`, "");
      setValue(`athletes.${index}.${division}.openClass`, "");
    }
    setValue(`athletes.${index}.gi.belt`, "");
    setValue(`athletes.${index}.nogi.grade`, "");
  }

  function renderDivision(division: Division) {
    if (!options) {
      return null;
    }

    const divisionErrors = athleteErrors?.[division];
    const label = DIVISION_LABELS[division];

    return (
      <div
        key={division}
        className="rounded-lg border border-alma-gold/25 bg-black/30 p-4 sm:col-span-2 sm:p-5"
      >
        <p className="text-xs font-black uppercase tracking-[0.28em] text-alma-gold">
          {label}
        </p>
        <h4 className="mt-1 text-lg font-black text-white">{label}の出場情報</h4>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field label="年齢区分" error={divisionErrors?.ageCategory?.message}>
            <span className="relative block">
              <select
                {...register(`athletes.${index}.${division}.ageCategory`)}
                className={selectClassName}
              >
                <option value="">年齢区分を選択</option>
                {ageCategoryRules.map((rule) => (
                  <option key={rule.label} value={rule.label}>
                    {formatAgeCategoryOption(rule)}
                  </option>
                ))}
              </select>
              <SelectArrow />
            </span>
          </Field>

          <Field
            label={options.weightClassLabel}
            error={divisionErrors?.weightClass?.message}
          >
            <span className="relative block">
              <select
                {...register(`athletes.${index}.${division}.weightClass`)}
                className={selectClassName}
              >
                <option value="">階級を選択</option>
                {options.weightClasses.map((weightClass) => (
                  <option key={weightClass} value={weightClass}>
                    {weightClass}
                  </option>
                ))}
              </select>
              <SelectArrow />
            </span>
          </Field>

          {division === "gi" ? (
            <Field label="帯色" error={athleteErrors?.gi?.belt?.message}>
              <span className="relative block">
                <select
                  {...register(`athletes.${index}.gi.belt`)}
                  className={selectClassName}
                >
                  <option value="">帯色を選択</option>
                  {options.belts.map((belt) => (
                    <option key={belt} value={belt}>
                      {belt}
                    </option>
                  ))}
                </select>
                <SelectArrow />
              </span>
            </Field>
          ) : (
            <Field label="グレード" error={athleteErrors?.nogi?.grade?.message}>
              <span className="relative block">
                <select
                  {...register(`athletes.${index}.nogi.grade`)}
                  className={selectClassName}
                >
                  <option value="">グレードを選択</option>
                  {options.grades.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
                <SelectArrow />
              </span>
            </Field>
          )}

          {options.hasOpenClass ? (
            <fieldset className="space-y-3 sm:col-span-2">
              <legend className="text-sm font-semibold text-zinc-200">
                {label} 無差別級（追加 {OPEN_CLASS_FEE.toLocaleString("ja-JP")}円）
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={radioCardClassName}>
                  <span className="text-sm font-semibold text-white">参加する</span>
                  <input
                    type="radio"
                    value="yes"
                    {...register(`athletes.${index}.${division}.openClass`)}
                    className="h-4 w-4 accent-alma-gold"
                  />
                </label>
                <label className={radioCardClassName}>
                  <span className="text-sm font-semibold text-white">参加しない</span>
                  <input
                    type="radio"
                    value="no"
                    {...register(`athletes.${index}.${division}.openClass`)}
                    className="h-4 w-4 accent-alma-gold"
                  />
                </label>
              </div>
              <FieldError message={divisionErrors?.openClass?.message} />
            </fieldset>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <fieldset className="space-y-3 sm:col-span-2">
        <legend className="text-sm font-semibold text-zinc-200">出場部門</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {DIVISION_SELECTIONS.map((selection) => (
            <label key={selection} className={radioCardClassName}>
              <span className="text-sm font-semibold text-white">
                {DIVISION_SELECTION_LABELS[selection]}
              </span>
              <input
                type="radio"
                value={selection}
                {...register(`athletes.${index}.divisionSelection`)}
                className="h-4 w-4 accent-alma-gold"
              />
            </label>
          ))}
        </div>
        <FieldError message={athleteErrors?.divisionSelection?.message} />
      </fieldset>

      <fieldset className="space-y-3 sm:col-span-2">
        <legend className="text-sm font-semibold text-zinc-200">大人／キッズ</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ATHLETE_CLASSES.map((value) => (
            <label key={value} className={radioCardClassName}>
              <span className="text-sm font-semibold text-white">
                {ATHLETE_CLASS_LABELS[value]}
                <span className="ml-2 text-xs font-normal text-zinc-400">
                  {value === "kids"
                    ? `${PROVISIONAL_SETTINGS.kidsMaxAge}歳以下`
                    : `${PROVISIONAL_SETTINGS.kidsMaxAge + 1}歳以上`}
                </span>
              </span>
              <input
                type="radio"
                value={value}
                {...register(`athletes.${index}.athleteClass`, {
                  onChange: resetCategoryFields,
                })}
                className="h-4 w-4 accent-alma-gold"
              />
            </label>
          ))}
        </div>
        <p className="text-xs leading-5 text-zinc-500">
          年齢は{PROVISIONAL_SETTINGS.ageReferenceLabel}で判定します。
        </p>
        <FieldError message={athleteErrors?.athleteClass?.message} />
      </fieldset>

      <Field label="氏名（漢字）" error={athleteErrors?.name?.message}>
        <input
          {...register(`athletes.${index}.name`)}
          placeholder="山田 太郎"
          className={inputClassName}
        />
      </Field>

      <Field label="氏名（カタカナ）" error={athleteErrors?.kana?.message}>
        <input
          {...register(`athletes.${index}.kana`)}
          placeholder="ヤマダ タロウ"
          className={inputClassName}
        />
      </Field>

      <Field label="性別" error={athleteErrors?.gender?.message}>
        <span className="relative block">
          <select {...register(`athletes.${index}.gender`)} className={selectClassName}>
            <option value="">性別を選択</option>
            <option value="male">男性</option>
            <option value="female">女性</option>
          </select>
          <SelectArrow />
        </span>
      </Field>

      <Field label="生年月日" error={athleteErrors?.birthDate?.message}>
        <input
          type="date"
          {...register(`athletes.${index}.birthDate`)}
          className={`${inputClassName} scheme-dark`}
        />
      </Field>

      {athleteClass === "kids" ? (
        <Field
          label="保護者氏名"
          error={athleteErrors?.guardianName?.message}
          className="sm:col-span-2"
        >
          <input
            {...register(`athletes.${index}.guardianName`)}
            placeholder="山田 花子"
            className={inputClassName}
          />
        </Field>
      ) : null}

      {options && divisions.length > 0 ? (
        <>
          {athleteClass === "adult" ? (
            <p className="text-xs leading-5 text-zinc-400 sm:col-span-2">
              ジュブナイルを除き、実年齢より若い年齢区分にも出場できます。
            </p>
          ) : null}
          {divisions.map((division) => renderDivision(division))}
        </>
      ) : (
        <p className="rounded-md border border-dashed border-white/15 px-4 py-4 text-sm leading-6 text-zinc-400 sm:col-span-2">
          出場部門と大人／キッズを選択すると、年齢区分・階級などの入力欄が表示されます。
        </p>
      )}
    </div>
  );
}
