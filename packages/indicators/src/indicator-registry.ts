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

// P0-3 — Plugin-based indicator registry (replaces the switch(kind) dispatch).
//
// Each indicator registers itself with a name, params schema, and a
// standardized compute function. Adding a new indicator requires only
// implementing a new file + registering it — no existing code changes.
// This mirrors the ToolRegistry pattern from packages/ai/src/tools/registry.ts.

import type { Candle, IndicatorKind } from '@hamafx/shared';
import { z } from 'zod';

// --- Plugin definition --------------------------------------------------

/**
 * An indicator plugin registered in the registry.
 * The `compute` function receives candles + params (already parsed
 * and validated by the registry) and returns the raw value array.
 * The registry wraps the result into the standard IndicatorResult shape.
 */
export interface IndicatorPlugin {
  /** Unique indicator kind (e.g. 'sma', 'ema', 'rsi'). */
  kind: IndicatorKind;
  /** Zod schema for params. Used by parseIndicatorParams(). */
  paramsSchema: z.ZodTypeAny;
  /**
   * Compute the indicator values from candles + parsed params.
   * Returns the raw value array — the registry wraps it into
   * `IndicatorResult` with the standard shape.
   */
  compute: (candles: Candle[], params: Record<string, number>) => unknown[];
  /** Human-readable description for catalogues / documentation. */
  description: string;
}

// --- Registry ------------------------------------------------------------

/**
 * Plugin-based indicator registry.
 *
 * Usage:
 * ```ts
 * import { indicatorRegistry } from './indicator-registry';
 *
 * // In each indicator file (self-registration):
 * indicatorRegistry.register({
 *   kind: 'sma',
 *   paramsSchema: PeriodOnly.default({ period: 20 }),
 *   compute: (candles, params) => sma(candles, params.period),
 *   description: 'Simple Moving Average',
 * });
 *
 * // In computeIndicator():
 * const plugin = indicatorRegistry.get('sma');
 * const values = plugin.compute(candles, parsedParams);
 * ```
 *
 * OCP benefit: adding an indicator means registering it —
 * no existing code changes. Replaces the switch(kind) dispatch
 * in registry.ts.
 */
export class IndicatorRegistry {
  private plugins = new Map<IndicatorKind, IndicatorPlugin>();

  /**
   * Register an indicator plugin. Idempotent — registering
   * the same kind twice overwrites.
   */
  register(plugin: IndicatorPlugin): void {
    this.plugins.set(plugin.kind, plugin);
  }

  /**
   * Get a registered indicator plugin by kind.
   * Throws if the kind is not registered.
   */
  get(kind: IndicatorKind): IndicatorPlugin {
    const plugin = this.plugins.get(kind);
    if (!plugin) {
      throw new Error(
        `Unknown indicator kind: "${kind}". Registered kinds: ${this.listKinds().join(', ')}. ` +
        `Add it via indicatorRegistry.register() in the indicator's file and import it in the barrel.`,
      );
    }
    return plugin;
  }

  /**
   * Check if an indicator kind is registered.
   */
  has(kind: IndicatorKind): boolean {
    return this.plugins.has(kind);
  }

  /**
   * List all registered indicator kinds.
   */
  listKinds(): IndicatorKind[] {
    return [...this.plugins.keys()];
  }

  /**
   * List all registered plugins.
   */
  listPlugins(): IndicatorPlugin[] {
    return [...this.plugins.values()];
  }
}

/** Global singleton — import this in indicator files to register. */
export const indicatorRegistry = new IndicatorRegistry();

// --- Registration (self-contained — each indicator registers here) --------
//
// Import order doesn't matter; registration is order-independent.
// All indicators register themselves in this file to keep the barrel
// clean. If you add a new indicator, add its import + registration here.

import { atr } from './atr';
import { bollinger } from './bollinger';
import { macd } from './macd';
import { ema, sma } from './moving-averages';
import { pivotsAligned } from './pivots';
import { rsi } from './rsi';

// --- Per-kind parameter schemas (moved from registry.ts) -----------------

const PeriodOnly = z.object({ period: z.number().int().min(1).max(500) });

indicatorRegistry.register({
  kind: 'sma',
  paramsSchema: PeriodOnly.default({ period: 20 }),
  compute: (candles, params) => sma(candles, params.period!),
  description: 'Simple Moving Average',
});

indicatorRegistry.register({
  kind: 'ema',
  paramsSchema: PeriodOnly.default({ period: 20 }),
  compute: (candles, params) => ema(candles, params.period!),
  description: 'Exponential Moving Average',
});

indicatorRegistry.register({
  kind: 'rsi',
  paramsSchema: PeriodOnly.default({ period: 14 }),
  compute: (candles, params) => rsi(candles, params.period!),
  description: 'Relative Strength Index (0-100)',
});

indicatorRegistry.register({
  kind: 'atr',
  paramsSchema: PeriodOnly.default({ period: 14 }),
  compute: (candles, params) => atr(candles, params.period!),
  description: 'Average True Range',
});

indicatorRegistry.register({
  kind: 'macd',
  paramsSchema: z
    .object({
      fast: z.number().int().min(1).max(200).default(12),
      slow: z.number().int().min(1).max(500).default(26),
      signal: z.number().int().min(1).max(200).default(9),
    })
    .default({ fast: 12, slow: 26, signal: 9 }),
  compute: (candles, params) =>
    macd(candles, params.fast!, params.slow!, params.signal!).map((p) => ({
      macd: p.macd,
      signal: p.signal,
      hist: p.hist,
    })),
  description: 'Moving Average Convergence Divergence (12/26/9)',
});

indicatorRegistry.register({
  kind: 'bollinger',
  paramsSchema: z
    .object({
      period: z.number().int().min(2).max(500).default(20),
      multiplier: z.number().min(0.1).max(10).default(2),
    })
    .default({ period: 20, multiplier: 2 }),
  compute: (candles, params) =>
    bollinger(candles, params.period!, params.multiplier!).map((p) => ({
      upper: p.upper,
      middle: p.middle,
      lower: p.lower,
    })),
  description: 'Bollinger Bands (20, 2)',
});

indicatorRegistry.register({
  kind: 'pivots',
  paramsSchema: z.object({}).default({}),
  compute: (candles, _params) =>
    pivotsAligned(candles).map((p) =>
      p === null
        ? null
        : {
            pp: p.pp,
            r1: p.r1,
            r2: p.r2,
            r3: p.r3,
            s1: p.s1,
            s2: p.s2,
            s3: p.s3,
          },
    ),
  description: 'Classic Floor Trader Pivots (PP, R1-R3, S1-S3)',
});
