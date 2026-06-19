CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"default_symbol" text DEFAULT 'XAUUSD' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"reduce_motion" boolean DEFAULT false NOT NULL,
	"telegram_bot_token" text,
	"telegram_chat_id" text,
	"alert_email" text,
	"ai_api_keys" text,
	"max_daily_usd" integer,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_symbols" (
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_symbols_user_id_symbol_pk" PRIMARY KEY("user_id","symbol")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp with time zone,
	"image" text,
	"hashedPassword" text,
	"role" text DEFAULT 'user' NOT NULL,
	"deletedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
INSERT INTO "user" ("id", "email", "name", "role") VALUES ('__system__', 'system@localhost', 'System', 'user') ON CONFLICT ("email") DO NOTHING;
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token"),
	CONSTRAINT "verificationToken_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"user_id" text NOT NULL,
	"endpoint_group" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_user_id_endpoint_group_window_start_pk" PRIMARY KEY("user_id","endpoint_group","window_start")
);
--> statement-breakpoint
ALTER TABLE "onchain_signals" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "onchain_signals" CASCADE;--> statement-breakpoint
ALTER TABLE "briefings_emitted" DROP CONSTRAINT "briefings_emitted_event_id_kind_pk";--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'daily_ai_spend'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

ALTER TABLE "daily_ai_spend" DROP CONSTRAINT "daily_ai_spend_pkey";--> statement-breakpoint
ALTER TABLE "briefings_emitted" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_ai_spend" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_telemetry" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_tool_telemetry" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;--> statement-breakpoint
ALTER TABLE "briefings_emitted" ADD CONSTRAINT "briefings_emitted_user_id_event_id_kind_pk" PRIMARY KEY("user_id","event_id","kind");--> statement-breakpoint
ALTER TABLE "shared_snapshots" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_embeddings" ADD COLUMN "user_id" text DEFAULT '__system__' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_ai_spend" ADD CONSTRAINT "daily_ai_spend_user_id_day_pk" PRIMARY KEY("user_id","day");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_symbols" ADD CONSTRAINT "user_symbols_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_limits_user_idx" ON "rate_limits" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_telemetry" ADD CONSTRAINT "chat_telemetry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_tool_telemetry" ADD CONSTRAINT "chat_tool_telemetry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefings_emitted" ADD CONSTRAINT "briefings_emitted_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_snapshots" ADD CONSTRAINT "shared_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_embeddings" ADD CONSTRAINT "memory_embeddings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_ai_spend" ADD CONSTRAINT "daily_ai_spend_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_threads_user_id_idx" ON "chat_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alerts_user_id_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "journal_entries_user_id_idx" ON "journal_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_telemetry_user_id_idx" ON "chat_telemetry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_tool_telemetry_user_id_idx" ON "chat_tool_telemetry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shared_snapshots_user_id_idx" ON "shared_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memory_embeddings_user_id_idx" ON "memory_embeddings" USING btree ("user_id");