import { z } from "zod";

export const eventSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  venue: z.string().min(1).max(120),
  entryStartAt: z.coerce.date(),
  entryEndAt: z.coerce.date(),
  eventDate: z.coerce.date(),
  status: z.enum(["draft", "published", "closed"]).default("draft"),
});

export type EventInput = z.infer<typeof eventSchema>;
