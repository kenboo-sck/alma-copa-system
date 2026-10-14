// 支払方法（クレジットカード／銀行振込／現金払い）に関する共通設定。
// 大会設定、申込フォーム、API、管理画面、メールのすべてがこのファイルを参照する。
// ブラウザとサーバーの両方から読み込むため、サーバー専用の処理は置かない。

export const PAYMENT_METHODS = ["card", "bank_transfer", "cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "クレジットカード",
  bank_transfer: "銀行振込",
  cash: "現金払い",
};

export const PAYMENT_METHOD_DESCRIPTIONS: Record<PaymentMethod, string> = {
  card: "お申し込み後、Stripe の決済ページでお支払いいただきます。",
  bank_transfer: "お申し込み後、ご案内する口座へ期限までにお振り込みください。",
  cash: "お申し込み後、ご案内する方法で現金にてお支払いください。",
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === "card" || value === "bank_transfer" || value === "cash";
}

// 支払方法を持たないエントリー（この機能の追加前の申込）はカード決済として扱う。
export function toPaymentMethod(value: unknown): PaymentMethod {
  return isPaymentMethod(value) ? value : "card";
}

// ---------------------------------------------------------------------------
// 大会ごとの支払設定
// ---------------------------------------------------------------------------

export type EventPaymentSettings = {
  methods: PaymentMethod[];
  bankTransfer: {
    // 振込先（銀行名・支店名・口座種別・口座番号・口座名義など）。
    accountInfo: string;
    // 案内文（振込手数料の扱い、振込名義の指定など）。
    note: string;
    // 支払期限日（日本時間の "YYYY-MM-DD"。当日中を期限とする）。
    dueDate: string;
  };
  cash: {
    // 案内文（支払場所・受付時間など。当日払い・事前持参のどちらにも使う）。
    note: string;
  };
};

type DataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is DataRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(data: DataRecord, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

export function isDateInputValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00+09:00`);
  return !Number.isNaN(parsed.getTime()) && toJapanDateInputValue(parsed) === value;
}

// 大会ドキュメントから支払設定を読む。設定がない既存の大会はカードのみとして扱う。
export function getEventPaymentSettings(data: DataRecord): EventPaymentSettings {
  const methods = Array.isArray(data.paymentMethods)
    ? PAYMENT_METHODS.filter((method) =>
        (data.paymentMethods as unknown[]).includes(method),
      )
    : [];
  const bankTransfer = isRecord(data.bankTransfer) ? data.bankTransfer : {};
  const cash = isRecord(data.cashPayment) ? data.cashPayment : {};
  const dueDate = stringField(bankTransfer, "dueDate");

  return {
    methods: methods.length > 0 ? methods : ["card"],
    bankTransfer: {
      accountInfo: stringField(bankTransfer, "accountInfo"),
      note: stringField(bankTransfer, "note"),
      dueDate: isDateInputValue(dueDate) ? dueDate : "",
    },
    cash: {
      note: stringField(cash, "note"),
    },
  };
}

export const defaultEventPaymentSettings: EventPaymentSettings = {
  methods: ["card"],
  bankTransfer: { accountInfo: "", note: "", dueDate: "" },
  cash: { note: "" },
};

// ---------------------------------------------------------------------------
// 支払期限（日本時間）
// ---------------------------------------------------------------------------

const JAPAN_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// 指定した日時の、日本時間での日付（"YYYY-MM-DD"）。
export function toJapanDateInputValue(value: Date) {
  return JAPAN_DATE_FORMAT.format(value);
}

// 支払期限日の終わり（日本時間の当日 23:59:59.999）。期限日は当日中まで有効。
export function getPaymentDueAt(dueDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return null;
  }

  const dueAt = new Date(`${dueDate}T23:59:59.999+09:00`);
  return Number.isNaN(dueAt.getTime()) ? null : dueAt;
}

export function formatPaymentDueDate(dueDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!match) {
    return "";
  }

  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`;
}

