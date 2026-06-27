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

// F7 — /ask command: free-form question to the AI.
// /ask is gold bullish? → runs the AI agent with the user's question.
//
// This command costs money (AI tokens) — it checks the budget guardrail.

import type { BotCommand, BotResponse, BotContext } from '../types';
import { runChat } from '../../agent';
import type { ServerEnv } from '@hamafx/shared';
import type { UIMessage } from 'ai';
import { withRateLimit } from '@hamafx/db';
import { createHash, randomUUID } from 'crypto';

export const askCommand: BotCommand = {
  name: 'ask',
  aliases: ['q'],
  description: 'Ask a question: /ask <question>',
  handler: async (args: string[], ctx: BotContext): Promise<BotResponse> => {
    if (args.length === 0) {
      return {
        text: 'Usage: /ask <question>\nExample: /ask is gold bullish?',
      };
    }

    const question = args.join(' ');

    // Rate limit: 15 questions per minute per user
    const rateLimit = await withRateLimit(ctx.userId, 'bot_ask', 15);
    if (!rateLimit.allowed) {
      return {
        text: `⏳ Rate limit exceeded. You can use /ask ${rateLimit.limit} times per minute. Please wait and try again.`,
      };
    }

    const userMessage: UIMessage = {
      id: randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: question }],
    };

    try {
      const threadId = deterministicThreadId(ctx.userId, 'ask');

      const result = await runChat({
        threadId,
        userId: ctx.userId,
        userMessage,
        env: {} as ServerEnv,
        customInstructions: `The user asked a question via the Telegram bot. Provide a concise answer suitable for a mobile chat interface.`,
      });

      const text = await result.text;

      return {
        text: text || 'Your question has been processed. Check the web UI for details.',
      };
    } catch (err) {
      return {
        text: `Failed to process question: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};

/** Generate a deterministic UUID from a string (for thread IDs). */
function deterministicThreadId(...parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('-')).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    '8' + hash.substring(17, 20),
    hash.substring(20, 32),
  ].join('-');
}
