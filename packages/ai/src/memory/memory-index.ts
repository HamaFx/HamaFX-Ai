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

// Phase 7b — unified memory index over journal entries, briefings, and
// thread synopses produced by `summarize_thread`. `news_embeddings`
// remains the dedicated index for news (its tighter schema buys cheaper
// reads on the noisier corpus); `memory_embeddings` covers everything
// else.
//
// Public surface:
//   - rememberJournalEntry({ entryId })          — call after createEntry/updateEntry
//   - rememberBriefing({ messageId, body })       — call from briefings/generate.ts
//   - rememberThreadSynopsis({ threadId, synopsis }) — called by summarize_thread
//   - searchMemory({ embedding, kinds, ... })     — used by search_knowledge
//
// Each `remember*` is best-effort and idempotent — on duplicate sourceId
// we delete-then-insert so the embedding always reflects the latest body.
// All paths are guarded by the daily AI budget so a runaway agent loop
// can't burn embedding spend in a side-effect.

import { getDb, schema } from '@hamafx/db';
import type { ServerEnv, Symbol, ThreadInsight } from '@hamafx/shared';
import type { UserSettingsRow } from '@hamafx/db/schema';
import { desc, eq, gte, sql } from 'drizzle-orm';

import { dailySpendUsd } from '../cost';
import { embedTexts, vectorLiteral } from '../embeddings';

export type MemoryKind = 'journal' | 'briefing' | 'thread_synopsis';

export interface MemoryRow {
  id: string;
  kind: MemoryKind;
  sourceId: string;
  symbol: Symbol | null;
  text: string;
  model: string;
  meta: unknown;
  similarity: number;
  occurredAtMs: number;
}

type EmbedEnv = Pick<
  ServerEnv,
  'AI_GATEWAY_API_KEY' | 'GOOGLE_GENERATIVE_AI_API_KEY' | 'AI_EMBEDDING_MODEL' | 'MAX_DAILY_USD'
>;

/** Phase D2 — user-pickable embedding model slice. */
type EmbedUserSettings = Pick<UserSettingsRow, 'aiApiKeys' | 'embeddingModel'>;

/**
 * Embed `text` and upsert into `memory_embeddings`. Skips silently when
 * the daily AI budget is exhausted. Idempotent on (kind, sourceId).
 */
async function upsertMemory(args: {
  kind: MemoryKind;
  sourceId: string;
  symbol: Symbol | null;
  text: string;
  meta: unknown;
  occurredAt: Date;
  /** Phase A — the owning user. Optional; falls back to tool context or system. */
  userId?: string;
  env?: Partial<EmbedEnv>;
  /**
   * Phase D2 — user's embedding model pick. When supplied, takes
   * precedence over env.AI_EMBEDDING_MODEL.
   */
  userSettings?: EmbedUserSettings;
}): Promise<{ stored: boolean; reason?: string }> {
  const text = args.text.trim();
  if (text.length === 0) return { stored: false, reason: 'empty' };

  const env = args.env ?? {};
  if (env.MAX_DAILY_USD !== undefined) {
    try {
      const spent = await dailySpendUsd(args.userId ?? '__system__');
      if (spent >= env.MAX_DAILY_USD) return { stored: false, reason: 'budget' };
    } catch {
      // proceed — budget probe failed; the chat-level guardrail still applies.
    }
  }

  let embedding: number[];
  let model: string;
  try {
    const result = await embedTexts({
      texts: [text],
      ...(args.userSettings ? { userSettings: args.userSettings } : {}),
      ...(env.AI_EMBEDDING_MODEL ? { env: { AI_EMBEDDING_MODEL: env.AI_EMBEDDING_MODEL } } : {}),
    });
    const e = result.embeddings[0];
    if (!e) return { stored: false, reason: 'no_embedding' };
    embedding = e;
    model = result.model;
  } catch {
    return { stored: false, reason: 'embed_failed' };
  }

  const db = getDb();
  // Atomic upsert (Phase 1 hardening §8). The previous DELETE + INSERT
  // pair left rows missing forever if the process crashed between the
  // two statements, and concurrent re-embeddings of the same source
  // could collide on the unique constraint. The single `ON CONFLICT`
  // statement keeps the insert and the body refresh in one transaction
  // and matches the (kind, source_id) unique key added in 0006.
  await db
    .insert(schema.memoryEmbeddings)
    .values({
      userId: args.userId ?? '__system__',
      kind: args.kind,
      sourceId: args.sourceId,
      symbol: args.symbol,
      text,
      model,
      embedding,
      meta: args.meta as never,
      occurredAt: args.occurredAt,
    })
    .onConflictDoUpdate({
      target: [schema.memoryEmbeddings.kind, schema.memoryEmbeddings.sourceId],
      set: {
        symbol: args.symbol,
        text,
        model,
        embedding,
        meta: args.meta as never,
        occurredAt: args.occurredAt,
        userId: args.userId ?? '__system__',
        // createdAt stays at the original insert time — pgvector cosine
        // results don't depend on it, and consumers prefer the original
        // ingestion timestamp for audit trails.
      },
    });

  return { stored: true };
}

