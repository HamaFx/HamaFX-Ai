-- Phase 7b — unified memory index for journal entries, briefings, and
-- thread synopses produced by `summarize_thread`. Lives alongside
-- `news_embeddings` (which keeps its tighter, news-only schema) so
-- `search_knowledge` can filter by `kind` and either hit the dedicated
-- news index or this one without an N-way join.

CREATE TABLE "memory_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"source_id" text NOT NULL,
	"symbol" text,
	"text" text NOT NULL,
	"model" text NOT NULL,
	"meta" jsonb,
	"embedding" vector(1536) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "memory_kind_idx" ON "memory_embeddings" ("kind");
--> statement-breakpoint
CREATE INDEX "memory_source_idx" ON "memory_embeddings" ("kind", "source_id");
--> statement-breakpoint
CREATE INDEX "memory_symbol_idx" ON "memory_embeddings" ("symbol");
--> statement-breakpoint
CREATE INDEX "memory_occurred_idx" ON "memory_embeddings" ("occurred_at");
--> statement-breakpoint
CREATE INDEX "memory_embeddings_hnsw_idx" ON "memory_embeddings" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint

-- Phase 7b — full-text search over `news_articles` for hybrid retrieval.
-- Reciprocal-rank fusion in `search_knowledge` combines this lexical
-- ranking with cosine similarity from `news_embeddings.embedding`.
CREATE INDEX IF NOT EXISTS "news_articles_fts_idx" ON "news_articles" USING gin (
  to_tsvector('english', coalesce("title", '') || ' ' || coalesce("summary", ''))
);

--> statement-breakpoint
CREATE TABLE "chat_tool_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid,
	"message_id" uuid,
	"tool" text NOT NULL,
	"ms" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tool_telemetry_created_idx" ON "chat_tool_telemetry" ("created_at");
--> statement-breakpoint
CREATE INDEX "tool_telemetry_thread_idx" ON "chat_tool_telemetry" ("thread_id", "created_at");
--> statement-breakpoint
CREATE INDEX "tool_telemetry_tool_idx" ON "chat_tool_telemetry" ("tool");
