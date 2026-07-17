-- Seed live_ticks for load-test / CI environments where the worker
-- isn't running.  Idempotent (UPSERT via ON CONFLICT).
INSERT INTO live_ticks (symbol, bid, ask, mid, ts, source, tenant_id)
VALUES
  ('XAUUSD', 2650.00, 2650.50, 2650.25, NOW(), 'seeded', '__system__'),
  ('EURUSD', 1.0850, 1.0855, 1.08525, NOW(), 'seeded', '__system__'),
  ('GBPUSD', 1.2650, 1.2655, 1.26525, NOW(), 'seeded', '__system__')
ON CONFLICT (symbol) DO UPDATE SET
  mid   = EXCLUDED.mid,
  bid   = EXCLUDED.bid,
  ask   = EXCLUDED.ask,
  ts    = NOW();
