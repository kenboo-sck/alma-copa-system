import { z } from "zod";

export const pricePeriodSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(40),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  amount: z.number().int().nonnegative(),
  currency: z.literal("JPY"),
  isActive: z.boolean(),
});

export const categorySchema = z.object({
  eventId: z.string().min(1),
  competitionType: z.enum(["jiu_jitsu", "grappling", "mma"]),
  displayName: z.string().min(1).max(160),
  pricePeriods: z.array(pricePeriodSchema),
});

export type CategoryInput = z.infer<typeof categorySchema>;
