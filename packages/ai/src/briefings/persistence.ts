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

// Briefings persistence — locate or create the dedicated `Briefings_Thread`
// + idempotency helpers for `briefings_emitted`.
//
// We keep ONE Briefings_Thread for life: the cron handlers always reuse it,
// and the chat sidebar pins it to the top via the `is_briefings` column.
//
// Phase A: added userId parameter. Briefings are still system-scoped (single
// user), but the schema now requires user_id. Pass a constant system user ID
// until Phase D implements per-user briefings.

import { getDb, schema } from '@hamafx/db';
import { and, desc, eq } from 'drizzle-orm';

import { type DbThread } from '../persistence';



/**
 * Returns the singleton `Briefings_Thread`, creating one if absent. Cron
 * handlers call this once per invocation; on a fresh DB it inserts the
 * first row, on subsequent invocations it returns the same row.
 *
 * Phase 1 hardening §9 — the create + promote pair runs in one
 * transaction so a crash between the INSERT and the
 * `set({ isBriefings: true, ... })` UPDATE can't leave a sibling thread
 * row orphaned (which would silently break the sidebar pin).
 */
export async function getOrCreateBriefingsThread(userId: string): Promise<DbThread> {
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.chatThreads)
    .where(and(eq(schema.chatThreads.isBriefings, true), eq(schema.chatThreads.userId, userId)))
    .limit(1);

  const found = existing[0];
  if (found) {
    return {
      id: found.id,
      title: found.title,
      titleSource:
        found.titleSource === 'llm' || found.titleSource === 'fallback'
          ? found.titleSource
          : null,
      pinnedSymbol: found.pinnedSymbol as DbThread['pinnedSymbol'],
      modelOverride: found.modelOverride,
      createdAt: found.createdAt.getTime(),
      updatedAt: found.updatedAt.getTime(),
    };
  }

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.chatThreads)
      .values({
        userId,
        title: 'Briefings',
        titleSource: 'llm',
        isBriefings: true,
        pinnedSymbol: null,
        modelOverride: null,
      })
      .returning();
    const row = inserted[0]!;
    return {
      id: row.id,
      title: row.title,
      titleSource:
        row.titleSource === 'llm' || row.titleSource === 'fallback' ? row.titleSource : 'llm',
      pinnedSymbol: row.pinnedSymbol as DbThread['pinnedSymbol'],
      modelOverride: row.modelOverride,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  });
}

