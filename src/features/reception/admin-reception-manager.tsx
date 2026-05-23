"use client";

import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";

type ReceptionEntry = {
  id: string;
  eventTitle: string;
  name: string;
  kana: string;
  bibNumber: string;
  category: string;
  receptionStatus: "not_checked_in" | "checked_in";
  checkedInAt: Date | null;
};

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  return null;
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function AdminReceptionManager() {
  const [entries, setEntries] = useState<ReceptionEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, collections.entries),
      (snapshot) => {
        setEntries(
          snapshot.docs.map((entrySnapshot) => {
            const data = entrySnapshot.data();

            return {
              id: entrySnapshot.id,
              eventTitle:
                typeof data.eventTitle === "string" ? data.eventTitle : "大会未設定",
              name: typeof data.name === "string" ? data.name : "",
              kana: typeof data.kana === "string" ? data.kana : "",
              bibNumber: typeof data.bibNumber === "string" ? data.bibNumber : "",
              category: typeof data.category === "string" ? data.category : "",
              receptionStatus:
                data.receptionStatus === "checked_in"
                  ? "checked_in"
                  : "not_checked_in",
              checkedInAt: toDate(data.checkedInAt),
            };
          }),
        );
        setIsLoading(false);
        setError(null);
      },
      (caughtError) => {
        console.error(caughtError);
        setError("受付情報の取得に失敗しました。");
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const visibleEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return entries;
    }

    return entries.filter((entry) =>
      [entry.id, entry.name, entry.kana, entry.bibNumber, entry.category]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [entries, searchQuery]);

  async function checkIn(entry: ReceptionEntry) {
    try {
      await updateDoc(doc(db, collections.entries, entry.id), {
        receptionStatus:
          entry.receptionStatus === "checked_in" ? "not_checked_in" : "checked_in",
        checkedInAt:
          entry.receptionStatus === "checked_in" ? null : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (caughtError) {
      console.error(caughtError);
      setError("受付状態の更新に失敗しました。");
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-alma-gold">当日運営</p>
        <h1 className="mt-2 text-2xl font-bold text-white">受付</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
          QRコードのentryId、氏名、ゼッケンで検索して受付状態を更新します。
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="QRのentryId、氏名、ゼッケンで検索"
        className="h-12 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-alma-gold"
      />

      {isLoading ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-zinc-400">
          受付情報を読み込んでいます。
        </div>
      ) : (
        <div className="grid gap-3">
          {visibleEntries.map((entry) => (
            <article
              key={entry.id}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={
                        entry.receptionStatus === "checked_in" ? "受付済" : "未受付"
                      }
                      tone={
                        entry.receptionStatus === "checked_in" ? "success" : "neutral"
                      }
                    />
                    <span className="text-xs text-zinc-500">
                      {formatDateTime(entry.checkedInAt)}
                    </span>
                  </div>
                  <h2 className="mt-2 font-semibold text-white">{entry.name}</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {entry.eventTitle} / {entry.category}
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-500">
                    {entry.id} / ゼッケン {entry.bibNumber || "-"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void checkIn(entry)}
                  className="min-h-11 rounded-md bg-alma-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d7b760]"
                >
                  受付済切替
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
