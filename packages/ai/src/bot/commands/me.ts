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

// F7+ — /me command: show the user's account info and usage stats.
// /me → displays account details, daily spend, and quick stats.

import type { BotCommand, BotResponse, BotContext } from '../types';
import { getUserWithSettings, countActiveAlerts } from '@hamafx/db';
import { dailySpendUsd } from '../../cost';
import { getBotLink } from '../linking';

export const meCommand: BotCommand = {
  name: 'me',
  aliases: ['account'],
  description: 'Your account info: /me',
  handler: async (_args: string[], ctx: BotContext): Promise<BotResponse> => {
    try {
      const link = await getBotLink(ctx.userId, 'telegram');
      const { settings, user: userRow } = await getUserWithSettings(ctx.userId);
      const dailyCostUsd = await dailySpendUsd(ctx.userId);
      const alertsCount = await countActiveAlerts(ctx.userId);

      const memberSince = userRow?.email ? 'Registered' : 'N/A';

      const costIcon = dailyCostUsd > 4 ? '🔴' : dailyCostUsd > 2 ? '🟡' : '🟢';

      const lines = [
        '👤 Your Account',
        '',
        `Name: ${userRow?.name ?? 'Not set'}`,
        `Email: ${userRow?.email ?? 'Not set'}`,
        `Member since: ${memberSince}`,
        `Telegram: ${link ? '✅ Linked' : '❌ Not linked'}`,
        '',
        '📊 Today\'s Usage',
        `${costIcon} AI Spend: $${dailyCostUsd.toFixed(4)}`,
        `Active Alerts: ${alertsCount}`,
        '',
        '🔗 hamafx.ai',
      ];

      return { text: lines.join('\n') };
    } catch (err) {
      return {
        text: `Failed to fetch account info: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};