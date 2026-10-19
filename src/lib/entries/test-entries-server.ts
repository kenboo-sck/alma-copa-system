import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import {
  ENTRY_HISTORY_COLLECTION,
  ENTRY_LEDGER_COLLECTION,
} from "@/lib/entries/entry-accounting";
import {
  TEST_ENTRY_FIELD,
  TEST_ENTRY_PURGE_BLOCK_MESSAGES,
  getTestEntryPurgeBlockReason,
  isTestEntry,
  type TestEntryOperationResult,
} from "@/lib/entries/test-entries";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { collections } from "@/lib/firebase/collections";

// テスト申込の指定・解除と完全削除（サーバー側）。呼び出し元の API ルートで
// オーナーであることを確認してから使う。メールの送信や Stripe への取消・返金は行わない。

type DataRecord = Record<string, unknown>;

type AdminActor = { uid: string; email: string };

// 1 回のトランザクションで書き込める件数の上限（Firestore の制限は 500）。
const MAX_WRITES_PER_ENTRY = 450;

function stringField(data: DataRecord | undefined, key: string) {
  const value = data?.[key];
  return typeof value === "string" ? value : "";
}

function describe(entryId: string, data: DataRecord | undefined) {
  return {
    entryId,
    name: stringField(data, "name"),
    eventTitle: stringField(data, "eventTitle"),
  };
}

// テスト申込への指定・解除。申込の内容・金額・変更の版数（revision）は変えない。
export async function setTestEntryFlags(
  entryIds: string[],
  isTest: boolean,
  actor: AdminActor,
): Promise<TestEntryOperationResult[]> {
  const db = getAdminFirestore();
  const results: TestEntryOperationResult[] = [];

  for (const entryId of entryIds) {
    const entryRef = db.collection(collections.entries).doc(entryId);

    try {
      const result = await db.runTransaction<TestEntryOperationResult>(
        async (transaction) => {
          const snapshot = await transaction.get(entryRef);
          if (!snapshot.exists) {
            return {
              entryId,
              name: "",
              eventTitle: "",
              ok: false,
              error: "申込が見つかりません。",
            };
          }

          const data = snapshot.data() as DataRecord;
          if (isTestEntry(data) !== isTest) {
            transaction.update(entryRef, {
              [TEST_ENTRY_FIELD]: isTest,
              testEntryMarkedAt: isTest ? FieldValue.serverTimestamp() : null,
              testEntryMarkedByUid: isTest ? actor.uid : null,
              testEntryMarkedByEmail: isTest ? actor.email : null,
            });
          }

          return { ...describe(entryId, data), ok: true };
        },
      );
      results.push(result);
    } catch (error) {
      console.error("Test entry flag update failed", { entryId, error });
      results.push({
        entryId,
        name: "",
        eventTitle: "",
        ok: false,
        error: "更新に失敗しました。時間をおいて、もう一度お試しください。",
      });
    }
  }

  return results;
}

// テスト申込の完全削除。申込本体と、その変更履歴・会計記録・メール履歴を削除する。
// 申込ごとに 1 つのトランザクションで「テスト指定・入金状況の再確認」と削除を行うため、
// 確認後に入金が記録された申込を消すことはない。1 件の失敗は他の申込に影響しない。
export async function purgeTestEntries(
  entryIds: string[],
): Promise<TestEntryOperationResult[]> {
  const db = getAdminFirestore();
  const results: TestEntryOperationResult[] = [];

  for (const entryId of entryIds) {
    const entryRef = db.collection(collections.entries).doc(entryId);

    try {
      const result = await db.runTransaction<TestEntryOperationResult>(
        async (transaction) => {
          const snapshot = await transaction.get(entryRef);
          if (!snapshot.exists) {
            return {
              entryId,
              name: "",
              eventTitle: "",
              ok: false,
              error: "申込が見つかりません（すでに削除された可能性があります）。",
            };
          }

          const data = snapshot.data() as DataRecord;
          const [ledgerSnapshot, historySnapshot, emailLogSnapshot] = await Promise.all(
            [
              transaction.get(entryRef.collection(ENTRY_LEDGER_COLLECTION)),
              transaction.get(entryRef.collection(ENTRY_HISTORY_COLLECTION)),
              transaction.get(
                db.collection(collections.emailLogs).where("entryId", "==", entryId),
              ),
            ],
          );
          const ledgerTypes = ledgerSnapshot.docs.map((doc) =>
            stringField(doc.data(), "type"),
          );
          const blockReason = getTestEntryPurgeBlockReason(data, ledgerTypes);

          if (blockReason) {
            return {
              ...describe(entryId, data),
              ok: false,
              error: TEST_ENTRY_PURGE_BLOCK_MESSAGES[blockReason],
            };
          }

          const refs = [
            ...ledgerSnapshot.docs,
            ...historySnapshot.docs,
            ...emailLogSnapshot.docs,
          ].map((doc) => doc.ref);
          if (refs.length + 1 > MAX_WRITES_PER_ENTRY) {
            return {
              ...describe(entryId, data),
              ok: false,
              error: "関連する記録が多すぎるため、まとめて削除できません。",
            };
          }

          for (const ref of refs) {
            transaction.delete(ref);
          }
          transaction.delete(entryRef);

          return {
            ...describe(entryId, data),
            ok: true,
            deleted: {
              history: historySnapshot.size,
              ledger: ledgerSnapshot.size,
              emailLogs: emailLogSnapshot.size,
            },
          };
        },
      );
      results.push(result);
    } catch (error) {
      console.error("Test entry purge failed", { entryId, error });
      results.push({
        entryId,
        name: "",
        eventTitle: "",
        ok: false,
        error: "削除に失敗しました。時間をおいて、もう一度お試しください。",
      });
    }
  }

  return results;
}
