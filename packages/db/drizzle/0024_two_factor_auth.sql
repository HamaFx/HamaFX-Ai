ALTER TABLE "user" ADD COLUMN "two_factor_secret" text;
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;
