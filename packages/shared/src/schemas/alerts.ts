import { z } from 'zod';
import { SymbolSchema } from '../symbols.js';
import { TimeframeSchema } from '../timeframes.js';

export const AlertChannelSchema = z.enum(['email', 'telegram', 'web-push']);
export type AlertChannel = z.infer<typeof AlertChannelSchema>;

const PriceCrossRule = z.object({
  type: z.literal('priceCross'),
  symbol: SymbolSchema,
  level: z.number(),
  direction: z.enum(['above', 'below']),
});

const CandleCloseRule = z.object({
  type: z.literal('candleClose'),
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  level: z.number(),
  direction: z.enum(['above', 'below']),
});

const IndicatorCrossRule = z.object({
  type: z.literal('indicatorCross'),
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  /** e.g. "rsi:14", "ema:50". Free string — interpreted by the evaluator. */
  indicator: z.string(),
  level: z.number(),
  direction: z.enum(['above', 'below']),
});

export const AlertRuleSchema = z.discriminatedUnion('type', [
  PriceCrossRule,
  CandleCloseRule,
  IndicatorCrossRule,
]);
export type AlertRule = z.infer<typeof AlertRuleSchema>;

export const AlertSchema = z.object({
  id: z.string().uuid(),
  rule: AlertRuleSchema,
  channels: z.array(AlertChannelSchema).default(['email']),
  /** Human-readable note shown in the UI / notification body. */
  note: z.string().nullable(),
  active: z.boolean().default(true),
  /** Set once when fired; one-shot alerts go inactive after firing. */
  firedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
});
export type Alert = z.infer<typeof AlertSchema>;
