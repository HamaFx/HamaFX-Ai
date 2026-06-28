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

// F7+ — /committee command: run the multi-agent committee on a symbol.
// /committee XAUUSD → runs full multi-agent deliberation (Technical + Fundamental + Risk + Decision).
//
// This is the most expensive command (4-5 LLM calls). Rate limited aggressively.

import type { BotCommand, BotResponse, BotContext } from '../types';
import { runChat } from '../../agent';
import type { ServerEnv } from '@hamafx/shared';
import type { UIMessage } from 'ai';
import { createHash, randomUUID } from 'crypto';
import { checkRateLimit } from '../../telegram/rate-limiter';

export const committeeCommand: BotCommand = {
  name: 'committee',
  aliases: ['comm'],
  description: 'Multi-agent committee: /committee <symbol>',
  handler: async (args: string[], ctx: BotContext): Promise<BotResponse> => {
    const symbolStr = args[0];
    if (!symbolStr) {
      return {
        text: [
          'Usage: /committee <symbol>',
          'Example: /committee XAUUSD',
          '',
          'Runs the full multi-agent committee (Technical + Fundamental + Risk + Decision).',
          '⚠️ This is a premium command — rate limited to 3/hour.',
        ].join('\n'),
      };
    }

    const symbol = symbolStr.toUpperCase();

    // Aggressive rate limit: 3 per hour per user
    const rateLimit = checkRateLimit(ctx.userId, 'bot_committee', 3);
    if (!rateLimit.allowed) {
      const minutes = Math.ceil(rateLimit.resetMs / 60000);
      return {
        text: `⏳ Committee rate limit reached (3/hour). Please wait ~${minutes}min.`,
      };
    }

    const userMessage: UIMessage = {
      id: randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: `Run a full committee analysis of ${symbol}. Convene all specialist agents and return the consolidated verdict with grade.` }],
    };

    try {
      const threadId = deterministicThreadId(ctx.userId, `committee-${symbol}`);

      // 45s timeout for committee (it's 4-5 LLM calls in parallel)
      const result = await Promise.race([
        runChat({
          threadId,
          userId: ctx.userId,
          userMessage,
          env: {} as ServerEnv,
          customInstructions: `The user requested a full multi-agent committee analysis of ${symbol} via the Telegram bot. Convene the committee with all specialist agents. Return a concise verdict suitable for mobile chat: grade (A-F), key consensus, risk warnings, and actionable summary.`,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Committee timeout')), 45_000),
        ),
      ]);

      const text = await result.text;

      return {
        text: text || `Committee analysis of ${symbol} completed. Check the web UI for full details.`,
      };
    } catch (err) {
      if (err instanceof Error && err.message.includes('timeout')) {
        return { text: '⏳ Committee analysis timed out (45s). The agents may still be processing — check the web UI for results.' };
      }
      return {
        text: `Committee failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};

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