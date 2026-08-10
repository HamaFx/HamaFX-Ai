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

// Tool: compute_risk.
//
// Pure-function position-sizing. Three rules:
//
//   1. risk_usd     = accountUsd * (riskPct / 100)
//   2. distance    = price distance per the symbol's catalog unit
//   3. position_size = risk_usd / (distance * value_per_lot)
//
// Price distance and contract size come from the canonical symbol catalog.
// The legacy output field `pipsToStop` is retained for compatibility, but
// crypto distances are expressed as raw price units rather than pips.
//
// Both shapes are returned (lots and units). `invalidDirection` flags the
// case where the stop is on the same side as the target relative to entry,
// which would mean the agent suggested a contradictory setup.

import {
  ComputeRiskInputSchema,
  getSymbolDefinition,
  pipSize,
  type ComputeRiskOutput,
  type Symbol,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

const InputSchema = ComputeRiskInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    compute_risk: { input: z.infer<typeof InputSchema> };
  }
}

export const computeRiskTool = tool({
  description:
    "Compute position size, USD risk/reward, and catalog distance-to-stop/target from a (symbol, side, entry, stop, target?, accountUsd, riskPct) tuple. Pure-function — no provider calls. Forex and gold distances use pips; crypto distances use raw price units. Use when the user asks 'how big should I be on this trade' or 'what size for X% risk'. Reward + RR are null when no target is supplied. Sets `invalidDirection: true` when stop is on the wrong side of entry for the given direction.",
  inputSchema: InputSchema,
  execute: async (input): Promise<ComputeRiskOutput> => {
    const { symbol, side, entry, stop, accountUsd, riskPct } = input;
    const target = input.target ?? null;

    const definition = getSymbolDefinition(symbol);
    if (definition.quoteCurrency !== 'USD' && definition.quoteCurrency !== 'USDT') {
      throw new Error('Risk sizing currently requires a USD- or USDT-quoted symbol');
    }
    const distanceUnit = definition.capabilities.priceDistanceUnit;
    const distanceStep = distanceUnit === 'price' ? 1 : pipSize(symbol);
    const distanceToStop = Math.abs(entry - stop) / distanceStep;
    const distanceToTarget = target !== null ? Math.abs(entry - target) / distanceStep : null;
    const valuePerDistanceUnit = valuePerDistanceUnitFor(symbol);

    const riskUsd = accountUsd * (riskPct / 100);
    // Total value at risk across the catalog distance unit per lot/coin.
    const positionSizeLots =
      distanceToStop > 0 && valuePerDistanceUnit > 0
        ? riskUsd / (distanceToStop * valuePerDistanceUnit)
        : 0;
    const unitsPerLot = definition.capabilities.contractSize;
    const positionSizeUnits = positionSizeLots * unitsPerLot;

    const rewardUsd =
      distanceToTarget !== null
        ? distanceToTarget * valuePerDistanceUnit * positionSizeLots
        : null;
    const rrRatio = distanceToTarget !== null && distanceToStop > 0 ? distanceToTarget / distanceToStop : null;

    const invalidDirection = isInvalidDirection({ side, entry, stop, target });

    const summary = buildSummary({
      symbol,
      side,
      pipsToStop: distanceToStop,
      pipsToTarget: distanceToTarget,
      riskUsd,
      rewardUsd,
      rrRatio,
      positionSizeLots,
    });

    return {
      symbol,
      side,
      entry,
      stop,
      target,
      riskUsd,
      rewardUsd,
      rrRatio,
      pipsToStop: distanceToStop,
      pipsToTarget: distanceToTarget,
      pipValueUsdPerLot: valuePerDistanceUnit,
      // The shared output schema exposes this alongside the legacy pip field
      // so crypto callers can render the correct unit without guessing.
      distanceUnit,
      quantityUnit: definition.capabilities.quantityUnit,
      positionSizeLots,
      positionSizeUnits,
      invalidDirection,
      summary,
    };
  },
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function valuePerDistanceUnitFor(symbol: Symbol): number {
  const definition = getSymbolDefinition(symbol);
  // USD/USDT-quoted catalog instruments have a simple settlement value:
  // contract size × one configured distance step. For crypto the distance
  // step is one raw price unit and the result is the contract size (1 coin).
  if (definition.capabilities.priceDistanceUnit === 'price') {
    return definition.capabilities.contractSize;
  }
  return definition.capabilities.contractSize * definition.pipSize;
}

function isInvalidDirection(args: {
  side: 'long' | 'short';
  entry: number;
  stop: number;
  target: number | null;
}): boolean {
  if (args.side === 'long') {
    if (args.stop >= args.entry) return true;
    if (args.target !== null && args.target <= args.entry) return true;
  } else {
    if (args.stop <= args.entry) return true;
    if (args.target !== null && args.target >= args.entry) return true;
  }
  return false;
}

function buildSummary(args: {
  symbol: Symbol;
  side: 'long' | 'short';
  pipsToStop: number;
  pipsToTarget: number | null;
  riskUsd: number;
  rewardUsd: number | null;
  rrRatio: number | null;
  positionSizeLots: number;
}): string {
  const sideStr = args.side === 'long' ? 'Long' : 'Short';
  const definition = getSymbolDefinition(args.symbol);
  const quantityLabel = definition.capabilities.quantityUnit;
  const sizeStr = `${args.positionSizeLots.toFixed(quantityLabel === 'coins' ? 4 : 2)} ${quantityLabel}`;
  const distanceLabel = getSymbolDefinition(args.symbol).capabilities.priceDistanceUnit;
  const stopStr = `${args.pipsToStop.toFixed(1)} ${distanceLabel} stop`;
  const rewardStr =
    args.rrRatio !== null && args.rewardUsd !== null
      ? `, RR ${args.rrRatio.toFixed(2)} ($${args.rewardUsd.toFixed(2)} reward)`
      : '';
  return `${sideStr} ${args.symbol}: ${sizeStr}, $${args.riskUsd.toFixed(2)} at risk over ${stopStr}${rewardStr}.`;
}
