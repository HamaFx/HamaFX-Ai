import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';

/**
 * Unified memory index. Phase 7b additions:
 *
 *   `news_embeddings` already covers news; this table covers everything
 *   else the agent should be able to recall — journal entries, briefings,
 *   thread synopses produced by `summarize_thread`. The single
 *   `kind` column discriminates between sources so `search_knowledge`
 *   can filter by kind without joining N tables.
 *
 *   `source_id` is the row id of the originating record (uuid or text),
 *   stored as text so a single FK pattern works across heterogeneous
 *   parents. We deliberately do NOT add hard FKs here — when a journal
 *   entry is deleted the matching memory row should be cleaned up via the
 *   periodic backfill cron, not via a cascade that pulls an oversize
 *   delete operation onto the live request.
 *
 *   `embedding` matches the dimensionality of the model named in
 *   `model` (1536 for `text-embedding-3-small`). Switch dimensions only
 *   alongside a backfill — `search_knowledge` will raise on mismatch.
 *
 *   `meta` is a tiny JSON envelope for per-kind extras (e.g. `symbol`,
 *   `outcome`, `eventId`). Keep payloads small — the embedding does the
 *   heavy lifting.
 */
export const memoryEmbeddings = pgTable(
  'memory_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** "journal" | "briefing" | "thread_synopsis" — discriminator. */
    kind: text('kind').notNull(),
    /** Originating row id (journal_entries.id, chat_messages.id, ...). */
    sourceId: text('source_id').notNull(),
    /** Symbol context, when the memory is symbol-scoped. */
    symbol: text('symbol'),
    /** Plain-text payload that was embedded — kept so we can re-embed without a join. */
    text: text('text').notNull(),
    /** Model id used to produce `embedding`, e.g. "openai/text-embedding-3-small". */
    model: text('model').notNull(),
    /** Per-kind extras — see file-level comment. */
    meta: jsonb('meta'),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    /** ms epoch UTC of the originating event (trade open, briefing emit, summarisation). */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('memory_kind_idx').on(t.kind),
    index('memory_source_idx').on(t.kind, t.sourceId),
    index('memory_symbol_idx').on(t.symbol),
    index('memory_occurred_idx').on(t.occurredAt),
    index('memory_embeddings_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

void sql; // silence unused-import lint when bundled in isolation
