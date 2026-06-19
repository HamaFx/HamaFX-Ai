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

// Output envelope returned by the `verify_call` AI tool.
//
// The verifier runs after the agent has named a directional setup and
// re-checks two things deterministically:
//
//   1. Has the proposed entry / stop / target combination been priced
//      sensibly? Stop must be on the appropriate side of entry; target,
//      if present, must be on the opposite side; pip distances must be
//      finite and positive.
//   2. Where is the nearest opposing liquidity (swing high above for
//      a long, swing low below for a short)? If that level sits inside
//      the entry→target range, the setup is at risk of being swept on
//      the way to TP.
//
// On disagreement the tool returns `agree: false` and emits a list of
// caveats — the agent should surface them through the `verify-warning`
// chat part rather than silently restating the call.
//
// Source of truth: packages/ai/src/tools/verify-call.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { TimeframeSchema } from '../../timeframes';

export const VerifyCallDirectionSchema = z.enum(['long', 'short']);
export type VerifyCallDirection = z.infer<typeof VerifyCallDirectionSchema>;

export const VerifyCallInputSchema = z.object({
  symbol: SymbolSchema,
  side: VerifyCallDirectionSchema,
  entry: z.number().positive(),
  stop: z.number().positive(),
  target: z.number().positive().nullable().optional(),
  /** Bar timeframe used for the structure scan. */
  tf: TimeframeSchema.default('1h'),
  /** Lookback in bars for the structure scan. */
  lookbackBars: z.number().int().min(50).max(1000).default(300),
});
export type VerifyCallInput = z.infer<typeof VerifyCallInputSchema>;

export const VerifyCallCaveatSchema = z.object({
  /** One-line code so the chat part can render an icon family. */
  code: z.enum([
    'invalid_stop_side',
    'invalid_target_side',
    'no_invalidation',
    'opposing_liquidity_in_path',
    'thin_structure',
  ]),
  message: z.string(),
});
export type VerifyCallCaveat = z.infer<typeof VerifyCallCaveatSchema>;

export const VerifyCallOutputSchema = z.object({
  symbol: SymbolSchema,
  asOf: z.number().int(),
  side: VerifyCallDirectionSchema,
  entry: z.number(),
  stop: z.number(),
  target: z.number().nullable(),
  /**
   * True when the verifier sees no problems. False means at least one
   * caveat fired — see `caveats[]` for details. The verifier never
   * blocks; the chat part renders a warning part so the user sees both
   * the call and the caveat.
   */
  agree: z.boolean(),
  caveats: z.array(VerifyCallCaveatSchema),
  /**
   * Nearest swing high above entry (long) or swing low below entry
   * (short). Null when structure scan returned nothing useful.
   */
  nearestOpposingLiquidity: z
    .object({
      price: z.number(),
      kind: z.enum(['swing_high', 'swing_low']),
      barsAgo: z.number().int(),
    })
    .nullable(),
  /** Templated one-paragraph rationale the chat part displays. */
  rationale: z.string(),
});
export type VerifyCallOutput = z.infer<typeof VerifyCallOutputSchema>;
