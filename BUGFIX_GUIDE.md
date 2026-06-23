# HamaFX-Ai — Bug Fix Implementation Guide

> **Audience:** an autonomous coding agent (or engineer) applying fixes to the
> HamaFX-Ai monorepo.
> **Scope:** 9 confirmed defects found during a deep audit, ordered by severity.
> Each entry gives the exact file, the root cause, the precise change to make,
> and how to verify the fix.
>
> **Repo facts you need:**
> - Monorepo managed by **pnpm 9** + **Turborepo**. Node >= 20.11.
> - Packages: `@hamafx/ai`, `@hamafx/data`, `@hamafx/db`, `@hamafx/indicators`,
>   `@hamafx/shared`, `@hamafx/config`; apps: `@hamafx/web`, `@hamafx/worker`.
> - **Two DB drivers**: production/Supabase uses **`postgres-js`**
>   (`packages/db/src/client.ts`); local dev + the test suite use **PGlite**
>   (`packages/db/src/pglite-client.ts`). This split is the root cause of two of
>   the most serious bugs — code is tested only on PGlite but runs on postgres-js
>   in production, and the two drivers return different shapes from
>   `db.execute()`.
> - Tests: **Vitest** per package. Run a single package with
>   `pnpm --filter @hamafx/<pkg> test -- --run`.

---

## ⚠️ Critical context: the `db.execute()` return-shape rule

You will touch this twice (Bug #1 and again when reasoning about Bug #2-adjacent
code), so internalize it once:

When you call `db.execute(sql\`...\`)` on a **raw SQL** query:

| Driver | Used in | `db.execute()` returns |
|--------|---------|------------------------|
| `postgres-js` | **production / Supabase** | a `Result` object that **`extends Array`** — the rows ARE the array. It has **no `.rows` property** (`result.rows === undefined`). Verified in `node_modules/.pnpm/postgres@3.4.9/.../cjs/src/result.js`: `module.exports = class Result extends Array`. |
| PGlite | **dev + tests** | an object shaped `{ rows: [...] }`. |

**The safe, driver-agnostic extraction pattern (use this everywhere):**

```ts
const list = Array.isArray(result)
  ? result
  : ((result as { rows?: unknown[] }).rows ?? []);
```

