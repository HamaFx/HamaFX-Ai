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

// F7 — /price command: get current price for a symbol.
// /price XAUUSD → current gold price

import type { BotCommand, BotResponse } from '../types';
import { schema } from '@hamafx/db';
import { getDb } from '../../db';
import { eq, desc } from 'drizzle-orm';

export const priceCommand: BotCommand = {
  name: 'price',
  aliases: ['p'],
  description: 'Get current price: /price <symbol>',
  handler: async (args: string[]): Promise<BotResponse> => {
    const symbolStr = args[0];
    if (!symbolStr) {
      return {
        text: 'Usage: /price <symbol>\nExample: /price XAUUSD',
      };
    }

    const symbol = symbolStr.toUpperCase();

    try {
      const db = getDb();
      const [tick] = await db
        .select({
          bid: schema.liveTicks.bid,
          ask: schema.liveTicks.ask,
          mid: schema.liveTicks.mid,
          ts: schema.liveTicks.ts,
        })
        .from(schema.liveTicks)
        .where(eq(schema.liveTicks.symbol, symbol))
        .orderBy(desc(schema.liveTicks.ts))
        .limit(1);

      if (!tick) {
        return {
          text: `No live data available for ${symbol}. The market may be closed or the symbol is not tracked.`,
        };
      }

      const time = new Date(tick.ts).toISOString();

      return {
        text: [
          `📊 ${symbol}`,
          ``,
          `Bid: ${tick.bid}`,
          `Ask: ${tick.ask}`,
          `Mid: ${tick.mid}`,
          `Updated: ${time}`,
        ].join('\n'),
      };
    } catch (err) {
      return {
        text: `Failed to fetch price for ${symbol}: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};
