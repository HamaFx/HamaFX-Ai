// Output envelope returned by the `get_calendar` AI tool. The tool's
// `CalendarItem` mirrors `EconomicEventSchema` but widens `country` and
// `currency` to plain string / nullable string (the tool returns whatever
// the DB row holds without re-validating against the strict zod enums).
//
// Source of truth: packages/ai/src/tools/get-calendar.ts execute() return type.

import { z } from 'zod';

import { ImportanceSchema } from '../calendar';

export const ToolCalendarItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  country: z.string(),
  currency: z.string().nullable(),
  importance: ImportanceSchema,
  /** Scheduled time, ms epoch UTC. */
  date: z.number().int(),
  actual: z.number().nullable(),
  forecast: z.number().nullable(),
  previous: z.number().nullable(),
  unit: z.string().nullable(),
  source: z.string(),
});
export type ToolCalendarItem = z.infer<typeof ToolCalendarItemSchema>;

export const GetCalendarOutputSchema = z.object({
  items: z.array(ToolCalendarItemSchema),
  /** True if the calendar pipeline hasn't populated the DB yet. */
  pipelinePending: z.boolean(),
});

export type GetCalendarOutput = z.infer<typeof GetCalendarOutputSchema>;
