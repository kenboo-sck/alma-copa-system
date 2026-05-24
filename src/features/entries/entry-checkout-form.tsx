"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState, type ReactNode } from "react";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { z } from "zod";

import { CalendarIcon, ClockIcon, LocationIcon, TrophyIcon } from "@/components/icons";
import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import {
  formatDate,
  formatDateTime,
  getCurrentEntryFee,
  getEventImageUrl,
  getEntryState,
  mapPublicEvent,
  toCssUrl,
  type PublicEvent,
} from "@/features/events/public-event-utils";
import type { EntryType } from "@/types/entry";

const athleteSchema = z.object({
  name: z.string().min(1, "氏名を入力してください。").max(50),
  kana: z.string().min(1, "フリガナを入力してください。").max(80),
  gender: z.string().min(1, "性別を選択してください。"),
  birthDate: z.string().min(1, "生年月日を入力してください。"),
  category: z.string().min(1, "カテゴリを入力してください。").max(120),
  ageCategory: z.string().min(1, "年齢カテゴリーを選択してください。"),
  weightClass: z.string().min(1, "階級を選択してください。"),
  openClass: z.string().min(1, "無差別級を選択してください。"),
});

const individualEntrySchema = athleteSchema.extend({
  email: z.email("メールアドレスを正しく入力してください。"),
  phone: z.string().min(10, "電話番号を入力してください。").max(20),
  gym: z
    .string()
    .min(1, "道場・ジム名を入力してください。")
    .max(120, "所属は120文字以内で入力してください。"),
  postalCode: z.string().min(1, "郵便番号を入力してください。").max(12),
  prefecture: z.string().min(1, "都道府県を入力してください。").max(20),
  city: z.string().min(1, "市区町村を入力してください。").max(80),
  addressLine: z.string().min(1, "番地・建物名を入力してください。").max(160),
});

const representativeEntrySchema = z.object({
  representativeName: z.string().min(1, "代表者氏名を入力してください。").max(50),
  representativeEmail: z.email("代表者メールアドレスを正しく入力してください。"),
  representativePhone: z.string().min(10, "代表者電話番号を入力してください。").max(20),
  representativeGym: z
    .string()
    .min(1, "道場・ジム名を入力してください。")
    .max(120, "所属は120文字以内で入力してください。"),
  representativePostalCode: z.string().min(1, "郵便番号を入力してください。").max(12),
  representativePrefecture: z.string().min(1, "都道府県を入力してください。").max(20),
  representativeCity: z.string().min(1, "市区町村を入力してください。").max(80),
  representativeAddressLine: z
    .string()
    .min(1, "番地・建物名を入力してください。")
    .max(160),
  athletes: z.array(athleteSchema).min(1, "選手を1名以上追加してください。"),
});

type AthleteValues = z.infer<typeof athleteSchema>;
type EntryCheckoutValues = z.infer<typeof individualEntrySchema> &
  z.infer<typeof representativeEntrySchema>;

type EntryCheckoutFormProps = {
  eventId: string;
  entryType: EntryType;
};

const defaultAthleteValues: AthleteValues = {
  name: "",
  kana: "",
  gender: "",
  birthDate: "",
  category: "",
  ageCategory: "",
  weightClass: "",
  openClass: "",
};

const defaultValues: EntryCheckoutValues = {
  ...defaultAthleteValues,
  email: "",
  phone: "",
  gym: "",
  postalCode: "",
  prefecture: "",
  city: "",
  addressLine: "",
  representativeName: "",
  representativeEmail: "",
  representativePhone: "",
  representativeGym: "",
  representativePostalCode: "",
  representativePrefecture: "",
  representativeCity: "",
  representativeAddressLine: "",
  athletes: [defaultAthleteValues],
};

const categoryOptions = ["エキスパート", "アドバンス", "ビギナー"];

