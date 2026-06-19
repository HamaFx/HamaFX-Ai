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

// Output envelope returned by the `get_session_levels` AI tool.
//
// Computes Asia / London / NY range and opening prints for the current
// trading day (and optionally the prior day), plus rolling-week extremes.
// Reads 1H candles from the data layer; sessions are sliced by UTC hour
// boundaries that match the LIVE_SNAPSHOT classifier in
// `packages/ai/src/context.ts`:
//   - asia:    00:00 ≤ hour < 07:00 UTC
//   - london:  07:00 ≤ hour < 12:00 UTC
//   - ny:      12:00 ≤ hour < 21:00 UTC
//
// Source of truth: packages/ai/src/tools/get-session-levels.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';

export const SessionTagSchema = z.enum(['asia', 'london', 'ny']);
export type SessionTag = z.infer<typeof SessionTagSchema>;

export const GetSessionLevelsInputSchema = z.object({
  symbol: SymbolSchema,
  /** Include prior day's sessions in the response. */
  includePrior: z.boolean().default(false),
});
export type GetSessionLevelsInput = z.infer<typeof GetSessionLevelsInputSchema>;

export const SessionRangeSchema = z.object({
  session: SessionTagSchema,
  /** Session window start, ms epoch UTC. */
  fromMs: z.number().int(),
  toMs: z.number().int(),
  /** Opening print of the session — first bar's open. */
  open: z.number().nullable(),
  /** Highest high in window; null when the session window has no bars yet. */
  high: z.number().nullable(),
  low: z.number().nullable(),
  /** Closing print of the session, only set when the session has ended. */
  close: z.number().nullable(),
  /** True when the window's right edge is in the future (session forming). */
  forming: z.boolean(),
});
export type SessionRange = z.infer<typeof SessionRangeSchema>;

export const GetSessionLevelsOutputSchema = z.object({
  symbol: SymbolSchema,
  asOf: z.number().int(),
  /** Today's three sessions, ordered chronologically (asia → london → ny). */
  today: z.array(SessionRangeSchema),
  /** Prior trading day's sessions, when `includePrior=true`. */
  prior: z.array(SessionRangeSchema).nullable(),
  /** True if no candles were available in the lookback window. */
  pipelinePending: z.boolean(),
});
export type GetSessionLevelsOutput = z.infer<typeof GetSessionLevelsOutputSchema>;
