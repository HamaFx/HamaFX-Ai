// SPDX-License-Identifier: Apache-2.0

import type { StructureKind } from '@hamafx/shared';

export const ALL_KINDS = ['swings', 'bos_choch', 'fvg', 'order_blocks', 'liquidity'] as const;

export const SHORT_LABEL: Record<StructureKind, string> = {
  swings: 'swings',
  bos_choch: 'BOS/CHoCH',
  fvg: 'FVG',
  order_blocks: 'OB',
  liquidity: 'sweeps',
};

export const FULL_LABEL: Record<StructureKind, string> = {
  swings: 'Swings',
  bos_choch: 'BOS / CHoCH',
  fvg: 'Fair Value Gaps',
  order_blocks: 'Order Blocks',
  liquidity: 'Liquidity sweeps',
};

export const HINT: Record<StructureKind, string> = {
  swings: 'Local pivot highs/lows',
  bos_choch: 'Break of structure / change of character',
  fvg: '3-bar imbalance zones',
  order_blocks: 'Last opposing candle before impulse',
  liquidity: 'Wick spike + close-back-inside',
};
