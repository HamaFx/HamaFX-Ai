CREATE TABLE "daily_ai_spend" (
	"day" date PRIMARY KEY NOT NULL,
	"total_usd_cents" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_throttle" (
	"provider" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"backoff_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "memory_embeddings" ADD CONSTRAINT "memory_embeddings_kind_source_uk" UNIQUE("kind","source_id");