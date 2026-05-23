"use client";

import { useEffect, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";

type PaymentCancelStatusProps = {
  entryId?: string;
};

export function PaymentCancelStatus({ entryId }: PaymentCancelStatusProps) {
  const [message, setMessage] = useState(
    entryId ? "決済キャンセル状態を保存しています。" : "決済は完了していません。",
  );

  useEffect(() => {
    if (!entryId) {
      return;
    }

    void updateDoc(doc(db, collections.entries, entryId), {
      paymentStatus: "failed",
      entryStatus: "cancelled",
      paymentFailedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
      .then(() => {
        setMessage("決済状態を失敗として保存しました。");
      })
      .catch((error) => {
        console.error("決済キャンセル状態の保存に失敗しました", {
          entryId,
          error,
        });
        setMessage("決済状態の保存に失敗しました。");
      });
  }, [entryId]);

  return <p className="mt-3 text-zinc-400">{message}</p>;
}