/** True when a briefing of `(eventId, kind)` has already been emitted. */
export async function wasEmitted(
  userId: string,
  eventId: string,
  kind: 'pre' | 'post' | 'weekly_review',
): Promise<boolean> {
  const rows = await getDb()
    .select({ k: schema.briefingsEmitted.kind })
    .from(schema.briefingsEmitted)
    .where(
      and(
        eq(schema.briefingsEmitted.userId, userId),
        eq(schema.briefingsEmitted.eventId, eventId),
        eq(schema.briefingsEmitted.kind, kind),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Record that a briefing has been emitted, linking back to the message row
 * that carries the body. The (userId, eventId, kind) primary key gives us
 * idempotency for free at the DB layer — a parallel emit will throw, which
 * we catch upstream and treat as "already emitted by another runner".
 */
export async function recordEmitted(
  userId: string,
  eventId: string,
  kind: 'pre' | 'post' | 'weekly_review',
  messageId: string,
): Promise<void> {
  await getDb()
    .insert(schema.briefingsEmitted)
    .values({ userId, eventId, kind, messageId })
    .onConflictDoNothing({
      target: [
        schema.briefingsEmitted.userId,
        schema.briefingsEmitted.eventId,
        schema.briefingsEmitted.kind,
      ],
    });
}


// ---------------------------------------------------------------------------
// Cron-handler queries
// ---------------------------------------------------------------------------

/**
 * Look up high-impact economic events whose `date` falls inside `[fromMs, toMs]`.
 * Used by /api/cron/briefings for both the pre-event window (now+30m ± 2m)
 * and the post-event window (now-30m ± 2m). Set `requireActual` to filter
 * to events whose `actual` column is non-null (post-event).
 */
export async function findHighImpactEventsInWindow(args: {
  fromMs: number;
  toMs: number;
  requireActual?: boolean;
}): Promise<{ id: string }[]> {
  const { eq: deq, and: dand, gte: dgte, lte: dlte, isNotNull: disNotNull } = await import('drizzle-orm');
  const filters = [
    dgte(schema.economicEvents.date, new Date(args.fromMs)),
    dlte(schema.economicEvents.date, new Date(args.toMs)),
    deq(schema.economicEvents.importance, 'high'),
  ];
  if (args.requireActual) {
    filters.push(disNotNull(schema.economicEvents.actual));
  }
  const rows = await getDb()
    .select({ id: schema.economicEvents.id })
    .from(schema.economicEvents)
    .where(dand(...filters));
  return rows;
}

// ---------------------------------------------------------------------------
// Dashboard surface — Phase 1.7
//
// `getLatestBriefing(userId)` returns the most recent briefing assistant
// message (a `briefing` typed part) from the user's `Briefings_Thread`,
// formatted for the dashboard widget. Returns `null` when the user has no
// briefings thread or no briefing messages yet — the dashboard widget then
// falls back to an empty-state.
//
// We deliberately use a dedicated read path (single SELECT + a JSON parse
// loop) instead of `listMessages` because:
//   1. `listMessages` does an extra `getThread` call (IDOR guard) and
//      hydrates ALL parts — we only need the parts of the most recent
//      message that has a `briefing` part.
//   2. Briefing messages are append-only; we can safely order by
//      `created_at DESC` and stop at the first match.
// ---------------------------------------------------------------------------

/** Shape returned by `getLatestBriefing` for the dashboard widget. */
export interface LatestBriefing {
  /** UUID of the chat_messages row carrying the briefing. */
  messageId: string;
  /** Thread id the briefing lives in (the user's Briefings_Thread). */
  threadId: string;
  /** ms epoch UTC. */
  createdAt: number;
  /** Markdown body of the briefing (the `text` part). */
  body: string;
  /** Resolved kind — one of the documented `BriefingKind` values. */
  kind: 'pre' | 'post' | 'weekly_review';
  /** Related event id, if any. `weekly_review` always has `null`. */
  eventId: string | null;
  /** Optional short summary attached to the briefing part. */
  summary: string;
  /**
   * Symbol context the briefing is tagged with, derived from the
   * related event's currency (EUR→EURUSD, GBP→GBPUSD, else XAUUSD).
   * Always populated for `pre`/`post`; null for `weekly_review`.
   */
  symbol: import('@hamafx/shared').Symbol | null;
  /** Related event title (resolved lazily from `economic_events`). */
  eventTitle: string | null;
  /** Related event date (ms epoch UTC), if any. */
  eventDate: number | null;
}

/**
 * Fetch the most recent briefing for the user, or `null` when none exist.
 *
 * Implementation notes:
 *   - We hit `chat_messages` ordered DESC and pick the first row whose
 *     `parts` JSON contains an object with `type === 'briefing'`.
 *   - We also resolve the related event (if any) so the widget can render
 *     the source link without a second client-side fetch.
 *   - The function is `userId`-scoped by walking through the
 *     `Briefings_Thread` first — there's exactly one per user.
 */
export async function getLatestBriefing(userId: string): Promise<LatestBriefing | null> {
  // 1. Locate the user's briefings thread.
  let thread: Awaited<ReturnType<typeof getOrCreateBriefingsThread>> | null = null;
  try {
    thread = await getOrCreateBriefingsThread(userId);
  } catch {
    return null;
  }
  if (!thread) return null;

  // 2. Fetch the most recent 50 assistant messages on that thread. 50 is a
  //    generous ceiling — cron emits at most a handful per day, and we
  //    only need the latest.
  const rows = await getDb()
    .select({
      id: schema.chatMessages.id,
      threadId: schema.chatMessages.threadId,
      parts: schema.chatMessages.parts,
      content: schema.chatMessages.content,
      createdAt: schema.chatMessages.createdAt,
    })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.threadId, thread.id))
    .orderBy(desc(schema.chatMessages.createdAt))
    .limit(50);

  // 3. Find the most recent message whose `parts` contains a briefing
  //    marker. Defensive — `parts` may be null or a malformed JSON array.
  for (const row of rows) {
    const parts = row.parts;
    if (!Array.isArray(parts)) continue;
    const bp = parts.find(
      (p): p is { type: string; eventId: string | null; kind: 'pre' | 'post' | 'weekly_review'; summary: string } =>
        p !== null &&
        typeof p === 'object' &&
        (p as { type?: string }).type === 'briefing',
    );
    if (!bp) continue;
    // The text part always lives at index 0 alongside the briefing marker.
    const textPart = parts.find(
      (p): p is { type: 'text'; text: string } =>
        p !== null && typeof p === 'object' && (p as { type?: string }).type === 'text',
    );

    // Resolve related event for pre/post briefings.
    let eventTitle: string | null = null;
    let eventDate: number | null = null;
    let symbol: import('@hamafx/shared').Symbol | null = null;
    if (bp.eventId) {
      try {
        const evRows = await getDb()
          .select({
            title: schema.economicEvents.title,
            date: schema.economicEvents.date,
            currency: schema.economicEvents.currency,
          })
          .from(schema.economicEvents)
          .where(eq(schema.economicEvents.id, bp.eventId))
          .limit(1);
        const ev = evRows[0];
        if (ev) {
          eventTitle = ev.title;
          eventDate = ev.date.getTime();
          if (ev.currency === 'EUR') symbol = 'EURUSD';
          else if (ev.currency === 'GBP') symbol = 'GBPUSD';
          else if (ev.currency === 'USD') symbol = 'XAUUSD';
        }
      } catch {
        // Event resolution is best-effort — nulls are fine for the widget.
      }
    }

    return {
      messageId: row.id,
      threadId: row.threadId,
      createdAt: row.createdAt.getTime(),
      body: textPart?.text ?? row.content ?? bp.summary ?? '',
      kind: bp.kind,
      eventId: bp.eventId,
      summary: bp.summary,
      symbol,
      eventTitle,
      eventDate,
    };
  }

  return null;
}