const ageCategoryOptions = [
  "キッズ（同じ年齢で試合組みます。）",
  "ジュベニウ 15歳から17歳",
  "アダルト 18歳から29歳",
  "マスター1 30歳から35歳",
  "マスター2 36歳から40歳",
  "マスター3 41歳から45歳",
  "マスター4 46歳から50歳",
  "マスター5 51歳以上",
];

const weightClassOptions = [
  "キッズ（体重手入力）",
  "ルースター",
  "ライトフェザー",
  "フェザー",
  "ライト",
  "ミドル",
  "ミディアムヘビー",
  "ヘビー",
  "スーパーヘビー",
];

const inputClassName =
  "h-[52px] w-full rounded-md border border-white/10 bg-black/55 px-4 text-sm text-white outline-none transition placeholder:text-zinc-600 hover:border-alma-gold/35 focus:border-alma-gold focus:bg-black/70 focus:shadow-[0_0_0_3px_rgba(214,173,69,0.13)]";

const selectClassName = `${inputClassName} appearance-none pr-11`;

const ENTRY_DRAFT_STORAGE_KEY = "alma-entry-draft";

function FormSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-white/10 pt-8">
      <div className="mb-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-gradient-to-r from-alma-gold/70 via-white/10 to-transparent" />
        <div className="text-right">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.34em] text-alma-gold/90">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-black text-white">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function SelectArrow() {
  return (
    <span className="pointer-events-none absolute right-4 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-b border-r border-alma-gold" />
  );
}

type EntryDraft = {
  eventId: string;
  entryType: EntryType;
  values: EntryCheckoutValues;
  savedAt: string;
};

function getEntryDraftStorageKey(eventId: string) {
  return `${ENTRY_DRAFT_STORAGE_KEY}:${eventId}`;
}

function readEntryDraft(eventId: string): EntryDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(getEntryDraftStorageKey(eventId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<EntryDraft> | null;

    if (
      !parsed ||
      parsed.eventId !== eventId ||
      (parsed.entryType !== "individual" && parsed.entryType !== "representative") ||
      typeof parsed.savedAt !== "string" ||
      !parsed.values
    ) {
      return null;
    }

    return parsed as EntryDraft;
  } catch {
    return null;
  }
}

function saveEntryDraft(
  eventId: string,
  entryType: EntryType,
  values: EntryCheckoutValues,
) {
  if (typeof window === "undefined") {
    return;
  }

  const draft: EntryDraft = {
    eventId,
    entryType,
    values,
    savedAt: new Date().toISOString(),
  };

  window.sessionStorage.setItem(
    getEntryDraftStorageKey(eventId),
    JSON.stringify(draft),
  );
}

