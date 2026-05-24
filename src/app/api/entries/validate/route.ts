import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin";
import { collections } from "@/lib/firebase/collections";
import { checkAgeCategory, normalizeEmail } from "@/lib/entries/entry-validation";

export const runtime = "nodejs";

const validationApplicantSchema = z.object({
  birthDate: z.string().min(1),
  ageCategory: z.string().min(1),
});

const validationSchema = z.object({
  eventId: z.string().min(1),
  email: z.email(),
  entryType: z.enum(["individual", "representative"]),
  applicants: z.array(validationApplicantSchema).min(1),
});

function isPublishedEvent(data: Record<string, unknown>) {
  return (
    data.status === "published" && ("deletedAt" in data ? data.deletedAt == null : true)
  );
}

function toDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  return null;
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = validationSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      {
        error: "入力内容に不備があります。必須項目を確認してください。",
      },
      { status: 400 },
    );
  }

  try {
    const db = getAdminFirestore();
    const eventSnapshot = await db
      .collection(collections.events)
      .doc(parsed.data.eventId)
      .get();

    if (!eventSnapshot.exists) {
      return Response.json(
        {
          error: "大会が見つかりません。",
        },
        { status: 404 },
      );
    }

    const eventData = eventSnapshot.data() as Record<string, unknown>;
    if (!isPublishedEvent(eventData)) {
      return Response.json(
        {
          error: "この大会は現在公開されていません。",
        },
        { status: 400 },
      );
    }

    const eventDate = toDate(eventData.eventDate);
    if (!eventDate) {
      return Response.json(
        {
          error: "大会開催日が設定されていないため、年齢カテゴリーを確認できません。",
        },
        { status: 400 },
      );
    }

    const ageChecks = parsed.data.applicants.map((applicant) =>
      checkAgeCategory(applicant, eventDate),
    );

    if (ageChecks.length === 0) {
      return Response.json(
        {
          error: "選手情報が見つかりません。入力内容をご確認ください。",
        },
        { status: 400 },
      );
    }

    if (ageChecks.some((check) => !check.isValid)) {
      return Response.json(
        {
          error:
            "生年月日から計算した年齢と、選択された年齢カテゴリーが一致していません。年齢カテゴリーをご確認ください。",
        },
        { status: 400 },
      );
    }

    const normalizedEmail = normalizeEmail(parsed.data.email);
    const duplicateSnapshot = await db
      .collection(collections.entries)
      .where("eventId", "==", parsed.data.eventId)
      .get();

    const duplicateExists = duplicateSnapshot.docs.some((entryDoc) => {
      const entryData = entryDoc.data() as {
        email?: unknown;
        normalizedEmail?: unknown;
      };
      const entryEmail =
        typeof entryData.normalizedEmail === "string"
          ? entryData.normalizedEmail
          : typeof entryData.email === "string"
            ? normalizeEmail(entryData.email)
            : "";

      return entryEmail === normalizedEmail;
    });

    if (duplicateExists) {
      return Response.json(
        {
          error:
            "このメールアドレスでは、すでにこの大会へエントリー済みです。内容の確認や変更をご希望の場合は、運営までお問い合わせください。",
        },
        { status: 409 },
      );
    }

    return Response.json({
      ok: true,
      normalizedEmail,
      eventDate: eventDate.toISOString(),
      calculatedAges: ageChecks.map((check) => check.calculatedAge),
    });
  } catch (error) {
    console.error("Entry validation failed", {
      error,
      eventId: parsed.data.eventId,
      email: parsed.data.email,
    });

    return Response.json(
      {
        error: "入力内容の検証に失敗しました。",
      },
      { status: 500 },
    );
  }
}
