// Output envelope returned by the `get_cot` AI tool.
//
// Returns the last N weeks of CFTC Commitment-of-Traders rows for one
// symbol, ingested by `/api/cron/cot`. Each sample has the four bucket
// long/short pairs (dealer / asset / leveraged / other); the agent
// computes net = long - short for trend reasoning.
//
// Source of truth: packages/ai/src/tools/get-cot.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';

export const GetCoTInputSchema = z.object({
  symbol: SymbolSchema.optional(),
  weeks: z.number().int().min(1).max(52).default(8),
});
export type GetCoTInput = z.infer<typeof GetCoTInputSchema>;

export const CoTSampleSchema = z.object({
  /** ms epoch UTC of the report date. */
  reportDate: z.number().int(),
  dealerLong: z.number().int().nullable(),
  dealerShort: z.number().int().nullable(),
  assetLong: z.number().int().nullable(),
  assetShort: z.number().int().nullable(),
  leveragedLong: z.number().int().nullable(),
  leveragedShort: z.number().int().nullable(),
  otherLong: z.number().int().nullable(),
  otherShort: z.number().int().nullable(),
});
export type CoTSample = z.infer<typeof CoTSampleSchema>;

export const GetCoTOutputSchema = z.object({
  symbol: SymbolSchema,
  samples: z.array(CoTSampleSchema),
  /** Templated summary string (no LLM second pass). */
  summary: z.string(),
  /** True when the table is empty (cron hasn't run yet). */
  pipelinePending: z.boolean(),
});
export type GetCoTOutput = z.infer<typeof GetCoTOutputSchema>;