export function EntryCheckoutForm({ eventId, entryType }: EntryCheckoutFormProps) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<EntryCheckoutValues>({
    resolver: zodResolver(
      entryType === "representative"
        ? representativeEntrySchema
        : individualEntrySchema,
    ) as unknown as Resolver<EntryCheckoutValues>,
    defaultValues,
  });

  const {
    fields: athleteFields,
    append: appendAthlete,
    remove: removeAthlete,
  } = useFieldArray({
    control,
    name: "athletes",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadEvent() {
      setIsLoadingEvent(true);
      setEventError(null);

      try {
        const snapshot = await getDoc(doc(db, collections.events, eventId));

        if (!snapshot.exists()) {
          throw new Error("大会が見つかりません。");
        }

        const data = snapshot.data();

        if (data.status !== "published" || data.deletedAt) {
          throw new Error("この大会は現在公開されていません。");
        }

        const nextEvent = mapPublicEvent(snapshot.id, data);

        if (isMounted) {
          setEvent(nextEvent);
          setError(null);
        }
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "大会情報の取得に失敗しました。";

        console.error("大会情報の取得に失敗しました", {
          eventId,
          collectionName: collections.events,
          error: caughtError,
          message,
        });

        if (isMounted) {
          setEvent(null);
          setEventError(
            message === "大会が見つかりません。"
              ? "大会情報が見つかりませんでした。URLをご確認ください。"
              : message,
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingEvent(false);
        }
      }
    }

    void loadEvent();

    return () => {
      isMounted = false;
    };
  }, [eventId]);

  useEffect(() => {
    const draft = readEntryDraft(eventId);
    if (!draft || draft.entryType !== entryType) {
      return;
    }

    reset({
      ...defaultValues,
      ...draft.values,
      athletes:
        draft.values.athletes?.length > 0
          ? draft.values.athletes
          : defaultValues.athletes,
    });
  }, [entryType, eventId, reset]);

  const individualPostalCode = useWatch({ control, name: "postalCode" }) ?? "";
  const representativePostalCode =
    useWatch({ control, name: "representativePostalCode" }) ?? "";
  const postalCode =
    entryType === "representative" ? representativePostalCode : individualPostalCode;

  useEffect(() => {
    const normalizedPostalCode = postalCode.replace(/\D/g, "");

    if (normalizedPostalCode.length !== 7) {
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(
        `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${normalizedPostalCode}`,
        { signal: controller.signal },
      )
        .then((response) => response.json())
        .then((data: unknown) => {
          if (
            typeof data !== "object" ||
            data === null ||
            !("results" in data) ||
            !Array.isArray(data.results) ||
            !data.results[0]
          ) {
            return;
          }

          const result = data.results[0] as {
            address1?: unknown;
            address2?: unknown;
            address3?: unknown;
          };

          if (typeof result.address1 === "string") {
            setValue(
              entryType === "representative"
                ? "representativePrefecture"
                : "prefecture",
              result.address1,
              { shouldValidate: true },
            );
          }

          const city = [result.address2, result.address3]
            .filter((value): value is string => typeof value === "string")
            .join("");

          if (city) {
            setValue(
              entryType === "representative" ? "representativeCity" : "city",
              city,
              {
                shouldValidate: true,
              },
            );
          }
        })
        .catch((caughtError: unknown) => {
          if (
            caughtError instanceof DOMException &&
            caughtError.name === "AbortError"
          ) {
            return;
          }

          console.info("郵便番号から住所を補完できませんでした。", caughtError);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [entryType, postalCode, setValue]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function submitEntry(values: EntryCheckoutValues) {
    if (!event) {
      setError(eventError ?? "大会情報を読み込めませんでした。");
      return;
    }

    setError(null);
    saveEntryDraft(eventId, entryType, values);
    setToast("確認ページへ移動します。");
    window.location.href = `/events/${eventId}/confirm`;
  }

  const entryState = event ? getEntryState(event) : null;
  const heroImage = event ? getEventImageUrl(event) : "/images/event-detail-hero.jpg";
  const entryTypeLabel =
    entryType === "representative" ? "REPRESENTATIVE ENTRY" : "INDIVIDUAL ENTRY";
  const entryTypeTitle =
    entryType === "representative" ? "代表者情報入力" : "選手情報入力";
  const currentPricing = event ? getCurrentEntryFee(event) : null;
  const watchedAthletes = useWatch({ control, name: "athletes" }) ?? [];
  const displayAthleteCount =
    entryType === "representative" ? Math.max(watchedAthletes.length, 1) : 1;
  const displayTotalAmount = (currentPricing?.entryFee ?? 0) * displayAthleteCount;

  return (
    <main className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[#050505] text-white">
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_20%_22%,rgba(214,173,69,0.12),transparent_24%),radial-gradient(circle_at_82%_74%,rgba(214,173,69,0.08),transparent_24%),linear-gradient(180deg,#050505_0%,#090909_48%,#020202_100%)]"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.14)_1px,transparent_1px)] bg-[size:64px_64px]"
        aria-hidden="true"
      />

      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.58)), url('${toCssUrl(heroImage)}')`,
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_18%_82%,rgba(214,173,69,0.2),transparent_28%),linear-gradient(90deg,rgba(0,0,0,0.9)_0%,rgba(0,0,0,0.66)_44%,rgba(0,0,0,0.22)_100%)]"
          aria-hidden="true"
        />
        <div
          className="absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-b from-transparent to-[#050505]"
          aria-hidden="true"
        />

        <div className="relative z-20 mx-auto flex min-h-[36vh] w-full max-w-[1200px] items-end px-4 py-8 sm:px-6 sm:py-10 lg:min-h-[42vh] lg:px-8 lg:py-12">
          <div className="max-w-3xl">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.5em] text-alma-gold">
              ENTRY FORM
            </p>
            <h1 className="mt-4 text-[clamp(2rem,5vw,4.4rem)] font-black uppercase leading-[0.95] tracking-[0.08em] text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.5)]">
              {entryTypeLabel}
            </h1>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-7 text-zinc-200 sm:text-base">
              {entryTypeTitle}
              。必要事項を入力し、確認ページで内容を見直してから決済へ進みます。
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto w-full max-w-[1000px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <form
          onSubmit={(event) => void handleSubmit(submitEntry)(event)}
          className="overflow-hidden rounded-lg border border-alma-gold/25 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.34)] sm:p-7 lg:p-8"
        >
          {toast ? (
            <div className="mb-5 rounded-md border border-emerald-700/70 bg-emerald-950/80 px-4 py-3 text-sm text-emerald-100">
              {toast}
            </div>
          ) : null}
          {error || eventError ? (
            <div className="mb-5 rounded-md border border-red-700/70 bg-red-950/80 px-4 py-3 text-sm text-red-100">
              {error ?? eventError}
            </div>
          ) : null}

          <div className="mb-9 rounded-lg border border-white/10 bg-black/42 p-5">
            {isLoadingEvent ? (
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-alma-gold border-t-transparent" />
                <p className="text-sm text-zinc-400">大会情報を読み込んでいます。</p>
              </div>
            ) : event ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-sm bg-alma-gold px-2.5 py-1 text-xs font-black text-black">
                    {entryState?.label ?? "受付状態不明"}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    ALMA COPA Official Entry
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-alma-gold/90">
                    Tournament
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">{event.title}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex items-center gap-3 border-t border-white/10 pt-3">
                    <CalendarIcon size={18} className="text-alma-gold" />
                    <div>
                      <p className="text-xs text-zinc-500">開催日</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {formatDate(event.eventDate)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 border-t border-white/10 pt-3">
                    <LocationIcon size={18} className="text-alma-gold" />
                    <div>
                      <p className="text-xs text-zinc-500">会場</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {event.venue || "会場未定"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 border-t border-white/10 pt-3">
                    <ClockIcon size={18} className="text-alma-gold" />
                    <div>
                      <p className="text-xs text-zinc-500">受付期間</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {formatDateTime(event.entryStartAt)} -
                      </p>
                      <p className="text-sm font-semibold text-white">
                        {formatDateTime(event.entryEndAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-10">
            {entryType === "individual" ? (
              <>
                <FormSection eyebrow="Basic Info" title="基本情報">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        道場・ジム名
                      </span>
                      <input
                        {...register("gym")}
                        placeholder="ALMA JIU-JITSU"
                        className={inputClassName}
                      />
                      {errors.gym ? (
                        <span className="text-xs text-red-300">
                          {errors.gym.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        氏名（漢字）
                      </span>
                      <input
                        {...register("name")}
                        placeholder="山田 太郎"
                        className={inputClassName}
                      />
                      {errors.name ? (
                        <span className="text-xs text-red-300">
                          {errors.name.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        氏名（カタカナ）
                      </span>
                      <input
                        {...register("kana")}
                        placeholder="ヤマダ タロウ"
                        className={inputClassName}
                      />
                      {errors.kana ? (
                        <span className="text-xs text-red-300">
                          {errors.kana.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        メールアドレス
                      </span>
                      <input
                        type="email"
                        autoComplete="email"
                        {...register("email")}
                        placeholder="entry@example.com"
                        className={inputClassName}
                      />
                      {errors.email ? (
                        <span className="text-xs text-red-300">
                          {errors.email.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2 sm:col-span-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        電話番号
                      </span>
                      <input
                        {...register("phone")}
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="09012345678"
                        className={inputClassName}
                      />
                      {errors.phone ? (
                        <span className="text-xs text-red-300">
                          {errors.phone.message}
                        </span>
                      ) : null}
                    </label>
                  </div>
                </FormSection>

                <FormSection eyebrow="Address" title="住所">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        郵便番号
                      </span>
                      <input
                        {...register("postalCode")}
                        inputMode="numeric"
                        autoComplete="postal-code"
                        placeholder="1234567"
                        className={inputClassName}
                      />
                      {errors.postalCode ? (
                        <span className="text-xs text-red-300">
                          {errors.postalCode.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        都道府県
                      </span>
                      <input
                        {...register("prefecture")}
                        autoComplete="address-level1"
                        placeholder="東京都"
                        className={inputClassName}
                      />
                      {errors.prefecture ? (
                        <span className="text-xs text-red-300">
                          {errors.prefecture.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        市区町村
                      </span>
                      <input
                        {...register("city")}
                        autoComplete="address-level2"
                        placeholder="渋谷区"
                        className={inputClassName}
                      />
                      {errors.city ? (
                        <span className="text-xs text-red-300">
                          {errors.city.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        番地・建物名
                      </span>
                      <input
                        {...register("addressLine")}
                        autoComplete="street-address"
                        placeholder="神南1-1-1 ALMAビル"
                        className={inputClassName}
                      />
                      {errors.addressLine ? (
                        <span className="text-xs text-red-300">
                          {errors.addressLine.message}
                        </span>
                      ) : null}
                    </label>
                  </div>
                </FormSection>

                <FormSection eyebrow="Athlete Info" title="選手情報">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">性別</span>
                      <span className="relative block">
                        <select {...register("gender")} className={selectClassName}>
                          <option value="">性別を選択</option>
                          <option value="male">男性</option>
                          <option value="female">女性</option>
                        </select>
                        <SelectArrow />
                      </span>
                      {errors.gender ? (
                        <span className="text-xs text-red-300">
                          {errors.gender.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        生年月日
                      </span>
                      <input
                        type="date"
                        {...register("birthDate")}
                        className={`${inputClassName} scheme-dark`}
                      />
                      {errors.birthDate ? (
                        <span className="text-xs text-red-300">
                          {errors.birthDate.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        カテゴリー
                      </span>
                      <span className="relative block">
                        <select {...register("category")} className={selectClassName}>
                          <option value="">カテゴリーを選択</option>
                          {categoryOptions.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                        <SelectArrow />
                      </span>
                      {errors.category ? (
                        <span className="text-xs text-red-300">
                          {errors.category.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        年齢カテゴリー
                      </span>
                      <span className="relative block">
                        <select
                          {...register("ageCategory")}
                          className={selectClassName}
                        >
                          <option value="">年齢カテゴリーを選択</option>
                          {ageCategoryOptions.map((ageCategory) => (
                            <option key={ageCategory} value={ageCategory}>
                              {ageCategory}
                            </option>
                          ))}
                        </select>
                        <SelectArrow />
                      </span>
                      {errors.ageCategory ? (
                        <span className="text-xs text-red-300">
                          {errors.ageCategory.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">階級</span>
                      <span className="relative block">
                        <select
                          {...register("weightClass")}
                          className={selectClassName}
                        >
                          <option value="">階級を選択</option>
                          {weightClassOptions.map((weightClass) => (
                            <option key={weightClass} value={weightClass}>
                              {weightClass}
                            </option>
                          ))}
                        </select>
                        <SelectArrow />
                      </span>
                      {errors.weightClass ? (
                        <span className="text-xs text-red-300">
                          {errors.weightClass.message}
                        </span>
                      ) : null}
                    </label>

                    <fieldset className="space-y-3 sm:col-span-2">
                      <legend className="text-sm font-semibold text-zinc-200">
                        無差別級（オープンクラス）
                      </legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="group flex min-h-[52px] cursor-pointer items-center justify-between rounded-md border border-white/10 bg-black/45 px-4 transition hover:border-alma-gold/40">
                          <span className="text-sm font-semibold text-white">
                            参加する
                          </span>
                          <input
                            type="radio"
                            value="yes"
                            {...register("openClass")}
                            className="h-4 w-4 accent-alma-gold"
                          />
                        </label>
                        <label className="group flex min-h-[52px] cursor-pointer items-center justify-between rounded-md border border-white/10 bg-black/45 px-4 transition hover:border-alma-gold/40">
                          <span className="text-sm font-semibold text-white">
                            参加しない
                          </span>
                          <input
                            type="radio"
                            value="no"
                            {...register("openClass")}
                            className="h-4 w-4 accent-alma-gold"
                          />
                        </label>
                      </div>
                      {errors.openClass ? (
                        <span className="text-xs text-red-300">
                          {errors.openClass.message}
                        </span>
                      ) : null}
                    </fieldset>
                  </div>
                </FormSection>
              </>
            ) : (
              <>
                <FormSection eyebrow="Representative" title="代表者情報">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        代表者氏名
                      </span>
                      <input
                        {...register("representativeName")}
                        placeholder="山田 太郎"
                        className={inputClassName}
                      />
                      {errors.representativeName ? (
                        <span className="text-xs text-red-300">
                          {errors.representativeName.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        道場・ジム名
                      </span>
                      <input
                        {...register("representativeGym")}
                        placeholder="ALMA JIU-JITSU"
                        className={inputClassName}
                      />
                      {errors.representativeGym ? (
                        <span className="text-xs text-red-300">
                          {errors.representativeGym.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        代表者メールアドレス
                      </span>
                      <input
                        type="email"
                        autoComplete="email"
                        {...register("representativeEmail")}
                        placeholder="team@example.com"
                        className={inputClassName}
                      />
                      {errors.representativeEmail ? (
                        <span className="text-xs text-red-300">
                          {errors.representativeEmail.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        代表者電話番号
                      </span>
                      <input
                        {...register("representativePhone")}
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="09012345678"
                        className={inputClassName}
                      />
                      {errors.representativePhone ? (
                        <span className="text-xs text-red-300">
                          {errors.representativePhone.message}
                        </span>
                      ) : null}
                    </label>
                  </div>
                </FormSection>

                <FormSection eyebrow="Team Address" title="住所">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        郵便番号
                      </span>
                      <input
                        {...register("representativePostalCode")}
                        inputMode="numeric"
                        autoComplete="postal-code"
                        placeholder="1234567"
                        className={inputClassName}
                      />
                      {errors.representativePostalCode ? (
                        <span className="text-xs text-red-300">
                          {errors.representativePostalCode.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        都道府県
                      </span>
                      <input
                        {...register("representativePrefecture")}
                        autoComplete="address-level1"
                        placeholder="東京都"
                        className={inputClassName}
                      />
                      {errors.representativePrefecture ? (
                        <span className="text-xs text-red-300">
                          {errors.representativePrefecture.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        市区町村
                      </span>
                      <input
                        {...register("representativeCity")}
                        autoComplete="address-level2"
                        placeholder="渋谷区"
                        className={inputClassName}
                      />
                      {errors.representativeCity ? (
                        <span className="text-xs text-red-300">
                          {errors.representativeCity.message}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-zinc-200">
                        番地・建物名
                      </span>
                      <input
                        {...register("representativeAddressLine")}
                        autoComplete="street-address"
                        placeholder="神南1-1-1 ALMAビル"
                        className={inputClassName}
                      />
                      {errors.representativeAddressLine ? (
                        <span className="text-xs text-red-300">
                          {errors.representativeAddressLine.message}
                        </span>
                      ) : null}
                    </label>
                  </div>
                </FormSection>

                <FormSection eyebrow="Athletes" title="選手情報">
                  <div className="space-y-5">
                    {athleteFields.map((field, index) => (
                      <div
                        key={field.id}
                        className="animate-[fadeIn_220ms_ease-out] rounded-lg border border-white/10 bg-black/30 p-5"
                      >
                        <div className="mb-5 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.28em] text-alma-gold">
                              Athlete {index + 1}
                            </p>
                            <h3 className="mt-1 text-xl font-black text-white">
                              選手{index + 1}
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAthlete(index)}
                            disabled={athleteFields.length <= 1}
                            className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            選手を削除
                          </button>
                        </div>

                        <div className="grid gap-5 sm:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-zinc-200">
                              氏名（漢字）
                            </span>
                            <input
                              {...register(`athletes.${index}.name`)}
                              placeholder="山田 太郎"
                              className={inputClassName}
                            />
                            {errors.athletes?.[index]?.name ? (
                              <span className="text-xs text-red-300">
                                {errors.athletes[index]?.name?.message}
                              </span>
                            ) : null}
                          </label>

                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-zinc-200">
                              氏名（カタカナ）
                            </span>
                            <input
                              {...register(`athletes.${index}.kana`)}
                              placeholder="ヤマダ タロウ"
                              className={inputClassName}
                            />
                            {errors.athletes?.[index]?.kana ? (
                              <span className="text-xs text-red-300">
                                {errors.athletes[index]?.kana?.message}
                              </span>
                            ) : null}
                          </label>

                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-zinc-200">
                              性別
                            </span>
                            <span className="relative block">
                              <select
                                {...register(`athletes.${index}.gender`)}
                                className={selectClassName}
                              >
                                <option value="">性別を選択</option>
                                <option value="male">男性</option>
                                <option value="female">女性</option>
                              </select>
                              <SelectArrow />
                            </span>
                            {errors.athletes?.[index]?.gender ? (
                              <span className="text-xs text-red-300">
                                {errors.athletes[index]?.gender?.message}
                              </span>
                            ) : null}
                          </label>

                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-zinc-200">
                              生年月日
                            </span>
                            <input
                              type="date"
                              {...register(`athletes.${index}.birthDate`)}
                              className={`${inputClassName} scheme-dark`}
                            />
                            {errors.athletes?.[index]?.birthDate ? (
                              <span className="text-xs text-red-300">
                                {errors.athletes[index]?.birthDate?.message}
                              </span>
                            ) : null}
                          </label>

                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-zinc-200">
                              カテゴリー
                            </span>
                            <span className="relative block">
                              <select
                                {...register(`athletes.${index}.category`)}
                                className={selectClassName}
                              >
                                <option value="">カテゴリーを選択</option>
                                {categoryOptions.map((category) => (
                                  <option key={category} value={category}>
                                    {category}
                                  </option>
                                ))}
                              </select>
                              <SelectArrow />
                            </span>
                            {errors.athletes?.[index]?.category ? (
                              <span className="text-xs text-red-300">
                                {errors.athletes[index]?.category?.message}
                              </span>
                            ) : null}
                          </label>

                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-zinc-200">
                              年齢カテゴリー
                            </span>
                            <span className="relative block">
                              <select
                                {...register(`athletes.${index}.ageCategory`)}
                                className={selectClassName}
                              >
                                <option value="">年齢カテゴリーを選択</option>
                                {ageCategoryOptions.map((ageCategory) => (
                                  <option key={ageCategory} value={ageCategory}>
                                    {ageCategory}
                                  </option>
                                ))}
                              </select>
                              <SelectArrow />
                            </span>
                            {errors.athletes?.[index]?.ageCategory ? (
                              <span className="text-xs text-red-300">
                                {errors.athletes[index]?.ageCategory?.message}
                              </span>
                            ) : null}
                          </label>

                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-zinc-200">
                              階級
                            </span>
                            <span className="relative block">
                              <select
                                {...register(`athletes.${index}.weightClass`)}
                                className={selectClassName}
                              >
                                <option value="">階級を選択</option>
                                {weightClassOptions.map((weightClass) => (
                                  <option key={weightClass} value={weightClass}>
                                    {weightClass}
                                  </option>
                                ))}
                              </select>
                              <SelectArrow />
                            </span>
                            {errors.athletes?.[index]?.weightClass ? (
                              <span className="text-xs text-red-300">
                                {errors.athletes[index]?.weightClass?.message}
                              </span>
                            ) : null}
                          </label>

                          <fieldset className="space-y-3 sm:col-span-2">
                            <legend className="text-sm font-semibold text-zinc-200">
                              無差別級（オープンクラス）
                            </legend>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="flex min-h-[52px] cursor-pointer items-center justify-between rounded-md border border-white/10 bg-black/45 px-4 transition hover:border-alma-gold/40">
                                <span className="text-sm font-semibold text-white">
                                  参加する
                                </span>
                                <input
                                  type="radio"
                                  value="yes"
                                  {...register(`athletes.${index}.openClass`)}
                                  className="h-4 w-4 accent-alma-gold"
                                />
                              </label>
                              <label className="flex min-h-[52px] cursor-pointer items-center justify-between rounded-md border border-white/10 bg-black/45 px-4 transition hover:border-alma-gold/40">
                                <span className="text-sm font-semibold text-white">
                                  参加しない
                                </span>
                                <input
                                  type="radio"
                                  value="no"
                                  {...register(`athletes.${index}.openClass`)}
                                  className="h-4 w-4 accent-alma-gold"
                                />
                              </label>
                            </div>
                            {errors.athletes?.[index]?.openClass ? (
                              <span className="text-xs text-red-300">
                                {errors.athletes[index]?.openClass?.message}
                              </span>
                            ) : null}
                          </fieldset>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => appendAthlete(defaultAthleteValues)}
                      className="inline-flex min-h-[48px] w-full items-center justify-center rounded-md border border-alma-gold/50 bg-black/35 px-5 py-3 text-sm font-black text-alma-gold transition hover:bg-alma-gold hover:text-black sm:w-auto"
                    >
                      選手を追加
                    </button>
                  </div>
                </FormSection>
              </>
            )}

            <FormSection eyebrow="Confirmation" title="入力内容の確認">
              <div className="flex flex-col gap-5 rounded-lg border border-alma-gold/25 bg-[linear-gradient(135deg,rgba(214,173,69,0.12),rgba(255,255,255,0.03))] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-alma-gold">
                    Entry Summary
                  </p>
                  {entryType === "representative" ? (
                    <>
                      <p className="mt-2 text-3xl font-black text-white">
                        合計: {displayTotalAmount.toLocaleString("ja-JP")}円
                      </p>
                      <p className="mt-2 text-base font-semibold text-zinc-200">
                        エントリー費{" "}
                        {(currentPricing?.entryFee ?? 0).toLocaleString("ja-JP")}円 ×{" "}
                        {displayAthleteCount}名
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-3xl font-black text-white">
                      合計: {displayTotalAmount.toLocaleString("ja-JP")}円
                    </p>
                  )}
                  <p className="mt-1 text-sm font-semibold text-zinc-400">
                    {currentPricing?.label ?? "価格を確認中"} /
                    確認ページで内容を見直してから決済します
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isLoadingEvent || !event}
                  className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md bg-alma-gold px-6 py-3 text-sm font-black text-black shadow-[0_16px_40px_rgba(214,173,69,0.24)] transition hover:bg-[#e0be58] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
                >
                  <TrophyIcon size={18} />
                  入力内容を確認する
                </button>
              </div>
            </FormSection>
          </div>
        </form>
      </section>
    </main>
  );
}
