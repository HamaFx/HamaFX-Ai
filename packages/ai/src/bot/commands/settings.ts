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

// F7+ — /settings command: show user's bot and account settings.
// /settings → displays current configuration and quick links.

import type { BotCommand, BotResponse, BotContext } from '../types';
import { getBotLink } from '../linking';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';

export const settingsCommand: BotCommand = {
  name: 'settings',
  aliases: ['config'],
  description: 'View your settings: /settings',
  handler: async (_args: string[], ctx: BotContext): Promise<BotResponse> => {
    try {
      const link = await getBotLink(ctx.userId, 'telegram');

      // Fetch user's model settings
      const db = getDb();
      const [userSettings] = await db
        .select({
          defaultModels: schema.userSettings.defaultModels,
          defaultSymbol: schema.userSettings.defaultSymbol,
          timezone: schema.userSettings.timezone,
        })
        .from(schema.userSettings)
        .where(eq(schema.userSettings.userId, ctx.userId))
        .limit(1);

      const linkedAt = link ? new Date(link.linkedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }) : 'Not linked';

      const modelInfo = userSettings?.defaultModels
        ? Object.entries(userSettings.defaultModels)
            .map(([domain, model]) => `${domain}: ${model}`)
            .join(', ')
        : 'Default (Gemini 2.5 Flash)';

      const lines = [
        '⚙️ Your HamaFX Settings',
        '',
        `🔗 Telegram: ${link ? `Linked since ${linkedAt}` : 'Not linked'}`,
        `🤖 AI Models: ${modelInfo}`,
        `📊 Default Symbol: ${userSettings?.defaultSymbol ?? 'XAUUSD'}`,
        `🕐 Timezone: ${userSettings?.timezone ?? 'UTC'}`,
        '',
        'Manage full settings at:',
        '🔗 hamafx.ai/settings',
        '',
        'Available commands:',
        '  /settings — This menu',
        '  /me — Your account info',
        '  /help — All commands',
      ];

      return { text: lines.join('\n') };
    } catch (err) {
      return {
        text: `Failed to load settings: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};