CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"parts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"pinned_symbol" text,
	"model_override" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule" jsonb NOT NULL,
	"channels" text[] DEFAULT '{"email"}' NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"entry" double precision NOT NULL,
	"stop" double precision,
	"target" double precision,
	"exit" double precision,
	"size" double precision,
	"outcome" text DEFAULT 'open' NOT NULL,
	"r_multiple" double precision,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"attachments" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"publisher" text,
	"published_at" timestamp with time zone NOT NULL,
	"symbols" text[] DEFAULT '{}'::text[] NOT NULL,
	"sentiment" text,
	"sentiment_score" double precision,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_articles_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "news_embeddings" (
	"article_id" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economic_events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"country" text NOT NULL,
	"currency" text,
	"importance" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"actual" double precision,
	"forecast" double precision,
	"previous" double precision,
	"unit" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"kind" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid,
	"message_id" uuid,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"ms" integer DEFAULT 0 NOT NULL,
	"est_cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_embeddings" ADD CONSTRAINT "news_embeddings_article_id_news_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_thread_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_threads_updated_at_idx" ON "chat_threads" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "alerts_active_idx" ON "alerts" USING btree ("active");--> statement-breakpoint
CREATE INDEX "alerts_fired_at_idx" ON "alerts" USING btree ("fired_at");--> statement-breakpoint
CREATE INDEX "journal_symbol_idx" ON "journal_entries" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "journal_opened_idx" ON "journal_entries" USING btree ("opened_at");--> statement-breakpoint
CREATE INDEX "news_published_at_idx" ON "news_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "news_source_idx" ON "news_articles" USING btree ("source");--> statement-breakpoint
CREATE INDEX "news_symbols_gin" ON "news_articles" USING gin ("symbols");--> statement-breakpoint
CREATE INDEX "news_embeddings_hnsw_idx" ON "news_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "economic_events" USING btree ("date");--> statement-breakpoint
CREATE INDEX "events_importance_idx" ON "economic_events" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "events_currency_idx" ON "economic_events" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "snapshots_symbol_kind_asof_idx" ON "snapshots" USING btree ("symbol","kind","as_of");--> statement-breakpoint
CREATE INDEX "telemetry_created_idx" ON "chat_telemetry" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "telemetry_thread_idx" ON "chat_telemetry" USING btree ("thread_id");