`packages/ai/src/cost.ts:130` already does this correctly. Other call sites
(`rag.ts`, `memory-index.ts`) use the equivalent `(result as any).rows ?? result`.
Only `rate-limit.ts` gets it wrong (Bug #1).

This rule does **not** apply to Drizzle's query-builder methods
(`db.select()...`, `db.insert()...`) — those always return a plain array. It only
applies to raw `db.execute()`.

---

# 🔴 CRITICAL BUGS

## Bug #1 — Per-user rate limiter is silently disabled in production

**File:** `packages/db/src/rate-limit.ts`
**Function:** `withRateLimit()`
**Impact:** The `ai_chat` rate limit (and any future limit using this helper)
**never triggers on the production database**. The `429 Too Many Requests` branch
in `apps/web/src/app/api/chat/route.ts` is dead code in prod. Abuse / cost-bomb
protection is effectively off. Passes all tests because tests run on PGlite.

### Root cause

The helper reads `.rows` unconditionally:

```ts
// CURRENT (buggy) — packages/db/src/rate-limit.ts
const rawRows = (rows as unknown as { rows?: Array<{ request_count: number }> }).rows ?? [];
const count = rawRows[0]?.request_count ?? 0;

return {
  allowed: count <= limit,   // count is 0 in prod → 0 <= 30 → always true
  count,
  limit,
};
```

On postgres-js, `rows` is an Array, so `rows.rows` is `undefined` → `rawRows = []`
→ `count = 0` → `allowed` is **always `true`**.

### Fix

Replace the extraction with the driver-agnostic pattern.

**Find:**

```ts
  // postgres-js / drizzle execute returns rows in `.rows` for tagged
  // templates (or under different keys depending on driver). Normalize.
  const rawRows = (rows as unknown as { rows?: Array<{ request_count: number }> }).rows ?? [];
  const count = rawRows[0]?.request_count ?? 0;
```

**Replace with:**

```ts
  // Driver-shape normalization: postgres-js (prod) returns a Result that
  // *extends Array* (no `.rows`); PGlite (dev/tests) returns `{ rows }`.
  // Read both shapes or the counter silently reads 0 in production and the
  // limit never fires. See cost.ts for the same pattern.
  const rawRows = (
    Array.isArray(rows) ? rows : ((rows as { rows?: Array<{ request_count: number }> }).rows ?? [])
  ) as Array<{ request_count: number }>;
  const count = Number(rawRows[0]?.request_count ?? 0);
```

> `Number(...)` guards against postgres-js returning `bigint`/string for integer
> columns under some configs; `request_count` compared with `<=` must be numeric.

### Add regression test (REQUIRED — this bug shipped because of zero coverage)

Create `packages/db/test/rate-limit.test.ts`. It must run against PGlite **and**
explicitly assert the array-shape branch so a postgres-js-style return can't
regress silently.

```ts
/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// NOTE: withRateLimit imports getDb() from './client' (postgres-js). To test it
// against PGlite without a live Postgres, this test exercises the row-shape
// normalization directly. If the project later adds a DI seam for the db client,
// switch to a full integration test that inserts into rate_limits.

// Minimal re-implementation guard: assert both driver shapes collapse to the
// same count. This locks the contract the production fix depends on.
function extractCount(rows: unknown): number {
  const list = (
    Array.isArray(rows) ? rows : ((rows as { rows?: Array<{ request_count: number }> }).rows ?? [])
  ) as Array<{ request_count: number }>;
  return Number(list[0]?.request_count ?? 0);
}

describe('rate-limit row-shape normalization', () => {
  it('reads postgres-js shape (Result extends Array)', () => {
    class Result extends Array {}
    const r = new Result();
    r.push({ request_count: 31 });
    expect(extractCount(r)).toBe(31);
  });

  it('reads PGlite shape ({ rows })', () => {
    expect(extractCount({ rows: [{ request_count: 5 }] })).toBe(5);
  });

  it('returns 0 for empty results of both shapes', () => {
    expect(extractCount([])).toBe(0);
    expect(extractCount({ rows: [] })).toBe(0);
  });
});
```

> **Stronger option (preferred if you can):** refactor `extractCount` into an
> exported helper in `packages/db/src/rate-limit.ts` (e.g.
> `export function rowsToArray(result: unknown): unknown[]`) and import it in
> both `withRateLimit` and the test, so the test covers the *actual* production
> code path rather than a copy. If you do this, also reuse `rowsToArray` to
> de-duplicate the same pattern in `cost.ts`.

### Verify

```bash
pnpm --filter @hamafx/db test -- --run
```

---

## Bug #2 — Daily AI budget overcharges ~10× (cost guardrail miscalibrated)

**File:** `packages/ai/src/cost.ts`
**Function:** `estimateCostUsd()` (the `RATES` lookup)
**Impact:** Default deployment uses **Vertex** model ids
(`google-vertex/gemini-2.5-flash`), but the `RATES` table is keyed by **gateway**
ids (`google/gemini-2.5-flash`). The lookup misses and falls through to
`FALLBACK_RATE = { inputPerM: 5, outputPerM: 15 }`, which is **~10× the real
Gemini Flash price**. `daily_ai_spend` inflates ~10×, so users hit
`BudgetExceededError` far below their real `MAX_DAILY_USD`.

Reproduction (verified):
```
estimateCostUsd('google-vertex/gemini-2.5-flash', 100000, 20000) = $0.80  (fallback)
estimateCostUsd('google/gemini-2.5-flash',        100000, 20000) = $0.08  (correct)
→ 10.0x overcharge
```

### Root cause

`agent.ts` passes the literal streamed `modelId` (Vertex-prefixed by default —
see `packages/shared/src/env.ts`: `AI_DEFAULT_MODEL` defaults to
`google-vertex/gemini-2.5-flash`, `AI_VISION_MODEL` to
`google-vertex/gemini-2.5-pro`) straight into `estimateCostUsd`. The `RATES`
table has no `google-vertex/*` keys.

### Fix

Normalize the model id before the rate lookup so a Vertex/gateway/bare id all map
to the same rate. Vertex and the AI Gateway bill the same underlying Google list
price, so collapsing the prefix is correct.

**Find:**

```ts
/** Estimate USD cost from token counts. Always >= 0. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATES[model] ?? FALLBACK_RATE;
  return (inputTokens / 1_000_000) * rate.inputPerM + (outputTokens / 1_000_000) * rate.outputPerM;
}
```

**Replace with:**

```ts
/**
 * Normalize a streamed model id to a `RATES` key. The agent persists the
 * literal id it streamed with — which is Vertex-prefixed by default
 * (`google-vertex/gemini-2.5-flash`) — but the RATES table is keyed by the
 * gateway form (`google/gemini-2.5-flash`). Vertex and the AI Gateway bill
 * the same Google list price, so we collapse the prefix. Bare ids (no slash,
 * BYOK Google) get the `google/` prefix added.
 */
function rateKeyForModel(model: string): string {
  if (model.startsWith('google-vertex/')) {
    return `google/${model.slice('google-vertex/'.length)}`;
  }
  // Bare Gemini id from BYOK google (e.g. 'gemini-2.5-flash').
  if (!model.includes('/') && model.startsWith('gemini-')) {
    return `google/${model}`;
  }
  return model;
}

/** Estimate USD cost from token counts. Always >= 0. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATES[rateKeyForModel(model)] ?? FALLBACK_RATE;
  return (inputTokens / 1_000_000) * rate.inputPerM + (outputTokens / 1_000_000) * rate.outputPerM;
}
```

> Do **not** simply add `google-vertex/*` duplicate keys to `RATES` — that leaves
> the bare-BYOK-Google case (`gemini-2.5-flash` with no prefix) still falling
> through. Normalizing is the durable fix. (For reference, `usage.ts` already has
> `canonicalizeProviderId()` that maps `google-vertex` → `vertex` and `''` →
> `google`; the cost layer just never got an equivalent.)

### Add regression tests

Edit `packages/ai/test/cost.test.ts`. The existing tests only cover `openai/*`
ids — that is exactly why this slipped through. Add cases for every prefix form:

```ts
  it('prices Vertex-prefixed Gemini at the same rate as the gateway id', () => {
    const vertex = estimateCostUsd('google-vertex/gemini-2.5-flash', 1_000_000, 1_000_000);
    const gateway = estimateCostUsd('google/gemini-2.5-flash', 1_000_000, 1_000_000);
    expect(vertex).toBeCloseTo(gateway, 6);
    // And explicitly NOT the $5/$15 fallback.
    expect(vertex).toBeLessThan(5);
  });

  it('prices bare BYOK Gemini id like the gateway id', () => {
    const bare = estimateCostUsd('gemini-2.5-pro', 1_000_000, 0);
    const gateway = estimateCostUsd('google/gemini-2.5-pro', 1_000_000, 0);
    expect(bare).toBeCloseTo(gateway, 6);
  });

  it('still falls back for genuinely unknown providers', () => {
    expect(estimateCostUsd('does-not-exist/x', 1_000_000, 1_000_000)).toBeCloseTo(20, 6);
  });
```

### Verify

```bash
pnpm --filter @hamafx/ai test -- --run
```

---

# 🟠 HIGH-SEVERITY BUGS

## Bug #3 — Citation enforcement silently ignores gold prices ≥ 5000

**File:** `packages/ai/src/verification/regex.ts`
**Const:** `PRICE_TOKEN`
**Impact:** The "never hallucinate prices" guardrail stops checking any gold price
of 5 digits (≥ 5000.00). The docstring **explicitly promises** to catch a
"black-swan spike" up to `4xxxx.xx`, but the regex only matches 4-digit values.
As gold approaches/exceeds 5000, real prices escape verification.

Reproduction (verified):
```
"gold at 12345.67"  -> null      (should match)
"spike to 41000.00" -> null      (the exact case the comment claims to cover)
"price 4999.99"     -> ['4999.99']
```

### Root cause

```ts
// gold band — only 4 digits before the decimal
String.raw`[1-4]\d{3}\.\d{1,2}` +
```

`[1-4]\d{3}` = exactly 4 digits (1000–4999). The comment says the band is
`1xxx.xx`–`4xxxx.xx`.

### Fix

Widen to 4 **or** 5 digits before the decimal.

**Find:**

```ts
export const PRICE_TOKEN = new RegExp(
  String.raw`(?<!\d\.)(?<!\d)\b(` +
    // gold band
    String.raw`[1-4]\d{3}\.\d{1,2}` +
    `|` +
    // FX bands
    String.raw`[01]\.\d{4,5}` +
    String.raw`)\b(?!\d)(?!\.\d)`,
  'g',
);
```

**Replace with:**

```ts
export const PRICE_TOKEN = new RegExp(
  String.raw`(?<!\d\.)(?<!\d)\b(` +
    // gold band: 1000.00 – 49999.99 (4–5 integer digits, covers a spike)
    String.raw`[1-4]\d{3,4}\.\d{1,2}` +
    `|` +
    // FX bands
    String.raw`[01]\.\d{4,5}` +
    String.raw`)\b(?!\d)(?!\.\d)`,
  'g',
);
```

> `[1-4]\d{3,4}` matches 1000.00–49999.99, matching the docstring's stated
> intent. This does **not** widen the FX band and keeps all existing boundary
> guards (`(?<!\d\.)`, `(?<!\d)`, `(?!\d)`, `(?!\.\d)`) so dotted timestamps and
> version strings still don't match.

### Add/extend test

Find the verification precision test (`packages/ai/test/verification-precision.test.ts`)
and add assertions:

```ts
  it('matches 5-digit gold prices (>= 5000)', () => {
    PRICE_TOKEN.lastIndex = 0;
    expect('gold spiked to 41000.00 today'.match(PRICE_TOKEN)).toContain('41000.00');
    PRICE_TOKEN.lastIndex = 0;
    expect('printed 12345.67'.match(PRICE_TOKEN)).toContain('12345.67');
  });

  it('still rejects version strings and timestamps', () => {
    PRICE_TOKEN.lastIndex = 0;
    expect('version 1.0.0 released on 2026.05.27'.match(PRICE_TOKEN)).toBeNull();
  });
```

(Import `PRICE_TOKEN` from `../src/verification/regex` if not already imported.)

### Verify

```bash
pnpm --filter @hamafx/ai test -- --run
```

---

## Bug #4 — Lint fails on a clean checkout (CI is red)

**File:** `packages/db/test/migration-0013-chat-model.test.ts`
**Impact:** `pnpm turbo run lint` exits 1, so the CI `lint-and-typecheck` job
fails on every PR. Two ESLint errors:

```
60:9   error  'trimmed' is never reassigned. Use 'const' instead       prefer-const
67:16  error  'applyUpTo' is defined but never used                    @typescript-eslint/no-unused-vars
```

### Fix 4a — `prefer-const`

In the `applyOne` function:

**Find:**

```ts
    let trimmed = stripComments(stmt.trim());
```

**Replace with:**

```ts
    const trimmed = stripComments(stmt.trim());
```

### Fix 4b — unused `applyUpTo`

The helper `applyUpTo(db, untilTag)` is defined but never called. Choose ONE:

- **Preferred — delete it.** Remove the entire `async function applyUpTo(...) { ... }`
  block (it starts at the `async function applyUpTo(` line and ends at its closing
  brace). Dead code in a test file adds nothing.
- **If you suspect it's meant to be used:** rename to `_applyUpTo` (the ESLint
  config allows unused names matching `/^_/u`) — but only do this if you cannot
  confirm it's safe to delete. Deleting is cleaner.

