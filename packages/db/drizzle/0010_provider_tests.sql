CREATE TABLE "provider_tests" (
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"tested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "provider_tests_user_provider_idx" ON "provider_tests" USING btree ("user_id","provider_id");
--> statement-breakpoint
ALTER TABLE "provider_tests" ADD CONSTRAINT "provider_tests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
