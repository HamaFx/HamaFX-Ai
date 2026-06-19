/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
