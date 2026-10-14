// ローカル検証用のテストデータ（テスト大会・テスト管理者）を Emulator に作る。
// Emulator 以外には接続しない: 接続先を Emulator に固定し、プロジェクト ID も demo- 専用。
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import {
  APP_URL,
  AUTH_EMULATOR_HOST,
  FIRESTORE_EMULATOR_HOST,
  PROJECT_ID,
  TEST_ADMINS,
  TEST_EVENT_ID,
  TEST_PASSWORD,
} from "./env.mjs";

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!PROJECT_ID.startsWith("demo-")) {
  throw new Error("ローカル検証用のプロジェクト ID は demo- で始まる必要があります。");
}

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const auth = getAuth(app);
const db = getFirestore(app);
const DAY = 24 * 60 * 60 * 1000;

function japanDate(offsetDays) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offsetDays * DAY));
}

for (const admin of TEST_ADMINS) {
  const existing = await auth.getUserByEmail(admin.email).catch(() => null);
  const user =
    existing ??
    (await auth.createUser({
      email: admin.email,
      password: TEST_PASSWORD,
      displayName: admin.displayName,
      emailVerified: true,
    }));

  await db.doc(`adminUsers/${user.uid}`).set({
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    permissions: admin.permissions,
    isActive: true,
  });
  console.log(`管理者: ${admin.email} / ${TEST_PASSWORD}（${admin.role}）`);
}

const now = Date.now();
const eventRef = db.doc(`events/${TEST_EVENT_ID}`);
const eventExists = (await eventRef.get()).exists;

// すでにある場合は上書きしない（画面から変更した支払設定を残す）。
if (!eventExists) {
  await eventRef.set({
    title: "【ローカル検証】COPA ALMA テスト大会",
    description: "ローカル検証用のテスト大会です。",
    eventDate: new Date(now + 90 * DAY),
    venue: "テスト体育館",
    entryStartAt: new Date(now - 7 * DAY),
    entryEndAt: new Date(now + 60 * DAY),
    earlyBirdPrice: 5000,
    earlyBirdStartAt: new Date(now - 60 * DAY),
    earlyBirdEndAt: new Date(now - 30 * DAY),
    regularPrice: 6000,
    regularStartAt: new Date(now - 30 * DAY),
    regularEndAt: new Date(now + 30 * DAY),
    latePrice: 7000,
    lateStartAt: new Date(now + 30 * DAY),
    lateEndAt: new Date(now + 60 * DAY),
    status: "published",
    // カード／銀行振込／現金払いをすべて有効にする。
    paymentMethods: ["card", "bank_transfer", "cash"],
    bankTransfer: {
      accountInfo: "テスト銀行 本店営業部\n普通 1234567\nコパアルマ ジッコウイインカイ",
      note: "振込手数料はご負担ください。振込名義は選手氏名（代表者申込は代表者氏名）でお願いします。",
      dueDate: japanDate(14),
    },
    cashPayment: {
      note: "大会当日の受付、または事前に道場の窓口（平日 10:00〜20:00）へご持参ください。",
    },
    aboutSection: {
      enabled: false,
      concept: "",
      level: "",
      classes: "",
      atmosphere: "",
      beginnerWelcome: "",
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// 旧形式（Gi / No-Gi 対応前）・個人・カードで支払済み 6,000円のテスト申込。
// 金額の内訳（台帳）や支払方法の項目を持たない、改修前の保存内容を再現している。
// 同じ内容で 2 件用意する（1 件を操作したあとも、もう 1 件で最初から試せる）。
for (const legacyEmail of ["legacy-paid@example.test", "legacy-paid-2@example.test"]) {
  const legacyEntryId = `${TEST_EVENT_ID}__${encodeURIComponent(legacyEmail)}`;
  const legacyRef = db.doc(`entries/${legacyEntryId}`);
  const legacyExists = (await legacyRef.get()).exists;

  if (!legacyExists) {
    const legacyAthlete = {
      name: "旧形式 太郎",
      kana: "キュウケイシキ タロウ",
      gender: "male",
      birthDate: new Date("1994-04-04"),
      category: "ビギナー",
      ageCategory: "アダルト",
      weightClass: "ライト",
      openClass: "no",
    };

    await legacyRef.set({
      eventId: TEST_EVENT_ID,
      eventTitle: "【ローカル検証】COPA ALMA テスト大会",
      entryType: "individual",
      entryStatus: "confirmed",
      paymentStatus: "paid",
      paymentProvider: "stripe",
      ...legacyAthlete,
      email: legacyEmail,
      normalizedEmail: legacyEmail,
      phone: "09012345678",
      gym: "テスト道場",
      postalCode: "1000001",
      prefecture: "東京都",
      city: "千代田区",
      addressLine: "1-1-1",
      athlete: legacyAthlete,
      representative: null,
      athletes: [],
      entryFee: 6000,
      priceType: "regular",
      athleteCount: 1,
      participantCount: 1,
      categoryEntryCount: 1,
      subtotalAmount: 6000,
      discountAmount: 0,
      totalAmount: 6000,
      currency: "JPY",
      receptionStatus: "not_checked_in",
      weighInStatus: "not_weighed",
      bibNumber: "",
      bracketPosition: "",
      checkedInAt: null,
      weighInAt: null,
      stripeSessionId: "cs_test_legacy_local",
      stripeCheckoutSessionId: "cs_test_legacy_local",
      stripePaymentIntentId: "pi_test_legacy_local",
      paidAt: new Date(now - 3 * DAY),
      paymentFailedAt: null,
      createdAt: new Date(now - 3 * DAY),
      updatedAt: new Date(now - 3 * DAY),
    });
  }

  console.log(
    `旧形式の申込: ${legacyEntryId}（${legacyExists ? "既存のまま" : "作成"}）`,
  );
  console.log(`  詳細: ${APP_URL}/admin/entries/${encodeURIComponent(legacyEntryId)}`);
}
console.log(`大会: ${TEST_EVENT_ID}（${eventExists ? "既存のまま" : "作成"}）`);
console.log(`申込フォーム: ${APP_URL}/events/${TEST_EVENT_ID}/entry`);
console.log(`管理画面: ${APP_URL}/admin/login`);
process.exit(0);
