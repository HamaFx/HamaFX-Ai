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

// P0-3 — Plugin-based dispatch for kind-keyed indicator computation.
//
// Delegates to `indicatorRegistry` (plugin registry pattern — same as
// ToolRegistry in packages/ai). Adding a new indicator requires only
// implementing a new file + calling `indicatorRegistry.register()`.
// No existing code changes.
//
// Used by the `/api/market/indicators` route handler and the
// `get_indicators` AI tool so they share a single source of truth
// for parameter parsing and output shape.

import {
  IndicatorKindSchema,
  type Candle,
  type IndicatorKind,
  type IndicatorResult,
  type Symbol,
  type Timeframe,
} from '@hamafx/shared';

// Import the barrel that triggers all indicator self-registrations.
import { indicatorRegistry } from './indicator-registry';

// --- Compute -------------------------------------------------------------

export interface ComputeArgs {
  symbol: Symbol;
  tf: Timeframe;
  kind: IndicatorKind;
  params: Record<string, unknown>;
  candles: Candle[];
}

/**
 * Parse and validate indicator params using the plugin's registered schema.
 * Backward-compatible — same signature as before P0-3.
 */
export function parseIndicatorParams(
  kind: IndicatorKind,
  raw: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const plugin = indicatorRegistry.get(kind);
  return plugin.paramsSchema.parse(raw) as Record<string, string | number | boolean>;
}

/**
 * Compute an indicator using the plugin registry.
 *
 * P0-3: Delegates to `indicatorRegistry.get(kind).compute()` instead of
 * a switch statement. Adding a new indicator now means registering it —
 * no existing code changes (OCP).
 */
export function computeIndicator(args: ComputeArgs): IndicatorResult {
  const { symbol, tf, kind, candles } = args;
  const params = parseIndicatorParams(IndicatorKindSchema.parse(kind), args.params);
  const fetchedAt = Date.now();

  const plugin = indicatorRegistry.get(kind);
  // Values are typed as unknown[] in the plugin interface to accommodate
  // the variety of indicator return types (number[], MacdPoint[], etc.).
  // The runtime value matches the expected IndicatorResult shape.
  const values = plugin.compute(
    candles,
    params as Record<string, number>,
  ) as IndicatorResult['values'];

  return { symbol, tf, kind, params, values, fetchedAt };
}
