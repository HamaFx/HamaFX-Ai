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

import { z } from 'zod';

import { SymbolSchema } from '../symbols';
import { TimeframeSchema } from '../timeframes';

/**
 * Normalised OHLC candle. All providers map to this DTO at the adapter
 * boundary (packages/data/src/providers/<name>/map.ts).
 */
export const CandleSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  /** Open time, ms epoch UTC. */
  t: z.number().int(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  /** Volume — nullable because FX volume is synthetic / per-broker. */
  v: z.number().nullable(),
  /** Provider that produced this candle, e.g. "twelve-data". */
  source: z.string(),
  /** When we fetched it, ms epoch UTC — drives freshness UI. */
  fetchedAt: z.number().int(),
});

export type Candle = z.infer<typeof CandleSchema>;
