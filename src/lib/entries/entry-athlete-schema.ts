import { z } from "zod";

import { validateAthleteInput } from "./entry-divisions";

const giEntryInputSchema = z.object({
  ageCategory: z.string().max(40),
  weightClass: z.string().max(40),
  belt: z.string().max(20),
  openClass: z.string().max(3),
});

const nogiEntryInputSchema = z.object({
  ageCategory: z.string().max(40),
  weightClass: z.string().max(40),
  grade: z.string().max(20),
  openClass: z.string().max(3),
});

// フォームと API の両方で使う選手 1 名分のスキーマ。
// 部門・大人／キッズの選択に応じた必須チェックは validateAthleteInput に集約している。
export const athleteInputSchema = z
  .object({
    name: z.string().min(1, "氏名を入力してください。").max(50),
    kana: z.string().min(1, "フリガナを入力してください。").max(80),
    gender: z.enum(["male", "female"], "性別を選択してください。"),
    birthDate: z.string().min(1, "生年月日を入力してください。").max(10),
    athleteClass: z.string().max(10),
    guardianName: z.string().max(50, "保護者氏名は50文字以内で入力してください。"),
    divisionSelection: z.string().max(10),
    gi: giEntryInputSchema,
    nogi: nogiEntryInputSchema,
  })
  .superRefine((athlete, context) => {
    for (const issue of validateAthleteInput(athlete)) {
      context.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    }
  });

export type AthleteInputValues = z.infer<typeof athleteInputSchema>;
