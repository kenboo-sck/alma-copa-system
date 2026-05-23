import { z } from "zod";

export const participantInputSchema = z.object({
  name: z.string().min(1).max(50),
  nameKana: z.string().min(1).max(80),
  gender: z.enum(["male", "female", "other", "no_answer"]),
  birthDate: z.coerce.date(),
  declaredWeightKg: z.number().min(20).max(200).optional(),
});

export const entryInputSchema = z.object({
  eventId: z.string().min(1),
  entryType: z.enum(["individual", "representative"]),
  applicantEmail: z.email(),
  applicantPhone: z.string().min(10).max(20),
  participants: z.array(participantInputSchema).min(1),
  agreedToTerms: z.literal(true),
  agreedToWaiver: z.literal(true),
  agreedToPrivacyPolicy: z.literal(true),
});

export type EntryInput = z.infer<typeof entryInputSchema>;
