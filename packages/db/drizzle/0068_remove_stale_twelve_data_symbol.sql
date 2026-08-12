-- Migration 0068: remove stale Twelve Data symbol column
--
-- The column is not present in the current Drizzle schema or runtime code.
-- Refuse to remove it if any non-empty values exist; this protects against
-- applying the cleanup before an unexpected legacy data source is reviewed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'symbol_catalog'
      AND column_name = 'twelve_data_symbol'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM "symbol_catalog"
      WHERE "twelve_data_symbol" IS NOT NULL
        AND btrim("twelve_data_symbol") <> ''
    ) THEN
      RAISE EXCEPTION 'symbol_catalog.twelve_data_symbol contains data; review before cleanup';
    END IF;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "symbol_catalog"
  DROP COLUMN IF EXISTS "twelve_data_symbol";
