ALTER TABLE "user_settings" ADD COLUMN "disabled_tools" jsonb DEFAULT '[]'::jsonb;
