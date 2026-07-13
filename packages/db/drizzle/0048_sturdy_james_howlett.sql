CREATE TABLE "analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_message_text" text NOT NULL,
	"user_message_parts" jsonb NOT NULL,
	"history_parts" jsonb NOT NULL,
	"mode" varchar(20) DEFAULT 'full' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"progress" jsonb,
	"result" jsonb,
	"error" text,
	"worker_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;