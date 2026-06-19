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

import { z } from 'zod';

export const ImportanceSchema = z.enum(['low', 'medium', 'high']);
export type Importance = z.infer<typeof ImportanceSchema>;

/**
 * Country code is loosely typed: well-known regions get an enum slot, anything
 * else falls through as a free string so we don't drop an event we can't map.
 */
export const KnownCountrySchema = z.enum(['US', 'EZ', 'UK', 'DE', 'FR', 'XAU']);
export const CountrySchema = z.union([KnownCountrySchema, z.string()]);

export const EventCurrencySchema = z.enum(['USD', 'EUR', 'GBP']);
export type EventCurrency = z.infer<typeof EventCurrencySchema>;

export const EconomicEventSchema = z.object({
  id: z.string(),
  /** Display name, e.g. "CPI YoY". */
  title: z.string(),
  country: CountrySchema,
  /** Symbol-scope currency, may be null for non-FX events (e.g. gold-relevant). */
  currency: EventCurrencySchema.nullable(),
  importance: ImportanceSchema,
  /** Scheduled time, ms epoch UTC. */
  date: z.number().int(),
  actual: z.number().nullable(),
  forecast: z.number().nullable(),
  previous: z.number().nullable(),
  unit: z.string().nullable(),
  source: z.string(),
});

export type EconomicEvent = z.infer<typeof EconomicEventSchema>;
