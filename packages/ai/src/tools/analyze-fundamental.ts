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

// Tool: analyze_fundamental.
//
// Aggregates the next-`horizon` window of high/medium-impact macro events
// for the symbol's currencies plus a recent news pull, and returns a
// structured fundamental snapshot. Sentiment counts are bucketed from
// `news_articles.sentiment`; the summary string is templated (no LLM).
//
// Empty pipelines (no events AND no headlines): return `pipelinePending: true`
// so the chat part can surface a single status line instead of a misleading
// "everything is quiet".

import { getDb, schema } from '@hamafx/db';
import {
  AnalyzeFundamentalInputSchema,
  type AnalyzeFundamentalOutput,
  type EconomicEvent,
  type EventCurrency,
  type Importance,
  type NewsSentiment,
  type Symbol,
  type SymbolOrCurrencyTag,
  type ToolNewsItem,
} from '@hamafx/shared';
import { tool } from 'ai';
import { and, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import type { z } from 'zod';

const InputSchema = AnalyzeFundamentalInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    analyze_fundamental: { input: z.infer<typeof InputSchema> };
  }
}

/** Map from symbol to the relevant currency tags used by the calendar + news. */
const CURRENCIES_BY_SYMBOL: Record<Symbol, EventCurrency[]> = {
  XAUUSD: ['USD'],
  EURUSD: ['EUR', 'USD'],
  GBPUSD: ['GBP', 'USD'],
};

/** Per-currency news cap so a noisy Marketaux day can't drown one currency. */
const NEWS_PER_CURRENCY = 5;

void or;
void eq;

export const analyzeFundamentalTool = tool({
  description:
    "Aggregate the upcoming high/medium-impact macro events for a symbol's currencies plus the most recent news, with a sentiment chip strip. Use for any 'what's the fundamental backdrop on X' or 'are there any catalysts in the next N hours' prompt. Window is `horizonHours` (default 24h). Sentiment buckets are read from news_articles.sentiment; no inference. Sets `pipelinePending: true` when both events and headlines are empty.",
  inputSchema: InputSchema,
  execute: async ({ symbol, horizonHours }): Promise<AnalyzeFundamentalOutput> => {
    const currencies = CURRENCIES_BY_SYMBOL[symbol] || ['USD'];
    const now = Date.now();
    const windowToMs = now + horizonHours * 60 * 60 * 1000;

    const [events, headlines] = await Promise.all([
      fetchEventsInWindow({ currencies, fromMs: now, toMs: windowToMs }),
      fetchHeadlinesForCurrencies({ currencies, symbol }),
    ]);

    const sentiment = bucketSentiment(headlines);
    const pipelinePending = events.length === 0 && headlines.length === 0;

    return {
      symbol,
      windowFromMs: now,
      windowToMs,
      currencies: currencies as readonly string[] as string[],
      events,
      headlines,
      sentiment,
      summary: deterministicSummary({
        symbol,
        currencies,
        windowFromMs: now,
        windowToMs,
        events,
        headlines,
        sentiment,
        pipelinePending,
      }),
      pipelinePending,
    };
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

interface EventQuery {
  currencies: EventCurrency[];
  fromMs: number;
  toMs: number;
}

async function fetchEventsInWindow(args: EventQuery): Promise<EconomicEvent[]> {
  const rows = await getDb()
    .select()
    .from(schema.economicEvents)
    .where(
      and(
        inArray(schema.economicEvents.currency, args.currencies as string[]),
        gte(schema.economicEvents.date, new Date(args.fromMs)),
        lte(schema.economicEvents.date, new Date(args.toMs)),
        inArray(schema.economicEvents.importance, ['medium', 'high']),
      ),
    )
    .orderBy(schema.economicEvents.date);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    country: r.country,
    currency: (r.currency as EventCurrency | null) ?? null,
    importance: r.importance as Importance,
    date: r.date.getTime(),
    actual: r.actual,
    forecast: r.forecast,
    previous: r.previous,
    unit: r.unit,
    source: r.source,
  }));
}

interface HeadlineQuery {
  currencies: EventCurrency[];
  symbol: Symbol;
}

async function fetchHeadlinesForCurrencies(args: HeadlineQuery): Promise<ToolNewsItem[]> {
  // We want the latest N items where the article is tagged with any of:
  // the symbol itself OR any of the currencies. We use a single overlap
  // check via pg's `&&` array operator.
  const tags = [args.symbol, ...args.currencies] as SymbolOrCurrencyTag[];
  const limit = NEWS_PER_CURRENCY * args.currencies.length + NEWS_PER_CURRENCY;

  const rows = await getDb()
    .select()
    .from(schema.newsArticles)
    .where(sql`${schema.newsArticles.symbols} && ARRAY[${sql.join(tags.map((t) => sql`${t}`), sql`, `)}]::text[]`)
    .orderBy(desc(schema.newsArticles.publishedAt))
    .limit(limit);

  // Dedupe by id (already unique in schema, but we splice multiple sets).
  const seen = new Set<string>();
  const out: ToolNewsItem[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      title: r.title,
      summary: r.summary,
      url: r.url,
      source: r.source,
      publisher: r.publisher,
      publishedAt: r.publishedAt.getTime(),
      sentiment: (r.sentiment as NewsSentiment | null) ?? null,
      sentimentScore: r.sentimentScore,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

function bucketSentiment(headlines: ToolNewsItem[]): {
  positive: number;
  negative: number;
  neutral: number;
} {
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  for (const h of headlines) {
    if (h.sentiment === 'positive') positive += 1;
    else if (h.sentiment === 'negative') negative += 1;
    else neutral += 1;
  }
  return { positive, negative, neutral };
}

function deterministicSummary(args: {
  symbol: Symbol;
  currencies: EventCurrency[];
  windowFromMs: number;
  windowToMs: number;
  events: EconomicEvent[];
  headlines: ToolNewsItem[];
  sentiment: { positive: number; negative: number; neutral: number };
  pipelinePending: boolean;
}): string {
  if (args.pipelinePending) {
    return 'No events or news found in the database. Calendar/news pipelines may not have ingested yet.';
  }

  const fromIso = new Date(args.windowFromMs).toISOString().slice(0, 16).replace('T', ' ');
  const toIso = new Date(args.windowToMs).toISOString().slice(0, 16).replace('T', ' ');
  const eventCount = args.events.length;
  const high = args.events.filter((e) => e.importance === 'high').length;
  const total = args.headlines.length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

  const eventClause =
    eventCount > 0
      ? `${eventCount} ${args.currencies.join('/')} event${eventCount === 1 ? '' : 's'}${high > 0 ? ` (${high} high-impact)` : ''}`
      : `no scheduled ${args.currencies.join('/')} events`;
  const sentimentClause =
    total > 0
      ? `${total} headline${total === 1 ? '' : 's'} skewing ${pct(args.sentiment.positive)}% pos / ${pct(args.sentiment.negative)}% neg / ${pct(args.sentiment.neutral)}% neutral`
      : 'no recent headlines on file';

  return `${args.symbol} window ${fromIso}Z → ${toIso}Z: ${eventClause}; ${sentimentClause}.`;
}
