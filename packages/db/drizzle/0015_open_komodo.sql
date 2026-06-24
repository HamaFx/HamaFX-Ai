CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbol_catalog" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"exchange" text,
	"tv_ticker" text,
	"pip_size" real,
	"price_decimals" integer,
	"currency_tags" text[],
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "rate_limits" DROP CONSTRAINT IF EXISTS "rate_limits_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");
--> statement-breakpoint
INSERT INTO "symbol_catalog" ("symbol", "name", "category", "exchange", "tv_ticker", "pip_size", "price_decimals", "currency_tags", "is_active", "sort_order") VALUES
('XAUUSD', 'Gold', 'metals', 'OANDA', 'OANDA:XAUUSD', 0.1, 2, ARRAY['USD', 'XAU'], true, 1),
('EURUSD', 'Euro / US Dollar', 'forex', 'OANDA', 'OANDA:EURUSD', 0.0001, 5, ARRAY['USD', 'EUR'], true, 2),
('GBPUSD', 'British Pound / US Dollar', 'forex', 'OANDA', 'OANDA:GBPUSD', 0.0001, 5, ARRAY['USD', 'GBP'], true, 3)
ON CONFLICT ("symbol") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "exchange" = EXCLUDED."exchange",
  "tv_ticker" = EXCLUDED."tv_ticker",
  "pip_size" = EXCLUDED."pip_size",
  "price_decimals" = EXCLUDED."price_decimals",
  "currency_tags" = EXCLUDED."currency_tags",
  "is_active" = EXCLUDED."is_active",
  "sort_order" = EXCLUDED."sort_order";