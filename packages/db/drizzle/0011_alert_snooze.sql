ALTER TABLE "alerts" ADD COLUMN "last_fired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "snooze_hours" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "alerts_last_fired_at_idx" ON "alerts" USING btree ("last_fired_at");
