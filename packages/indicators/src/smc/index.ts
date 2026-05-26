// Smart Money Concepts compute orchestrator.
//
// Single entry point used by the route handler + the AI tool, mirroring
// the `computeIndicator` pattern. Caller picks which kinds to compute by
// name; each kind is opt-in so a "just give me the FVGs" call doesn't
// burn cycles on order-block scanning.

import type { Candle, StructureKind, StructureResult, Symbol, Timeframe } from '@hamafx/shared';

import { detectFvgs, type DetectFvgOptions } from './fvg';
import { detectLiquiditySweeps, type DetectLiquiditySweepsOptions } from './liquidity';
import { detectOrderBlocks, type DetectOrderBlocksOptions } from './order-blocks';
import { detectStructure, type DetectStructureOptions } from './structure';
import { findSwings, type FindSwingsOptions } from './swings';

export { findSwings } from './swings';
export { detectStructure } from './structure';
export { detectFvgs } from './fvg';
export { detectOrderBlocks } from './order-blocks';
export { detectLiquiditySweeps } from './liquidity';

export interface ComputeStructureArgs {
  symbol: Symbol;
  tf: Timeframe;
  candles: Candle[];
  /** Which subsystems to compute. Defaults to all five. */
  kinds?: readonly StructureKind[];
  swings?: FindSwingsOptions;
  structure?: DetectStructureOptions;
  fvg?: DetectFvgOptions;
  orderBlocks?: DetectOrderBlocksOptions;
  liquidity?: DetectLiquiditySweepsOptions;
}

const ALL_KINDS: readonly StructureKind[] = [
  'swings',
  'bos_choch',
  'fvg',
  'order_blocks',
  'liquidity',
];

export function computeStructure(args: ComputeStructureArgs): StructureResult {
  const { symbol, tf, candles } = args;
  const kinds = new Set(args.kinds ?? ALL_KINDS);

  // Swings are a dependency for structure + liquidity, so we compute them
  // even if the caller didn't ask — but only emit them in the result if
  // they did.
  const needSwings = kinds.has('swings') || kinds.has('bos_choch') || kinds.has('liquidity');
  const swings = needSwings ? findSwings(candles, args.swings) : [];

  const result: StructureResult = {
    symbol,
    tf,
    bars: candles.length,
    fetchedAt: Date.now(),
  };

  if (kinds.has('swings')) result.swings = swings;
  if (kinds.has('bos_choch')) result.events = detectStructure(candles, swings, args.structure);
  if (kinds.has('fvg')) result.fvg = detectFvgs(candles, args.fvg);
  if (kinds.has('order_blocks')) result.orderBlocks = detectOrderBlocks(candles, args.orderBlocks);
  if (kinds.has('liquidity'))
    result.liquidity = detectLiquiditySweeps(candles, swings, args.liquidity);

  return result;
}
