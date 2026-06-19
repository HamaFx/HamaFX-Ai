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

// Per-symbol tick buffer.
//
// The SignalR consumer dispatches `BiquoteTick` events as fast as BiQuote
// pushes them — that's many hundreds per second across the three symbols
// during high-volume windows. Writing every one of those to Postgres would
// burn quota and starve other queries.
//
// `TickBuffer` collapses the firehose into the LATEST tick per symbol. The
// flush loop drains it once per second and UPSERTs into `live_ticks`. We
// also keep a slot for "ticks since last drain" so callers can enforce a
// minimum of one DB write per N ticks per symbol if they want.
//
// This module is pure data — no IO, no logging — so it's trivially
// testable and reusable from the candle aggregator (which wants the same
// per-symbol coalescing semantics over a different drain cadence).

import type { Symbol } from '@hamafx/shared';

import type { NormalizedTick } from './consumer.js';

interface Slot {
  tick: NormalizedTick;
  /** Count of ticks observed for this symbol since the last drain. */
  observed: number;
}

export class TickBuffer {
  private readonly slots = new Map<Symbol, Slot>();

  /**
   * Record a tick. Replaces any existing tick for the symbol so the buffer
   * always holds the freshest known value. O(1).
   */
  push(tick: NormalizedTick): void {
    const existing = this.slots.get(tick.symbol);
    if (existing) {
      existing.tick = tick;
      existing.observed += 1;
    } else {
      this.slots.set(tick.symbol, { tick, observed: 1 });
    }
  }

  /**
   * Drain the buffer. Returns the latest tick per symbol since the last
   * call, oldest-symbol-first by observation order. Calling drain with no
   * pending ticks returns an empty array.
   */
  drain(): Array<{ tick: NormalizedTick; observed: number }> {
    if (this.slots.size === 0) return [];
    const out: Array<{ tick: NormalizedTick; observed: number }> = [];
    for (const slot of this.slots.values()) {
      out.push({ tick: slot.tick, observed: slot.observed });
    }
    this.slots.clear();
    return out;
  }

  /** Test helper / introspection. */
  size(): number {
    return this.slots.size;
  }

  /** Test helper. */
  clear(): void {
    this.slots.clear();
  }
}
