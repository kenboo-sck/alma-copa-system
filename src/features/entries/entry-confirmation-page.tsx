"use client";

import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircleIcon,
  LocationIcon,
  TrophyIcon,
  UserIcon,
} from "@/components/icons";
import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import {
  ATHLETE_CLASS_LABELS,
  DIVISION_LABELS,
  DIVISION_SELECTION_LABELS,
  PROVISIONAL_SETTINGS,
  calculateEntryFees,
  getGenderLabel,
  getOpenClassLabel,
  getSelectedDivisions,
  isAthleteClass,
  isDivisionSelection,
  type AthleteInput,
} from "@/lib/entries/entry-divisions";
import {
  clearEntryDraft,
  readEntryDraft,
  saveEntryCompletion,
  type EntryCompletion,
  type EntryDraft,
} from "@/lib/entries/entry-storage";
import { calculateAgeOnDate, maskEmail } from "@/lib/entries/entry-validation";
import {
  PAYMENT_METHOD_DESCRIPTIONS,
  PAYMENT_METHOD_LABELS,
  formatPaymentDueDate,
  getAvailablePaymentMethods,
  type PaymentMethod,
} from "@/lib/payments/payment-methods";
import {
  getCurrentEntryFee,
  mapPublicEvent,
  type PublicEvent,
} from "@/features/events/public-event-utils";
import type { EntryType } from "@/types/entry";

import { EntryFeeBreakdown } from "./entry-fee-breakdown";

type EntryConfirmationPageProps = {
  eventId: string;
};