// 大会の設定上、いま選択できる支払方法。
// 銀行振込は、振込先と期限が設定済みで、期限日（日本時間の当日中）を過ぎていない場合のみ。
export function getAvailablePaymentMethods(
  settings: EventPaymentSettings,
  now = new Date(),
): PaymentMethod[] {
  return settings.methods.filter((method) => {
    if (method !== "bank_transfer") {
      return true;
    }

    const dueAt = getPaymentDueAt(settings.bankTransfer.dueDate);
    return (
      Boolean(settings.bankTransfer.accountInfo.trim()) &&
      dueAt !== null &&
      now <= dueAt
    );
  });
}

// ---------------------------------------------------------------------------
// 申込時に保存する支払案内
// ---------------------------------------------------------------------------

// 申込時点の支払案内。大会設定を後から変更しても、保存済みの案内は変わらない。
export type EntryPaymentInfo = {
  method: PaymentMethod;
  // 銀行振込のみ。
  bankAccountInfo: string;
  // 銀行振込・現金払いの案内文。
  note: string;
  // 銀行振込のみ（日本時間の "YYYY-MM-DD"）。
  dueDate: string;
};

export function buildEntryPaymentInfo(
  settings: EventPaymentSettings,
  method: PaymentMethod,
): EntryPaymentInfo {
  if (method === "bank_transfer") {
    return {
      method,
      bankAccountInfo: settings.bankTransfer.accountInfo.trim(),
      note: settings.bankTransfer.note.trim(),
      dueDate: settings.bankTransfer.dueDate,
    };
  }

  return {
    method,
    bankAccountInfo: "",
    note: method === "cash" ? settings.cash.note.trim() : "",
    dueDate: "",
  };
}

export function readEntryPaymentInfo(data: DataRecord): EntryPaymentInfo {
  const info = isRecord(data.paymentInfo) ? data.paymentInfo : {};

  return {
    method: toPaymentMethod(data.paymentMethod),
    bankAccountInfo: stringField(info, "bankAccountInfo"),
    note: stringField(info, "note"),
    dueDate: stringField(info, "dueDate"),
  };
}

export type PaymentGuidanceSection = {
  label: string;
  // 改行を含む場合がある。
  value: string;
};

// 受付完了画面・受付メールに載せる支払案内。
export function buildPaymentGuidanceSections(
  info: EntryPaymentInfo,
): PaymentGuidanceSection[] {
  if (info.method === "bank_transfer") {
    return [
      { label: "お振込先", value: info.bankAccountInfo },
      {
        label: "お支払い期限",
        value: info.dueDate
          ? `${formatPaymentDueDate(info.dueDate)}（日本時間・当日中）`
          : "",
      },
      { label: "お振込みのご案内", value: info.note },
    ].filter((section) => section.value);
  }

  if (info.method === "cash") {
    return [{ label: "お支払いのご案内", value: info.note }].filter(
      (section) => section.value,
    );
  }

  return [];
}

// ---------------------------------------------------------------------------
// 支払状態
// ---------------------------------------------------------------------------

export type EntryPaymentStatus = "pending" | "paid" | "failed";

export function toEntryPaymentStatus(value: unknown): EntryPaymentStatus {
  return value === "paid" || value === "failed" ? value : "pending";
}

// 振込期限超過: 銀行振込で未払いのまま、期限日（日本時間の当日中）を過ぎた申込。
// 自動キャンセルは行わず、表示と絞り込みにだけ使う。
export function isBankTransferOverdue(
  entry: {
    paymentMethod: PaymentMethod;
    paymentStatus: EntryPaymentStatus;
    entryStatus: string;
    paymentDueDate: string;
  },
  now = new Date(),
) {
  if (
    entry.paymentMethod !== "bank_transfer" ||
    entry.paymentStatus === "paid" ||
    entry.entryStatus === "cancelled"
  ) {
    return false;
  }

  const dueAt = getPaymentDueAt(entry.paymentDueDate);
  return dueAt !== null && now > dueAt;
}

// 管理画面に表示する申込状態。支払状態とは別に扱う。
export function getEntryStatusLabel(entryStatus: string) {
  switch (entryStatus) {
    case "confirmed":
      return "受付済み";
    case "pending_payment":
      return "カード決済の手続き待ち";
    case "cancelled":
      return "キャンセル";
    case "expired":
      return "期限切れ";
    case "refunded":
      return "返金済み";
    default:
      return "未確定";
  }
}
