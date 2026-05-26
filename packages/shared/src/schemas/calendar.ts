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
