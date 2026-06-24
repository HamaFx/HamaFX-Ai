ALTER TABLE "user_settings" ADD COLUMN "monthly_budget_limit" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "provider_spending_thresholds" jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "spend_alerts_config" jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "spend_alerts_state" jsonb;