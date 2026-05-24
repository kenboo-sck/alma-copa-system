"use client";

import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
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
import { getSiteUrl } from "@/lib/site-url";
import {
  getCurrentEntryFee,
  mapPublicEvent,
  type PublicEvent,
} from "@/features/events/public-event-utils";
import type { EntryType } from "@/types/entry";

const ENTRY_DRAFT_STORAGE_KEY = "alma-entry-draft";

type AthleteDraft = {
  name: string;
  kana: string;
  gender: string;
  birthDate: string;
  category: string;
  ageCategory: string;
  weightClass: string;
  openClass: string;
};

type EntryDraftValues = {
  name: string;
  kana: string;
  email: string;
  phone: string;
  gym: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
  representativeName: string;
  representativeEmail: string;
  representativePhone: string;
  representativeGym: string;
  representativePostalCode: string;
  representativePrefecture: string;
  representativeCity: string;
  representativeAddressLine: string;
  gender: string;
  birthDate: string;
  category: string;
  ageCategory: string;
  weightClass: string;
  openClass: string;
  athletes: AthleteDraft[];
};

type EntryDraft = {
  eventId: string;
  entryType: EntryType;
  values: EntryDraftValues;
  savedAt: string;
};

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

function getStorageKey(eventId: string) {
  return `${ENTRY_DRAFT_STORAGE_KEY}:${eventId}`;
}

function readDraft(eventId: string): EntryDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(getStorageKey(eventId));
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

function getEntryTypeLabel(entryType: EntryType) {
  return entryType === "representative" ? "代表者エントリー" : "個人エントリー";
}

function getApplicantName(draft: EntryDraft) {
  return draft.entryType === "representative"
    ? draft.values.representativeName
    : draft.values.name;
}

function getApplicantKana(draft: EntryDraft) {
  if (draft.entryType === "representative") {
    return draft.values.athletes[0]?.kana ?? "-";
  }

  return draft.values.kana || "-";
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

function getAthletes(draft: EntryDraft) {
  return draft.entryType === "representative" ? draft.values.athletes : [draft.values];
}

function getEntryCategories(draft: EntryDraft) {
  const athletes = getAthletes(draft);
  return athletes
    .map((athlete) => athlete.category)
    .filter(Boolean)
    .join(" / ");
}

function formatBirthDate(value: string) {
  return value ? formatDateText(value) : "-";
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-semibold text-zinc-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold leading-6 text-white">
        {value || "-"}
      </p>
    </div>
  );
}

