ALTER TABLE "user" ADD COLUMN "tokenVersion" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "device_name" text,
  "ip" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_active_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions" ("user_id");
