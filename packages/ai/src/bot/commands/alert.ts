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

// F7 — /alert command: create a price alert from the bot.
// /alert XAUUSD > 2700 → creates a priceCross alert when XAUUSD goes above 2700.
// /alert EURUSD < 1.0850 → creates a priceCross alert when EURUSD goes below 1.0850.

import type { BotCommand, BotResponse, BotContext } from '../types';
import { getDb, schema } from '@hamafx/db';

interface ParsedAlert {
  symbol: string;
  direction: 'above' | 'below';
  level: number;
}

function parseAlertArgs(args: string[]): ParsedAlert | null {
  if (args.length < 3) return null;

  const symbol = args[0].toUpperCase();
  const operator = args[1];
  const levelStr = args[2];

  let direction: 'above' | 'below';
  if (operator === '>' || operator === '>=') {
    direction = 'above';
  } else if (operator === '<' || operator === '<=') {
    direction = 'below';
  } else {
    return null;
  }

  const level = parseFloat(levelStr);
  if (isNaN(level)) return null;

  return { symbol, direction, level };
}

export const alertCommand: BotCommand = {
  name: 'alert',
  aliases: [],
  description: 'Create price alert: /alert <symbol> > <price>',
  handler: async (args: string[], ctx: BotContext): Promise<BotResponse> => {
    const parsed = parseAlertArgs(args);

    if (!parsed) {
      return {
        text: [
          'Usage: /alert <symbol> <operator> <price>',
          'Operators: >, <, >=, <=',
          'Example: /alert XAUUSD > 2700',
          'Example: /alert EURUSD < 1.0850',
        ].join('\n'),
      };
    }

    try {
      const db = getDb();

      // Create a priceCross alert rule (matching the AlertRule schema)
      const rule = {
        type: 'priceCross',
        symbol: parsed.symbol,
        level: parsed.level,
        direction: parsed.direction,
      };

      await db.insert(schema.alerts).values({
        userId: ctx.userId,
        rule,
        channels: ['telegram'],
        active: true,
      });

      const dirText = parsed.direction === 'above' ? '↑ above' : '↓ below';

      return {
        text: [
          `✅ Alert Created`,
          ``,
          `Symbol: ${parsed.symbol}`,
          `Trigger: ${dirText} ${parsed.level}`,
          ``,
          `You'll be notified on Telegram when the condition is met.`,
        ].join('\n'),
      };
    } catch (err) {
      return {
        text: `Failed to create alert: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};
