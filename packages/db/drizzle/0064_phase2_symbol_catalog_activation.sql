-- Phase 2 — canonical symbol catalog activation.
--
-- Older migration chains created symbol_catalog before provider-specific
-- columns were added to the Drizzle schema. Keep these guards here so both
-- existing Postgres installations and fresh PGlite chains can activate the
-- catalog safely.
ALTER TABLE "symbol_catalog" ADD COLUMN IF NOT EXISTS "biquote_symbol" text;
ALTER TABLE "symbol_catalog" ADD COLUMN IF NOT EXISTS "binance_symbol" text;
ALTER TABLE "symbol_catalog" ADD COLUMN IF NOT EXISTS "finnhub_symbol" text;
ALTER TABLE "symbol_catalog" ADD COLUMN IF NOT EXISTS "n_data_symbol" text;
ALTER TABLE "symbol_catalog" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT '__system__';

-- The shared package owns instrument identity. This migration mirrors that
-- locked catalog into the system catalog used by onboarding, settings, and
-- market-data discovery. Existing rows are updated in place so user data and
-- historical references remain intact; non-canonical system rows are only
-- deactivated, never deleted.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "symbol_catalog"
    WHERE "symbol" IN (
      'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD', 'USDCHF',
      'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY',
      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT'
    )
    AND COALESCE("tenant_id", '__system__') <> '__system__'
  ) THEN
    RAISE EXCEPTION 'Canonical symbol_catalog rows must be system-scoped before applying 0064';
  END IF;
END $$;
--> statement-breakpoint

