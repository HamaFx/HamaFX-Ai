// Tool: compute_risk.
//
// Pure-function position-sizing. Three rules:
//
//   1. risk_usd     = accountUsd * (riskPct / 100)
//   2. pip_value    = USD value of one pip per 1.0 standard lot at this entry
//   3. position_size = risk_usd / (pipsToStop * pip_value_per_lot)
//
// Pip-size per symbol comes from `pipSize(symbol)` in `@hamafx/shared`.
// Pip value per lot for the supported symbols:
//   - XAUUSD: 1 lot = 100 oz × 0.1 (one pip is 0.1 USD/oz) = $10/pip
//   - EURUSD / GBPUSD: 1 lot = 100,000 base × 0.0001 = $10/pip
//
// Both shapes are returned (lots and units). `invalidDirection` flags the
// case where the stop is on the same side as the target relative to entry,
// which would mean the agent suggested a contradictory setup.

import {
  ComputeRiskInputSchema,
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
    "Compute position size, USD risk/reward, and pips-to-stop/target from a (symbol, side, entry, stop, target?, accountUsd, riskPct) tuple. Pure-function — no provider calls. Use when the user asks 'how big should I be on this trade' or 'what size for X% risk'. Reward + RR are null when no target is supplied. Sets `invalidDirection: true` when stop is on the wrong side of entry for the given direction.",
  inputSchema: InputSchema,
  execute: async (input): Promise<ComputeRiskOutput> => {
    const { symbol, side, entry, stop, accountUsd, riskPct } = input;
    const target = input.target ?? null;

    const pip = pipSize(symbol);
    const pipsToStop = Math.abs(entry - stop) / pip;
    const pipsToTarget = target !== null ? Math.abs(entry - target) / pip : null;
    const pipValueUsdPerLot = pipValueUsdPerLotFor(symbol);

    const riskUsd = accountUsd * (riskPct / 100);
    // Total $ risked across `pipsToStop` × pipValuePerLot per lot.
    const positionSizeLots =
      pipsToStop > 0 && pipValueUsdPerLot > 0
        ? riskUsd / (pipsToStop * pipValueUsdPerLot)
        : 0;
    // 1 lot = 100,000 units for FX, 100 oz for XAU. We surface units so a
    // user on a non-lot UI (oanda/MT5 unit input) can copy the integer.
    const unitsPerLot = symbol === 'XAUUSD' ? 100 : 100_000;
    const positionSizeUnits = positionSizeLots * unitsPerLot;

    const rewardUsd =
      pipsToTarget !== null ? pipsToTarget * pipValueUsdPerLot * positionSizeLots : null;
    const rrRatio = pipsToTarget !== null && pipsToStop > 0 ? pipsToTarget / pipsToStop : null;

    const invalidDirection = isInvalidDirection({ side, entry, stop, target });

    const summary = buildSummary({
      symbol,
      side,
      pipsToStop,
      pipsToTarget,
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
      pipsToStop,
      pipsToTarget,
      pipValueUsdPerLot,
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

function pipValueUsdPerLotFor(symbol: Symbol): number {
  // Personal-mode: all three supported pairs are USD-quoted, so one pip per
  // 1 standard lot is $10 across the board (XAU 1 lot = 100 oz × 0.1; FX
  // 1 lot = 100,000 base × 0.0001 = $10).
  if (symbol === 'XAUUSD') return 10;
  return 10;
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
  const sizeStr = `${args.positionSizeLots.toFixed(2)} lots`;
  const stopStr = `${args.pipsToStop.toFixed(1)}p stop`;
  const rewardStr =
    args.rrRatio !== null && args.rewardUsd !== null
      ? `, RR ${args.rrRatio.toFixed(2)} ($${args.rewardUsd.toFixed(2)} reward)`
      : '';
  return `${sideStr} ${args.symbol}: ${sizeStr}, $${args.riskUsd.toFixed(2)} at risk over ${stopStr}${rewardStr}.`;
}
