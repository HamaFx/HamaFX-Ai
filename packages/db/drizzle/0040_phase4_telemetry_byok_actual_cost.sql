-- Phase 4 — Rate Limiting & AI Cost Hardening
-- Migration 0040: Add actual_cost_usd and byok_key columns to chat_telemetry.
--
-- These columns support per-tenant billing readiness:
--   - actual_cost_usd: provider-billed cost where available (vs estimate)
--   - byok_key: flag indicating the user's own API key was used (not system spend)

ALTER TABLE chat_telemetry
  ADD COLUMN IF NOT EXISTS actual_cost_usd double precision,
  ADD COLUMN IF NOT EXISTS byok_key boolean DEFAULT false;

COMMENT ON COLUMN chat_telemetry.actual_cost_usd IS
  'Phase 4 — actual provider-billed cost in USD where available. Falls back to est_cost_usd when not set.';
COMMENT ON COLUMN chat_telemetry.byok_key IS
  'Phase 4 — true when the turn used the user own API key (BYOK), false for system/gateway key.';
