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
import { and, eq } from 'drizzle-orm';

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