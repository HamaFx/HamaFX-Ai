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

// Tool: compute_position_health.
//
// Joins open journal entries to live mid prices and emits per-position
// pnl in pips + R, plus distance to stop / target. Fetches each price
// independently so a single failure only drops one row and sets
// `partial: true`.

import { getPrice } from '@hamafx/data';
import {
  ComputePositionHealthInputSchema,
  pipSize,
  type ComputePositionHealthOutput,
  type PositionHealthRow,
  type Symbol,
  type TradeSide,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

import { listEntries } from '../journal/persistence';
import { getToolContext } from '../tool-context';

const InputSchema = ComputePositionHealthInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    compute_position_health: { input: z.infer<typeof InputSchema> };
  }
}

const NEAR_HIT_PIPS = 5;

export const computePositionHealthTool = tool({
  description:
    'For each currently-open journal entry, compute live P/L in pips and R-multiples plus distance to stop and target. Use when the user asks "how are my open trades", "anything close to stopping out", or wants a live P/L pulse. Skips closed trades; sets `empty: true` when no positions are open and `partial: true` when at least one row was dropped due to a price-fetch failure.',
  inputSchema: InputSchema,
  execute: async ({ symbol, limit }): Promise<ComputePositionHealthOutput> => {
    const all = await listEntries(getToolContext().userId, { limit: 200, ...(symbol ? { symbol } : {}) });
    const open = all.filter((e) => e.outcome === 'open').slice(0, limit);

    if (open.length === 0) {
      return { asOf: Date.now(), rows: [], partial: false, empty: true };
    }

    let partial = false;
    const priceCache = new Map<Symbol, number>();
    const rows: PositionHealthRow[] = [];

    for (const e of open) {
      let mid = priceCache.get(e.symbol);
      if (mid === undefined) {
        try {
          const tick = await getPrice(e.symbol);
          mid = tick.mid;
          priceCache.set(e.symbol, mid);
        } catch {
          partial = true;
          continue;
        }
      }

      rows.push(buildRow({ entry: e, mid }));
    }

    return { asOf: Date.now(), rows, partial, empty: false };
  },
});

interface BuildRowArgs {
  entry: {
    id: string;
    symbol: Symbol;
    side: TradeSide;
    openedAt: number;
    entry: number;
    stop: number | null;
    target: number | null;
  };
  mid: number;
}

function buildRow(args: BuildRowArgs): PositionHealthRow {
  const { entry: e, mid } = args;
  const pip = pipSize(e.symbol);

  // Signed P/L in price space, then convert to pips.
  const sign = e.side === 'long' ? 1 : -1;
  const pnlPriceUnits = (mid - e.entry) * sign;
  const pnlPips = pnlPriceUnits / pip;

  // R = pnl / |entry-stop|, only when stop is known.
  let pnlR: number | null = null;
  let distanceToStopPips: number | null = null;
  if (e.stop !== null) {
    const risk = Math.abs(e.entry - e.stop);
    if (risk > 0) pnlR = pnlPriceUnits / risk;
    distanceToStopPips = Math.abs(mid - e.stop) / pip;
  }

  let distanceToTargetPips: number | null = null;
  if (e.target !== null) {
    distanceToTargetPips = Math.abs(mid - e.target) / pip;
  }

  const aboutToHit =
    (distanceToStopPips !== null && distanceToStopPips <= NEAR_HIT_PIPS) ||
    (distanceToTargetPips !== null && distanceToTargetPips <= NEAR_HIT_PIPS);

  return {
    entryId: e.id,
    symbol: e.symbol,
    side: e.side,
    openedAtMs: e.openedAt,
    entry: e.entry,
    stop: e.stop,
    target: e.target,
    currentMid: mid,
    pnlPips,
    pnlR,
    distanceToStopPips,
    distanceToTargetPips,
    aboutToHit,
  };
}
