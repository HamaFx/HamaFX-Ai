/**
 * Copyright 2026 Kestrel
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

import { createHash, randomUUID } from 'crypto';

import type { UIMessage } from 'ai';

import { checkRateLimit } from '../../telegram/rate-limiter';
import { tryMastraBotMessage } from '../mastra';
import type { BotCommand, BotContext, BotResponse } from '../types';

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
      parts: [
        {
          type: 'text',
          text: `Run a full committee analysis of ${symbol}. Convene all specialist agents and return the consolidated verdict with grade.`,
        },
      ],
    };

    try {
      const threadId = deterministicThreadId(ctx.userId, `committee-${symbol}`);

      const text = await tryMastraBotMessage({
        userId: ctx.userId,
        threadId,
        userMessage,
        prompt: `Run a full committee analysis of ${symbol}. Include consensus, disagreement, risk warnings, and invalidation conditions.`,
        system:
          'You are Kestrel coordinating a read-only Mastra committee summary. Use only supplied evidence, do not invent current market facts, use scenario language, and never place trades or create mutations.',
      });

      return {
        text:
          text ??
          `Mastra could not complete the committee analysis of ${symbol}. Please try again in the web app.`,
      };
    } catch (err) {
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
