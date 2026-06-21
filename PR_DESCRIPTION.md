# Fix 9 issues found in a deep audit (2 critical guardrail bugs)

## Summary

A deep audit surfaced 9 defects. The two most serious are **critical**: both core
safety guardrails — per-user rate limiting and the daily cost ceiling — were
miscalibrated in production while looking green in CI, because the test suite runs
on **PGlite** and production runs on **postgres-js** with **Vertex** model ids.

All fixes include regression tests where applicable. `pnpm turbo run lint`,
package tests, and typecheck (including `apps/web`) all pass.

## What changed

### 🔴 Critical

- **Rate limiter was disabled in production** (`packages/db/src/rate-limit.ts`)
  `postgres-js` returns a `Result` that *extends Array* (no `.rows`), while PGlite
  returns `{ rows }`. `withRateLimit()` read `.rows` blindly, so the count was
  always `0` in prod and the limit never fired. Now reads both shapes and coerces
  to a number. New `rate-limit.test.ts` locks the contract (helper had **zero**
  coverage). Also removed the no-op `windowMs` param (both ternary branches were
  identical).

- **Daily AI budget overcharged ~10×** (`packages/ai/src/cost.ts`)
  The agent streams with `google-vertex/…` ids by default, but `RATES` is keyed by
  `google/…`, so the lookup fell through to the `$5/$15` fallback. Added
  `rateKeyForModel()` to normalize Vertex/bare Gemini ids to the gateway rate key.
  Added regression tests for every prefix form.

### 🟠 High

- **Gold prices ≥ 5000 escaped citation enforcement** (`verification/regex.ts`)
  Gold band `[1-4]\d{3}` (4 digits) → `[1-4]\d{3,4}` (1000–49999.99), matching the
  docstring's stated intent. Boundary guards unchanged. Added tests.

- **Lint red on a clean checkout** — fixed `migration-0013` errors plus two
  pre-existing errors in `agent.ts` and `chat-model.test.ts` that were masked
  because turbo cancelled the `@hamafx/ai` task once `@hamafx/db` failed first.
  `pnpm turbo run lint` now exits 0 across all 8 packages.

### 🟡 Medium

- **`windowMs` no-op** removed from `withRateLimit` (folded into the rate-limit
  commit); updated the one caller.
- **"32 tools" → 30** across README (badge/heading/diagram) and 4 docs files
  (verified against `tools/index.ts`).
- **`failover.ts` header** rewritten to match actual behavior (no phantom
  throttle).
- **Playwright artifacts** (`playwright.pid`, `playwright-report/`) untracked +
  ignored.
- **Broken README quickstart** — fixed the unclosed-quote `echo … >> .env.local`.

## Verification

| Check | Result |
|---|---|
| `pnpm turbo run lint` | ✅ 8/8 packages clean |
| `@hamafx/ai` tests | ✅ 232 pass (incl. new cost + regex tests) |
| `@hamafx/db` tests | ✅ 17 pass (incl. new rate-limit test) |
| `@hamafx/data` tests | ✅ 86 pass |
| typecheck (all 6 packages incl. web) | ✅ clean |

## Commits

1. `fix(db): rate limiter reads both driver row shapes (prod limit was disabled)`
2. `fix(ai): normalize vertex/bare model ids in cost lookup (~10x overcharge)`
3. `fix(ai): widen PRICE_TOKEN gold band to 5 digits`
4. `fix(lint): clear ESLint errors so CI lint gate passes`
5. `docs(data): correct failover header to match actual behavior`
6. `docs: fix tool count (32->30) and broken README quickstart command`
7. `chore(web): ignore Playwright run artifacts`
8. `docs: add BUGFIX_GUIDE.md documenting the 9 audited issues`

> Note: `BUGFIX_GUIDE.md` / `PR_DESCRIPTION.md` are included for reviewer context.
> Feel free to drop those two commits if you'd rather not land the docs.
