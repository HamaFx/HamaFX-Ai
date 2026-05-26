// Dispatch table for kind-keyed indicator computation. Used by the
// `/api/market/indicators` route handler and the `get_indicators` AI tool
// so they share a single source of truth for parameter parsing and
// output shape.

import {
  IndicatorKindSchema,
  type Candle,
  type IndicatorKind,
  type IndicatorResult,
  type Symbol,
  type Timeframe,
} from '@hamafx/shared';
import { z } from 'zod';

import { atr } from './atr';
import { bollinger } from './bollinger';
import { macd } from './macd';
import { ema, sma } from './moving-averages';
import { pivotsAligned } from './pivots';
import { rsi } from './rsi';

// --- Per-kind parameter schemas ------------------------------------------

const PeriodOnly = z.object({ period: z.number().int().min(1).max(500) });

// We use `z.ZodTypeAny` instead of a tighter generic because each schema
// has slightly different defaults; the actual runtime type narrowing is
// done by the caller via `parseIndicatorParams`.
const ParamSchemas: Record<IndicatorKind, z.ZodTypeAny> = {
  sma: PeriodOnly.default({ period: 20 }),
  ema: PeriodOnly.default({ period: 20 }),
  rsi: PeriodOnly.default({ period: 14 }),
  atr: PeriodOnly.default({ period: 14 }),
  macd: z
    .object({
      fast: z.number().int().min(1).max(200).default(12),
      slow: z.number().int().min(1).max(500).default(26),
      signal: z.number().int().min(1).max(200).default(9),
    })
    .default({ fast: 12, slow: 26, signal: 9 }),
  bollinger: z
    .object({
      period: z.number().int().min(2).max(500).default(20),
      multiplier: z.number().min(0.1).max(10).default(2),
    })
    .default({ period: 20, multiplier: 2 }),
  pivots: z.object({}).default({}),
};

export function parseIndicatorParams(
  kind: IndicatorKind,
  raw: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const schema = ParamSchemas[kind];
  return schema.parse(raw) as Record<string, string | number | boolean>;
}

// --- Compute -------------------------------------------------------------

export interface ComputeArgs {
  symbol: Symbol;
  tf: Timeframe;
  kind: IndicatorKind;
  params: Record<string, unknown>;
  candles: Candle[];
}

export function computeIndicator(args: ComputeArgs): IndicatorResult {
  const { symbol, tf, kind, candles } = args;
  const params = parseIndicatorParams(IndicatorKindSchema.parse(kind), args.params);
  const fetchedAt = Date.now();

  const values = (() => {
    switch (kind) {
      case 'sma':
        return sma(candles, params.period as number);
      case 'ema':
        return ema(candles, params.period as number);
      case 'rsi':
        return rsi(candles, params.period as number);
      case 'atr':
        return atr(candles, params.period as number);
      case 'macd':
        return macd(
          candles,
          params.fast as number,
          params.slow as number,
          params.signal as number,
        ).map((p) => ({
          // Convert MacdPoint -> Record<string, number|null> (matches
          // IndicatorSeriesValueSchema).
          macd: p.macd,
          signal: p.signal,
          hist: p.hist,
        }));
      case 'bollinger':
        return bollinger(candles, params.period as number, params.multiplier as number).map(
          (p) => ({ upper: p.upper, middle: p.middle, lower: p.lower }),
        );
      case 'pivots':
        return pivotsAligned(candles).map((p) =>
          p === null
            ? null
            : ({
                pp: p.pp,
                r1: p.r1,
                r2: p.r2,
                r3: p.r3,
                s1: p.s1,
                s2: p.s2,
                s3: p.s3,
              } as Record<string, number>),
        );
    }
  })();

  return { symbol, tf, kind, params, values, fetchedAt };
}
