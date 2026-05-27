// Output envelope returned by the `compute_risk` AI tool.
//
// Pure-function position-sizing: given an entry, stop, optional target, an
// account size, and a risk percent, return everything a trader actually
// puts on the ticket. The reward + RR fields are nullable when no target
// is supplied. Everything in account-currency is USD because that's the
// quote of every supported pair.
//
// Source of truth: packages/ai/src/tools/compute-risk.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';

export const TradeDirectionSchema = z.enum(['long', 'short']);
export type TradeDirection = z.infer<typeof TradeDirectionSchema>;

export const ComputeRiskInputSchema = z
  .object({
    symbol: SymbolSchema,
    side: TradeDirectionSchema,
    entry: z.number().positive(),
    stop: z.number().positive(),
    target: z.number().positive().nullable().optional(),
    /** Account size in USD. */
    accountUsd: z.number().positive(),
    /** Percent of account at risk per trade. Capped at 10 %. */
    riskPct: z.number().positive().max(10).default(1),
  })
  .refine((v) => v.entry !== v.stop, {
    message: 'entry and stop cannot be equal',
    path: ['stop'],
  });
export type ComputeRiskInput = z.infer<typeof ComputeRiskInputSchema>;

export const ComputeRiskOutputSchema = z.object({
  symbol: SymbolSchema,
  side: TradeDirectionSchema,
  entry: z.number(),
  stop: z.number(),
  target: z.number().nullable(),
  /** USD risked = accountUsd * riskPct/100. */
  riskUsd: z.number(),
  /** USD reward at the supplied target, null if no target supplied. */
  rewardUsd: z.number().nullable(),
  /** Reward / risk; null if no target. */
  rrRatio: z.number().nullable(),
  /** Distance entry → stop, in pips (always positive). */
  pipsToStop: z.number(),
  pipsToTarget: z.number().nullable(),
  /** USD value of one pip per 1 standard lot. */
  pipValueUsdPerLot: z.number(),
  /**
   * Position size to put on the ticket. Both forms emitted so the user
   * picks whichever their broker UI accepts.
   */
  positionSizeLots: z.number(),
  positionSizeUnits: z.number(),
  /** True when entry/stop direction is inconsistent with `side`. */
  invalidDirection: z.boolean(),
  /** Human-readable summary the chat part renders directly. */
  summary: z.string(),
});
export type ComputeRiskOutput = z.infer<typeof ComputeRiskOutputSchema>;
