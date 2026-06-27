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

// F7 — /track command: AI track record stats.
// /track → shows decision signal statistics (win rate, count, etc.).
// Depends on F1 (Decision Signal Tracking).

import type { BotCommand, BotResponse, BotContext } from '../types';
import { getDb, schema } from '@hamafx/db';
import { eq, sql } from 'drizzle-orm';

export const trackCommand: BotCommand = {
  name: 'track',
  aliases: ['trackrecord', 'tr'],
  description: 'AI track record: /track',
  handler: async (_args: string[], ctx: BotContext): Promise<BotResponse> => {
    try {
      const db = getDb();

      // Get total signal counts
      const [totalStats] = await db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${schema.decisionSignals.status} = 'active')::int`,
          expired: sql<number>`count(*) filter (where ${schema.decisionSignals.status} = 'expired')::int`,
          closed: sql<number>`count(*) filter (where ${schema.decisionSignals.status} = 'closed')::int`,
        })
        .from(schema.decisionSignals)
        .where(eq(schema.decisionSignals.userId, ctx.userId));

      // Get outcome stats
      const [outcomeStats] = await db
        .select({
          evaluated: sql<number>`count(*)::int`,
          hits: sql<number>`count(*) filter (where ${schema.decisionSignalOutcomes.outcome} = 'hit')::int`,
          misses: sql<number>`count(*) filter (where ${schema.decisionSignalOutcomes.outcome} = 'miss')::int`,
          neutral: sql<number>`count(*) filter (where ${schema.decisionSignalOutcomes.outcome} = 'neutral')::int`,
          avgReturn: sql<number>`avg(${schema.decisionSignalOutcomes.priceReturnPct})::float`,
        })
        .from(schema.decisionSignalOutcomes)
        .innerJoin(
          schema.decisionSignals,
          eq(schema.decisionSignalOutcomes.signalId, schema.decisionSignals.id),
        )
        .where(eq(schema.decisionSignals.userId, ctx.userId));

      const total = totalStats?.total ?? 0;
      const evaluated = outcomeStats?.evaluated ?? 0;
      const hits = outcomeStats?.hits ?? 0;
      const winRate = evaluated > 0 ? ((hits / evaluated) * 100).toFixed(1) : 'N/A';
      const avgReturn = outcomeStats?.avgReturn !== null && outcomeStats?.avgReturn !== undefined
        ? `${outcomeStats.avgReturn.toFixed(2)}%`
        : 'N/A';

      const lines = [
        '🎯 AI Track Record',
        '',
        `Total Signals: ${total}`,
        `Active: ${totalStats?.active ?? 0}`,
        `Expired: ${totalStats?.expired ?? 0}`,
        `Closed: ${totalStats?.closed ?? 0}`,
        '',
        '📈 Outcomes',
        `Evaluated: ${evaluated}`,
        `Hits: ${hits}`,
        `Misses: ${outcomeStats?.misses ?? 0}`,
        `Neutral: ${outcomeStats?.neutral ?? 0}`,
        `Win Rate: ${winRate}%`,
        `Avg Return: ${avgReturn}`,
        '',
        'View detailed stats at hamafx.ai/settings/track-record',
      ];

      return {
        text: lines.join('\n'),
      };
    } catch (err) {
      return {
        text: `Failed to fetch track record: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};
