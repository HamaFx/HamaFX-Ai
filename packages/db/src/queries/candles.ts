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

// Candle query helpers — market data and alert simulation.

import { eq, desc } from 'drizzle-orm';
import { getDb, schema } from '../client';

/** A candle row from candles_1m (subset of relevant fields). */
export interface CandleRow {
  t: number | Date | string;
  o: number;
  h: number;
  l: number;
  c: number;
}

/**
 * Fetch the most recent N candles for a symbol from candles_1m.
 * Used by the alert simulator and market data routes.
 */
export async function getRecentCandles(
  symbol: string,
  limit: number = 1500,
): Promise<CandleRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.candles1m)
    .where(eq(schema.candles1m.symbol, symbol))
    .orderBy(desc(schema.candles1m.t))
    .limit(limit);
}

/**
 * Fetch the active symbol catalog, ordered by sortOrder.
 */
export async function listActiveSymbols() {
  const db = getDb();
  return db
    .select()
    .from(schema.symbolCatalog)
    .where(eq(schema.symbolCatalog.isActive, true))
    .orderBy(schema.symbolCatalog.sortOrder);
}
