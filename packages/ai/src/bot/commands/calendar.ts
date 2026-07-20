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

// F7+ — /calendar command: upcoming economic calendar events.
// /calendar → next 5 economic events
// /calendar 10 → next 10 events

import type { BotCommand, BotResponse } from '../types';
import { queries } from '@hamafx/db';

export const calendarCommand: BotCommand = {
  name: 'calendar',
  aliases: ['cal'],
  description: 'Economic calendar: /calendar [count]',
  handler: async (args: string[]): Promise<BotResponse> => {
    try {
      const firstArg = args[0];
      const limit = firstArg ? Math.min(parseInt(firstArg, 10) || 5, 15) : 5;
      const now = Date.now();
      // Events up to 90 days out
      const events = await queries.news.listUpcomingEvents(now, now + 90 * 24 * 60 * 60 * 1000, limit);

      if (events.length === 0) {
        return { text: '📅 No upcoming economic events found.' };
      }

      const lines: string[] = ['📅 Upcoming Economic Events', ''];

      for (const ev of events) {
        const time = new Date(ev.date).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const impactIcon =
          ev.importance === 'high' ? '🔴' :
          ev.importance === 'medium' ? '🟡' : '🟢';
        const actualStr = ev.actual !== null ? ` | Actual: ${ev.actual}` : '';
        const forecastStr = ev.forecast !== null ? ` | Forecast: ${ev.forecast}` : '';

        lines.push(`${impactIcon} ${ev.title}`);
        lines.push(`   ${ev.country} ${ev.currency ?? ''} · ${time}${forecastStr}${actualStr}`);
        lines.push('');
      }

      return { text: lines.join('\n') };
    } catch (err) {
      return {
        text: `Failed to fetch calendar: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};