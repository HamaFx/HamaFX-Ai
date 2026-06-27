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

// F7 — /help command: list all available commands.

import type { BotCommand, BotResponse } from '../types';
import { getBotDispatcher } from '../dispatcher';

export const helpCommand: BotCommand = {
  name: 'help',
  aliases: ['start', 'h'],
  description: 'Show available commands',
  handler: async (): Promise<BotResponse> => {
    const dispatcher = getBotDispatcher();
    const commands = dispatcher.listCommands();

    // Group commands by category for better UX
    const marketCommands = commands.filter((c) =>
      ['price', 'chart', 'news', 'calendar'].includes(c.name),
    );
    const aiCommands = commands.filter((c) =>
      ['analyze', 'ask', 'committee'].includes(c.name),
    );
    const accountCommands = commands.filter((c) =>
      ['status', 'positions', 'alert', 'track', 'settings', 'me'].includes(c.name),
    );

    const formatCmds = (cmds: typeof commands) =>
      cmds.map((c) => `/${c.name} — ${c.description}`).join('\n');

    const text = [
      '🤖 HamaFX Bot Commands',
      '',
      '📈 Market',
      formatCmds(marketCommands),
      '',
      '🧠 AI Analysis',
      formatCmds(aiCommands),
      '',
      '👤 Account',
      formatCmds(accountCommands),
      '',
      '/link <code> — Link your HamaFX account',
      '/help — Show this help',
      '',
      '💡 You can also send any free-form message to chat with the AI.',
    ].join('\n');

    return { text };
  },
};
