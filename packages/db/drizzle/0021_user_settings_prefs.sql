ALTER TABLE "user_settings" ADD COLUMN "custom_instructions" text;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "time_format" text;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "theme" text;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notification_preferences" jsonb;
