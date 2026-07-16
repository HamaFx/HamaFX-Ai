# HamaFX-Ai — Deep Investigation Findings Notepad

> **Created:** 2026-07-16 · **Last updated:** 2026-07-16 (deep-dive round 1)
> **Purpose:** Track all findings from deep codebase investigation, organized by phase/risk area.
> **Status:** 🔴 = critical | 🟠 = high | 🟡 = medium | ⚪ = low/info | ✅ = no issue

---

## ✅ Phase A-G: Hardening Plan (22 work orders — COMPLETED)

All 22 work orders implemented. See `RELIABILITY_HARDENING_LOG.md` for full details.

---

## 🔴 Phase H: Security Deep-Dive (UPDATED with deep findings)

### H-1 🔴: `twelvedata/rest.ts` still uses module-level `dailyCount` — NOT fixed by RL-2
- **File:** `packages/data/src/providers/twelvedata/rest.ts:18,21-26,84,147`
- **Issue:** `let dailyCount = 0;` at module level. `checkDailyQuota()` checks `dailyCount >= 780`. Line 147: `dailyCount += 1`. The `provider_daily_quota` table exists in the schema but `twelvedata/rest.ts` does NOT use it — it's still the old per-instance counter.
- **Impact:** Multiple server instances each get 780 calls independently. Race condition on concurrent requests within same instance.
- **Severity:** 🔴 — RL-2 was supposed to fix this but the old code is still active.

### H-2 🟡: `with-user-scope.ts` uses `as any` for tenant isolation
- **File:** `packages/db/src/with-user-scope.ts:66`
- **Issue:** `return eq((table as any).userId, userId)` — bypasses type safety on tenant scoping.
- **Severity:** 🟡 — Works but any table refactor could silently break tenant isolation.

