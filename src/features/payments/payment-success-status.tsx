"use client";

import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";

import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";

type PaymentSuccessStatusProps = {
  entryId?: string;
  sessionId?: string;
  applicantName?: string;
  applicantEmail?: string;
  eventId?: string;
  eventTitle?: string;
  entryType?: "individual" | "representative";
};

type CheckoutSessionStatusResponse = {
  sessionId?: string;
  status?: string;
  paymentIntentId?: string;
  error?: string;
};

const ENTRY_EMAILS_API_PATH = "/api/notifications/send-entry-emails";

function parseEmailResponseBody(value: string) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function PaymentSuccessStatus({
  entryId,
  sessionId,
  applicantName,
  applicantEmail,
  eventId,
  eventTitle,
  entryType,
}: PaymentSuccessStatusProps) {
  const [message, setMessage] = useState(
    entryId ? "受付内容を確認しています。" : "エントリー受付を完了しました。",
  );
  const emailSentRef = useRef(false);

  useEffect(() => {
    if (!entryId) {
      return;
    }

    let isMounted = true;
    const resolvedEntryId = entryId;

    async function sendEntryEmails(resolvedSessionId: string) {
      if (
        !applicantEmail ||
        !applicantName ||
        !eventId ||
        !eventTitle ||
        !entryType ||
        emailSentRef.current
      ) {
        console.warn("Entry email API call skipped", {
          entryId: resolvedEntryId,
          eventId,
          eventTitle,
          entryType,
          hasApplicantName: Boolean(applicantName),
          hasApplicantEmail: Boolean(applicantEmail),
          alreadySent: emailSentRef.current,
        });
        return false;
      }

      const emailCacheKey = `alma-entry-email-sent:${resolvedEntryId}`;
      const alreadySent =
        typeof window !== "undefined" &&
        window.sessionStorage.getItem(emailCacheKey) === "1";

      if (alreadySent) {
        emailSentRef.current = true;
        console.info("Entry email API call skipped because session cache is set", {
          entryId: resolvedEntryId,
          eventId,
          eventTitle,
          applicantEmail,
          apiPath: ENTRY_EMAILS_API_PATH,
        });
        return true;
      }

      emailSentRef.current = true;

      try {
        console.info("Entry email API call started", {
          entryId: resolvedEntryId,
          eventId,
          eventTitle,
          applicantEmail,
          apiPath: ENTRY_EMAILS_API_PATH,
          sessionId: resolvedSessionId,
        });

        const emailResponse = await fetch(ENTRY_EMAILS_API_PATH, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            entryId: resolvedEntryId,
            eventId,
            eventTitle,
            entryType,
            applicantName,
            applicantEmail,
            paymentStatus: "paid",
            sessionId: resolvedSessionId,
          }),
        });
        const emailResponseBody = await emailResponse.text().catch(() => "");
        const emailResult = parseEmailResponseBody(emailResponseBody);

        if (emailResponse.status === 200) {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(emailCacheKey, "1");
          }
          console.info("Entry emails sent", {
            entryId: resolvedEntryId,
            eventId,
            eventTitle,
            applicantEmail,
            apiPath: ENTRY_EMAILS_API_PATH,
            status: emailResponse.status,
            statusText: emailResponse.statusText,
            body: emailResult ?? emailResponseBody,
          });
          return true;
        } else {
          console.error("Entry emails failed", {
            entryId: resolvedEntryId,
            eventId,
            eventTitle,
            applicantEmail,
            apiPath: ENTRY_EMAILS_API_PATH,
            status: emailResponse.status,
            statusText: emailResponse.statusText,
            body: emailResult ?? emailResponseBody,
          });
          return false;
        }
      } catch (emailError) {
        console.error("Entry emails failed", {
          entryId: resolvedEntryId,
          eventId,
          eventTitle,
          applicantEmail,
          apiPath: ENTRY_EMAILS_API_PATH,
          error: emailError,
        });
        return false;
      }
    }

    async function updatePaidStatus() {
      try {
        let sessionData: CheckoutSessionStatusResponse | null = null;

        if (sessionId) {
          const sessionResponse = await fetch(
            `/api/payments/checkout-session?session_id=${encodeURIComponent(sessionId)}`,
          );

          sessionData = (await sessionResponse
            .json()
            .catch(() => null)) as CheckoutSessionStatusResponse | null;

          if (!sessionResponse.ok) {
            console.warn("Stripe Checkout Session の取得に失敗しました", {
              entryId,
              sessionId,
              error: sessionData?.error,
            });
          }
        }

        const paymentIntentId = sessionData?.paymentIntentId ?? "";
        const resolvedSessionId = sessionData?.sessionId ?? sessionId ?? "";

        try {
          await updateDoc(doc(db, collections.entries, resolvedEntryId), {
            paymentStatus: "paid",
            entryStatus: "confirmed",
            stripeSessionId: resolvedSessionId,
            stripeCheckoutSessionId: resolvedSessionId,
            stripePaymentIntentId: paymentIntentId,
            paidAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (isMounted) {
            setMessage("エントリー受付を確定しています。");
          }
        } catch (paidStatusError) {
          console.error("決済完了状態の保存に失敗しました", {
            entryId,
            sessionId,
            error: paidStatusError,
          });

          if (isMounted) {
            setMessage("決済は完了しています。受付状態を確認しています。");
          }
        }

        const emailSent = await sendEntryEmails(resolvedSessionId);
        if (isMounted) {
          setMessage(
            emailSent
              ? "確認メールを送信しました。"
              : "確認メールの送信状況を確認しています。届かない場合はお問い合わせください。",
          );
        }
      } catch (error) {
        console.error("決済完了状態の保存に失敗しました", {
          entryId,
          sessionId,
          error,
        });

        if (isMounted) {
          setMessage("決済は完了しています。受付状態を確認しています。");
        }
      }
    }

    void updatePaidStatus();

    return () => {
      isMounted = false;
    };
  }, [
    applicantEmail,
    applicantName,
    entryId,
    eventId,
    eventTitle,
    entryType,
    sessionId,
  ]);

  return <p className="text-sm leading-6 text-zinc-300 sm:text-base">{message}</p>;
}