export function EntryConfirmationPage({ eventId }: EntryConfirmationPageProps) {
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const storedDraft = readDraft(eventId);
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
  const athletes = useMemo(() => (draft ? getAthletes(draft) : []), [draft]);
  const totalAmount = (pricing?.entryFee ?? 0) * Math.max(athletes.length, 1);
  const editHref =
    draft?.entryType === "representative"
      ? `/events/${eventId}/entry/representative`
      : `/events/${eventId}/entry/individual`;

  async function proceedToStripe() {
    if (!draft || !event) {
      setError("確認用の入力内容が見つかりません。");
      return;
    }

    const values = draft.values;
    const isRepresentative = draft.entryType === "representative";
    const resolvedAthletes = getAthletes(draft);
    const firstAthlete = resolvedAthletes[0];

    if (!firstAthlete) {
      setError("選手を1名以上追加してください。");
      return;
    }

    if (Number.isNaN(new Date(firstAthlete.birthDate).getTime())) {
      setError("生年月日の形式が正しくありません。");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const applicantName = getApplicantName(draft);
    const applicantEmail = getApplicantEmail(draft);
    const applicantPhone = getApplicantPhone(draft);
    const applicantGym = getApplicantGym(draft);
    const applicantPostalCode = getApplicantPostalCode(draft);
    const applicantPrefecture = getApplicantPrefecture(draft);
    const applicantCity = getApplicantCity(draft);
    const applicantAddressLine = getApplicantAddressLine(draft);
    const athleteCount = resolvedAthletes.length;
    const pricingNow = getCurrentEntryFee(event);
    const totalAmountNow = pricingNow.entryFee * athleteCount;

    const entryRef = doc(collection(db, collections.entries));
    const athletePayloads = resolvedAthletes.map((athlete) => ({
      name: athlete.name,
      kana: athlete.kana,
      gender: athlete.gender,
      birthDate: Timestamp.fromDate(new Date(athlete.birthDate)),
      category: athlete.category,
      ageCategory: athlete.ageCategory,
      weightClass: athlete.weightClass,
      openClass: athlete.openClass,
    }));

    const successUrl = `${getSiteUrl()}/payment/success?entry_id=${entryRef.id}&session_id={CHECKOUT_SESSION_ID}&applicant_name=${encodeURIComponent(applicantName)}&applicant_email=${encodeURIComponent(applicantEmail)}&event_id=${encodeURIComponent(eventId)}&event_title=${encodeURIComponent(event.title)}&entry_type=${encodeURIComponent(draft.entryType)}`;
    const cancelUrl = `${getSiteUrl()}/payment/cancel?entry_id=${entryRef.id}`;

    try {
      await setDoc(entryRef, {
        eventId,
        eventTitle: event.title,
        entryType: draft.entryType,
        entryStatus: "pending_payment",
        paymentStatus: "pending",
        paymentProvider: "stripe",
        name: applicantName,
        kana: isRepresentative ? firstAthlete.kana : values.kana,
        email: applicantEmail,
        phone: applicantPhone,
        gender: isRepresentative ? firstAthlete.gender : values.gender,
        birthDate: Timestamp.fromDate(new Date(firstAthlete.birthDate)),
        gym: applicantGym,
        postalCode: applicantPostalCode,
        prefecture: applicantPrefecture,
        city: applicantCity,
        addressLine: applicantAddressLine,
        category: isRepresentative ? firstAthlete.category : values.category,
        ageCategory: isRepresentative ? firstAthlete.ageCategory : values.ageCategory,
        weightClass: isRepresentative ? firstAthlete.weightClass : values.weightClass,
        openClass: isRepresentative ? firstAthlete.openClass : values.openClass,
        athlete: isRepresentative
          ? null
          : {
              name: values.name,
              kana: values.kana,
              gender: values.gender,
              birthDate: Timestamp.fromDate(new Date(values.birthDate)),
              category: values.category,
              ageCategory: values.ageCategory,
              weightClass: values.weightClass,
              openClass: values.openClass,
            },
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
          : null,
        athletes: isRepresentative ? athletePayloads : [],
        entryFee: pricingNow.entryFee,
        priceType: pricingNow.priceType,
        athleteCount,
        receptionStatus: "not_checked_in",
        weighInStatus: "not_weighed",
        bibNumber: "",
        bracketPosition: "",
        checkedInAt: null,
        weighInAt: null,
        participantCount: athleteCount,
        categoryEntryCount: athleteCount,
        subtotalAmount: totalAmountNow,
        discountAmount: 0,
        totalAmount: totalAmountNow,
        currency: "JPY",
        stripeSessionId: "",
        stripeCheckoutSessionId: "",
        stripePaymentIntentId: "",
        paymentFailedAt: null,
        paidAt: null,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      const response = await fetch("/api/payments/checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entryId: entryRef.id,
          eventId,
          eventTitle: event.title,
          entryType: draft.entryType,
          name: applicantName,
          kana: isRepresentative ? firstAthlete.kana : values.kana,
          email: applicantEmail,
          phone: applicantPhone,
          gym: applicantGym,
          gender: isRepresentative ? firstAthlete.gender : values.gender,
          birthDate: firstAthlete.birthDate,
          postalCode: applicantPostalCode,
          prefecture: applicantPrefecture,
          city: applicantCity,
          addressLine: applicantAddressLine,
          category: isRepresentative ? firstAthlete.category : values.category,
          ageCategory: isRepresentative ? firstAthlete.ageCategory : values.ageCategory,
          weightClass: isRepresentative ? firstAthlete.weightClass : values.weightClass,
          openClass: isRepresentative ? firstAthlete.openClass : values.openClass,
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
          athletes: isRepresentative ? values.athletes : undefined,
          amount: totalAmountNow,
          currency: "JPY",
          itemName: `ALMA COPA エントリー費（${pricingNow.label} / ${athleteCount}名）`,
          customerEmail: applicantEmail,
          successUrl,
          cancelUrl,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        url?: string;
        sessionId?: string;
        stripe?: {
          debug?: {
            testMode?: boolean;
          };
          isConfigured?: boolean;
          isTestMode?: boolean;
          missingKeys?: string[];
          warnings?: string[];
        };
      };

      if (!response.ok || !data.url || !data.sessionId) {
        throw new Error(data.error || "決済ページの作成に失敗しました。");
      }

      await updateDoc(entryRef, {
        stripeSessionId: data.sessionId,
        stripeCheckoutSessionId: data.sessionId,
        updatedAt: serverTimestamp(),
      }).catch((saveError: unknown) => {
        console.error("Stripe session ID の保存に失敗しました", {
          entryId: entryRef.id,
          saveError,
        });
      });

      window.location.href = data.url;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Stripe Checkoutの作成に失敗しました。";

      console.error("確認ページからの決済開始に失敗しました", {
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
        { label: "メールアドレス", value: getApplicantEmail(draft) },
        { label: "電話番号", value: getApplicantPhone(draft) },
        { label: "所属", value: getApplicantGym(draft) },
        { label: "申込区分", value: getEntryTypeLabel(draft.entryType) },
        { label: "出場カテゴリー", value: getEntryCategories(draft) },
        { label: "合計金額", value: formatYen(totalAmount) },
      ]
    : [];

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="overflow-hidden rounded-lg border border-alma-gold/25 bg-alma-charcoal shadow-2xl shadow-black/40">
        <div className="h-1 bg-alma-gold" />

        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-alma-gold/40 bg-alma-gold/10 px-3 py-1.5 text-xs font-bold text-alma-gold">
              <CheckCircleIcon size={15} />
              確認
            </div>
            <h1 className="mt-5 text-3xl font-black leading-tight text-white sm:text-5xl">
              エントリー内容確認
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
              入力内容を確認してからStripe決済へ進みます。修正が必要な場合は入力画面へ戻り、この内容で問題なければ決済へ進んでください。
            </p>

            {error ? (
              <div className="mt-6 rounded-md border border-red-700/70 bg-red-950/80 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={draft ? editHref : `/events/${eventId}/entry`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-alma-gold hover:bg-alma-gold/10"
              >
                <ArrowLeftIcon size={16} />
                修正する
              </Link>
              <button
                type="button"
                onClick={() => void proceedToStripe()}
                disabled={loading || isSubmitting || !draft || !event}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-alma-gold px-5 py-3 text-sm font-bold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <TrophyIcon size={16} />
                {isSubmitting ? "Stripeへ進行中..." : "この内容で決済へ進む"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/35 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-alma-gold">
                  Entry Summary
                </p>
                <h2 className="mt-1 text-lg font-bold text-white">確認内容</h2>
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
                </div>

                <div className="mt-5 rounded-md border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start gap-3">
                    <UserIcon size={20} className="mt-0.5 shrink-0 text-alma-gold" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-500">住所</p>
                      <p className="mt-2 text-sm leading-7 text-white">
                        〒{getApplicantPostalCode(draft)}{" "}
                        {getApplicantPrefecture(draft)}
                        {getApplicantCity(draft)}
                        <br />
                        {getApplicantAddressLine(draft)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-alma-gold/90">
                      その他必要な入力項目
                    </p>
                  </div>

                  {draft.entryType === "representative" ? (
                    <>
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
                          />
                          <SummaryRow
                            label="代表者電話番号"
                            value={draft.values.representativePhone}
                          />
                          <SummaryRow
                            label="代表者所属"
                            value={draft.values.representativeGym}
                          />
                        </div>
                      </div>

                      {draft.values.athletes.map((athlete, index) => (
                        <div
                          key={`${athlete.name}-${index}`}
                          className="rounded-md border border-white/10 bg-white/[0.03] p-4"
                        >
                          <p className="text-sm font-bold text-white">
                            選手 {index + 1}
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <SummaryRow label="氏名" value={athlete.name} />
                            <SummaryRow label="フリガナ" value={athlete.kana} />
                            <SummaryRow label="性別" value={athlete.gender} />
                            <SummaryRow
                              label="生年月日"
                              value={formatBirthDate(athlete.birthDate)}
                            />
                            <SummaryRow
                              label="出場カテゴリー"
                              value={athlete.category}
                            />
                            <SummaryRow
                              label="年齢カテゴリー"
                              value={athlete.ageCategory}
                            />
                            <SummaryRow label="階級" value={athlete.weightClass} />
                            <SummaryRow
                              label="無差別級"
                              value={
                                athlete.openClass === "yes" ? "参加する" : "参加しない"
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SummaryRow label="性別" value={draft.values.gender} />
                        <SummaryRow
                          label="生年月日"
                          value={formatBirthDate(draft.values.birthDate)}
                        />
                        <SummaryRow
                          label="出場カテゴリー"
                          value={draft.values.category}
                        />
                        <SummaryRow
                          label="年齢カテゴリー"
                          value={draft.values.ageCategory}
                        />
                        <SummaryRow label="階級" value={draft.values.weightClass} />
                        <SummaryRow
                          label="無差別級"
                          value={
                            draft.values.openClass === "yes" ? "参加する" : "参加しない"
                          }
                        />
                      </div>
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