INSERT INTO "symbol_catalog" (
  "symbol", "name", "category", "exchange", "tv_ticker",
  "biquote_symbol", "binance_symbol", "finnhub_symbol", "n_data_symbol",
  "pip_size", "price_decimals", "currency_tags", "is_active", "sort_order", "tenant_id"
) VALUES
  ('XAUUSD', 'Gold / US Dollar', 'gold', 'OANDA', 'OANDA:XAUUSD', 'XAUUSD', NULL, 'OANDA:XAU_USD', NULL, 0.1, 2, ARRAY['USD', 'XAU'], true, 1, '__system__'),
  ('EURUSD', 'Euro / US Dollar', 'forex', 'OANDA', 'OANDA:EURUSD', 'EURUSD', NULL, 'OANDA:EUR_USD', NULL, 0.0001, 5, ARRAY['USD', 'EUR'], true, 2, '__system__'),
  ('GBPUSD', 'British Pound / US Dollar', 'forex', 'OANDA', 'OANDA:GBPUSD', 'GBPUSD', NULL, 'OANDA:GBP_USD', NULL, 0.0001, 5, ARRAY['USD', 'GBP'], true, 3, '__system__'),
  ('USDJPY', 'US Dollar / Japanese Yen', 'forex', 'OANDA', 'OANDA:USDJPY', 'USDJPY', NULL, 'OANDA:USD_JPY', NULL, 0.01, 3, ARRAY['USD', 'JPY'], true, 4, '__system__'),
  ('AUDUSD', 'Australian Dollar / US Dollar', 'forex', 'OANDA', 'OANDA:AUDUSD', 'AUDUSD', NULL, 'OANDA:AUD_USD', NULL, 0.0001, 5, ARRAY['USD', 'AUD'], true, 5, '__system__'),
  ('USDCAD', 'US Dollar / Canadian Dollar', 'forex', 'OANDA', 'OANDA:USDCAD', 'USDCAD', NULL, 'OANDA:USD_CAD', NULL, 0.0001, 5, ARRAY['USD', 'CAD'], true, 6, '__system__'),
  ('NZDUSD', 'New Zealand Dollar / US Dollar', 'forex', 'OANDA', 'OANDA:NZDUSD', 'NZDUSD', NULL, 'OANDA:NZD_USD', NULL, 0.0001, 5, ARRAY['USD', 'NZD'], true, 7, '__system__'),
  ('USDCHF', 'US Dollar / Swiss Franc', 'forex', 'OANDA', 'OANDA:USDCHF', 'USDCHF', NULL, 'OANDA:USD_CHF', NULL, 0.0001, 5, ARRAY['USD', 'CHF'], true, 8, '__system__'),
  ('EURGBP', 'Euro / British Pound', 'forex', 'OANDA', 'OANDA:EURGBP', 'EURGBP', NULL, 'OANDA:EUR_GBP', NULL, 0.0001, 5, ARRAY['EUR', 'GBP'], true, 9, '__system__'),
  ('EURJPY', 'Euro / Japanese Yen', 'forex', 'OANDA', 'OANDA:EURJPY', 'EURJPY', NULL, 'OANDA:EUR_JPY', NULL, 0.01, 3, ARRAY['EUR', 'JPY'], true, 10, '__system__'),
  ('GBPJPY', 'British Pound / Japanese Yen', 'forex', 'OANDA', 'OANDA:GBPJPY', 'GBPJPY', NULL, 'OANDA:GBP_JPY', NULL, 0.01, 3, ARRAY['GBP', 'JPY'], true, 11, '__system__'),
  ('AUDJPY', 'Australian Dollar / Japanese Yen', 'forex', 'OANDA', 'OANDA:AUDJPY', 'AUDJPY', NULL, 'OANDA:AUD_JPY', NULL, 0.01, 3, ARRAY['AUD', 'JPY'], true, 12, '__system__'),
  ('BTCUSDT', 'Bitcoin / Tether', 'crypto', 'BINANCE', 'BINANCE:BTCUSDT', NULL, 'BTCUSDT', 'BINANCE:BTCUSDT', NULL, 0.01, 2, ARRAY['USD', 'USDT', 'BTC'], true, 13, '__system__'),
  ('ETHUSDT', 'Ethereum / Tether', 'crypto', 'BINANCE', 'BINANCE:ETHUSDT', NULL, 'ETHUSDT', 'BINANCE:ETHUSDT', NULL, 0.01, 2, ARRAY['USD', 'USDT', 'ETH'], true, 14, '__system__'),
  ('SOLUSDT', 'Solana / Tether', 'crypto', 'BINANCE', 'BINANCE:SOLUSDT', NULL, 'SOLUSDT', 'BINANCE:SOLUSDT', NULL, 0.01, 2, ARRAY['USD', 'USDT', 'SOL'], true, 15, '__system__'),
  ('BNBUSDT', 'BNB / Tether', 'crypto', 'BINANCE', 'BINANCE:BNBUSDT', NULL, 'BNBUSDT', 'BINANCE:BNBUSDT', NULL, 0.01, 2, ARRAY['USD', 'USDT', 'BNB'], true, 16, '__system__'),
  ('XRPUSDT', 'XRP / Tether', 'crypto', 'BINANCE', 'BINANCE:XRPUSDT', NULL, 'XRPUSDT', 'BINANCE:XRPUSDT', NULL, 0.0001, 4, ARRAY['USD', 'USDT', 'XRP'], true, 17, '__system__'),
  ('ADAUSDT', 'Cardano / Tether', 'crypto', 'BINANCE', 'BINANCE:ADAUSDT', NULL, 'ADAUSDT', 'BINANCE:ADAUSDT', NULL, 0.0001, 4, ARRAY['USD', 'USDT', 'ADA'], true, 18, '__system__')
ON CONFLICT ("symbol") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "exchange" = EXCLUDED."exchange",
  "tv_ticker" = EXCLUDED."tv_ticker",
  "biquote_symbol" = EXCLUDED."biquote_symbol",
  "binance_symbol" = EXCLUDED."binance_symbol",
  "finnhub_symbol" = EXCLUDED."finnhub_symbol",
  "n_data_symbol" = EXCLUDED."n_data_symbol",
  "pip_size" = EXCLUDED."pip_size",
  "price_decimals" = EXCLUDED."price_decimals",
  "currency_tags" = EXCLUDED."currency_tags",
  "is_active" = EXCLUDED."is_active",
  "sort_order" = EXCLUDED."sort_order",
  "tenant_id" = EXCLUDED."tenant_id";
--> statement-breakpoint

UPDATE "symbol_catalog"
SET "is_active" = false
WHERE ("tenant_id" IS NULL OR "tenant_id" = '__system__')
  AND "symbol" NOT IN (
    'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD', 'USDCHF',
    'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY',
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT'
  );