### Verify

```bash
pnpm --filter @hamafx/db lint
# then the full gate:
pnpm turbo run lint
```

Both must exit 0.

---

# 🟡 MEDIUM-SEVERITY BUGS (correctness, dead code, hygiene)

## Bug #5 — Rate-limiter `windowMs` parameter is a no-op (misleading API)

**File:** `packages/db/src/rate-limit.ts`
**Impact:** The function signature and a comment advertise a configurable window,
but both branches of the ternary are identical, so any `windowMs` other than
60000 is silently treated as 1 minute. A caller passing `windowMs: 300_000`
(5 min) gets a 1-minute window with no error.

### Root cause

```ts
const bucket =
  windowMs === 60_000
    ? sql`date_trunc('minute', now())`
    : sql`date_trunc('minute', now())`;   // identical branches
```

### Fix (choose ONE)

**Option A — Honest minimal fix (recommended).** Remove the dead parameter and
the misleading branch. The `rate_limits` table PK is minute-aligned, so a true
sub-minute or multi-minute window needs schema work that is out of scope.

1. Change the signature:
   ```ts
   export async function withRateLimit(
     userId: string,
     endpointGroup: string,
     limit: number,
   ): Promise<RateLimitResult> {
   ```
2. Replace the ternary with a single statement and an accurate comment:
   ```ts
   // Fixed 1-minute window — the rate_limits PK is keyed on a minute-aligned
   // window_start. Longer/shorter windows require a schema change.
   const bucket = sql`date_trunc('minute', now())`;
   ```
