CREATE TABLE "briefings_emitted" (
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"message_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefings_emitted_event_id_kind_pk" PRIMARY KEY("event_id","kind")
);
--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "is_briefings" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "economic_events" ADD COLUMN "actuals_filled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "briefings_emitted" ADD CONSTRAINT "briefings_emitted_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;