// ---------------------------------------------------------------------------
// public remember*() helpers
// ---------------------------------------------------------------------------

export interface RememberJournalArgs {
  entryId: string;
  env?: Partial<EmbedEnv>;
  /** Phase D2 — user's embedding pick. */
  userSettings?: EmbedUserSettings;
}

/**
 * Embed a journal entry from the live row. Composes `notes` + side/symbol
 * context so the search can hit on either lexical or semantic prompts.
 */
export async function rememberJournalEntry(
  args: RememberJournalArgs,
): Promise<{ stored: boolean; reason?: string }> {
  const rows = await getDb()
    .select()
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.id, args.entryId))
    .limit(1);
  const row = rows[0];
  if (!row) return { stored: false, reason: 'not_found' };

  const text = composeJournalText(row);
  return upsertMemory({
    kind: 'journal',
    sourceId: row.id,
    symbol: row.symbol as Symbol,
    text,
    meta: {
      side: row.side,
      outcome: row.outcome,
      rMultiple: row.rMultiple,
      tags: row.tags,
    },
    occurredAt: row.openedAt,
    ...(row.userId ? { userId: row.userId } : {}),
    ...(args.env ? { env: args.env } : {}),
    ...(args.userSettings ? { userSettings: args.userSettings } : {}),
  });
}

function composeJournalText(row: typeof schema.journalEntries.$inferSelect): string {
  const lines = [
    `${row.side === 'long' ? 'Long' : 'Short'} ${row.symbol} @ ${row.entry}`,
    row.stop !== null ? `stop ${row.stop}` : null,
    row.target !== null ? `target ${row.target}` : null,
    row.exit !== null ? `exit ${row.exit}` : null,
    row.outcome !== 'open' ? `outcome ${row.outcome}` : null,
    row.rMultiple !== null ? `R ${row.rMultiple.toFixed(2)}` : null,
    Array.isArray(row.tags) && row.tags.length > 0 ? `tags ${row.tags.join(', ')}` : null,
    row.notes ?? null,
  ].filter((s): s is string => s !== null);
  return lines.join(' · ');
}

export interface RememberBriefingArgs {
  messageId: string;
  body: string;
  /** Optional symbol scope. */
  symbol?: Symbol | null;
  /** Briefing kind ('pre' | 'post' | 'weekly_review'). */
  briefingKind: string;
  occurredAtMs?: number;
  env?: Partial<EmbedEnv>;
}

export async function rememberBriefing(
  args: RememberBriefingArgs,
): Promise<{ stored: boolean; reason?: string }> {
  return upsertMemory({
    kind: 'briefing',
    sourceId: args.messageId,
    symbol: args.symbol ?? null,
    text: args.body,
    meta: { briefingKind: args.briefingKind },
    occurredAt: new Date(args.occurredAtMs ?? Date.now()),
    ...(args.env ? { env: args.env } : {}),
  });
}