3. Update any callers that pass a 4th arg. Check with:
   ```bash
   grep -rn "withRateLimit(" packages apps --include='*.ts' | grep -v node_modules
   ```
   (Currently the only production caller is `apps/web/src/app/api/chat/route.ts`,
   which calls `withRateLimit(user.userId, 'ai_chat', CHAT_RATE_LIMIT)` — 3 args,
   so no caller change is needed.)

**Option B — Actually implement it.** Only if a configurable window is genuinely
required: switch the bucket to `to_timestamp(floor(extract(epoch from now()) / (${windowMs}/1000)) * (${windowMs}/1000))`
and confirm the `rate_limits` PK/index supports arbitrary `window_start` values.
This is more invasive and needs a migration review — prefer Option A unless asked.

### Verify

```bash
pnpm --filter @hamafx/db typecheck && pnpm --filter @hamafx/web typecheck
```

---

## Bug #6 — README advertises "32 tools" but there are 30

**Files:** `README.md` (badge + "AI Agent — 32 Tools" heading + per-category
table) and `docs/03-ai-agent.md` (references "32 tools").
**Impact:** Documentation inaccuracy. Actual count verified two ways: 30 tool
files in `packages/ai/src/tools/` (excluding `index.ts` and `with-telemetry.ts`)
and **30 registered keys** in `packages/ai/src/tools/index.ts`.

