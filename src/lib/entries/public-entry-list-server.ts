import "server-only";

import { toDate } from "@/features/events/public-event-utils";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { collections } from "@/lib/firebase/collections";

import {
  buildPublicEntryList,
  isEntryListPublic,
  type PublicEntryList,
} from "./public-entry-list";

// エントリーの読み出しはサーバー（Admin SDK）だけで行う。Firestore ルールは
// 一般ユーザーにエントリーの読み取りを許可しておらず、ここでも広げない。
// 選手名・所属・カテゴリーの組み立てに必要な項目だけを読み出す
// （連絡先・住所・支払情報・管理者メモなどは読み出さない）。
const ENTRY_FIELDS = [
  "entryStatus",
  "entryType",
  "formatVersion",
  "gym",
  "representative.gym",
  "athlete",
  "athletes",
  // 旧形式の個人申込は、選手情報（氏名・区分）が申込の直下にある。
  "name",
  "kana",
  "category",
  "ageCategory",
  "weightClass",
  "openClass",
  "cancelledAt",
];

// 公開設定が有効な大会のエントリーリストを返す。
// 大会が存在しない・公開されていない・エントリーリストが非公開の場合は null
// （どの理由かは区別せずに返し、非公開の大会の存在も明かさない）。
export async function getPublicEntryList(
  eventId: string,
): Promise<PublicEntryList | null> {
  if (!eventId || eventId.includes("/")) {
    return null;
  }

  const firestore = getAdminFirestore();
  const eventSnapshot = await firestore
    .collection(collections.events)
    .doc(eventId)
    .get();
  const eventData = eventSnapshot.data();

  if (!eventSnapshot.exists || !isEntryListPublic(eventData)) {
    return null;
  }

  const entriesSnapshot = await firestore
    .collection(collections.entries)
    .where("eventId", "==", eventId)
    .select(...ENTRY_FIELDS)
    .get();

  return buildPublicEntryList(
    {
      id: eventSnapshot.id,
      title: typeof eventData?.title === "string" ? eventData.title : "",
    },
    entriesSnapshot.docs.map((snapshot) => ({
      id: snapshot.id,
      data: snapshot.data(),
    })),
    toDate,
  );
}
