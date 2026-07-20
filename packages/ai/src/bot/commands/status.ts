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

// F7 — /status command: system status and quick overview.
// /status → shows system health, market phase, and user's open positions count.

import type { BotCommand, BotResponse, BotContext } from '../types';
import { listOpenPositions } from '@hamafx/db';
import { countActiveAlerts } from '@hamafx/db';
import { getMarketPhase, isForexWeekend } from '@hamafx/shared';

export const statusCommand: BotCommand = {
  name: 'status',
  aliases: ['s'],
  description: 'System status: /status',
  handler: async (_args: string[], ctx: BotContext): Promise<BotResponse> => {
    try {
      const positions = await listOpenPositions(ctx.userId);
      const alertsCount = await countActiveAlerts(ctx.userId);

      // Get market phase
      const phase = getMarketPhase();
      const weekend = isForexWeekend();

      const lines = [
        '🟢 HamaFX System Status',
        '',
        `Session: ${phase.session}`,
        `Liquidity: ${phase.liquidity}`,
        weekend ? '⚠️ Weekend — markets closed' : '✅ Markets open',
        '',
        '📊 Your Overview',
        `Open Positions: ${positions.length}`,
        `Active Alerts: ${alertsCount}`,        '','System operational',
      ];

      return {
        text: lines.join('\n'),
      };
    } catch (err) {
      return {
        text: `Status check failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};