### Fix

1. Recount authoritatively (the registry is the source of truth):
   ```bash
   grep -oE "^\s+[a-z_]+:" packages/ai/src/tools/index.ts | wc -l   # -> 30
   ```
2. In `README.md`:
   - Badge: `ai%20tools-32` → `ai%20tools-30`.
   - Heading: `## 🤖 AI Agent — 32 Tools` → `## 🤖 AI Agent — 30 Tools`.
   - Verify the per-category tool table sums to the same number you set.
3. In `docs/03-ai-agent.md`: replace "32 tools" wording with "30 tools".
4. Grep for any other stragglers and fix them too:
   ```bash
   grep -rn "32 tools\|32 Tools\|ai tools-32\|ai%20tools-32" README.md docs
   ```

> If the project would rather *keep* the number at 32, the alternative is to add
> the 2 missing tools — but that is a feature, not a fix. Default to correcting
> the docs.

---

## Bug #7 — `failover.ts` header comment describes throttle behavior that doesn't exist

**File:** `packages/data/src/failover.ts` (module header comment, point 6)
**Impact:** Doc/code drift that will mislead maintainers. The header states:

> *6. PROVIDER_QUOTA_EXCEEDED also nudges the adaptive throttle so the next
> reservation against this provider sees a tighter cap.*

There is **no throttle call** in `runWithFailover` — it only calls
`recordFailure(a.name)`. The inline comment near the quota branch
("Quota errors are sticky") also implies an action that never happens.

### Fix (choose ONE)

**Option A — Make the comment match the code (recommended, low risk).** Edit the
header to describe what the function actually does.

Replace header point 6:
```
//   6. PROVIDER_QUOTA_EXCEEDED also nudges the adaptive throttle so the
//      next reservation against this provider sees a tighter cap.
```
with:
```
//   6. On PROVIDER_QUOTA_EXCEEDED we still try the next provider (it may be
//      on a different quota) and re-throw the quota error preferentially
//      (see rankProviderError) because it's the most actionable signal.
//      NOTE: this runner does not itself touch the adaptive throttle —
//      throttle reservations live in packages/data/src/cache/throttle.ts and
//      are applied at the adapter layer, not here.
```
Also fix the inline comment near the end of the loop:
```ts
// Quota errors are sticky — but we still try the next provider since
// the next one may be on a different quota.
```
→ keep the second sentence; drop "are sticky" unless you implement stickiness.

**Option B — Implement the promised behavior.** Only if product wants it: import
the throttle helper from `packages/data/src/cache/throttle.ts` and call it in the
`catch` when `err.code === 'PROVIDER_QUOTA_EXCEEDED'`. Verify the throttle module
exposes a "tighten cap for provider" function first; if not, this is a feature.
Prefer Option A.

### Verify

```bash
pnpm --filter @hamafx/data test -- --run
```

---

## Bug #8 — Build/test artifacts committed to the repo

**Tracked files that should not be:**
- `apps/web/playwright.pid`
- `apps/web/playwright-report/index.html` (and the rest of `apps/web/playwright-report/`)

Neither is matched by any `.gitignore`.

### Fix

1. Untrack the files (keep working copies, just stop tracking):
   ```bash
   git rm --cached apps/web/playwright.pid
   git rm -r --cached apps/web/playwright-report
   ```
