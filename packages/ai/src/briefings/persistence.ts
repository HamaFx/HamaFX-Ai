// Briefings persistence — locate or create the dedicated `Briefings_Thread`
// + idempotency helpers for `briefings_emitted`.
//
// We keep ONE Briefings_Thread for life: the cron handlers always reuse it,
// and the chat sidebar pins it to the top via the `is_briefings` column.

import { getDb, schema } from '@hamafx/db';
import { and, eq } from 'drizzle-orm';

import { createThread, type DbThread } from '../persistence';

/**
 * Returns the singleton `Briefings_Thread`, creating one if absent. Cron
 * handlers call this once per invocation; on a fresh DB it inserts the
 * first row, on subsequent invocations it returns the same row.
 */
export async function getOrCreateBriefingsThread(): Promise<DbThread> {
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.chatThreads)
    .where(eq(schema.chatThreads.isBriefings, true))
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

  const fresh = await createThread();
  // Promote the just-created row to the briefings thread. We patch
  // `title` + `title_source` so the sidebar shows a stable badge instead
  // of the auto-title path picking it up later.
  await db
    .update(schema.chatThreads)
    .set({ isBriefings: true, title: 'Briefings', titleSource: 'llm' })
    .where(eq(schema.chatThreads.id, fresh.id));

  return { ...fresh, title: 'Briefings', titleSource: 'llm' };
}

/** True when a briefing of `(eventId, kind)` has already been emitted. */
export async function wasEmitted(
  eventId: string,
  kind: 'pre' | 'post' | 'weekly_review',
): Promise<boolean> {
  const rows = await getDb()
    .select({ k: schema.briefingsEmitted.kind })
    .from(schema.briefingsEmitted)
    .where(
      and(
        eq(schema.briefingsEmitted.eventId, eventId),
        eq(schema.briefingsEmitted.kind, kind),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Record that a briefing has been emitted, linking back to the message row
 * that carries the body. The (eventId, kind) primary key gives us idempotency
 * for free at the DB layer — a parallel emit will throw, which we catch
 * upstream and treat as "already emitted by another runner".
 */
export async function recordEmitted(
  eventId: string,
  kind: 'pre' | 'post' | 'weekly_review',
  messageId: string,
): Promise<void> {
  await getDb()
    .insert(schema.briefingsEmitted)
    .values({ eventId, kind, messageId })
    .onConflictDoNothing({ target: [schema.briefingsEmitted.eventId, schema.briefingsEmitted.kind] });
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