### H-3 🟡: `auth.ts` NextAuth type bypass — documented upstream
- **File:** `apps/web/src/auth.ts:48` — `const _nextAuth = NextAuth as any;`
- **Issue:** Documented upstream issue (nextauthjs/next-auth#9138). Consumers re-narrow as needed.
- **Severity:** ⚪ — Known, documented, unavoidable.

### H-4 🟡: `auth.ts` Drizzle transaction type narrowing bypass
- **File:** `apps/web/src/auth.ts:302-303` — `await (db.transaction as any)(async (tx: any) => { ... })`
- **Issue:** Drizzle's transaction type narrowing doesn't work with NextAuth's callback types.
- **Severity:** 🟡 — Known Drizzle limitation, but `tx: any` loses type safety inside the transaction.

### H-5 🟡: `rag.ts` and `memory-index.ts` cast DB results to `as any`
- **Files:** `rag.ts:137,184`, `memory-index.ts:350`
- **Issue:** `const rows = (result as any).rows ?? (result as unknown as RagRow[])` — double-cast pattern. Would crash at runtime if `.rows` is undefined.
- **Severity:** 🟡 — Defensive with `??` fallback, but casts mask the actual return type.

### H-6 🟡: `briefings/generate.ts` casts UI parts as `as any` 3 times
- **Files:** `briefings/generate.ts:136,274,311`
- **Issue:** `const { messageId } = await appendAssistantMessage(thread.id, ui as any);` — the `ui` variable is a manually constructed UIMessage-like object. Type mismatch with `appendAssistantMessage` signature.
- **Severity:** 🟡 — If the UIMessage type changes, this silently breaks.

### H-7 🟡: `tools/index.ts` casts tool implementations as `as any`
- **Files:** `tools/index.ts:77,90`
- **Issue:** `analyze_chart_image: withTelemetry('analyze_chart_image', analyzeChartImageTool as any)` and `summarize_thread: withTelemetry('summarize_thread', summarizeThreadTool as any)` — two tools bypass the tool type system.
- **Severity:** 🟡 — `withTelemetry` wrapper expects a specific tool shape; these tools may have incompatible types.

### H-8 🟠: `tools/convene-committee.ts` — 4 internal tool executions with `as any` options
- **Files:** `convene-committee.ts:54-57`
- **Issue:** `analyzeFundamentalTool.execute!({ symbol, horizonHours: 48 }, { toolCallId: 'internal', messages: [] } as any)` — using `!` non-null assertion + `as any` for internal tool calls. If `execute` is undefined, runtime crash.
- **Severity:** 🟠 — Non-null assertion on potentially-undefined method. Crashes if tool isn't registered.

### H-9 🟠: `convene-committee.ts:111` — `ctx.env as any` for Google Search tool
- **File:** `convene-committee.ts:111`
- **Issue:** `getVertexGoogleSearchTool(ctx.env as any)` — passing entire env as any. If env shape changes, runtime error.
- **Severity:** 🟡 — Likely works because the function only reads specific fields.

### H-10 🟡: `chat/route.ts:157,216` — user messages cast as `as UIMessage`
- **File:** `apps/web/src/app/api/chat/route.ts:157,216`
- **Issue:** `userMessage: last as UIMessage` and `history: body.messages as UIMessage[]` — unchecked type assertion on user-supplied messages array.
- **Severity:** 🟡 — Zod validates the overall body shape, but individual message parts aren't structurally validated against UIMessage.

### H-11 🟠: `alerts/preview/route.ts:104` — `(undefined as any)` placeholder
- **File:** `apps/web/src/app/api/alerts/preview/route.ts:104`
- **Issue:** `(undefined as any)` passed as an argument — deliberate placeholder marked with TODO comment. Silently passes undefined where a real value is expected.
- **Severity:** 🟠 — Intentional tech debt, could cause runtime issues if the function starts using that parameter.

---

## 🟡 Phase I: Error Handling Gaps

### I-1 ✅: No empty catch blocks found
- **Status:** Clean.

### I-2 🟡: 3 `void (async () => { ... })()` IIFEs in worker
- **Files:** `apps/worker/src/index.ts:79,187,302`
- **Issue:** Errors caught by `unhandledRejection` handler on line 404, but no `.catch()` chaining for early detection.
- **Severity:** ⚪ — Defensive; global handler exists.

### I-3 ✅: Worker has proper `unhandledRejection` + `uncaughtException` handlers
- **Status:** Good. Flushes Sentry before exit.

---

## 🔴 Phase J: Race Conditions & Concurrency (UPDATED)

### J-1 🔴: `twelvedata/rest.ts` `dailyCount` is STILL module-level — RL-2 didn't fix it
- **File:** `packages/data/src/providers/twelvedata/rest.ts:18`
- **Evidence:** `let dailyCount = 0;` at line 18. `checkDailyQuota()` at line 21 checks `dailyCount >= 780`. `dailyCount += 1` at line 147.
- **The `provider_daily_quota` table EXISTS** (schema at `packages/db/src/schema/provider-daily-quota.ts:28`) but **twelvedata/rest.ts does NOT import or use it.**
- **Impact:** Race condition on every concurrent request. Multi-instance deployments each get separate 780-call quotas.
- **Severity:** 🔴 — CRITICAL. RL-2 work was incomplete.

### J-2 ⚪: Test factories use module-level counters
- **Files:** `packages/test-utils/src/factories/threads.ts:18`, `users.ts:8`
- **Severity:** ⚪ — Test-only.

### J-3 🟡: Worker `index.ts` has scattered module-level state
- **Variables:** `lastTickAt`, `lastMt5TickAt`, `lastTwelveDataTickAt`, `lastCandleCaptureAt`, `candleFailureCount`, `lastTickFlushCaptureAt`, `tickFlushFailureCount`
- **Severity:** 🟡 — Single-threaded, but hard to reason about.

### J-4 🟡: Scheduler `embedded.ts` — 7 AbortControllers created and discarded
- **File:** `apps/worker/src/scheduler/embedded.ts:41,51,61,71,81,91,101`
- **Issue:** Each job entry creates `signal: new AbortController().signal` — the controller is never stored, so it can never be aborted externally. The signal is passed to jobs but effectively useless.
- **Severity:** 🟡 — Jobs can't be aborted. The `scheduler.ts` (non-embedded) has proper AbortController with timeout.

---

## 🟠 Phase K: Resource Leaks (UPDATED)

### K-1 🟡: scheduler/embedded.ts — 7 AbortControllers with no reference (DUPLICATE of J-4)
- **Severity:** 🟡

### K-2 ✅: All data provider REST clients have proper AbortController pattern
- **Files:** binance/rest.ts, fred/rest.ts, finnhub/rest.ts, twelvedata/rest.ts, biquote/rest.ts, marketaux/rest.ts, cftc/rest.ts
- **Pattern:** `ctrl = new AbortController()` → `timer = setTimeout(() => ctrl.abort(...))` → `signal.addEventListener('abort', ..., { once: true })` → cleanup in finally.
- **Severity:** ✅ — All good. `{ once: true }` used. Timers cleared in finally blocks.

### K-3 🟡: `market-client.ts:64` — missing `{ once: true }` on signal listener
- **File:** `apps/web/src/lib/market-client.ts:64`
- **Issue:** `init.signal.addEventListener('abort', () => controller.abort());` — no `{ once: true }`. If the outer signal fires multiple abort events, it re-invokes controller.abort().
- **Severity:** ⚪ — `AbortController.abort()` is idempotent, so no functional bug, but wasteful.

### K-4 🟡: `retry.ts:168` — missing `{ once: true }` on signal listener
- **File:** `packages/ai/src/retry.ts:168`
- **Issue:** `signal?.addEventListener('abort', () => { clearTimeout(timer); reject(...); }, { once: true });` — wait, this HAS `{ once: true }`. ✅ OK.

### K-5 🟡: `llm-throttle.ts:156` — event listener pattern needs verification
- **File:** `packages/ai/src/llm-throttle.ts:156`
- **Issue:** `signal.addEventListener(...)` — need to verify if `{ once: true }` is present. **NEED TO READ FILE.**
- **Severity:** 🟡

### K-6 ⚪: Only 1 `removeEventListener` found in entire non-test codebase
- **File:** `apps/web/src/hooks/use-local-storage.ts:72`
- **Status:** ⚪ — Most event listeners use `{ once: true }` or are on short-lived signals. But this is sparse.

---

## 🟡 Phase L: Input Validation Gaps (UPDATED)

### L-1 ✅: Vast majority of API routes use Zod validation via `parseJsonBody` / `parseSearchParams`
- **128 matches** for Zod schema usage across `apps/web/src/app/api/`
- **Status:** ✅ — Strong validation culture. Most routes have proper Zod schemas.

### L-2 🟡: Routes that use `req.json()` raw (without `parseJsonBody` wrapper) but still validate:
- `journal/import/route.ts:38` — has `ImportPayloadSchema` but uses raw `await req.json()`. **NEED TO VERIFY** if it validates after.
- `onboarding/save-progress/route.ts:22` — has `ProgressSchema` but uses raw.
- `notifications/noise-config/route.ts:40` — has schema but uses raw.
- `notifications/route-config/route.ts:40` — has schema but uses raw.
- `portfolio/settings/route.ts:48` — has `UpdateSettingsSchema` but uses raw.
- `portfolio/positions/route.ts:53` — has schema but uses raw.
- `portfolio/positions/[id]/route.ts:46` — has schema but uses raw.
- `push/subscribe/route.ts:61` — validates with `BodySchema.safeParse(raw)` after `req.json()` — **acceptable**.
- `push/unsubscribe/route.ts:40` — validates with `BodySchema.safeParse(raw)` after `req.json()` — **acceptable**.
- `admin/test-alert-email/route.ts:104` — has `safeJson` wrapper that tolerates empty bodies.
- `billing/webhook/route.ts:50` — `await req.text()` for raw body (needed for signature verification) — **acceptable**.
- **Severity:** 🟡 — Most eventually validate, but through inconsistent paths.

### L-3 🟡: `chat/route.ts:157` — `body.messages as UIMessage[]` unchecked
- **Issue:** Messages array from user is cast to `UIMessage[]` without structural validation.
- **Severity:** 🟡 — The Zod `BodySchema` validates the top-level object but individual message parts aren't validated.

---

## 🟡 Phase M: Worker-Specific Issues

### M-1 🟡: Second SIGTERM exits immediately without Sentry flush
- **File:** `apps/worker/src/index.ts:74`
- **Severity:** ⚪ — Edge case; first signal does graceful shutdown.

### M-2 ✅: Reconnect logic is solid across all 3 WebSocket consumers
- **Files:** `signalr/consumer.ts`, `binance/consumer.ts`, `twelvedata/consumer.ts`
- **Pattern:** Exponential backoff with jitter, resubscription, server-requested reconnect, cleanup on new connect.
- **Status:** ✅ — Excellent.

### M-3 ✅: `runner/cli.ts` properly handles SIGTERM with cleanup
- **File:** `apps/worker/src/runner/cli.ts:94-99`
- **Pattern:** Creates AbortController, registers SIGTERM handler, removes listener in finally.
- **Status:** ✅ — Good.

---

## 🟡 Phase N: Test Coverage Gaps (UPDATED)

### N-1 ✅: No skipped tests
- **Status:** Clean.

### N-2 ⚪: Only 1 TODO found across all core source packages
- **File:** `apps/worker/src/symbol-manager.ts:127` — `watchlistCount: 1, // TODO: aggregate from DB for real popularity`
- **AI package:** 0 TODOs
- **Data package:** 0 TODOs
- **DB package:** 0 TODOs
- **Status:** ⚪ — Very clean. Only 1 minor TODO.

### N-3 ⚪: `vi.mock` usage in tests is standard
- **Severity:** ⚪ — Not a concern.

---

## 🟠 Phase O: Configuration & Dangerous Defaults (UPDATED)

### O-1 ✅: No insecure TLS settings
- **Status:** Clean.

### O-2 🟠: API keys silently fall back to empty string — masks configuration errors
- **Files (sampling):**
  - `market-data-providers.ts:98` — `const apiKey = options?.apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY ?? '';`
  - `market-data-providers.ts:200` — `const apiKey = options?.apiKeys?.twelvedata ?? process.env.TWELVEDATA_API_KEY ?? '';`
  - `worker/index.ts:269` — `apiKey: env.TWELVEDATA_API_KEY ?? ''`
  - `adapters/news.ts:53-54` — both finnhub and marketaux keys fall back to `''`
  - `adapters/calendar.ts:41` — fred key falls back to `''`
  - `adapters/candles.ts:70-71` — finnhub and twelvedata keys fall back to `''`
  - `adapters/price.ts:86,89` — finnhub and twelvedata keys fall back to `''`
  - `admin/test-telegram/route.ts:63-64` — `TELEGRAM_BOT_TOKEN ?? ''`, `TELEGRAM_CHAT_ID ?? ''`
  - `admin/test-alert-email/route.ts:61-63` — RESEND_API_KEY, FROM_EMAIL, TO_EMAIL all `?? ''`
  - `eval/runner.ts:561` — `cookie: process.env.EVAL_COOKIE ?? ''`
- **Impact:** Missing API keys silently produce "401 Unauthorized" or empty responses instead of loud, early failures. Debugging takes hours instead of minutes.
- **Severity:** 🟠 — High operational pain. Should fail fast with clear error messages.

### O-3 🟡: `CONTRACT_SIZES` fallback to 100,000
- **File:** `packages/shared/src/schemas/portfolio.ts:169`
- **Issue:** `return CONTRACT_SIZES[symbol.toUpperCase()] ?? 100_000;` — defaults to standard lot. Wrong for many instruments.
- **Severity:** 🟡 — Could give wrong position sizing for non-standard instruments.

### O-4 🟡: `closeBased ?? true` in SMC structure
- **File:** `packages/indicators/src/smc/structure.ts:55`
- **Issue:** `const closeBased = opts.closeBased ?? true;` — changes swing-point detection behavior. True means "use close price" vs. "use high/low".
- **Severity:** ⚪ — Reasonable default but worth documenting.

### O-5 🟡: `maxDailyUsd ?? 5` hardcoded in briefing generation
- **File:** `packages/ai/src/briefings/generate.ts:76`
- **Issue:** `MAX_DAILY_USD: Number.parseFloat(process.env.MAX_DAILY_USD ?? '5')` — this is a local fallback in briefings that may differ from the main env.
- **Severity:** 🟡 — Inconsistency risk with the main `MAX_DAILY_USD` from shared env.

### O-6 ⚪: 64 env-var fallbacks total — mostly safe defaults for local dev
- Most `??` for env vars use safe defaults for development (e.g., `'http://localhost:3000'`, `'wss://stream.binance.com:9443'`).
- **Severity:** ⚪ — Generally fine for a self-hosted open-source project.

---

## 📊 Final Severity Tally

| Severity | Count | Top Items |
|----------|-------|-----------|
| 🔴 Critical | 2 | J-1: twelvedata dailyCount still module-level (RL-2 incomplete). H-1: Same finding cross-referenced. |
| 🟠 High | 4 | H-8: convene-committee non-null execute; H-11: undefined as any placeholder; O-2: Silent API key fallbacks; K-5: llm-throttle listener leak |
| 🟡 Medium | ~20 | `as any` casts, unvalidated input paths, AbortController patterns |
| ⚪ Low/Info | ~12 | Test-only, well-handled edge cases, documented issues |
| ✅ Good | 8 | No empty catches, solid reconnect, no skipped tests, no insecure TLS, strong Zod usage, proper AbortController patterns in providers |

---

## 🔜 Recommended Next Steps (ordered by severity)

1. ~~**🔴 Fix J-1/H-1:** Wire twelvedata/rest.ts to use `provider_daily_quota` table~~ ✅ DONE — see commit below
2. ~~**🟠 Fix O-2:** Add fail-fast checks for required API keys~~ ✅ ANALYZED — provider `?? ''` is intentional for failover chains; worker env validation already catches required keys
3. ~~**🟠 Fix H-8:** Replace `execute!` non-null assertions in convene-committee~~ ✅ DONE
4. ~~**🟡 Audit:** Verify llm-throttle.ts signal listener~~ ✅ VERIFIED — already has `{ once: true }` (false alarm)
5. ~~**🟠 Fix H-11:** Replace `(undefined as any)` in alerts/preview~~ ✅ DONE
6. **🟡 Audit:** Review the 9 routes that use raw `req.json()` without `parseJsonBody` — still pending
7. **🟡 Cleanup:** Replace 13 `as any` casts in core paths with proper types or guards — still pending

---

## ✅ Round 2 Fixes (2026-07-16)

### Fixed:
- **J-1/H-1 🔴→✅:** Created `packages/db/src/provider-quota.ts` with atomic `checkAndIncrementDailyQuota()`. Wired `twelvedata/rest.ts` to use it instead of module-level `dailyCount`. Now shared across all instances via DB.
- **H-8 🟠→✅:** Replaced 4 `execute!` non-null assertions in `convene-committee.ts` with proper null guards + descriptive error messages.
- **H-11 🟠→✅:** Replaced `(undefined as any)` placeholder query in `alerts/preview/route.ts` with proper `eq(schema.candles1m.symbol, rule.symbol)` filter + `orderBy(desc(...))`.
- **K-5 🟡→✅:** Verified — `llm-throttle.ts` already has `{ once: true }`.
- **O-2 🟠→⚪:** Analyzed — `?? ''` pattern is intentional for multi-provider failover chains. Worker startup already validates required keys.
