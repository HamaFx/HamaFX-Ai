-- Evaluation dataset registry. Dataset content is stored outside the DB and
-- addressed by SHA-256; this table stores lifecycle and provenance only.

CREATE TABLE IF NOT EXISTS "eval_datasets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "version" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "record_count" integer NOT NULL DEFAULT 0,
  "content_sha256" text NOT NULL,
  "source" text NOT NULL,
  "provenance" jsonb NOT NULL,
  "created_by" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "approved_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "eval_datasets_version_uk"
  ON "eval_datasets" ("version");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "eval_datasets_content_hash_uk"
  ON "eval_datasets" ("content_sha256");
