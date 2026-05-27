// Tool: verify_call.
//
// Verifies a directional setup by:
//   1. Sanity-checking entry / stop / target geometry.
//   2. Scanning recent structure for the nearest opposing liquidity
//      (swing high above entry for a long, swing low below entry for a
//      short).
//   3. Flagging when that opposing level sits inside entry→target.
//
// Pure deterministic logic — no LLM call. The output is consumed by the
// `verify-warning` chat part which renders the caveats next to the
// agent's directional call rather than silencing it.

import { getCandles } from '@hamafx/data';
import { computeStructure } from '@hamafx/indicators';
import {
  VerifyCallInputSchema,
  type Symbol,
  type VerifyCallCaveat,
  type VerifyCallOutput,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

const InputSchema = VerifyCallInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    verify_call: { input: z.infer<typeof InputSchema> };
  }
}

export const verifyCallTool = tool({
  description:
    "Verify a directional setup. Re-checks (entry, stop, target) geometry and scans recent structure for the nearest opposing liquidity (swing high above for longs, swing low below for shorts) — flags when that level sits inside entry→target. Use after naming a setup (BEFORE the user asks 'is this safe'). Never blocks; emits caveats with `agree: false` so the user sees the call AND the warnings together.",
  inputSchema: InputSchema,
  execute: async ({
    symbol,
    side,
    entry,
    stop,
    target,
    tf,
    lookbackBars,
  }): Promise<VerifyCallOutput> => {
    const caveats: VerifyCallCaveat[] = [];

    // Geometry checks first — cheap and deterministic.
    if (side === 'long' && stop >= entry) {
      caveats.push({
        code: 'invalid_stop_side',
        message: `Long with stop ${stop} ≥ entry ${entry} — stop must sit below entry.`,
      });
    }
    if (side === 'short' && stop <= entry) {
      caveats.push({
        code: 'invalid_stop_side',
        message: `Short with stop ${stop} ≤ entry ${entry} — stop must sit above entry.`,
      });
    }
    const nullableTarget = target ?? null;
    if (nullableTarget !== null) {
      if (side === 'long' && nullableTarget <= entry) {
        caveats.push({
          code: 'invalid_target_side',
          message: `Long with target ${nullableTarget} ≤ entry ${entry} — target must sit above entry.`,
        });
      }
      if (side === 'short' && nullableTarget >= entry) {
        caveats.push({
          code: 'invalid_target_side',
          message: `Short with target ${nullableTarget} ≥ entry ${entry} — target must sit below entry.`,
        });
      }
    } else {
      caveats.push({
        code: 'no_invalidation',
        message: 'No target supplied — invalidation level missing.',
      });
    }

    // Structure scan for nearest opposing liquidity.
    let nearestOpposingLiquidity: VerifyCallOutput['nearestOpposingLiquidity'] = null;
    try {
      const candles = await getCandles(symbol, tf, { count: lookbackBars });
      const structure = computeStructure({
        symbol,
        tf,
        candles,
        kinds: ['swings'],
        swings: { lookback: 3 },
      });
      const swings = structure.swings ?? [];
      const lastIndex = candles.length - 1;

      if (swings.length === 0) {
        caveats.push({
          code: 'thin_structure',
          message: 'Structure scan returned no swings — thin candle window.',
        });
      } else if (side === 'long') {
        const above = [...swings].reverse().find((s) => s.type === 'high' && s.price > entry);
        if (above) {
          nearestOpposingLiquidity = {
            price: above.price,
            kind: 'swing_high',
            barsAgo: lastIndex - above.index,
          };
          if (nullableTarget !== null && above.price < nullableTarget) {
            caveats.push({
              code: 'opposing_liquidity_in_path',
              message: `Long target ${nullableTarget} sits beyond a swing high at ${above.price.toFixed(decimals(symbol))} — that level may sweep before TP.`,
            });
          }
        }
      } else {
        const below = [...swings].reverse().find((s) => s.type === 'low' && s.price < entry);
        if (below) {
          nearestOpposingLiquidity = {
            price: below.price,
            kind: 'swing_low',
            barsAgo: lastIndex - below.index,
          };
          if (nullableTarget !== null && below.price > nullableTarget) {
            caveats.push({
              code: 'opposing_liquidity_in_path',
              message: `Short target ${nullableTarget} sits beyond a swing low at ${below.price.toFixed(decimals(symbol))} — that level may sweep before TP.`,
            });
          }
        }
      }
    } catch {
      caveats.push({
        code: 'thin_structure',
        message: 'Could not load candles for the structure scan.',
      });
    }

    const agree = caveats.length === 0;
    const rationale = buildRationale({
      symbol,
      side,
      entry,
      stop,
      target: nullableTarget,
      nearestOpposingLiquidity,
      agree,
      caveats,
    });

    return {
      symbol,
      asOf: Date.now(),
      side,
      entry,
      stop,
      target: nullableTarget,
      agree,
      caveats,
      nearestOpposingLiquidity,
      rationale,
    };
  },
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function decimals(symbol: Symbol): number {
  return symbol === 'XAUUSD' ? 2 : 5;
}

function buildRationale(args: {
  symbol: Symbol;
  side: 'long' | 'short';
  entry: number;
  stop: number;
  target: number | null;
  nearestOpposingLiquidity: VerifyCallOutput['nearestOpposingLiquidity'];
  agree: boolean;
  caveats: VerifyCallCaveat[];
}): string {
  const d = decimals(args.symbol);
  const head = `${args.side === 'long' ? 'Long' : 'Short'} ${args.symbol}: entry ${args.entry.toFixed(d)} · stop ${args.stop.toFixed(d)}${args.target !== null ? ` · target ${args.target.toFixed(d)}` : ''}.`;
  if (args.agree) {
    const liquidityLine = args.nearestOpposingLiquidity
      ? ` Nearest opposing ${args.nearestOpposingLiquidity.kind === 'swing_high' ? 'swing high' : 'swing low'} at ${args.nearestOpposingLiquidity.price.toFixed(d)} (${args.nearestOpposingLiquidity.barsAgo} bars back).`
      : '';
    return `${head} Geometry checks out.${liquidityLine}`;
  }
  return `${head} ${args.caveats.length} caveat${args.caveats.length === 1 ? '' : 's'}: ${args.caveats.map((c) => c.message).join(' · ')}`;
}
