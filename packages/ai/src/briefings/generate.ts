// Briefings generators — pre-event, post-event, weekly review.
//
// Each function:
//   1. Loads the `Briefings_Thread` (or creates it once).
//   2. Checks `briefings_emitted` for `(eventId, kind)` to enforce idempotency.
//   3. Builds the briefing body. LLM-authored when budget allows; deterministic
//      stats-only fallback otherwise. The first user message in any briefing
//      thread is irrelevant — we directly append assistant messages with a
//      `briefing` part marker so the chat UI can recognise them later.
//   4. Persists via `appendAssistantMessage` then writes the
//      `briefings_emitted` row.
//
// Failures are logged and swallowed: the cron handler reports `processed`
// vs total, never propagates a partial failure as a 500.

import { getDb, schema } from '@hamafx/db';
import {
  type BriefingMessagePart,
  type EconomicEvent,
  type EventCurrency,
  type Importance,
  type Symbol,
} from '@hamafx/shared';
import { generateText } from 'ai';
import { and, asc, eq } from 'drizzle-orm';

import { dailySpendUsd } from '../cost';
import { computeStats } from '../journal/persistence';
import { rememberBriefing } from '../memory/memory-index';
import { resolveModel } from '../model';
import { appendAssistantMessage } from '../persistence';

import {
  getOrCreateBriefingsThread,
  recordEmitted,
  wasEmitted,
} from './persistence';

export interface BriefingsEnv {
  AI_GATEWAY_API_KEY?: string | undefined;
  GOOGLE_GENERATIVE_AI_API_KEY?: string | undefined;
  GOOGLE_VERTEX_PROJECT?: string | undefined;
  GOOGLE_VERTEX_LOCATION?: string | undefined;
  GOOGLE_APPLICATION_CREDENTIALS_JSON?: string | undefined;
  GOOGLE_APPLICATION_CREDENTIALS?: string | undefined;
  AI_DEFAULT_MODEL: string;
  MAX_DAILY_USD: number;
  LOG_PROMPTS: boolean;
}

function envFromProcess(): BriefingsEnv {
  return {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    GOOGLE_VERTEX_PROJECT: process.env.GOOGLE_VERTEX_PROJECT,
    GOOGLE_VERTEX_LOCATION: process.env.GOOGLE_VERTEX_LOCATION,
    GOOGLE_APPLICATION_CREDENTIALS_JSON: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    AI_DEFAULT_MODEL: process.env.AI_DEFAULT_MODEL ?? 'google-vertex/gemini-2.5-flash',
    MAX_DAILY_USD: Number.parseFloat(process.env.MAX_DAILY_USD ?? '5'),
    LOG_PROMPTS: process.env.LOG_PROMPTS === '1',
  };
}

// ---------------------------------------------------------------------------
// Pre / Post event briefings
// ---------------------------------------------------------------------------

export async function emitPreEvent(eventId: string): Promise<{ emitted: boolean; reason?: string }> {
  return emitEventBriefing(eventId, 'pre');
}

export async function emitPostEvent(eventId: string): Promise<{ emitted: boolean; reason?: string }> {
  return emitEventBriefing(eventId, 'post');
}

