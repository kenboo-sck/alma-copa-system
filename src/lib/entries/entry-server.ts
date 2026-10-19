import "server-only";

import { createHash } from "node:crypto";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { EmailProviderError, emailService } from "@/lib/email";
import {
  buildBodyPreview,
  createServerMailLog,
  toMailLogProvider,
} from "@/lib/email/mail-logs";
import type { EntryEmailPayload } from "@/lib/email/types";
import { isRecord, readEntryAccounting } from "@/lib/entries/entry-accounting";
import type { AthleteInputValues } from "@/lib/entries/entry-athlete-schema";
import {
  ENTRY_FORMAT_VERSION,
  buildEntrySummaryLines,
  buildLegacySummaryFields,
  calculateEntryFees,
  normalizeAthlete,
  type NormalizedAthlete,
} from "@/lib/entries/entry-divisions";
import {
  accountingFields,
  ensureAccountingInitialized,
  recalculate,
  writeLedgerRecord,
} from "@/lib/entries/entry-ledger";
import {
  buildAgeCategoryFieldErrors,
  buildDuplicateEmailFieldError,
  buildEntryDocumentId,
  normalizeEmail,
  type EntryValidationFailure,
  type EntryValidationFieldError,
} from "@/lib/entries/entry-validation";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { collections } from "@/lib/firebase/collections";
import {
  PAYMENT_METHOD_LABELS,
  buildEntryPaymentInfo,
  buildPaymentGuidanceSections,
  getAvailablePaymentMethods,
  getEventPaymentSettings,
  getPaymentDueAt,
  readEntryPaymentInfo,
  toPaymentMethod,
  type EntryPaymentInfo,
  type PaymentMethod,
} from "@/lib/payments/payment-methods";
import {
  getCurrentEntryFee,
  mapPublicEvent,
  toDate,
} from "@/features/events/public-event-utils";

// エントリーの保存・料金の確定・支払状態の更新を行うサーバー処理。
// Firestore ルールでは一般ユーザーの直接書き込みを認めず、すべてここを通す。

type DataRecord = Record<string, unknown>;

type EntryContact = {
  name: string;
  email: string;
  phone: string;
  gym: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
};

export type CreateEntryInput = {
  eventId: string;
  entryType: "individual" | "representative";
  paymentMethod: PaymentMethod;
  email: string;
  normalizedEmail?: string;
  phone: string;
  gym: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
  representative?: EntryContact;
  athletes: AthleteInputValues[];
  // 画面に表示していた合計金額。サーバーの計算結果との一致確認にだけ使う。
  amount: number;
};

export type CreatedEntry = {
  entryId: string;
  eventId: string;
  eventTitle: string;
  entryType: "individual" | "representative";
  applicantName: string;
  applicantEmail: string;
  normalizedEmail: string;
  paymentMethod: PaymentMethod;
  paymentInfo: EntryPaymentInfo;
  entryFee: number;
  priceType: string;
  priceLabel: string;
  athleteCount: number;
  divisionEntryCount: number;
  openClassEntryCount: number;
  totalAmount: number;
  // 未払いの同じ申込をやり直した場合、前回確定した参加費をそのまま使う。
  feeCarriedOver: boolean;
  summaryLines: string[];
  eventDate: Date;
  athletes: NormalizedAthlete[];
};

export type CreateEntryResult =
  | { ok: true; entry: CreatedEntry }
  | { ok: false; failure: EntryValidationFailure };

function failure(
  status: number,
  stage: EntryValidationFailure["stage"],
  message: string,
  fieldErrors: EntryValidationFieldError[],
): { ok: false; failure: EntryValidationFailure } {
  return { ok: false, failure: { ok: false, status, stage, message, fieldErrors } };
}

function simpleFailure(
  status: number,
  stage: EntryValidationFailure["stage"],
  field: string,
  code: string,
  message: string,
) {
  return failure(status, stage, message, [{ field, message, code }]);
}

const PRICE_LABELS: Record<string, string> = {
  early: "早期割引",
  regular: "通常価格",
  late: "最終価格",
};

// 出場内容（申込区分と選手ごとの出場情報）が同じかどうかを比べるためのキー。
function buildContentKey(entryType: string, athletes: NormalizedAthlete[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ entryType, athletes }))
    .digest("hex");
}

function isPaidEntry(data: DataRecord) {
  return data.paymentStatus === "paid";
}

// 管理者が変更・キャンセル・入金記録を行った申込（履歴や金額の記録がある申込）。
// 公開フォームからの申し込み直しで上書きすると履歴と食い違うため、重複として扱う。
function hasAdminRecords(data: DataRecord) {
  return (
    (typeof data.revision === "number" && data.revision > 0) ||
    data.accountingInitialized === true
  );
}

