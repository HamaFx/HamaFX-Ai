-- 0043: Add n_data_symbol to symbol_catalog. Exists in prod, no migration. Idempotent.
ALTER TABLE "symbol_catalog" ADD COLUMN IF NOT EXISTS "n_data_symbol" text;
