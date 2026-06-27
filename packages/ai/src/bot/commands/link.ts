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

// F7 — /link command: link a Telegram chat to a HamaFX user account.
// /link ABC123 → resolves the link code and stores the mapping.
//
// This command is special: it works even for unlinked users (that's its purpose).
// The link code is generated from the settings page.

import type { BotCommand, BotResponse, BotContext } from '../types';
import { resolveLinkCode } from '../linking';

export const linkCommand: BotCommand = {
  name: 'link',
  aliases: [],
  description: 'Link your HamaFX account: /link <code>',
  handler: async (args: string[], ctx: BotContext): Promise<BotResponse> => {
    if (args.length === 0) {
      return {
        text: [
          '🔗 Link Your HamaFX Account',
          '',
          'To link your Telegram to HamaFX:',
          '1. Go to hamafx.ai/settings',
          '2. Click "Link Telegram"',
          '3. Copy the 6-character code',
          '4. Send: /link <your-code>',
          '',
          'Link codes expire after 10 minutes.',
        ].join('\n'),
      };
    }

    const code = args[0];

    // We need the chatId from the context, but since the user isn't linked yet,
    // ctx.userId will be empty. We use a special context for linking.
    // The actual chatId is passed via the context.
    const chatId = ctx.chatId;
    if (!chatId) {
      return { text: 'Error: Could not determine chat ID. Please try again.' };
    }

    try {
      const userId = await resolveLinkCode(code, chatId, 'telegram');

      if (!userId) {
        return {
          text: '❌ Invalid or expired link code. Please generate a new code from hamafx.ai/settings and try again.',
        };
      }

      return {
        text: [
          '✅ Account Linked Successfully!',
          '',
          'Your Telegram is now connected to your HamaFX account.',
          'You can now use all bot commands:',
          '',
          '/price XAUUSD — Get current price',
          '/analyze EURUSD — Full AI analysis',
          '/ask is gold bullish? — Ask a question',
          '/status — System status',
          '/positions — Your open positions',
          '/track — AI track record',
          '/help — See all commands',
        ].join('\n'),
      };
    } catch (err) {
      return {
        text: `Linking failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};
