# Documentation & Config Fixes — Changelog

Date: 2026-07-02

## Summary

Verified all 12 README-linked docs (01–15) exist at their stated paths — no missing or renamed files. Cross-checked concrete factual claims in README.md, AGENTS.md, .env.example, and docs/ against the actual codebase: env var usages, tool counts, table/migration counts, job counts, BYOK provider list, and BiQuote API key status. Fixed 7 env vars missing from .env.example, corrected stale `BIQUOTE_API_KEY` references (BiQuote is now keyless), updated table/migration/job counts to match reality, added 2 missing AI tools to the README matrix and docs/03-ai-agent.md, fixed stale `docs/06-data-sources.md` references (file doesn't exist — correct doc is `04-data-layer.md`), and expanded the BYOK provider list from 6 to 8 named providers. Flagged 3 env vars in .env.example that appear unused outside env.ts validation, and noted the `AUTH_FIX_PLAN.md` file still doesn't exist despite being referenced.

---

## Fixes Applied

### .env.example (7 variables added)

1. **`AI_ALERT_PREVIEW_RATE_LIMIT`** — used in `apps/web/src/app/api/alerts/preview/route.ts:47`, was missing from .env.example. Added with comment (default: 10).
2. **`AI_BULK_DELETE_RATE_LIMIT`** — used in `apps/web/src/app/api/chat/threads/bulk-delete/route.ts:47`, was missing. Added with comment (default: 10).
3. **`AI_EXPORT_RATE_LIMIT`** — used in `apps/web/src/app/api/chat/threads/[id]/export/route.ts:46`, was missing. Added with comment (default: 10).
4. **`AI_EXPORT_MAX_MESSAGES`** — used in `apps/web/src/app/api/chat/threads/[id]/export/route.ts:47`, was missing. Added with comment (default: 500).
5. **`GOOGLE_APPLICATION_CREDENTIALS`** — used in `packages/ai/src/model.ts`, `packages/ai/src/agent.ts`, and many other files as a Vertex AI service-account key file path. Was missing from .env.example (only `GOOGLE_APPLICATION_CREDENTIALS_JSON` was listed). Added with comment explaining it's the file-path alternative.
6. **`NEXT_PUBLIC_DEPLOYED_SHA`** — used in `apps/web/src/instrumentation-client.ts:17` for Sentry release tracking. Was missing. Added with comment.
7. **`BIQUOTE_BASE_URL`** — already present in .env.example (line 182, commented out). No change needed here; the fix was in README.md and docs (see below).

### README.md (3 corrections)

1. **`BIQUOTE_API_KEY` → `BIQUOTE_BASE_URL`** in the Configuration Reference Table (line 268). BiQuote is now a keyless service — the code uses `BIQUOTE_BASE_URL` (default `https://biquote.io`) with no API key. Updated the env var name, description, and scope column.
2. **BYOK provider list expanded** (line 40). README listed only 6 providers ("Gemini, Claude, OpenAI, Groq, DeepSeek, or Mistral") but `packages/ai/src/byok-providers.ts` defines 9 provider IDs: google, vertex, anthropic, openai, groq, mistral, openrouter, xai, deepseek. Updated to list 8 user-facing providers (vertex is an infra-level provider, not user-facing BYOK).
3. **Tools matrix: added Portfolio & Sentiment row** (after line 176). The README's "32 AI Tools" matrix listed only 30 tools — `get_portfolio_snapshot` and `get_social_sentiment` exist in `packages/ai/src/tools/` and are registered in the tool index but were missing from the matrix. Added a new row with both tools.

### AGENTS.md (2 corrections)

1. **"7 heavy jobs" → "8 heavy jobs"** (line 113). The architecture-at-a-glance diagram said "7 heavy jobs" but `apps/worker/src/jobs/index.ts` registers 8 jobs: alerts, embedding-backfill, briefings, snapshots, cot, fred-actuals, weekly-review, resonance-sync. Updated count and added "alerts" to the parenthetical examples.
2. **"40 tables" → "42 tables"** (lines 78, 191). The monorepo structure tree and doc index both said "40 tables" but `grep -c 'pgTable(' packages/db/src/schema/*.ts` returns 42 pgTable calls. Updated both occurrences.

### docs/04-data-layer.md (2 corrections)

1. **"40 Tables" → "42 Tables"** in section heading (line 10). Actual pgTable count is 42.
2. **"35 migrations (0000–0034)" → "40 migrations (0000–0039)"** (line 425). The `packages/db/drizzle/` directory contains 40 SQL migration files (0000 through 0039), including the Phase 3 RLS cutover migrations.

### docs/07-worker.md (1 correction)

1. **"Registers all 7 jobs" → "Registers all 8 jobs"** (line 417). The embedded scheduler description said 7 jobs but the JOBS registry has 8 entries. (The job table at line 346 already correctly says "The 8 jobs" — this was fixed in the prior audit pass.)

### docs/03-ai-agent.md (1 correction)

1. **Added `get_portfolio_snapshot` and `get_social_sentiment` to the Additional Tools table** (line 170). The "Additional Tools" section listed only 2 tools (get_cot, get_seasonality) but 4 tools belong there. Updated heading from "(2 tools)" to "(4 tools)" and added both missing tools with descriptions verified from the tool files.

### docs/02-codebase.md (1 correction)

1. **`BIQUOTE_API_KEY` → `BIQUOTE_BASE_URL` (keyless)** (line 198). The env var list for market data providers referenced `BIQUOTE_API_KEY` but BiQuote is now keyless — the code uses `BIQUOTE_BASE_URL` instead.

### docs/11-self-hosting.md (1 correction)

1. **Troubleshooting table: BiQuote row** (line 129). Changed "BiQuote credentials missing | Set `BIQUOTE_API_KEY`" to "BiQuote endpoint unreachable | Set `BIQUOTE_BASE_URL` (BiQuote is keyless)".

### docs/01-architecture.md (1 correction)

1. **Stale `06-data-sources.md` reference → `docs/04-data-layer.md`** (line 234). Referenced `06-data-sources.md` which does not exist; the correct data layer doc is `04-data-layer.md`.

### Code comments (4 files, stale doc references fixed)

1. **`packages/data/src/cache/nextjs.ts:20`** — `docs/06-data-sources.md` → `docs/04-data-layer.md`
2. **`packages/data/src/cache/ttl.ts:17`** — `docs/06-data-sources.md` → `docs/04-data-layer.md`
3. **`packages/shared/src/env.ts:126`** — `docs/06-data-sources.md` → `docs/04-data-layer.md`
4. **`apps/web/src/hooks/use-candles.ts:35`** — `docs/06-data-sources.md` → `docs/04-data-layer.md`

---

## Items Flagged but NOT Changed

1. **`ALPHAVANTAGE_API_KEY`** — present in .env.example and validated in `packages/shared/src/env.ts:140` but not referenced anywhere else in app code. May be reserved for a future data provider or used by an external script. Not removed per audit policy.

2. **`TRADING_ECONOMICS_KEY`** — present in .env.example and validated in `packages/shared/src/env.ts:142` but not referenced in any app code outside env.ts. Same situation as ALPHAVANTAGE. Not removed.

3. **`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`** — present in .env.example and validated in `packages/shared/src/env.ts:128-129`. Code comments in `packages/data/src/cache/nextjs.ts` and `packages/data/src/health.ts` explicitly say "no Upstash" and explain the cache uses Next.js built-in cache instead. These vars appear to be legacy/reserved. Not removed.

4. **`BYOK_ENABLED`, `MULTI_USER_ENABLED`, `PER_USER_BRIEFINGS`** — present in .env.example and defined in `packages/shared/src/env.ts` (lines 208, 212, 220) but not referenced in any application code outside env.ts. They may be consumed by middleware or feature-flag logic not caught by the grep, or may be planned for future use. Not removed.

5. **`HC_TENANT_EXPORT_UUID` / `HC_TENANT_DELETE_UUID`** — present in .env.example and used only in shell scripts (`infra/cron-vm/scripts/export-tenant.sh`, `delete-tenant.sh`), not in TypeScript code. Correctly in .env.example for ops visibility. No change needed.

6. **`AUTH_FIX_PLAN.md`** — referenced from AGENTS.md (3 places) and `docs/10-security.md` (2 places) with "(not yet written)" / "(planned)" notes. The file does not exist. All references already carry appropriate caveats from the prior audit pass. No further change needed, but the file should eventually be written or the references removed.

7. **AGENTS.md "Phases 0–9 shipped" claim** — could not fully verify every phase milestone from code alone. Phase 8 is clearly present (many `Phase 8 PR-*` comments in worker jobs and schema). Phase 3 RLS/multi-tenant code exists (`HAMAFX_ENABLE_RLS`, `withTenantDb`, migrations 0035–0039). Left unchanged — the claim is plausible but a full phase-by-phase verification was out of scope.

8. **README LOC numbers** (~50,300 for web, ~25,700 for ai, etc.) — approximate and will drift. Not verified line-by-line. Left unchanged.

9. **`docs/06-data-sources.md` references in `docs/review/` files** — two review docs reference this non-existent file. Left unchanged since review docs are historical audit artifacts.

10. **`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`** — listed as "potentially unused" in the initial diff but confirmed used in `apps/web/src/app/api/upload/route.ts`, `apps/web/src/lib/storage.ts`, `apps/web/src/app/api/cron/cleanup-uploads/route.ts`, and `packages/data/src/adapters/storage.ts`. Correctly present in .env.example. No change needed.

---

## Suggested Follow-up

1. **Remove or wire up unused env vars** — `ALPHAVANTAGE_API_KEY`, `TRADING_ECONOMICS_KEY`, and `UPSTASH_REDIS_*` are validated by zod but never consumed by app code. Either remove them from both env.ts and .env.example, or add the provider integrations they were intended for.

2. **Write `AUTH_FIX_PLAN.md` or remove references** — the file is referenced 5 times across AGENTS.md and docs/10-security.md. Either write the plan or remove the dangling references to avoid confusion for new contributors.

3. **Verify `BYOK_ENABLED`, `MULTI_USER_ENABLED`, `PER_USER_BRIEFINGS` feature flags** — these are defined in env.ts with zod validation but appear unused in app code. If they're meant to gate features, the gating logic may be missing; if they're deprecated, they should be removed from env.ts and .env.example.

4. **2Checkout/Verifone billing integration** — `docs/BILLING-WEBHOOK-SAFETY-GATE.md` references "Phase 8.3" billing integration, but no billing code exists in the codebase yet. The doc is a forward-looking design spec. Consider adding a note to AGENTS.md or README.md that billing is planned but not yet implemented, to prevent contributors from assuming it exists.

5. **`docs/INCIDENT-RESPONSE.md`** — exists but is not linked from README.md or AGENTS.md doc indexes. Consider adding it to the documentation map if it's meant to be discoverable.
