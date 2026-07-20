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

// F7+ — /news command: fetch latest market news.
// /news → latest forex/gold news
// /news XAUUSD → news filtered to a symbol

import type { BotCommand, BotResponse } from '../types';
import { queries } from '@hamafx/db';

export const newsCommand: BotCommand = {
  name: 'news',
  aliases: ['n'],
  description: 'Latest market news: /news [symbol]',
  handler: async (args: string[]): Promise<BotResponse> => {
    try {
      const symbolStr = args[0];
      const articles = await queries.news.listRecentArticles(5, 0, {
        ...(symbolStr ? { symbol: symbolStr.toUpperCase() } : {}),
      });

      if (articles.length === 0) {
        return { text: '📭 No recent news available. The market may be closed.' };
      }

      const lines: string[] = ['📰 Latest Market News', ''];

      for (const item of articles) {
        const time = new Date(item.publishedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const sentimentIcon =
          item.sentiment === 'positive' ? '🟢' :
          item.sentiment === 'negative' ? '🔴' : '⚪';
        lines.push(`${sentimentIcon} ${item.title}`);
        lines.push(`   ${item.source} · ${time}`);
        if (item.url) lines.push(`   🔗 ${item.url}`);
        lines.push('');
      }

      return { text: lines.join('\n') };
    } catch (err) {
      return {
        text: `Failed to fetch news: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};