// 銀行振込・現金払いで受付済み（未払い）のエントリー。重複申込の判定に使う。
function isAcceptedUnpaidEntry(data: DataRecord) {
  return (
    toPaymentMethod(data.paymentMethod) !== "card" &&
    data.entryStatus === "confirmed" &&
    data.paymentStatus !== "paid"
  );
}

// 同じ大会・同じメールアドレスでの新しい申込を受け付けない申込（有効な申込）。
// キャンセル済みの申込は、記録が残っていても再申込を妨げない。
function blocksReapplication(data: DataRecord) {
  return (
    data.entryStatus !== "cancelled" &&
    (isPaidEntry(data) || isAcceptedUnpaidEntry(data) || hasAdminRecords(data))
  );
}

// 新しい申込で上書きしてよい申込（カード決済の手続きが終わっていない申込など）。
// 支払済みの申込や、変更・キャンセル・入金の記録がある申込は、記録を残すため上書きしない。
function isOverwritableEntry(data: DataRecord) {
  return !isPaidEntry(data) && !hasAdminRecords(data);
}

export async function createEntry(
  input: CreateEntryInput,
  now = new Date(),
): Promise<CreateEntryResult> {
  const db = getAdminFirestore();
  const eventSnapshot = await db
    .collection(collections.events)
    .doc(input.eventId)
    .get();

  if (!eventSnapshot.exists) {
    return simpleFailure(
      404,
      "event_lookup",
      "eventId",
      "event_not_found",
      "大会が見つかりません。",
    );
  }

  const eventData = eventSnapshot.data() as DataRecord;

  if (eventData.status !== "published" || eventData.deletedAt != null) {
    return simpleFailure(
      400,
      "event_status",
      "eventId",
      "event_not_published",
      "この大会は現在公開されていません。",
    );
  }

  const eventDate = toDate(eventData.eventDate);
  if (!eventDate) {
    return simpleFailure(
      400,
      "event_date",
      "eventDate",
      "event_date_missing",
      "大会開催日が設定されていないため、年齢カテゴリーを確認できません。",
    );
  }

  const athletes = input.athletes
    .map((athlete) => normalizeAthlete(athlete))
    .filter((athlete): athlete is NormalizedAthlete => athlete !== null);
  const firstAthlete = athletes[0];

  if (!firstAthlete || athletes.length !== input.athletes.length) {
    return simpleFailure(
      400,
      "age_category_check",
      "athletes",
      "applicant_missing",
      "選手情報が見つかりません。入力内容をご確認ください。",
    );
  }

  const ageFieldErrors = buildAgeCategoryFieldErrors(
    athletes,
    eventDate,
    input.entryType,
  );
  if (ageFieldErrors.length > 0) {
    return failure(
      400,
      "age_category_check",
      ageFieldErrors[0].message,
      ageFieldErrors,
    );
  }

  // 大会で有効になっていない支払方法は、API に直接送られても受け付けない。
  const paymentSettings = getEventPaymentSettings(eventData);
  if (!getAvailablePaymentMethods(paymentSettings, now).includes(input.paymentMethod)) {
    return simpleFailure(
      400,
      "payment_method_check",
      "paymentMethod",
      "payment_method_unavailable",
      "選択された支払方法は、この大会ではご利用いただけません。ページを再読み込みして選び直してください。",
    );
  }

  const isRepresentative = input.entryType === "representative";
  const contact: Omit<EntryContact, "name" | "email" | "phone"> =
    isRepresentative && input.representative ? input.representative : input;
  const applicantName =
    isRepresentative && input.representative
      ? input.representative.name
      : firstAthlete.name;
  const normalizedEmail = normalizeEmail(input.normalizedEmail ?? input.email);
  const entriesCollection = db.collection(collections.entries);
  // 申込の ID は「大会ID__メールアドレス」。その ID に記録を残したキャンセル済みの申込が
  // ある場合だけ、再申込を「…__2」「…__3」の ID に保存する。
  const baseEntryId = buildEntryDocumentId(input.eventId, normalizedEmail);
  const eventTitle = typeof eventData.title === "string" ? eventData.title : "";
  const pricingNow = getCurrentEntryFee(mapPublicEvent(input.eventId, eventData), now);
  const contentKey = buildContentKey(input.entryType, athletes);
  const paymentInfo = buildEntryPaymentInfo(paymentSettings, input.paymentMethod);
  const paymentDueAt = getPaymentDueAt(paymentInfo.dueDate);
  const summaryLines = buildEntrySummaryLines(athletes, { numbered: isRepresentative });
  const storedAthletes = athletes.map((athlete) => ({
    ...athlete,
    birthDate: new Date(athlete.birthDate),
  }));

  return db.runTransaction<CreateEntryResult>(async (transaction) => {
    // 同じ大会・同じメールアドレスの申込（キャンセル済みを含む）をすべて読む。
    const baseSnapshot = await transaction.get(entriesCollection.doc(baseEntryId));
    const sameEmailSnapshot = await transaction.get(
      entriesCollection
        .where("eventId", "==", input.eventId)
        .where("normalizedEmail", "==", normalizedEmail),
    );
    const sameEmailEntries = new Map<string, DataRecord>();
    if (baseSnapshot.exists) {
      sameEmailEntries.set(baseSnapshot.id, baseSnapshot.data() as DataRecord);
    }
    for (const snapshot of sameEmailSnapshot.docs) {
      sameEmailEntries.set(snapshot.id, snapshot.data() as DataRecord);
    }

    // 支払済み、銀行振込・現金払いで受付済み（未払い）、または管理者の記録がある
    // 有効な申込がある場合は重複。キャンセル済みの申込は重複として扱わない。
    const blocking = [...sameEmailEntries.values()].find(blocksReapplication);
    if (blocking) {
      const duplicateError = buildDuplicateEmailFieldError(input.entryType);
      return failure(409, "duplicate_email_check", duplicateError.message, [
        {
          ...duplicateError,
          code: isPaidEntry(blocking)
            ? "duplicate_email"
            : hasAdminRecords(blocking)
              ? "duplicate_managed_entry"
              : "duplicate_unpaid_entry",
        },
      ]);
    }

    // 上書きしてよい申込（カード決済の手続き途中など）があれば、従来どおり同じ申込として
    // 保存し直す。なければ、空いている ID に新しく保存する（記録のある申込は残す）。
    const overwritable = [...sameEmailEntries.entries()]
      .filter(([, data]) => isOverwritableEntry(data))
      .sort(([a], [b]) => Number(b === baseEntryId) - Number(a === baseEntryId));
    let entryId = overwritable[0]?.[0] ?? baseEntryId;
    if (!overwritable[0] && sameEmailEntries.has(baseEntryId)) {
      let suffix = 2;
      while (sameEmailEntries.has(`${baseEntryId}__${suffix}`)) {
        suffix += 1;
      }
      entryId = `${baseEntryId}__${suffix}`;
      // 同時に同じ ID へ保存されないよう、トランザクションの読み取りに含める。
      const candidate = await transaction.get(entriesCollection.doc(entryId));
      if (candidate.exists) {
        return simpleFailure(
          409,
          "duplicate_email_check",
          "email",
          "duplicate_retry",
          "申込の保存が重なりました。時間をおいて、もう一度お試しください。",
        );
      }
    }
    const entryRef = entriesCollection.doc(entryId);
    const existing = sameEmailEntries.get(entryId) ?? null;

    // カード決済の手続きが終わっていない申込のやり直し。出場内容が同じなら、
    // 最初の申込時に確定した参加費を引き継ぐ（料金期間が変わっても再計算しない）。
    // 出場内容を変えた場合は新しい申込として、現在の料金で計算し直す。
    const previous =
      existing !== null &&
      existing.entryStatus === "pending_payment" &&
      existing.contentKey === contentKey &&
      typeof existing.entryFee === "number" &&
      existing.entryFee > 0 &&
      typeof existing.priceType === "string"
        ? existing
        : null;
    const carryOverFee = previous !== null;
    const entryFee = previous ? (previous.entryFee as number) : pricingNow.entryFee;
    const priceType = previous ? (previous.priceType as string) : pricingNow.priceType;
    const fees = calculateEntryFees(entryFee, athletes);

    if (!carryOverFee && input.amount !== fees.totalAmount) {
      return simpleFailure(
        409,
        "amount_check",
        "amount",
        "amount_mismatch",
        "料金が画面の表示と一致しませんでした。申込時期による料金の切り替わりなどが考えられます。ページを再読み込みして金額をご確認ください。",
      );
    }

    const isCard = input.paymentMethod === "card";

    transaction.set(entryRef, {
      formatVersion: ENTRY_FORMAT_VERSION,
      eventId: input.eventId,
      eventTitle,
      entryType: input.entryType,
      // 申込状態と支払状態は別に持つ。銀行振込・現金払いは、未払いのまま受付済みになる。
      entryStatus: isCard ? "pending_payment" : "confirmed",
      paymentStatus: "pending",
      paymentMethod: input.paymentMethod,
      paymentProvider: isCard ? "stripe" : "manual",
      // 申込時点の支払案内。大会設定を後から変更しても、この内容は変わらない。
      paymentInfo: {
        bankAccountInfo: paymentInfo.bankAccountInfo,
        note: paymentInfo.note,
        dueDate: paymentInfo.dueDate,
      },
      paymentDueDate: paymentInfo.dueDate,
      paymentDueAt: paymentDueAt ? Timestamp.fromDate(paymentDueAt) : null,
      name: applicantName,
      kana: firstAthlete.kana,
      email: input.email,
      normalizedEmail,
      phone: input.phone,
      gender: firstAthlete.gender,
      birthDate: new Date(firstAthlete.birthDate),
      gym: contact.gym,
      postalCode: contact.postalCode,
      prefecture: contact.prefecture,
      city: contact.city,
      addressLine: contact.addressLine,
      // 旧形式から引き継いでいる要約項目。出場内容の正は athlete / athletes。
      ...buildLegacySummaryFields(firstAthlete),
      athlete: isRepresentative ? null : storedAthletes[0],
      representative: isRepresentative ? (input.representative ?? null) : null,
      athletes: isRepresentative ? storedAthletes : [],
      contentKey,
      // 参加費は申込時にサーバーが確定する。支払日が料金期間を過ぎても再計算しない。
      entryFee,
      priceType,
      feeConfirmedAt: previous
        ? (previous.feeConfirmedAt ??
          previous.createdAt ??
          FieldValue.serverTimestamp())
        : FieldValue.serverTimestamp(),
      athleteCount: athletes.length,
      divisionEntryCount: fees.divisionEntryCount,
      openClassEntryCount: fees.openClassEntryCount,
      openClassFee: fees.openClassFee,
      receptionStatus: "not_checked_in",
      weighInStatus: "not_weighed",
      bibNumber: "",
      bracketPosition: "",
      checkedInAt: null,
      weighInAt: null,
      participantCount: athletes.length,
      categoryEntryCount: fees.divisionEntryCount,
      subtotalAmount: fees.totalAmount,
      discountAmount: 0,
      totalAmount: fees.totalAmount,
      currency: "JPY",
      stripeSessionId: "",
      stripeCheckoutSessionId: "",
      stripePaymentIntentId: "",
      paymentFailedAt: null,
      paidAt: null,
      paymentConfirmedAt: null,
      paymentConfirmedVia: null,
      paymentConfirmedByUid: null,
      paymentConfirmedByEmail: null,
      paymentIssue: null,
      // 管理者による変更の版数（同時編集の検出に使う）。
      revision: 0,
      // 受付メール／完了メールの送信状況。二重送信を防ぐために使う。
      // 銀行振込・現金払いは、保存と同時にこのリクエストが送信を担当する。
      entryEmail: isCard
        ? { status: "none" }
        : { status: "sending", claimedAt: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: previous
        ? (previous.createdAt ?? FieldValue.serverTimestamp())
        : FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      entry: {
        entryId,
        eventId: input.eventId,
        eventTitle,
        entryType: input.entryType,
        applicantName,
        applicantEmail: input.email,
        normalizedEmail,
        paymentMethod: input.paymentMethod,
        paymentInfo,
        entryFee,
        priceType,
        priceLabel: PRICE_LABELS[priceType] ?? "",
        athleteCount: athletes.length,
        divisionEntryCount: fees.divisionEntryCount,
        openClassEntryCount: fees.openClassEntryCount,
        totalAmount: fees.totalAmount,
        feeCarriedOver: carryOverFee,
        summaryLines,
        eventDate,
        athletes,
      },
    };
  });
}

// 作成した Checkout Session をエントリーに記録する（決済との対応確認と調査に使う）。
export async function recordCheckoutSession(entryId: string, sessionId: string) {
  await getAdminFirestore().collection(collections.entries).doc(entryId).update({
    stripeCheckoutSessionId: sessionId,
    stripeSessionId: sessionId,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// メール
// ---------------------------------------------------------------------------

function stringField(data: DataRecord, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function getStoredSummaryLines(data: DataRecord): string[] {
  if (data.formatVersion !== ENTRY_FORMAT_VERSION) {
    return [];
  }

  const isRepresentative = data.entryType === "representative";
  const stored = isRepresentative
    ? Array.isArray(data.athletes)
      ? data.athletes
      : []
    : data.athlete
      ? [data.athlete]
      : [];

  return buildEntrySummaryLines(stored as NormalizedAthlete[], {
    numbered: isRepresentative,
  });
}

// 保存済みのエントリーから、受付メール／完了メールの内容を組み立てる。
export function buildEntryEmailPayload(
  entryId: string,
  data: DataRecord,
  sessionId?: string,
): EntryEmailPayload | null {
  const entryType =
    data.entryType === "individual" || data.entryType === "representative"
      ? data.entryType
      : null;
  const eventId = stringField(data, "eventId");
  const eventTitle = stringField(data, "eventTitle");
  const applicantName = stringField(data, "name");
  const applicantEmail = stringField(data, "email");

  if (!entryType || !eventId || !eventTitle || !applicantName || !applicantEmail) {
    return null;
  }

  const isPaid = data.paymentStatus === "paid";
  const paymentInfo = readEntryPaymentInfo(data);
  const summaryLines = getStoredSummaryLines(data);

  return {
    entryId,
    eventId,
    eventTitle,
    entryType,
    applicantName,
    applicantEmail,
    paymentStatus: isPaid ? "paid" : "pending",
    sessionId,
    ...(summaryLines.length > 0 ? { entryDetailLines: summaryLines } : {}),
    ...(typeof data.totalAmount === "number" && data.totalAmount > 0
      ? { totalAmount: data.totalAmount }
      : {}),
    paymentMethodLabel: PAYMENT_METHOD_LABELS[paymentInfo.method],
    amountLabel: isPaid ? "お支払い金額" : "お支払い予定金額",
    paymentStatusLabel: isPaid ? "支払い済み" : "未払い",
    paymentGuidance: isPaid ? [] : buildPaymentGuidanceSections(paymentInfo),
  };
}

export type EntryEmailOutcome = "sent" | "failed" | "not_configured" | "skipped";

// 送信を担当する権利（entryEmail.status = "sending"）を得た処理だけが呼ぶ。
// 送信結果をエントリーとメール履歴に記録する。
export async function deliverEntryEmails(
  entryId: string,
  sessionId?: string,
): Promise<EntryEmailOutcome> {
  const db = getAdminFirestore();
  const entryRef = db.collection(collections.entries).doc(entryId);
  const snapshot = await entryRef.get();
  const payload = snapshot.exists
    ? buildEntryEmailPayload(entryId, snapshot.data() as DataRecord, sessionId)
    : null;

  async function finish(status: "sent" | "failed", error: string | null) {
    await entryRef
      .update({
        entryEmail: {
          status,
          error,
          finishedAt: FieldValue.serverTimestamp(),
        },
      })
      .catch((updateError: unknown) => {
        console.error("Entry email status update failed", { entryId, updateError });
      });
  }

  if (!payload) {
    await finish("failed", "メールに必要な情報が不足しています。");
    return "skipped";
  }

  const status = emailService.getEnvironmentStatus();
  if (!status.isConfigured) {
    console.error("Entry email service is not configured", {
      entryId,
      provider: status.provider,
      missingKeys: status.missingKeys,
    });
    await finish(
      "failed",
      `メール送信の設定が不足しています: ${status.missingKeys.join(", ")}`,
    );
    return "not_configured";
  }

  const messages = emailService.getEntryEmailMessages(payload);
  const logBase = {
    entryId,
    eventId: payload.eventId,
    eventTitle: payload.eventTitle,
    mailType: "entry_completed" as const,
    provider: toMailLogProvider(status.provider),
    createdByAdminUid: null,
    createdByAdminEmail: null,
  };

  try {
    await emailService.sendEntryEmails(payload);

    await Promise.allSettled(
      messages.map((message) =>
        createServerMailLog({
          ...logBase,
          recipientEmail: message.recipientEmail,
          recipientName: message.recipientName,
          recipientType: message.recipientType,
          subject: message.subject,
          bodyPreview: buildBodyPreview(message.text),
          status: "sent",
          errorMessage: null,
        }),
      ),
    );
    await finish("sent", null);
    return "sent";
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedRecipient =
      error instanceof EmailProviderError
        ? error.details.recipient
        : payload.applicantEmail;
    const failedMessage = messages.find(
      (message) => message.recipientEmail === failedRecipient,
    );

    if (failedMessage) {
      await createServerMailLog({
        ...logBase,
        recipientEmail: failedMessage.recipientEmail,
        recipientName: failedMessage.recipientName,
        recipientType: failedMessage.recipientType,
        subject: failedMessage.subject,
        bodyPreview: buildBodyPreview(failedMessage.text),
        status: "failed",
        errorMessage,
      }).catch((logError: unknown) => {
        console.error("Entry email failure log write failed", { entryId, logError });
      });
    }

    console.error("Entry emails failed", { entryId, error: errorMessage });
    await finish("failed", errorMessage);
    return "failed";
  }
}

export type EntryEmailResendResult =
  | {
      ok: true;
      results: {
        recipientType: "user" | "admin";
        recipientEmail: string;
        ok: boolean;
        error: string | null;
      }[];
    }
  | { ok: false; status: number; message: string };

// 管理画面からの受付メール（受付完了・完了メール）の再送。申込時と同じ文面を使う。
// includeAdmin が false の場合は申込者向けだけを送る。送信結果は申込とメール履歴に記録する。
export async function resendEntryEmails(input: {
  entryId: string;
  includeAdmin: boolean;
  adminUid: string;
  adminEmail: string;
}): Promise<EntryEmailResendResult> {
  const db = getAdminFirestore();
  const entryRef = db.collection(collections.entries).doc(input.entryId);

  // 送信を担当する権利を得る（同じ申込への同時の再送や、申込直後の送信と重ならないようにする）。
  const claim = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(entryRef);
    if (!snapshot.exists) {
      return { ok: false as const, status: 404, message: "申込が見つかりません。" };
    }
    const data = snapshot.data() as DataRecord;
    if (data.entryStatus !== "confirmed") {
      return {
        ok: false as const,
        status: 409,
        message:
          data.entryStatus === "pending_payment"
            ? "カード決済の手続きが終わっていない申込には、受付メールを送れません。"
            : "受付済みの申込だけ、受付メールを再送できます。",
      };
    }
    const entryEmail = isRecord(data.entryEmail) ? data.entryEmail : {};
    const claimedAt = toDate(entryEmail.claimedAt);
    if (
      entryEmail.status === "sending" &&
      claimedAt &&
      Date.now() - claimedAt.getTime() <= EMAIL_CLAIM_TIMEOUT_MS
    ) {
      return {
        ok: false as const,
        status: 409,
        message:
          "受付メールを送信中です。少し時間をおいて、画面を再読み込みしてください。",
      };
    }
    transaction.update(entryRef, {
      entryEmail: { status: "sending", claimedAt: FieldValue.serverTimestamp() },
    });
    return { ok: true as const, data };
  });

  if (!claim.ok) {
    return claim;
  }

  const payload = buildEntryEmailPayload(input.entryId, claim.data);
  const status = emailService.getEnvironmentStatus();
  const finish = (result: "sent" | "failed", error: string | null) =>
    entryRef
      .update({
        entryEmail: {
          status: result,
          error,
          finishedAt: FieldValue.serverTimestamp(),
          resentAt: FieldValue.serverTimestamp(),
          resentByEmail: input.adminEmail,
        },
      })
      .catch((updateError: unknown) => {
        console.error("Entry email resend status update failed", {
          entryId: input.entryId,
          updateError,
        });
      });

  if (!payload || !status.isConfigured) {
    const message = !payload
      ? "メールに必要な情報が不足しています。"
      : `メール送信の設定が不足しています: ${status.missingKeys.join(", ")}`;
    await finish("failed", message);
    return { ok: false, status: payload ? 503 : 409, message };
  }

  const messages = emailService
    .getEntryEmailMessages(payload)
    .filter((message) => input.includeAdmin || message.recipientType === "user");
  const results: Extract<EntryEmailResendResult, { ok: true }>["results"] = [];

  for (const message of messages) {
    let error: string | null = null;
    try {
      await emailService.sendEntryEmailMessage(message);
    } catch (caughtError) {
      error = caughtError instanceof Error ? caughtError.message : String(caughtError);
      console.error("Entry email resend failed", {
        entryId: input.entryId,
        recipientType: message.recipientType,
        error,
      });
    }
    results.push({
      recipientType: message.recipientType,
      recipientEmail: message.recipientEmail,
      ok: error === null,
      error,
    });
    await createServerMailLog({
      entryId: input.entryId,
      eventId: payload.eventId,
      eventTitle: payload.eventTitle,
      recipientEmail: message.recipientEmail,
      recipientName: message.recipientName,
      recipientType: message.recipientType,
      mailType: "entry_completed",
      subject: message.subject,
      bodyPreview: buildBodyPreview(message.text),
      status: error === null ? "sent" : "failed",
      errorMessage: error,
      provider: toMailLogProvider(status.provider),
      createdByAdminUid: input.adminUid,
      createdByAdminEmail: input.adminEmail,
    }).catch((logError: unknown) => {
      console.error("Entry email resend log write failed", {
        entryId: input.entryId,
        logError,
      });
    });
  }

  // 申込者向けが届いたかどうかで、申込の受付メールの状態を決める。
  const userResult = results.find((result) => result.recipientType === "user");
  await finish(
    userResult?.ok ? "sent" : "failed",
    userResult?.ok
      ? null
      : (userResult?.error ?? "申込者向けのメールを送れませんでした。"),
  );
  console.info("Entry email resend completed", {
    entryId: input.entryId,
    includeAdmin: input.includeAdmin,
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  });

  return { ok: true, results };
}

// ---------------------------------------------------------------------------
// カード決済の確定（Stripe）
// ---------------------------------------------------------------------------

// Stripe から取得した（署名検証済みの Webhook、またはシークレットキーで取得した）
// Checkout Session の内容。
export type VerifiedCheckoutSession = {
  sessionId: string;
  entryId?: string;
  eventId?: string;
  paymentStatus?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  paymentIntentId?: string;
};

export type CardPaymentResult =
  | { status: "confirmed"; sendEmail: boolean }
  | { status: "already_confirmed"; sendEmail: boolean }
  | { status: "not_paid" }
  | { status: "entry_not_found" }
  | { status: "mismatch"; reason: string };

// 送信担当の処理が途中で止まった場合に、再送（Webhook の再試行）が引き継げるまでの時間。
const EMAIL_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

function getAppliedSessionIds(entry: DataRecord): string[] {
  return Array.isArray(entry.stripeAppliedSessionIds)
    ? entry.stripeAppliedSessionIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
}

function describeMismatch(entry: DataRecord, session: VerifiedCheckoutSession) {
  if (toPaymentMethod(entry.paymentMethod) !== "card") {
    return "payment_method_not_card";
  }
  if (entry.entryStatus === "cancelled") {
    return "entry_cancelled";
  }
  if ((session.currency ?? "").toLowerCase() !== "jpy" || entry.currency !== "JPY") {
    return "currency_mismatch";
  }
  // 決済ページの作成後に申込が変更・キャンセルされた場合や、すでに入金がある場合は、
  // 決済金額が現在の未収額と一致しない。古い内容・金額では支払済みにしない。
  if (
    typeof session.amountTotal !== "number" ||
    session.amountTotal !== readEntryAccounting(entry).dueAmount
  ) {
    return "amount_mismatch";
  }
  if (session.eventId && session.eventId !== entry.eventId) {
    return "event_mismatch";
  }
  return null;
}

// Stripe の決済結果を確認し、金額・通貨・申込との対応が一致した場合だけ支払済みにする。
// 何度呼ばれても結果は変わらない（Webhook の再送や完了画面からの確認が重なってもよい）。
export async function confirmCardPayment(
  session: VerifiedCheckoutSession,
): Promise<CardPaymentResult> {
  if (!session.entryId) {
    return { status: "entry_not_found" };
  }

  if (session.paymentStatus !== "paid") {
    return { status: "not_paid" };
  }

  const db = getAdminFirestore();
  const entryRef = db.collection(collections.entries).doc(session.entryId);

  return db.runTransaction<CardPaymentResult>(async (transaction) => {
    const snapshot = await transaction.get(entryRef);
    if (!snapshot.exists) {
      return { status: "entry_not_found" };
    }

    const entry = snapshot.data() as DataRecord;
    const appliedSessionIds = getAppliedSessionIds(entry);
    // 同じ決済は 1 回しか入金として記録しない（Webhook の再送、完了画面との重複）。
    const isAlreadyApplied =
      appliedSessionIds.includes(session.sessionId) ||
      (appliedSessionIds.length === 0 &&
        entry.paymentStatus === "paid" &&
        entry.accountingInitialized !== true);

    if (isAlreadyApplied) {
      // 完了メールの送信担当が途中で止まっていた場合だけ、この処理が引き継ぐ。
      const entryEmail = (entry.entryEmail ?? {}) as DataRecord;
      const claimedAt = toDate(entryEmail.claimedAt);
      const isStale =
        entryEmail.status === "sending" &&
        claimedAt !== null &&
        Date.now() - claimedAt.getTime() > EMAIL_CLAIM_TIMEOUT_MS;

      if (isStale) {
        transaction.update(entryRef, {
          entryEmail: { status: "sending", claimedAt: FieldValue.serverTimestamp() },
        });
      }

      return { status: "already_confirmed", sendEmail: isStale };
    }

    const mismatch = describeMismatch(entry, session);
    if (mismatch) {
      // 支払済みにはせず、管理者が確認できるように記録だけ残す。
      transaction.update(entryRef, {
        paymentIssue: {
          reason: mismatch,
          stripeCheckoutSessionId: session.sessionId,
          stripeAmountTotal: session.amountTotal ?? null,
          stripeCurrency: session.currency ?? null,
          detectedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { status: "mismatch", reason: mismatch };
    }

    const amount = session.amountTotal as number;
    const accounting = recalculate(
      ensureAccountingInitialized(transaction, entryRef, entry),
      { paidAmount: readEntryAccounting(entry).paidAmount + amount },
    );

    writeLedgerRecord(transaction, entryRef, {
      id: `stripe_${session.sessionId}`,
      type: "payment",
      amount,
      method: "card",
      note: "Stripe 決済の確定",
      source: "stripe",
    });

    transaction.update(entryRef, {
      ...accountingFields(accounting),
      entryStatus: "confirmed",
      stripeAppliedSessionIds: FieldValue.arrayUnion(session.sessionId),
      stripeCheckoutSessionId: session.sessionId,
      stripeSessionId: session.sessionId,
      stripePaymentIntentId: session.paymentIntentId ?? "",
      stripeAmountTotal: session.amountTotal ?? null,
      stripeCurrency: session.currency ?? null,
      paidAt: FieldValue.serverTimestamp(),
      paymentConfirmedAt: FieldValue.serverTimestamp(),
      paymentConfirmedVia: "stripe",
      paymentIssue: null,
      entryEmail: { status: "sending", claimedAt: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { status: "confirmed", sendEmail: true };
  });
}

// ---------------------------------------------------------------------------
// 振込入金・現金受領の記録（管理者）
// ---------------------------------------------------------------------------

export type ManualPaymentResult =
  | { status: "confirmed" }
  | { status: "already_confirmed" }
  | { status: "entry_not_found" }
  | { status: "not_manual_payment" }
  | { status: "entry_cancelled" };

// 銀行振込の入金、現金の受領を記録する。確認した管理者と日時はサーバー側で記録する。
// すでに支払済みの場合は何も変更しない（二重操作で記録が上書きされない）。
export async function confirmManualPayment(input: {
  entryId: string;
  adminUid: string;
  adminEmail: string;
}): Promise<ManualPaymentResult> {
  const db = getAdminFirestore();
  const entryRef = db.collection(collections.entries).doc(input.entryId);

  return db.runTransaction<ManualPaymentResult>(async (transaction) => {
    const snapshot = await transaction.get(entryRef);
    if (!snapshot.exists) {
      return { status: "entry_not_found" };
    }

    const entry = snapshot.data() as DataRecord;

    // カード決済の支払済みへの変更は、Stripe の確認を通した処理だけが行う。
    if (toPaymentMethod(entry.paymentMethod) === "card") {
      return { status: "not_manual_payment" };
    }

    const dueAmount = readEntryAccounting(entry).dueAmount;

    if (entry.paymentStatus === "paid" || dueAmount <= 0) {
      return { status: "already_confirmed" };
    }

    if (entry.entryStatus === "cancelled") {
      return { status: "entry_cancelled" };
    }

    const accounting = recalculate(
      ensureAccountingInitialized(transaction, entryRef, entry),
      { paidAmount: readEntryAccounting(entry).paidAmount + dueAmount },
    );

    writeLedgerRecord(transaction, entryRef, {
      type: "payment",
      amount: dueAmount,
      method: toPaymentMethod(entry.paymentMethod),
      note: "入金の記録（一覧から未収額の全額を記録）",
      source: "admin",
      adminUid: input.adminUid,
      adminEmail: input.adminEmail,
    });

    transaction.update(entryRef, {
      ...accountingFields(accounting),
      revision: (typeof entry.revision === "number" ? entry.revision : 0) + 1,
      paidAt: FieldValue.serverTimestamp(),
      paymentConfirmedAt: FieldValue.serverTimestamp(),
      paymentConfirmedVia: "admin",
      paymentConfirmedByUid: input.adminUid,
      paymentConfirmedByEmail: input.adminEmail,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { status: "confirmed" };
  });
}

// 決済完了画面に返す、支払状態の要約（個人情報は含めない）。
export async function getEntryPaymentSummary(entryId: string) {
  const snapshot = await getAdminFirestore()
    .collection(collections.entries)
    .doc(entryId)
    .get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as DataRecord;

  return {
    entryId,
    eventTitle: stringField(data, "eventTitle"),
    paymentMethod: toPaymentMethod(data.paymentMethod),
    paymentStatus:
      data.paymentStatus === "paid" ? ("paid" as const) : ("pending" as const),
    entryStatus: stringField(data, "entryStatus"),
    totalAmount: typeof data.totalAmount === "number" ? data.totalAmount : 0,
  };
}