2. Add ignore rules. Append to `apps/web/.gitignore`:
   ```
   # Playwright run artifacts
   playwright.pid
   playwright-report/
   test-results/
   ```
3. Confirm they're now ignored:
   ```bash
   git status --porcelain | grep -i playwright   # should show only the deletions
   git check-ignore apps/web/playwright.pid apps/web/playwright-report/index.html
   ```

---

## Bug #9 — README "Native" quickstart has a broken shell command

**File:** `README.md` (the "Native — zero setup" code block)
**Impact:** Copy-pasting the command does **not** write `.env.local`; the unclosed
single quote drops the shell into a `>` continuation prompt and swallows the
redirection as literal text.

### Root cause

```bash
echo 'GOOGLE_GENERATIVE_AI_API_KEY=*** >> .env.local
```
The opening `'` is never closed, and the placeholder `***` would also be glob/
shell-expanded.

### Fix

**Find:**
```bash
echo 'GOOGLE_GENERATIVE_AI_API_KEY=*** >> .env.local
```
**Replace with:**
```bash
echo 'GOOGLE_GENERATIVE_AI_API_KEY=your-key-here' >> .env.local
```

> Quote closed; `***` replaced with a literal placeholder so it isn't expanded.

---

# ✅ Final verification checklist

Run from the repo root after all fixes. Each must pass.

```bash
# 1. Lint must be clean (Bug #4)
pnpm turbo run lint

# 2. Typecheck (Bug #5 signature change, etc.)
#    NOTE: @hamafx/web typecheck is memory-hungry; run packages individually if
#    a constrained environment OOM-kills it (exit 137 is OOM, not a type error).
pnpm --filter @hamafx/db typecheck
pnpm --filter @hamafx/ai typecheck
pnpm --filter @hamafx/data typecheck
pnpm --filter @hamafx/shared typecheck
pnpm --filter @hamafx/indicators typecheck

# 3. Tests (Bugs #1, #2, #3 add coverage)
pnpm --filter @hamafx/db test -- --run
pnpm --filter @hamafx/ai test -- --run
pnpm --filter @hamafx/data test -- --run

# 4. Full suite (optional; some web tests time out under heavy parallelism in
#    constrained sandboxes — run the failing file in isolation to confirm it's
#    an env timeout, not a real failure)
pnpm turbo run test -- --run
```

### Per-bug acceptance criteria

| Bug | Done when |
|-----|-----------|
| #1 | `withRateLimit` reads both array and `{rows}` shapes; new `rate-limit.test.ts` passes; count is numeric. |
| #2 | `estimateCostUsd('google-vertex/gemini-2.5-flash', …)` equals the `google/gemini-2.5-flash` cost (not the $5/$15 fallback); new cost tests pass. |
| #3 | `PRICE_TOKEN` matches `41000.00` and `12345.67`; still rejects `1.0.0` and `2026.05.27`. |
| #4 | `pnpm turbo run lint` exits 0. |
| #5 | No dead/identical ternary; `windowMs` either removed or implemented; all callers compile. |
| #6 | README badge, heading, and docs all state the real tool count (30) and agree with `tools/index.ts`. |
| #7 | `failover.ts` header matches the actual code behavior. |
| #8 | `git ls-files` no longer lists `playwright.pid` or `playwright-report/`; both are git-ignored. |
| #9 | README native command is a valid, closed-quote `echo … >> .env.local`. |

---

# Suggested commit grouping

Keep changes reviewable by grouping into focused commits:

1. `fix(db): rate limiter reads both driver row shapes (prod limit was disabled)` — Bug #1 + test
2. `fix(ai): normalize vertex/bare model ids in cost lookup (~10x overcharge)` — Bug #2 + tests
3. `fix(ai): widen PRICE_TOKEN gold band to 5 digits` — Bug #3 + test
4. `chore(db): fix lint errors in migration-0013 test` — Bug #4
5. `refactor(db): drop no-op windowMs param from withRateLimit` — Bug #5
6. `docs: correct tool count, failover comment, README native command` — Bugs #6, #7, #9
7. `chore: untrack playwright artifacts` — Bug #8

---

## Priority rationale (if you can only do a few)

Do **#1 and #2 first.** Together they mean both core safety guardrails — abuse
rate-limiting and the cost ceiling — are miscalibrated in production while looking
green in the test suite, because the suite runs on PGlite and production runs on
postgres-js with Vertex model ids. **#4** is next because CI is currently red.
Everything else is correctness/hygiene.
