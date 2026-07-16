# Reliability Hardening Log

| Work Order | Status | Commit SHA | Notes |
|------------|--------|------------|-------|
| RL-1 | DONE | e6fe469 | Added resolveThrottleBackend() with auto-default (postgres on Vercel/worker, memory otherwise). 7 resolver matrix tests pass. |
| RL-2 | DONE | e6fe469 | Added provider_daily_quota table (migration 0051), tryReserveDaily() in throttle.ts, wired into twelvedata/rest.ts. Note: atomic reserve-before-fetch (not post-success increment) — safer for concurrent callers. |
| RL-4 | DONE | e6fe469 | Added getRetryAfterMs() parsing seconds/HTTP-date from 3 error shapes, withRetry() honors it via max(jittered, retryAfter) capped at maxRetryAfterMs. Abort listener already used {once:true}. Tests: getRetryAfterMs unit tests. |
| RL-3 | DONE | e6fe469 | Created llm-throttle.ts with noteLlmRateLimit/awaitLlmHeadroom governor. Wired into agent.ts onFinish and pre-streamText, and model.ts testProviderKey. Key = providerId:userId. Fail-open. Tests pass. |
| RL-5 | DONE | e6fe469 | Added withRateLimit to 10 unprotected routes. 6 new env vars documented in .env.example. Defaults generous enough to not break normal UI polling. |
| PERF-1 | DONE | e6fe469 | MemoryCache now bounded LRU (default 5000 entries), lazy sweep (32 entries/call), periodic full sweep in worker (unref'd 60s interval). clear() added to Cache interface and NextjsCache. |
| PERF-2 | DONE | e6fe469 | Tenant cache registry LRU-capped at 500; _tenantLastAccess tracks recency; evictLruTenantsIfNeeded evicts LRU non-global tenants; setDefaultCache also updates bookkeeping. |
| PERF-7 | DONE | e6fe469 | Reentrancy guard (_runningJobs Set) in runJobSafely; multi-agent poll converted from setInterval to self-rescheduling setTimeout with unref(); cleanup ordering: clearTimeout before delete from running set. |
| DB-1 | DONE | e6fe469 | Retention cleanup: shared retention.ts (direct deletes for rate_limits, chat_telemetry, chatToolTelemetry, diagnostic_traces, provider_daily_quota), web cron route + worker job registered at daily 03:15 UTC. Exported from db barrel. |
| DB-2 | DONE | e6fe469 | resolveSslOptions now throws in production without SUPABASE_CA_CERT, opt-out via DB_ALLOW_INSECURE_TLS. Updated TLS comment in client.ts and test expectation in phase4-5-migrations. |
| PERF-6 | DONE | e6fe469 | Replaced DELETE+INSERT provider_tests with single onConflictDoUpdate upsert wrapped in waitUntil(). Saves one DB write per turn + moves it off the response path. Removed unused `and` import. |
| PERF-5 | DONE | e6fe469 | Added limitConcurrency() helper + wrapped specialist Promise.all in orchestrator. Default 3, minimum 1, env-overridable via MULTI_AGENT_CONCURRENCY. New concurrency.ts util. |
| PERF-4 | DONE | e6fe469 | Added supportsPromptCaching() in model.ts. Anthropic-backed calls get anthropic cacheControl ephemeral marker on the system prefix for ~90% token cost reduction. Wired into agent.ts streamArgs and base-agent.ts generateText. |
| SEC-1 | DONE | e6fe469 | Signed x-user-id header with HMAC-SHA256 (NEXTAUTH_SECRET). middleware.ts injects x-user-id + x-user-id-sig (Web Crypto API). api.ts verifies signature inline with dynamic import('node:crypto'). Matcher-coverage test enumerates all withAuth routes. Edge-safe shared util in signed-user-header.ts. |
| SEC-2 | PARTIAL | e6fe469 | CSP script-src 'unsafe-inline' retained with comment documenting plan for nonce/hash-based replacement. Nonce adoption needs Playwright verification first — queued as follow-up. |
| SEC-3 | DONE | e6fe469 | Dockerfile.worker: non-root USER node with chown, HEALTHCHECK curl localhost:8081/health at 30s interval. |
| SEC-4 | DONE | e6fe469 | normalizePemPrivateKey moved to shared packages/ai/src/util/pem.ts (breaks circular dep). Duplicate removed from model.ts and byok-providers.ts. PEM tests use generateKeyPairSync at runtime + crypto.createPrivateKey() verification. Removed --openssl-legacy-provider from Dockerfile.worker. |
| CLEAN-1 | DONE | e6fe469 | Deleted dead nextjs.ts (zero imports found, no knip.json reference). |
| CLEAN-2 | DONE | e6fe469 | Added probeInFlight single-flight guard in circuit-breaker HALF_OPEN state. Set before fn(), cleared in finally. |
| CLEAN-3 | DONE | e6fe469 | Added {once:true} to addEventListener('abort',...) across 7 provider REST files (twelvedata, biquote, finnhub, marketaux, cftc, fred, binance) — 9 occurrences total. Prevents listener accumulation on long-lived parent signals. |
| PERF-8 | DONE | e6fe469 | Thread fork: replaced per-message insert loop with single bulk insert. Symbols reorder: replaced per-symbol UPDATE loop with single CASE WHEN UPDATE. |
| UPG-1 | DONE | committed | next-auth already pinned at 5.0.0-beta.31 (no caret). Bumped turbo, typescript-eslint, msw to latest compat. See spike note below. |

## Test Status (final)

- **Typecheck**: ✅ 9/9
- **Lint**: ✅ 9/9 (15 pre-existing no-console warnings in db scripts)
- **AI tests**: ✅ 695/695 (65 files)
- **Data tests**: ✅ 130/130 (17 files)
- **Worker tests**: ✅ 91/91
- **Web tests**: 475/480 passed (5 pre-existing route-health.test.ts failures — unchanged from baseline, not hardening regressions)
- **SEC-1 regression tests**: ✅ 90/90 (api.test.ts 29/29 + middleware-matcher-coverage 61/61)

### UPG-1 next-auth spike note

**Current version:** `next-auth@5.0.0-beta.31` (exact, no range — safe from unintended bumps).

**GA migration surface (do NOT attempt ad-hoc):**
- NextAuth.js v5 GA renamed packages: `next-auth` → `@auth/nextjs`, `@auth/core` already present. Migration guide: https://authjs.dev/getting-started/migrating-to-v5
- Breaking changes in GA: session callback signature changed, `auth()` API renamed to `auth()`, middleware wrapper updated.
- `@auth/drizzle-adapter` v1.x may need bump to v2.x for GA compat.
- Recommendation: schedule a dedicated upgrade window with full E2E smoke suite before merging. Pin to exact GA version once released.
