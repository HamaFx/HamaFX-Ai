CREATE TABLE "cron_runs" (
	"job_name" text NOT NULL,
	"run_date" date NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"note" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "cron_runs_status_idx" ON "cron_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "telemetry_user_created_idx" ON "chat_telemetry" USING btree ("user_id","created_at");