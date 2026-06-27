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

// F7 — /positions command: show open positions.
// /positions → lists all open positions with P&L.
// Depends on F2 (Portfolio Management).

import type { BotCommand, BotResponse, BotContext } from '../types';
import { getOpenPositionsWithPnL } from '../../portfolio';

export const positionsCommand: BotCommand = {
  name: 'positions',
  aliases: ['pos'],
  description: 'Show open positions: /positions',
  handler: async (_args: string[], ctx: BotContext): Promise<BotResponse> => {
    try {
      const positions = await getOpenPositionsWithPnL(ctx.userId);

      if (positions.length === 0) {
        return {
          text: '📭 No open positions. Use the web UI to add positions.',
        };
      }

      const lines: string[] = [
        `📊 Open Positions (${positions.length})`,
        '',
      ];

      for (const pos of positions) {
        const dirIcon = pos.direction === 'long' ? '🟢' : '🔴';
        const pnlStr = pos.unrealizedPnlUsd !== null
          ? `${pos.unrealizedPnlUsd >= 0 ? '🟢' : '🔴'} $${pos.unrealizedPnlUsd.toFixed(2)}`
          : 'N/A';
        const stale = pos.stale ? ' (stale)' : '';

        lines.push(
          `${dirIcon} ${pos.symbol} ${pos.lotSize} lots${stale}`,
          `  Entry: ${pos.entryPrice} | P&L: ${pnlStr}`,
        );
      }

      return {
        text: lines.join('\n'),
      };
    } catch (err) {
      return {
        text: `Failed to fetch positions: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};
