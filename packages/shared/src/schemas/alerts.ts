import { z } from 'zod';

import { SymbolSchema } from '../symbols';
import { TimeframeSchema } from '../timeframes';

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
  /**
   * Strict spec format: `<kind>` or `<kind>:<n>(,n)(,n)`.
   * Kinds: sma, ema, rsi, atr, macd, bollinger, pivots. The evaluator
   * re-validates with the same regex; `parseIndicatorSpec` returns null on
   * any deviation so a rule that previously slipped through (e.g.
   * "rsi:14:bogus") is now filtered before delivery.
   */
  indicator: z
    .string()
    .regex(
      /^(?:sma|ema|rsi|atr|macd|bollinger|pivots)(?::[0-9]+(?:,[0-9]+){0,2})?$/i,
      'indicator must match `<kind>` or `<kind>:n[,n[,n]]`',
    ),
  level: z.number(),
  direction: z.enum(['above', 'below']),
  /**
   * Latest observed indicator value from the previous evaluation tick.
   * Cross detection requires a baseline:
   *
   *   - direction "above" fires iff `prev < level AND curr >= level`
   *   - direction "below" fires iff `prev > level AND curr <= level`
   *
   * On the first tick `previousValue === null`, so the alert never fires
   * immediately on creation when the indicator already sits past the
   * threshold. The evaluator writes the current sample back as the new
   * baseline whenever it doesn't fire.
   */
  previousValue: z.number().nullable().optional(),
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