export interface RememberThreadSynopsisArgs {
  threadId: string;
  synopsis: string;
  insights: ThreadInsight[];
  env?: Partial<EmbedEnv>;
  /** Phase D2 — user's embedding pick. */
  userSettings?: EmbedUserSettings;
}

export async function rememberThreadSynopsis(
  args: RememberThreadSynopsisArgs,
): Promise<{ stored: boolean; reason?: string }> {
  const insightLines = args.insights.map(
    (i) => `→ ${i.text}${i.symbol ? ` (${i.symbol})` : ''}`,
  );
  const text = [args.synopsis, ...insightLines].join('\n').trim();
  return upsertMemory({
    kind: 'thread_synopsis',
    sourceId: args.threadId,
    symbol: null,
    text,
    meta: { insights: args.insights },
    occurredAt: new Date(),
    ...(args.env ? { env: args.env } : {}),
    ...(args.userSettings ? { userSettings: args.userSettings } : {}),
  });
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

export interface SearchMemoryArgs {
  embedding: number[];
  limit: number;
  kinds?: MemoryKind[];
  symbol?: Symbol;
  /** ms epoch lower bound on occurredAt. */
  since?: number;
  /** Phase A — multi-tenant scope. Required unless explicitly skipping. */
  userId: string;
}

/**
 * Cosine-similarity search over `memory_embeddings`. Returns rows with
 * similarity in [0, 1]. Caller is responsible for any time-decay
 * post-processing.
 */
export async function searchMemory(args: SearchMemoryArgs): Promise<MemoryRow[]> {
  const { embedding, limit, kinds, symbol, since } = args;
  const vec = vectorLiteral(embedding);

  // Build dynamic WHERE clauses while keeping drizzle's parametrisation.
  const kindClause =
    kinds && kinds.length > 0
      ? sql`AND kind IN (${sql.join(
          kinds.map((k) => sql`${k}`),
          sql`, `,
        )})`
      : sql``;
  const symbolClause = symbol ? sql`AND symbol = ${symbol}` : sql``;
  const sinceClause =
    since !== undefined ? sql`AND occurred_at >= ${new Date(since)}` : sql``;
  const userClause = sql`AND user_id = ${args.userId}`;

  const result = await getDb().execute(sql`
    SELECT
      id,
      kind,
      source_id AS "sourceId",
      symbol,
      text,
      model,
      meta,
      occurred_at AS "occurredAt",
      1 - (embedding <=> ${vec}::vector) AS similarity
    FROM memory_embeddings
    WHERE 1 = 1
      ${kindClause}
      ${symbolClause}
      ${sinceClause}
      ${userClause}
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${limit}
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (result as any).rows ?? (result as unknown as MemoryRow[]);
  return (rows as Array<MemoryRow & { occurredAt: Date | string }>).map((r) => {
    const occurredMs =
      r.occurredAt instanceof Date ? r.occurredAt.getTime() : Date.parse(String(r.occurredAt));
    return {
      id: r.id,
      kind: r.kind as MemoryKind,
      sourceId: r.sourceId,
      symbol: (r.symbol as Symbol | null) ?? null,
      text: r.text,
      model: r.model,
      meta: r.meta,
      similarity: Math.max(0, Math.min(1, Number(r.similarity))),
      occurredAtMs: Number.isFinite(occurredMs) ? occurredMs : Date.now(),
    };
  });
}

/** Cheap probe — has the index ever had any data? */
export async function countMemory(): Promise<number> {
  const rows = await getDb()
    .select({ id: schema.memoryEmbeddings.id })
    .from(schema.memoryEmbeddings)
    .limit(1);
  return rows.length;
}

// silence unused-import lint when bundled in isolation
void desc;
void gte;
