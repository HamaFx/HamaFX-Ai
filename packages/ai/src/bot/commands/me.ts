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

// F7+ — /me command: show the user's account info and usage stats.
// /me → displays account details, daily spend, and quick stats.

import type { BotCommand, BotResponse, BotContext } from '../types';
import { getDb, schema } from '@hamafx/db';
import { eq, and, sql } from 'drizzle-orm';
import { getBotLink } from '../linking';

export const meCommand: BotCommand = {
  name: 'me',
  aliases: ['account'],
  description: 'Your account info: /me',
  handler: async (_args: string[], ctx: BotContext): Promise<BotResponse> => {
    try {
      const db = getDb();
      const link = await getBotLink(ctx.userId, 'telegram');

      // Get user info
      const [user] = await db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          image: schema.users.image,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, ctx.userId))
        .limit(1);

      if (!user) {
        return { text: '❌ Account not found. Please re-link your Telegram.' };
      }

      // Get today's AI spend from dailyAiSpend table
      const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const [spendRow] = await db
        .select({
          totalUsdCents: schema.dailyAiSpend.totalUsdCents,
        })
        .from(schema.dailyAiSpend)
        .where(
          and(
            eq(schema.dailyAiSpend.userId, ctx.userId),
            eq(schema.dailyAiSpend.day, todayStr),
          ),
        )
        .limit(1);

      const dailyCostUsd = spendRow ? spendRow.totalUsdCents / 100 : 0;

      // Count threads
      const [threadRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.chatThreads)
        .where(eq(schema.chatThreads.userId, ctx.userId));

      // Count active alerts
      const [alertRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.alerts)
        .where(
          and(
            eq(schema.alerts.userId, ctx.userId),
            eq(schema.alerts.active, true),
          ),
        );

      const memberSince = new Date(user.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const costIcon = dailyCostUsd > 4 ? '🔴' : dailyCostUsd > 2 ? '🟡' : '🟢';

      const lines = [
        '👤 Your Account',
        '',
        `Name: ${user.name ?? 'Not set'}`,
        `Email: ${user.email ?? 'Not set'}`,
        `Member since: ${memberSince}`,
        `Telegram: ${link ? '✅ Linked' : '❌ Not linked'}`,
        '',
        '📊 Today\'s Usage',
        `${costIcon} AI Spend: $${dailyCostUsd.toFixed(4)}`,
        `Total Threads: ${threadRow?.count ?? 0}`,
        `Active Alerts: ${alertRow?.count ?? 0}`,
        '',
        '🔗 hamafx.ai',
      ];

      return { text: lines.join('\n') };
    } catch (err) {
      return {
        text: `Failed to fetch account info: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};