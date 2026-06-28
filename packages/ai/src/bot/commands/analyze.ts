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

// F7 — /analyze command: full AI analysis of a symbol.
// /analyze EURUSD → runs the AI agent for a full analysis.
//
// This command costs money (AI tokens) — it checks the budget guardrail.

import type { BotCommand, BotResponse, BotContext } from '../types';
import { runChat } from '../../agent';
import type { ServerEnv } from '@hamafx/shared';
import type { UIMessage } from 'ai';
import { withRateLimit } from '@hamafx/db';
import { createHash, randomUUID } from 'crypto';

export const analyzeCommand: BotCommand = {
  name: 'analyze',
  aliases: ['a'],
  description: 'Full AI analysis: /analyze <symbol>',
  handler: async (args: string[], ctx: BotContext): Promise<BotResponse> => {
    const symbolStr = args[0];
    if (!symbolStr) {
      return {
        text: 'Usage: /analyze <symbol>\nExample: /analyze EURUSD',
      };
    }
    const symbol = symbolStr.toUpperCase();

    // Rate limit: 10 analyses per minute per user
    const rateLimit = await withRateLimit(ctx.userId, 'bot_analyze', 10);
    if (!rateLimit.allowed) {
      return {
        text: `⏳ Rate limit exceeded. You can run /analyze ${rateLimit.limit} times per minute. Please wait and try again.`,
      };
    }

    // Build a chat message that triggers analysis
    const userMessage: UIMessage = {
      id: randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: `Please provide a full analysis of ${symbol}. Include technical, fundamental, and risk assessment.` }],
    };

    try {
      // Use a deterministic thread ID for bot conversations per user+symbol
      const threadId = deterministicThreadId(ctx.userId, `analyze-${symbol}`);

      const result = await runChat({
        threadId,
        userId: ctx.userId,
        userMessage,
        env: {} as ServerEnv, // The agent resolves env internally via getServerEnv
        customInstructions: `The user requested a full analysis of ${symbol} via the Telegram bot. Provide a concise but comprehensive analysis suitable for a mobile chat interface. Use clear formatting.`,
      });

      const text = await result.text;

      return {
        text: text || `Analysis of ${symbol} completed. Check the web UI for full details.`,
      };
    } catch (err) {
      return {
        text: `Analysis failed: ${err instanceof Error ? err.message : 'unknown error'}`,
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
