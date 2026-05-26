// Output envelope returned by the `analyze_fundamental` AI tool. The tool
// derives the symbol's currency set, pulls upcoming high-impact events plus
// recent news, and returns a structured fundamental snapshot. Summary is
// deterministic — no second LLM round-trip.
//
// Source of truth: packages/ai/src/tools/analyze-fundamental.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { EconomicEventSchema } from '../calendar';
import { ToolNewsItemSchema } from './get-news';

export const AnalyzeFundamentalInputSchema = z.object({
  symbol: SymbolSchema,
  /** Look-ahead window in hours for the calendar query. Defaults to 24h. */
  horizonHours: z.number().int().min(1).max(168).default(24),
});
export type AnalyzeFundamentalInput = z.infer<typeof AnalyzeFundamentalInputSchema>;

export const AnalyzeFundamentalOutputSchema = z.object({
  symbol: SymbolSchema,
  windowFromMs: z.number().int(),
  windowToMs: z.number().int(),
  /** Currencies derived from the symbol (USD, EUR, GBP). */
  currencies: z.array(z.string()),
  events: z.array(EconomicEventSchema),
  headlines: z.array(ToolNewsItemSchema),
  sentiment: z.object({
    positive: z.number().int().min(0),
    negative: z.number().int().min(0),
    neutral: z.number().int().min(0),
  }),
  summary: z.string(),
  /** True when both events and headlines are empty (pipelines haven't run). */
  pipelinePending: z.boolean(),
});
export type AnalyzeFundamentalOutput = z.infer<typeof AnalyzeFundamentalOutputSchema>;
