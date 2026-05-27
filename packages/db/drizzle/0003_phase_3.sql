CREATE TABLE "cot_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"report_date" timestamp with time zone NOT NULL,
	"dealer_long" integer,
	"dealer_short" integer,
	"asset_long" integer,
	"asset_short" integer,
	"leveraged_long" integer,
	"leveraged_short" integer,
	"other_long" integer,
	"other_short" integer,
	"source" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"overlay" jsonb,
	"symbol" text,
	"tf" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE INDEX "cot_reports_symbol_date_idx" ON "cot_reports" USING btree ("symbol","report_date");--> statement-breakpoint
CREATE INDEX "shared_snapshots_expires_at_idx" ON "shared_snapshots" USING btree ("expires_at");