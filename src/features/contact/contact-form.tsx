"use client";

import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useState } from "react";
import type { FormEvent } from "react";

import { db } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";

type ContactFormValues = {
  name: string;
  email: string;
  phone: string;
  inquiryType: string;
  message: string;
};

const inquiryTypeOptions = [
  { value: "", label: "選択してください" },
  { value: "entry", label: "エントリーについて" },
  { value: "payment", label: "決済について" },
  { value: "event", label: "大会について" },
  { value: "other", label: "その他" },
] as const;

const initialValues: ContactFormValues = {
  name: "",
  email: "",
  phone: "",
  inquiryType: "",
  message: "",
};

const contactSubmitStorageKey = "alma-copa-contact-last-submit-at";
const contactSubmitIntervalMs = 30_000;
const maxLengths: Record<keyof ContactFormValues, number> = {
  name: 80,
  email: 160,
  phone: 40,
  inquiryType: 20,
  message: 5000,
};

export function ContactForm() {
  const [values, setValues] = useState<ContactFormValues>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormValues, string>>>(
    {},
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitWarning, setSubmitWarning] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  function updateValue(key: keyof ContactFormValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const nextErrors: Partial<Record<keyof ContactFormValues, string>> = {};
    const trimmedValues = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      inquiryType: values.inquiryType,
      message: values.message.trim(),
    };

    if (!trimmedValues.name) {
      nextErrors.name = "お名前を入力してください。";
    } else if (trimmedValues.name.length > maxLengths.name) {
      nextErrors.name = `${maxLengths.name}文字以内で入力してください。`;
    }
    if (!trimmedValues.email) {
      nextErrors.email = "メールアドレスを入力してください。";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValues.email)) {
      nextErrors.email = "メールアドレスを正しく入力してください。";
    } else if (trimmedValues.email.length > maxLengths.email) {
      nextErrors.email = `${maxLengths.email}文字以内で入力してください。`;
    }
    if (trimmedValues.phone.length > maxLengths.phone) {
      nextErrors.phone = `${maxLengths.phone}文字以内で入力してください。`;
    }
    if (!trimmedValues.message) {
      nextErrors.message = "お問い合わせ内容を入力してください。";
    } else if (trimmedValues.message.length > maxLengths.message) {
      nextErrors.message = `${maxLengths.message}文字以内で入力してください。`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function isSubmitTooSoon() {
    try {
      const lastSubmitAt = Number(
        window.localStorage.getItem(contactSubmitStorageKey) ?? "0",
      );

      return Number.isFinite(lastSubmitAt)
        && Date.now() - lastSubmitAt < contactSubmitIntervalMs;
    } catch (error) {
      console.error("Contact submit interval check failed", error);
      return false;
    }
  }

  function rememberSubmitTime() {
    try {
      window.localStorage.setItem(contactSubmitStorageKey, String(Date.now()));
    } catch (error) {
      console.error("Contact submit interval save failed", error);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitWarning(null);

    try {
      if (isSubmitTooSoon()) {
        throw new Error(
          "短時間に連続して送信されています。少し時間をおいて再度お試しください。",
        );
      }

      const inquiryRef = doc(collection(db, collections.inquiries));
      const normalizedValues = {
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        inquiryType: values.inquiryType,
        message: values.message.trim(),
      };

      await setDoc(inquiryRef, {
        inquiryId: inquiryRef.id,
        ...normalizedValues,
        phone: normalizedValues.phone || null,
        status: "unhandled",
        adminNotified: false,
        userNotified: false,
        emailError: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      rememberSubmitTime();

      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inquiryId: inquiryRef.id,
            ...normalizedValues,
          }),
        });
        const data = (await response.json().catch(() => null)) as {
          error?: string;
          emailWarning?: string;
          success?: boolean;
        } | null;

        if (!response.ok || data?.success !== true) {
          console.error("Contact notification failed", data);
          setSubmitWarning(
            data?.error ??
              "お問い合わせは受け付けましたが、通知メールの送信に失敗した可能性があります。",
          );
        } else {
          setSubmitWarning(data?.emailWarning ?? null);
        }
      } catch (error) {
        console.error("Contact notification request failed", error);
        setSubmitWarning(
          "お問い合わせは受け付けましたが、通知メールの送信に失敗した可能性があります。",
        );
      }

      setValues(initialValues);
      setIsSubmitted(true);
    } catch (error) {
      console.error(error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : "お問い合わせの送信に失敗しました。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="rounded-lg border border-emerald-700 bg-emerald-950/60 p-6">
        <p className="text-lg font-bold text-white">
          お問い合わせを送信しました。
        </p>
        <p className="mt-3 text-sm leading-6 text-emerald-100">
          内容を確認のうえ、担当者よりご連絡いたします。
        </p>
        {submitWarning ? (
          <p className="mt-3 rounded-md border border-amber-400/40 bg-amber-950/60 px-4 py-3 text-sm leading-6 text-amber-100">
            {submitWarning}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setIsSubmitted(false)}
          className="mt-5 min-h-11 rounded-md border border-emerald-400/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400 hover:text-black"
        >
          続けて問い合わせる
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:p-6"
    >
      {submitError ? (
        <div className="mb-5 rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
          {submitError}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-zinc-200">お名前 *</span>
          <input
            value={values.name}
            onChange={(event) => updateValue("name", event.target.value)}
            autoComplete="name"
            className="h-12 w-full rounded-md border border-white/10 bg-black px-3 text-base text-white outline-none focus:border-alma-gold"
          />
          {errors.name ? <p className="text-sm text-red-300">{errors.name}</p> : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-zinc-200">
            メールアドレス *
          </span>
          <input
            value={values.email}
            onChange={(event) => updateValue("email", event.target.value)}
            type="email"
            autoComplete="email"
            className="h-12 w-full rounded-md border border-white/10 bg-black px-3 text-base text-white outline-none focus:border-alma-gold"
          />
          {errors.email ? <p className="text-sm text-red-300">{errors.email}</p> : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-zinc-200">電話番号</span>
          <input
            value={values.phone}
            onChange={(event) => updateValue("phone", event.target.value)}
            type="tel"
            autoComplete="tel"
            className="h-12 w-full rounded-md border border-white/10 bg-black px-3 text-base text-white outline-none focus:border-alma-gold"
          />
          {errors.phone ? <p className="text-sm text-red-300">{errors.phone}</p> : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-zinc-200">
            お問い合わせ種別
          </span>
          <select
            value={values.inquiryType}
            onChange={(event) => updateValue("inquiryType", event.target.value)}
            className="h-12 w-full rounded-md border border-white/10 bg-black px-3 text-base text-white outline-none focus:border-alma-gold"
          >
            {inquiryTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-4 block space-y-2">
        <span className="text-sm font-semibold text-zinc-200">
          お問い合わせ内容 *
        </span>
        <textarea
          value={values.message}
          onChange={(event) => updateValue("message", event.target.value)}
          rows={8}
          className="w-full rounded-md border border-white/10 bg-black px-3 py-3 text-base leading-7 text-white outline-none focus:border-alma-gold"
        />
        {errors.message ? (
          <p className="text-sm text-red-300">{errors.message}</p>
        ) : null}
      </label>

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-12 w-full rounded-md bg-alma-gold px-5 py-3 text-sm font-bold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {isSubmitting ? "送信中..." : "送信する"}
        </button>
      </div>
    </form>
  );
}
