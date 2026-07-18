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

// Internal "live tick" DTO — the row shape we persist in the `live_ticks`
// snapshot table from the worker's BiQuote SignalR consumer (Phase 8).
//
// Differs from the user-facing `TickSchema`:
//   - `LiveTickSchema` is the persistence-layer DTO; carries everything we
//     write to Postgres and read back from `/api/market/price`.
//   - `TickSchema` is the wire-facing DTO already exported from the
//     provider adapters; one-way conversion via the BiQuote map.
//
// The schema deliberately mirrors `live_ticks` columns 1:1 so Drizzle's
// inferred row type can be `as` cast cleanly when we materialise reads.

import { z } from 'zod';

import { SymbolSchema } from '../symbols';

export const LiveTickSchema = z.object({
  symbol: SymbolSchema,
  bid: z.number().finite(),
  ask: z.number().finite(),
  /** mid = (bid + ask) / 2; computed in the consumer, not stored as derived. */
  mid: z.number().finite(),
  /** Tick wall-clock time, ms epoch UTC. */
  ts: z.number().int().nonnegative(),
  /**
   * Where this tick came from. Stable strings, not an enum, because we want
   * to add new sources without a schema migration:
   *   - 'biquote-signalr' — preferred path, written by the worker's hub consumer
   *   - 'biquote-rest'    — REST polling fallback
   *   - 'finnhub-rest'    — fallback to Finnhub on BiQuote outage    *   - 'finnhub-rest'    — fallback
   */
  source: z.string().min(1),
});

export type LiveTick = z.infer<typeof LiveTickSchema>;
