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

// Multi-Agent Orchestration — shared context builder.

import { buildLiveSnapshot } from '../context';
export { extractUserMessageText } from '../message-text';
import { buildSystemPrompt } from '../prompt/system';
import type { UserSettingsRow } from '@hamafx/db/schema';
import type { UIMessage } from 'ai';
import type { SharedContext, MultiAgentEnv } from './types';
import { getCandles } from '@hamafx/data';
// P0-2: multi-agent pre-fetch still uses getDb() directly since
// ToolContext is not set up in the multi-agent pipeline yet.
import { schema } from '@hamafx/db';
import { getDb as getDbDirect } from '../db';
import { gte, lte, and } from 'drizzle-orm';

function userContextFromSettings(displayName: string | null, settings: UserSettingsRow) {
  return {
    displayName: displayName ?? '',
    defaultSymbol: settings.defaultSymbol as 'XAUUSD' | 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'BTCUSD' | 'ETHUSD',
    timezone: settings.timezone,
    language: settings.language,
  };
}

export interface BuildContextArgs {
  symbol: string;
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  history: UIMessage[];
  userSettings: UserSettingsRow;
  displayName: string | null;
  customInstructions?: string;
  env: MultiAgentEnv;
  signal: AbortSignal | null;
}

/** Q4: Pre-fetch candles for common timeframes — share across all specialists. */
async function prefetchCandlesBlock(symbol: string): Promise<string> {
  const tfs = ['1h', '4h', '1d'] as const;
  const lines: string[] = [];
  for (const tf of tfs) {
    try {
      const candles = await getCandles(symbol, tf, { count: 50 });
      if (candles.length > 0) {
        const last = candles[candles.length - 1]!;
        // Show last 5 closes for trend context, not just the final bar.
        const recentCloses = candles.slice(-5).map((c) => c.c).join(', ');
        lines.push(
          `- ${symbol} ${tf}: ${candles.length} bars | recent closes: [${recentCloses}] | ` +
          `latest OHLC: o=${last.o}, h=${last.h}, l=${last.l}, c=${last.c}`,
        );
      } else {
        lines.push(`- ${symbol} ${tf}: no candles available`);
      }
    } catch {
      lines.push(`- ${symbol} ${tf}: fetch failed`);
    }
  }
  return lines.length > 0 ? `## Pre-fetched Candles\n${lines.join('\n')}` : '';
}

/** Q4: Pre-fetch upcoming calendar events — share across all specialists. */
async function prefetchCalendarBlock(): Promise<string> {
  try {
    const db = getDbDirect();
    const now = new Date();
    const weekOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(schema.economicEvents)
      .where(
        and(
          gte(schema.economicEvents.date, now),
          lte(schema.economicEvents.date, weekOut),
        ),
      )
      .orderBy(schema.economicEvents.date)
      .limit(15);

    if (rows.length === 0) return '';
    const lines = rows.map(
      (r) =>
        `- ${r.date.toISOString().slice(0, 10)} | ${r.currency} | ${r.importance} | ${r.title}` +
        (r.forecast ? ` (f/c: ${r.forecast})` : ''),
    );
    return `## Upcoming Economic Events\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}

export async function buildSharedContext(args: BuildContextArgs): Promise<SharedContext> {
  const { symbol, userId, threadId, userMessage, history, userSettings, customInstructions, env, signal } = args;
  const snapshot = await buildLiveSnapshot({ signal: signal ?? undefined, userId });

  // Q4: Pre-fetch common datasets once so all 4 specialists don't each
  // re-fetch the same candle data / calendar events independently.
  const [candlesBlock, calendarBlock] = await Promise.all([
    prefetchCandlesBlock(symbol),
    prefetchCalendarBlock(),
  ]);
  const prefetchedData = [candlesBlock, calendarBlock]
    .filter(Boolean)
    .join('\n\n');

  const ctx: SharedContext = {
    symbol, threadId, userId, snapshot, userSettings, userMessage, history, signal, env,
  };
  if (customInstructions !== undefined) ctx.customInstructions = customInstructions;
  if (prefetchedData) ctx.prefetchedData = prefetchedData;
  return ctx;
}

export function buildSharedSystemPrompt(ctx: SharedContext, displayName: string | null): string {
  const userCtx = userContextFromSettings(displayName, ctx.userSettings);
  const basePrompt = buildSystemPrompt(ctx.snapshot, userCtx);
  let prompt = basePrompt;
  // Q4: inject pre-fetched data before custom instructions so agents
  // can prefer it over making their own tool calls for the same data.
  if (ctx.prefetchedData && ctx.prefetchedData.length > 0) {
    prompt += `\n\n# PREFETCHED DATA (use this instead of calling tools for the same data)\n${ctx.prefetchedData}`;
  }
  if (ctx.customInstructions && ctx.customInstructions.trim().length > 0) {
    prompt += `\n\n<USER_CUSTOM_INSTRUCTIONS>\n${ctx.customInstructions}\n</USER_CUSTOM_INSTRUCTIONS>`;
  }
  return prompt;
}