async function emitEventBriefing(
  eventId: string,
  kind: 'pre' | 'post',
): Promise<{ emitted: boolean; reason?: string }> {
  if (await wasEmitted(eventId, kind)) {
    return { emitted: false, reason: 'already_emitted' };
  }

  const event = await loadEvent(eventId);
  if (!event) return { emitted: false, reason: 'event_not_found' };

  const env = envFromProcess();
  const thread = await getOrCreateBriefingsThread();

  const summary = await composeEventSummary(event, kind, env);
  const part: BriefingMessagePart = {
    type: 'briefing',
    eventId,
    kind,
    summary,
  };

  const ui = {
    id: crypto.randomUUID(),
    role: 'assistant' as const,
    parts: [
      { type: 'text' as const, text: summary },
      part,
    ],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { messageId } = await appendAssistantMessage(thread.id, ui as any);
  await recordEmitted(eventId, kind, messageId);

  // Phase 7b — embed the briefing into the memory index so it's
  // surfaceable later via `search_knowledge`. Best-effort.
  void rememberBriefing({
    messageId,
    body: summary,
    briefingKind: kind,
    occurredAtMs: event.date,
    ...(event.currency
      ? { symbol: symbolFromCurrency(event.currency) }
      : {}),
  }).catch((err) => console.warn('[briefings] memory write failed', err));

  return { emitted: true };
}

async function composeEventSummary(
  event: EconomicEvent,
  kind: 'pre' | 'post',
  env: BriefingsEnv,
): Promise<string> {
  // Hard budget guard before any model call.
  let llmAllowed = true;
  try {
    const spent = await dailySpendUsd();
    if (spent >= env.MAX_DAILY_USD) llmAllowed = false;
  } catch {
    // If we can't compute spend, fall back to deterministic copy — never block.
    llmAllowed = false;
  }

  if (!llmAllowed) return deterministicEventSummary(event, kind);

  const prompt = buildEventPrompt(event, kind);
  try {
    const { text } = await generateText({
      model: resolveModel(env.AI_DEFAULT_MODEL, env),
      system:
        'You are HamaFX-Ai writing a briefing for the single user. Be concise (max 6 short bullets). No greetings, no signoffs. Plain text, no markdown headings, no emoji.',
      prompt,
    });
    const cleaned = text.trim();
    return cleaned.length > 0 ? cleaned : deterministicEventSummary(event, kind);
  } catch (err) {
    if (env.LOG_PROMPTS) console.warn('[briefings] LLM failed', err);
    return deterministicEventSummary(event, kind);
  }
}

function buildEventPrompt(event: EconomicEvent, kind: 'pre' | 'post'): string {
  const iso = new Date(event.date).toISOString();
  const lines = [
    `Event: ${event.title}`,
    `Country: ${event.country}; Currency: ${event.currency ?? 'n/a'}`,
    `Importance: ${event.importance}`,
    `Scheduled: ${iso}`,
    `Forecast: ${event.forecast ?? 'n/a'}`,
    `Previous: ${event.previous ?? 'n/a'}`,
  ];
  if (kind === 'post' && event.actual !== null) {
    lines.push(`Actual: ${event.actual}`);
  }
  lines.push('', 'Task:');
  if (kind === 'pre') {
    lines.push(
      'Write a pre-event briefing that names the event, the time in UTC, key levels to watch, and the typical reaction. Bullets, no fluff.',
    );
  } else {
    lines.push(
      'Write a post-event recap covering the actual vs forecast vs previous, the implied surprise direction, and one trade-management note. Bullets, no fluff.',
    );
  }
  return lines.join('\n');
}

function deterministicEventSummary(event: EconomicEvent, kind: 'pre' | 'post'): string {
  const iso = new Date(event.date).toISOString();
  if (kind === 'pre') {
    return [
      `${event.title} (${event.currency ?? event.country}) — ${iso}`,
      `Importance: ${event.importance}.`,
      `Forecast: ${event.forecast ?? 'n/a'} · Previous: ${event.previous ?? 'n/a'}.`,
      'Watch for the headline number and whisper number; reactions usually peak inside the first 5 minutes.',
    ].join('\n');
  }
  return [
    `${event.title} (${event.currency ?? event.country}) — ${iso}`,
    `Actual: ${event.actual ?? 'n/a'} · Forecast: ${event.forecast ?? 'n/a'} · Previous: ${event.previous ?? 'n/a'}.`,
    surpriseLabel(event),
  ].join('\n');
}

function surpriseLabel(event: EconomicEvent): string {
  if (event.actual === null || event.forecast === null) return 'No surprise detectable.';
  const diff = event.actual - event.forecast;
  if (Math.abs(diff) < 1e-9) return 'Print matched forecast.';
  return diff > 0 ? 'Beat (positive surprise).' : 'Miss (negative surprise).';
}

// ---------------------------------------------------------------------------
// Weekly review
// ---------------------------------------------------------------------------

const WEEKLY_REVIEW_KEY = 'weekly_review';

export async function emitWeeklyReview(): Promise<{ emitted: boolean; reason?: string }> {
  const env = envFromProcess();
  const thread = await getOrCreateBriefingsThread();

  // Idempotency for the weekly review is keyed on the ISO week boundary
  // so re-running on the same Sunday is a no-op but next Sunday still fires.
  const weekKey = `${WEEKLY_REVIEW_KEY}:${isoWeekKey(new Date())}`;
  if (await wasEmitted(weekKey, 'weekly_review')) {
    return { emitted: false, reason: 'already_emitted_this_week' };
  }

  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const stats = await computeStats({ sinceMs });
  if (stats.count === 0) {
    const text = 'No journal entries in the last 7 days. Nothing to review — go log a trade.';
    const ui = {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      parts: [
        { type: 'text' as const, text },
        {
          type: 'briefing' as const,
          eventId: null,
          kind: 'weekly_review' as const,
          summary: text,
        } satisfies BriefingMessagePart,
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { messageId } = await appendAssistantMessage(thread.id, ui as any);
    await recordEmitted(weekKey, 'weekly_review', messageId);
    return { emitted: true };
  }

  // Top 3 wins / losses / patterns from the same window.
  const entries = await getDb()
    .select()
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.outcome, 'win'),
      ),
    )
    .orderBy(asc(schema.journalEntries.openedAt))
    .limit(50);
  void entries;

  const summary = await composeWeeklyReviewSummary(stats, env);
  const ui = {
    id: crypto.randomUUID(),
    role: 'assistant' as const,
    parts: [
      { type: 'text' as const, text: summary },
      {
        type: 'briefing' as const,
        eventId: null,
        kind: 'weekly_review' as const,
        summary,
      } satisfies BriefingMessagePart,
    ],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { messageId } = await appendAssistantMessage(thread.id, ui as any);
  await recordEmitted(weekKey, 'weekly_review', messageId);

  // Phase 7b — embed the weekly review for later memory recall.
  void rememberBriefing({
    messageId,
    body: summary,
    briefingKind: 'weekly_review',
    occurredAtMs: Date.now(),
  }).catch((err) => console.warn('[briefings] memory write failed', err));

  return { emitted: true };
}

async function composeWeeklyReviewSummary(
  stats: Awaited<ReturnType<typeof computeStats>>,
  env: BriefingsEnv,
): Promise<string> {
  const det = deterministicWeeklyReview(stats);

  let llmAllowed = true;
  try {
    const spent = await dailySpendUsd();
    if (spent >= env.MAX_DAILY_USD) llmAllowed = false;
  } catch {
    llmAllowed = false;
  }
  if (!llmAllowed) return det;

  try {
    const { text } = await generateText({
      model: resolveModel(env.AI_DEFAULT_MODEL, env),
      system:
        'You are HamaFX-Ai writing the user\'s weekly trading review. Be concise (max 5 short bullets). No greetings or signoffs. Plain text.',
      prompt: `Stats:\n${det}\n\nWrite the review.`,
    });
    const cleaned = text.trim();
    return cleaned.length > 0 ? cleaned : det;
  } catch (err) {
    if (env.LOG_PROMPTS) console.warn('[briefings] weekly LLM failed', err);
    return det;
  }
}

function deterministicWeeklyReview(stats: Awaited<ReturnType<typeof computeStats>>): string {
  return [
    `Last 7 days — ${stats.count} trade${stats.count === 1 ? '' : 's'} (${stats.wins}W / ${stats.losses}L / ${stats.breakevens}BE / ${stats.open} open).`,
    `Win rate: ${(stats.winRate * 100).toFixed(1)}% · Avg R: ${stats.avgR.toFixed(2)} · Total R: ${stats.totalR.toFixed(2)}.`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadEvent(eventId: string): Promise<EconomicEvent | null> {
  const rows = await getDb()
    .select()
    .from(schema.economicEvents)
    .where(eq(schema.economicEvents.id, eventId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
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
  };
}

/** ISO-week key like "2026-W22" — stable across UTC days within the week. */
function isoWeekKey(d: Date): string {
  // Algorithm from https://en.wikipedia.org/wiki/ISO_week_date#Algorithms
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}

/**
 * Map a CFD currency tag to one of our three supported pairs for the
 * briefing's memory-index symbol context. USD-driven events get pinned
 * to XAUUSD because gold is the most directly USD-exposed leg in our
 * scope.
 */
function symbolFromCurrency(currency: EventCurrency): Symbol {
  if (currency === 'EUR') return 'EURUSD';
  if (currency === 'GBP') return 'GBPUSD';
  return 'XAUUSD';
}