function formatYen(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

function formatDateText(value: string) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function getEntryTypeLabel(entryType: EntryType) {
  return entryType === "representative" ? "代表者エントリー" : "個人エントリー";
}

function getApplicantName(draft: EntryDraft) {
  return draft.entryType === "representative"
    ? draft.values.representativeName
    : (draft.values.athletes[0]?.name ?? "");
}

function getApplicantKana(draft: EntryDraft) {
  return draft.values.athletes[0]?.kana || "-";
}

function getApplicantEmail(draft: EntryDraft) {
  return draft.entryType === "representative"
    ? draft.values.representativeEmail
    : draft.values.email;
}

function getApplicantPhone(draft: EntryDraft) {
  return draft.entryType === "representative"
    ? draft.values.representativePhone
    : draft.values.phone;
}

function getApplicantGym(draft: EntryDraft) {
  return draft.entryType === "representative"
    ? draft.values.representativeGym
    : draft.values.gym;
}

function getApplicantPostalCode(draft: EntryDraft) {
  return draft.entryType === "representative"
    ? draft.values.representativePostalCode
    : draft.values.postalCode;
}

function getApplicantPrefecture(draft: EntryDraft) {
  return draft.entryType === "representative"
    ? draft.values.representativePrefecture
    : draft.values.prefecture;
}

function getApplicantCity(draft: EntryDraft) {
  return draft.entryType === "representative"
    ? draft.values.representativeCity
    : draft.values.city;
}

function getApplicantAddressLine(draft: EntryDraft) {
  return draft.entryType === "representative"
    ? draft.values.representativeAddressLine
    : draft.values.addressLine;
}

function formatBirthDate(value: string) {
  return value ? formatDateText(value) : "-";
}

function formatAge(value: number | null) {
  return value === null ? "-" : `${value}歳`;
}

function getAthleteCalculatedAge(birthDate: string, eventDate: Date | null) {
  if (!eventDate) {
    return null;
  }

  return calculateAgeOnDate(birthDate, eventDate);
}

function getAthleteClassLabel(athlete: AthleteInput) {
  return isAthleteClass(athlete.athleteClass)
    ? ATHLETE_CLASS_LABELS[athlete.athleteClass]
    : "-";
}

function getDivisionSelectionLabel(athlete: AthleteInput) {
  return isDivisionSelection(athlete.divisionSelection)
    ? DIVISION_SELECTION_LABELS[athlete.divisionSelection]
    : "-";
}

function SummaryRow({
  label,
  value,
  fullWidth = false,
  valueClassName = "",
  error = "",
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
  valueClassName?: string;
  error?: string;
}) {
  return (
    <div
      className={`rounded-md border border-white/10 bg-white/[0.04] p-4 ${
        fullWidth ? "sm:col-span-2" : ""
      }`}
    >
      <p
        className={`text-xs font-semibold ${error ? "text-red-300" : "text-zinc-500"}`}
      >
        {label}
      </p>
      <p
        className={`mt-2 text-sm font-semibold leading-6 text-white ${
          valueClassName || "break-words"
        }`}
      >
        {value || "-"}
      </p>
      {error ? <p className="mt-2 text-xs leading-5 text-red-300">{error}</p> : null}
    </div>
  );
}

export function EntryConfirmationPage({ eventId }: EntryConfirmationPageProps) {
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setValidationStage] = useState<string | null>(null);
  const [, setValidationErrors] = useState<
    Array<{ field: string; message: string; code: string }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      setError(null);
      setValidationStage(null);
      setValidationErrors([]);

      try {
        const storedDraft = readEntryDraft(eventId);
        if (!storedDraft) {
          throw new Error(
            "確認用の入力内容が見つかりません。入力画面からやり直してください。",
          );
        }

        const snapshot = await getDoc(doc(db, collections.events, eventId));
        if (!snapshot.exists()) {
          throw new Error("大会が見つかりません。");
        }

        const data = snapshot.data();
        if (data.status !== "published" || data.deletedAt) {
          throw new Error("この大会は現在公開されていません。");
        }

        if (isMounted) {
          setDraft(storedDraft);
          setEvent(mapPublicEvent(snapshot.id, data));
        }
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "確認ページの読み込みに失敗しました。";
        if (isMounted) {
          setDraft(null);
          setEvent(null);
          setError(message);
          setValidationStage(null);
          setValidationErrors([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [eventId]);

  const pricing = event ? getCurrentEntryFee(event) : null;
  const athletes = useMemo(() => (draft ? draft.values.athletes : []), [draft]);
  const totalAmount = calculateEntryFees(pricing?.entryFee ?? 0, athletes).totalAmount;
  const eventDate = event?.eventDate ?? null;
  const editHref =
    draft?.entryType === "representative"
      ? `/events/${eventId}/entry/representative`
      : `/events/${eventId}/entry/individual`;
  // 大会で有効になっている支払方法だけを表示する。1 つだけの場合はそれを選択済みにする。
  const availablePaymentMethods = useMemo(
    () => (event ? getAvailablePaymentMethods(event.paymentSettings) : []),
    [event],
  );
  const paymentMethod: PaymentMethod | null =
    selectedPaymentMethod && availablePaymentMethods.includes(selectedPaymentMethod)
      ? selectedPaymentMethod
      : availablePaymentMethods.length === 1
        ? availablePaymentMethods[0]
        : null;

  async function proceedToStripe() {
    if (!draft || !event) {
      setError("確認用の入力内容が見つかりません。");
      return;
    }

    const values = draft.values;
    const isRepresentative = draft.entryType === "representative";
    const resolvedAthletes = draft.values.athletes;
    const firstAthlete = resolvedAthletes[0];

    if (!firstAthlete) {
      setError("選手を1名以上追加してください。");
      return;
    }

    if (Number.isNaN(new Date(firstAthlete.birthDate).getTime())) {
      setError("生年月日の形式が正しくありません。");
      return;
    }

    if (!paymentMethod) {
      setError("お支払い方法を選択してください。");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setValidationStage(null);
    setValidationErrors([]);

    const applicantEmail = getApplicantEmail(draft);
    const applicantPhone = getApplicantPhone(draft);
    const applicantGym = getApplicantGym(draft);
    const applicantPostalCode = getApplicantPostalCode(draft);
    const applicantPrefecture = getApplicantPrefecture(draft);
    const applicantCity = getApplicantCity(draft);
    const applicantAddressLine = getApplicantAddressLine(draft);
    const athleteCount = resolvedAthletes.length;
    const pricingNow = getCurrentEntryFee(event);
    // 画面に表示している金額。サーバー側で同じ式から再計算し、不一致なら決済へ進まない。
    const totalAmountNow = calculateEntryFees(
      pricingNow.entryFee,
      resolvedAthletes,
    ).totalAmount;

    try {
      const validationResponse = await fetch("/api/entries/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          email: applicantEmail,
          entryType: draft.entryType,
          athletes: resolvedAthletes,
        }),
      });

      const validationData = (await validationResponse.json().catch(() => null)) as {
        error?: string;
        normalizedEmail?: string;
        stage?: string;
        message?: string;
        fieldErrors?: Array<{
          field: string;
          message: string;
          code: string;
        }>;
      } | null;

      if (!validationResponse.ok) {
        setValidationStage(validationData?.stage ?? "schema_validation");
        setValidationErrors(validationData?.fieldErrors ?? []);
        console.error("Entry validation failed before Stripe", {
          stage: validationData?.stage ?? "unknown",
          message:
            validationData?.message ??
            validationData?.error ??
            "入力内容の確認に失敗しました。",
          validationResult: validationData,
          formData: {
            eventId,
            entryType: draft.entryType,
            applicantEmail: maskEmail(applicantEmail),
            applicantCount: athleteCount,
          },
        });
        throw new Error(
          validationData?.message ??
            validationData?.error ??
            "入力内容の確認に失敗しました。しばらくしてからもう一度お試しください。",
        );
      }

      // 申込の保存・料金の確定・決済ページの作成は、すべてサーバーが行う。
      const response = await fetch("/api/payments/checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          entryType: draft.entryType,
          paymentMethod,
          email: applicantEmail,
          phone: applicantPhone,
          gym: applicantGym,
          postalCode: applicantPostalCode,
          prefecture: applicantPrefecture,
          city: applicantCity,
          addressLine: applicantAddressLine,
          representative: isRepresentative
            ? {
                name: values.representativeName,
                email: values.representativeEmail,
                phone: values.representativePhone,
                gym: values.representativeGym,
                postalCode: values.representativePostalCode,
                prefecture: values.representativePrefecture,
                city: values.representativeCity,
                addressLine: values.representativeAddressLine,
              }
            : undefined,
          athletes: resolvedAthletes,
          amount: totalAmountNow,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        stage?: string;
        message?: string;
        fieldErrors?: Array<{
          field: string;
          message: string;
          code: string;
        }>;
        url?: string;
        sessionId?: string;
        entryId?: string;
        completion?: EntryCompletion;
      };
      const isCard = paymentMethod === "card";
      const isCompleted = isCard
        ? Boolean(data.url && data.sessionId)
        : Boolean(data.entryId && data.completion);

      if (!response.ok || !isCompleted) {
        setValidationStage(data.stage ?? "unexpected_error");
        if (data.fieldErrors) {
          setValidationErrors(data.fieldErrors);
        }
        console.error("Checkout session creation failed after validation", {
          stage: data.stage ?? "unexpected_error",
          message: data.message ?? data.error ?? "お申し込みの処理に失敗しました。",
          validationResult: data,
          formData: {
            eventId,
            entryType: draft.entryType,
            applicantEmail: maskEmail(applicantEmail),
            applicantCount: athleteCount,
          },
        });
        throw new Error(
          data.message ?? data.error ?? "お申し込みの処理に失敗しました。",
        );
      }

      if (isCard && data.url) {
        window.location.href = data.url;
        return;
      }

      // 銀行振込・現金払い: 未払いのまま受付完了。受付完了画面で支払案内を表示する。
      if (data.completion && data.entryId) {
        saveEntryCompletion(data.completion);
        clearEntryDraft(eventId);
        window.location.href = `/entry/accepted?entry_id=${encodeURIComponent(data.entryId)}`;
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "お申し込みの処理に失敗しました。";

      console.error("確認ページからの申込に失敗しました", {
        eventId,
        eventTitle: event.title,
        entryType: draft.entryType,
        error: caughtError,
      });

      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const summaryItems = draft
    ? [
        { label: "氏名", value: getApplicantName(draft) },
        { label: "フリガナ", value: getApplicantKana(draft) },
        { label: "電話番号", value: getApplicantPhone(draft) },
        { label: "申込区分", value: getEntryTypeLabel(draft.entryType) },
        { label: "合計金額", value: formatYen(totalAmount) },
      ]
    : [];

  const applicantEmail = draft ? getApplicantEmail(draft) : "";
  const applicantGym = draft ? getApplicantGym(draft) : "";
  const applicantPostalCode = draft ? getApplicantPostalCode(draft) : "";
  const applicantPrefecture = draft ? getApplicantPrefecture(draft) : "";
  const applicantCity = draft ? getApplicantCity(draft) : "";
  const applicantAddressLine = draft ? getApplicantAddressLine(draft) : "";
  const addressText = draft
    ? `〒${applicantPostalCode} ${applicantPrefecture}${applicantCity}\n${applicantAddressLine}`
    : "";

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div className="overflow-hidden rounded-lg border border-alma-gold/25 bg-alma-charcoal shadow-2xl shadow-black/40">
        <div className="h-1 bg-alma-gold" />

        <div className="border-b border-white/10 bg-black/20 px-5 py-5 sm:px-8 sm:py-6 lg:px-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-alma-gold/40 bg-alma-gold/10 px-3 py-1.5 text-xs font-bold text-alma-gold">
            <CheckCircleIcon size={15} />
            確認
          </div>
          <h1 className="mt-5 text-3xl font-black leading-tight text-white sm:text-5xl">
            エントリー内容確認
          </h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
            入力内容とお支払い方法を確認してからお申し込みください。修正が必要な場合は入力画面へ戻り、
            この内容で問題なければお手続きへ進んでください。
          </p>

          {error ? (
            <div className="mt-5 rounded-md border border-red-700/70 bg-red-950/80 px-4 py-4 text-sm text-red-100">
              <p className="leading-6">{error}</p>
              <div className="mt-4">
                <Link
                  href={draft ? editHref : `/events/${eventId}/entry`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-500/40 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition hover:border-red-300 hover:bg-white/10"
                >
                  <ArrowLeftIcon size={16} />
                  修正する
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mx-auto w-full max-w-[1100px] p-5 sm:p-8 lg:p-10">
          <div className="rounded-lg border border-white/10 bg-black/35 p-4 sm:p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-alma-gold">
                  Entry Summary
                </p>
                <h2 className="mt-1 text-lg font-bold text-white">確認内容</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  年齢は大会開催日時点で計算しています。
                </p>
              </div>
              <span className="rounded-full bg-alma-gold px-3 py-1 text-xs font-bold text-black">
                受付前
              </span>
            </div>

            {loading ? (
              <div className="flex items-center gap-3 px-1 py-6">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-alma-gold border-t-transparent" />
                <p className="text-sm text-zinc-400">確認内容を読み込んでいます。</p>
              </div>
            ) : draft && event ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {summaryItems.map((item) => (
                    <SummaryRow
                      key={item.label}
                      label={item.label}
                      value={item.value}
                    />
                  ))}
                  <SummaryRow
                    label="メールアドレス"
                    value={applicantEmail}
                    fullWidth
                    valueClassName="break-all"
                  />
                  <SummaryRow
                    label="所属"
                    value={applicantGym}
                    fullWidth
                    valueClassName="break-words"
                  />
                </div>

                <div className="mt-5 rounded-md border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start gap-3">
                    <UserIcon size={20} className="mt-0.5 shrink-0 text-alma-gold" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-500">住所</p>
                      <p className="mt-2 whitespace-pre-line break-words text-sm leading-7 text-white">
                        {addressText}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-alma-gold/90">
                      選手・出場内容
                    </p>
                  </div>

                  {draft.entryType === "representative" ? (
                    <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm font-bold text-white">代表者情報</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <SummaryRow
                          label="代表者氏名"
                          value={draft.values.representativeName}
                        />
                        <SummaryRow
                          label="代表者メールアドレス"
                          value={draft.values.representativeEmail}
                          fullWidth
                          valueClassName="break-all"
                        />
                        <SummaryRow
                          label="代表者電話番号"
                          value={draft.values.representativePhone}
                        />
                        <SummaryRow
                          label="代表者所属"
                          value={draft.values.representativeGym}
                          fullWidth
                        />
                      </div>
                    </div>
                  ) : null}

                  {athletes.map((athlete, index) => (
                    <div
                      key={`${athlete.name}-${index}`}
                      className="rounded-md border border-white/10 bg-white/[0.03] p-4"
                    >
                      <p className="text-sm font-bold text-white">
                        {draft.entryType === "representative"
                          ? `選手 ${index + 1}`
                          : "選手情報"}
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <SummaryRow label="氏名" value={athlete.name} />
                        <SummaryRow label="フリガナ" value={athlete.kana} />
                        <SummaryRow
                          label="性別"
                          value={getGenderLabel(athlete.gender)}
                        />
                        <SummaryRow
                          label="生年月日"
                          value={formatBirthDate(athlete.birthDate)}
                        />
                        <SummaryRow
                          label="計算年齢"
                          value={formatAge(
                            getAthleteCalculatedAge(athlete.birthDate, eventDate),
                          )}
                        />
                        <SummaryRow
                          label="大人／キッズ"
                          value={getAthleteClassLabel(athlete)}
                        />
                        {athlete.athleteClass === "kids" ? (
                          <SummaryRow label="保護者氏名" value={athlete.guardianName} />
                        ) : null}
                        <SummaryRow
                          label="出場部門"
                          value={getDivisionSelectionLabel(athlete)}
                        />
                      </div>

                      {getSelectedDivisions(athlete.divisionSelection).map(
                        (division) => {
                          const entry = athlete[division];

                          return (
                            <div
                              key={division}
                              className="mt-3 rounded-md border border-alma-gold/25 bg-black/20 p-3"
                            >
                              <p className="text-xs font-bold tracking-[0.2em] text-alma-gold">
                                {DIVISION_LABELS[division]}
                              </p>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <SummaryRow
                                  label="年齢区分"
                                  value={entry.ageCategory}
                                />
                                <SummaryRow
                                  label={
                                    athlete.athleteClass === "kids"
                                      ? `階級（${PROVISIONAL_SETTINGS.kidsWeightNote}）`
                                      : "階級"
                                  }
                                  value={entry.weightClass}
                                />
                                {division === "gi" ? (
                                  <SummaryRow label="帯色" value={athlete.gi.belt} />
                                ) : (
                                  <SummaryRow
                                    label="グレード"
                                    value={athlete.nogi.grade}
                                  />
                                )}
                                {athlete.athleteClass === "adult" ? (
                                  <SummaryRow
                                    label="無差別級"
                                    value={getOpenClassLabel(entry.openClass)}
                                  />
                                ) : null}
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-md border border-alma-gold/25 bg-[linear-gradient(135deg,rgba(214,173,69,0.12),rgba(255,255,255,0.03))] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-alma-gold">
                    料金内訳
                  </p>
                  <div className="mt-3">
                    <EntryFeeBreakdown
                      entryFee={pricing?.entryFee ?? 0}
                      priceLabel={pricing?.label ?? ""}
                      athletes={athletes}
                      showAthleteHeadings={draft.entryType === "representative"}
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-md border border-alma-gold/25 bg-black/30 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-alma-gold">
                    お支払い方法
                  </p>
                  {availablePaymentMethods.length === 0 ? (
                    <p className="mt-3 text-sm leading-6 text-red-200">
                      この大会は現在、Webでのお申し込みを受け付けていません（選択できるお支払い方法がありません）。
                      お手数ですが運営までお問い合わせください。
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {availablePaymentMethods.map((method) => (
                        <label
                          key={method}
                          className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                            paymentMethod === method
                              ? "border-alma-gold bg-alma-gold/10"
                              : "border-white/10 bg-white/[0.03] hover:border-alma-gold/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={method}
                            checked={paymentMethod === method}
                            onChange={() => setSelectedPaymentMethod(method)}
                            className="mt-1 h-4 w-4 accent-alma-gold"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-white">
                              {PAYMENT_METHOD_LABELS[method]}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-zinc-400">
                              {PAYMENT_METHOD_DESCRIPTIONS[method]}
                              {method === "bank_transfer" &&
                              event.paymentSettings.bankTransfer.dueDate
                                ? ` お支払い期限: ${formatPaymentDueDate(event.paymentSettings.bankTransfer.dueDate)}`
                                : ""}
                            </span>
                          </span>
                        </label>
                      ))}
                      <p className="text-xs leading-5 text-zinc-500">
                        参加費はお申し込み時点の金額で確定します。お支払い日によって金額が変わることはありません。
                        {draft.entryType === "representative"
                          ? " 代表者エントリーは、全選手分をまとめて 1 つの方法でお支払いいただきます。"
                          : ""}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-md border border-alma-gold/25 bg-[linear-gradient(135deg,rgba(214,173,69,0.12),rgba(255,255,255,0.03))] p-4">
                  <div className="flex items-center gap-3">
                    <CalendarIcon size={18} className="text-alma-gold" />
                    <div>
                      <p className="text-xs font-semibold text-zinc-500">大会名</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {event.title}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <LocationIcon size={18} className="text-alma-gold" />
                    <div>
                      <p className="text-xs font-semibold text-zinc-500">会場</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {event.venue || "会場未定"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-t border-white/10 pt-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                    <Link
                      href={draft ? editHref : `/events/${eventId}/entry`}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-alma-gold hover:bg-alma-gold/10 sm:w-auto"
                    >
                      <ArrowLeftIcon size={16} />
                      修正する
                    </Link>
                    <button
                      type="button"
                      onClick={() => void proceedToStripe()}
                      disabled={
                        loading || isSubmitting || !draft || !event || !paymentMethod
                      }
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-alma-gold px-6 py-3 text-sm font-bold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
                    >
                      <TrophyIcon size={16} />
                      {isSubmitting
                        ? "お手続き中..."
                        : paymentMethod === "card"
                          ? "この内容で決済へ進む"
                          : paymentMethod
                            ? "この内容で申し込む"
                            : "お支払い方法を選択してください"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="px-1 py-6 text-sm leading-7 text-zinc-400">
                {error ??
                  "確認内容が見つかりませんでした。入力画面からやり直してください。"}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
