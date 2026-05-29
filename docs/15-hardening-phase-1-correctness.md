# Hardening Phase 1 — Correctness & Security

> **Theme:** Things that produce **wrong behavior, wrong data, or weakened security** today. Most of this is one-or-two-line fixes. Ship this first.

## Goal

Eliminate every issue where the system silently produces an incorrect result, double-writes user data, leaks payload bounds, or weakens an existing security primitive. After this phase the system is **boring and predictable**: features either work or fail loudly.

## Scope

- 12 issues, all bug-class.
- No architectural moves. No new abstractions.
- No breaking API changes (but auth cookies will rotate once — see §1).

## Out of scope

- Reliability/concurrency work → Phase 2.
- Performance, UX polish, observability cleanup → Phase 3.

## Pre-requisites

- Run `pnpm turbo run typecheck && pnpm turbo run test` clean before starting.
- Snapshot Supabase before running migration in §7.
- Be ready to bump `AUTH_COOKIE_SECRET` (§1) — every active session is invalidated on deploy.

## Sequencing

```
§1  Auth cookie encoder        (lands first; isolated)
§2  Auto-journal double-save
§3  lastClosedBar off-by-one
§4  indicatorCross semantics
§5  journalShortcut ambiguity
§6  parseJsonBody payload cap
§7  Daily-budget race
§8  Memory upsert atomicity
§9  Persistence transactionality
§10 Briefings empty-summary marking
§11 parseIndicatorSpec validation
§12 Composer maxLength strict
```

§1 is independent. §2-§6 can land in any order. §7-§9 share the persistence layer and should land in one PR. §10-§12 are leaf-level cleanups.

## Estimated effort

- 1 senior engineer · 3-4 working days end to end.
- Total LOC change: < 600 across ~25 files.

---

## Issues

### 1. Auth cookie base64url encoder is wrong

**Severity:** Critical  
**Reference:** Review §1  
**Files:** `apps/web/src/lib/auth.ts`

#### Problem

`bytesToBase64Url` does `replaceAll('+', '-')` then `replaceAll('_', '/')`. `btoa` never emits `_`, so the second substitution is a no-op. Tokens contain raw `/` characters in payload + signature. The companion decoder mirrors the bug, so round-trip works — but tokens are not URL-safe and any external consumer (curl logs, analytics, future Authorization header reuse) sees malformed base64url.

#### Fix

```ts
// apps/web/src/lib/auth.ts:43
function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

// apps/web/src/lib/auth.ts:48 — verify the inverse is symmetric
function base64UrlToBytes(s: string): Bytes {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replaceAll('-', '+').replaceAll('_', '/');
  // ...
}
```

#### Acceptance criteria

- Existing unit tests in `apps/web/test/auth.test.ts` (add if missing) round-trip a 256-byte payload with `+`, `/`, `_`, `-` characters.
- New property test: 100 random byte sequences encode-then-decode to themselves.
- Production deploy invalidates all existing sessions on first hit (expected — document in PR description).

#### Tests

- Add `apps/web/test/auth.test.ts`:
  - `signAuthToken → verifyAuthToken` round-trip with arbitrary `iat/exp`.
  - Decoding a token signed with the **buggy** encoder must FAIL after the fix (proves the format actually changed).
  - Tokens contain only `[A-Za-z0-9_-]` (regex assertion).

#### Risk / rollback

- Risk: low. Worst case, every user (= you) re-logs in.
- Rollback: revert single commit + bump `AUTH_COOKIE_SECRET` back to original value.

---

### 2. Auto-journal double-saves trades

**Severity:** Critical  
**Reference:** Review §2  
**Files:** `apps/web/src/app/api/chat/route.ts`, `packages/ai/src/journal/auto-parse.ts`, `packages/ai/src/tools/log-journal.ts`

#### Problem

The chat route parses `Journal: …` shortcuts and calls `createEntry` server-side. The same user message is then forwarded to the model verbatim. The model has a `log_journal` tool, sees the trade language, and calls it — creating a duplicate row.

#### Fix

Pick one path. **Recommended:** drop the regex parser entirely.

```ts
// apps/web/src/app/api/chat/route.ts
// REMOVE the `maybeAutoJournal` block.
```

If keeping the parser (e.g. for offline/no-budget guarantees):

1. After saving the entry, prepend a system-role message to the thread before streaming:

```ts
if (parsed) {
  const entry = await createEntry({ ... });
  await appendSystemMessage(threadId, {
    role: 'system',
    content: `Auto-journal saved entry ${entry.id}: ${describeShortcut(parsed)}. Confirm to user; do NOT call log_journal.`,
  });
}
```

2. Strengthen the system prompt to forbid `log_journal` calls when an `Auto-journal saved entry` system note is present in the recent history.

#### Acceptance criteria

- Send `Journal: long XAUUSD @ 2400 SL 2390 TP 2420` from a fresh thread.
- Exactly **one** row appears in `journal_entries`.
- The assistant confirms the saved entry in chat.

#### Tests

- `packages/ai/test/auto-journal.test.ts`: assert `parseJournalShortcut` outputs match expected DTOs across 10 fuzz inputs.
- Integration test in `apps/web/test/api-chat.test.ts` (add): mock the AI gateway; assert `journal_entries.length === 1` after one shortcut request.

#### Risk / rollback

- Risk: low. The recommended path is removal of dead code.
- Rollback: re-add `maybeAutoJournal` if a workflow regresses.

---

### 3. `lastClosedBar` is off by one timeframe

**Severity:** High  
**Reference:** Review §10  
**Files:** `packages/ai/src/alerts/evaluator.ts`

#### Problem

```ts
const cutoff = Date.now() - tfMs(tf);
for (let i = candles.length - 1; i >= 0; i -= 1) {
  if (candles[i].t <= cutoff) return candles[i];
}
```

Returns the last bar that **opened** ≥ 1 tf ago, but that bar is still in progress. For 1h, alerts compare against a bar from ~2h ago instead of the most recently closed one.

#### Fix

```ts
function lastClosedBar(candles: Candle[], tf: Timeframe): Candle | null {
  const tfDur = tfMs(tf);
  const now = Date.now();
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const bar = candles[i]!;
    // Bar is closed iff its open + duration is in the past.
    if (bar.t + tfDur <= now) return bar;
  }
  return null;
}
```

#### Acceptance criteria

- Given a 1h timeframe and candles at `t=00:00, 01:00, 02:00, 03:00` with `now=03:30`, the function returns the `02:00` bar (closed at `03:00`), **not** `01:00`.
- Add fixture-based unit test covering 1m / 1h / 1d / 1w boundaries.

#### Tests

- `packages/ai/test/alerts/last-closed-bar.test.ts` with parameterized cases.

#### Risk / rollback

- Risk: alerts may fire on a different bar than they used to. Document in PR; the new behavior matches the **intended** semantics.
- Rollback: trivial revert.

---

### 4. `indicatorCross` alerts don't detect actual crosses

**Severity:** High  
**Reference:** Review §11  
**Files:** `packages/ai/src/alerts/evaluator.ts`, `packages/shared/src/schemas/alerts.ts`

#### Problem

Current implementation reads the latest indicator value and compares against `level`. With one-shot semantics, an `RSI > 70` alert fires immediately if RSI is already 75 when the alert is created — confusing the user who expected a crossing event.

#### Fix

Two paths; pick by user intent.

**Path A — rename to `indicatorLevel` (simplest, accepts current behavior):**

1. Add `indicatorLevel` to `AlertRuleSchema` (preferred name).
2. Keep `indicatorCross` as a deprecated alias for one release; emit a warning when read.
3. Update UI labels in `apps/web/src/app/(app)/alerts/_components/`.

**Path B — actual crossing semantics:**

1. Extend the rule shape to carry `previousValue: number | null`.
2. On each cron tick, read both `previous` (from row) and `current` (from indicator). A crossing occurred when `(prev < level AND curr >= level)` (above) or `(prev > level AND curr <= level)` (below).
3. After a non-firing tick, write `previousValue = current` so the next tick has the right anchor.

Recommended: **Path B**. Higher work but matches user intuition.

#### Acceptance criteria

- Path B: create an alert when RSI is already 75 with rule `above 70`. Alert does **not** fire on first tick. After RSI drops to 60 then rises back to 71, alert fires once.

#### Tests

- `packages/ai/test/alerts/cross-detection.test.ts`: parameterized over above/below × already-met/not-yet × dropping/rising.

#### Risk / rollback

- Path B requires a small migration to add `previous_value` (nullable) to whatever stores rule state. If we don't want to widen the rule shape, store it on a sibling `alert_state` table. Lower migration risk.
- Rollback: revert evaluator + restore previous one-shot logic.

---

### 5. `parseJournalShortcut` ambiguity returns null silently

**Severity:** Medium  
**Reference:** Review §19  
**Files:** `packages/ai/src/journal/auto-parse.ts`

> Becomes irrelevant if §2 deletes the parser. Skip if so.

#### Problem

When both `bought` and `sold` match, the parser returns `null`. The user message stays in chat, no entry is saved, no error is shown.

#### Fix

When both verbs match, prefer the **first verb** in the message as authoritative.

```ts
const longIdx = body.search(SIDE_LONG_RE);
const shortIdx = body.search(SIDE_SHORT_RE);
const isLong = longIdx >= 0 && (shortIdx < 0 || longIdx < shortIdx);
const isShort = !isLong && shortIdx >= 0;
if (!isLong && !isShort) return null;
const side: TradeSide = isLong ? 'long' : 'short';
```

#### Acceptance criteria

- "Bought XAU at 2400 then sold half" parses as **long** at 2400.
- "Sold XAU at 2400 then bought back" parses as **short** at 2400.

#### Tests

- Extend existing parser tests with the both-verbs cases.

#### Risk / rollback

- Risk: minimal. New behavior never produces a worse result than the old one (which produced no entry at all).

---

### 6. `parseJsonBody` has no payload size cap

**Severity:** High  
**Reference:** Review §14  
**Files:** `apps/web/src/lib/api.ts`, `apps/web/src/app/api/chat/route.ts`

#### Problem

`req.json()` reads the entire body into memory before zod sees it. The composer can attach 4 × 5 MB images as base64 data URLs (~27 MB inflated). Vercel's body limit is 4.5 MB; requests fail late with cryptic errors. Worse, on a self-hosted Node runtime there is no early bound.

#### Fix

```ts
// apps/web/src/lib/api.ts
const MAX_BODY_BYTES = 6 * 1024 * 1024; // 6 MB hard cap

export async function parseJsonBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  const lenHeader = req.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    throw validationError(`Payload too large (max ${MAX_BODY_BYTES} bytes)`);
  }
  const raw: unknown = await req.json();
  return schema.parse(raw) as z.infer<S>;
}
```

For the chat route specifically: also reject when the deserialized body's parts total exceeds 4 MB (after base64 decode estimate).

#### Acceptance criteria

- POST `/api/chat` with a 7 MB body → 400 with `code: VALIDATION`, `message: 'Payload too large …'`.
- POST `/api/journal` with valid 100-byte body → 201.

#### Tests

- Add `apps/web/test/api-payload-size.test.ts`.

#### Risk / rollback

- Risk: low. Choose a cap higher than any legitimate request.

---

### 7. Daily AI budget guard is racy

**Severity:** High  
**Reference:** Review §5  
**Files:** `packages/ai/src/cost.ts`, new migration in `packages/db/drizzle/`, `packages/ai/src/agent.ts`

#### Problem

`enforceDailyBudget` reads `SUM(est_cost_usd)` then decides. Two concurrent requests both pass at 99% of budget; you spend 198%. Plus every chat turn pays a SUM round-trip.

#### Fix

Replace the read-then-decide pattern with an atomic counter:

1. **New table:** `daily_ai_spend(day DATE PRIMARY KEY, total_usd_cents BIGINT NOT NULL DEFAULT 0)`.
2. **Migration:** add the table; populate today's row on first chat turn.
3. **New helper:** `tryReserveBudget(estimatedCents: number, capCents: number): Promise<{ ok: true } | { ok: false; spent: number }>`.
   - One UPDATE: `UPDATE daily_ai_spend SET total_usd_cents = total_usd_cents + $1 WHERE day = today AND total_usd_cents + $1 <= $2 RETURNING total_usd_cents`.
   - If 0 rows updated → over budget; do not run the model.
   - If 1 row updated → reservation succeeded.
4. **Reconciliation:** `recordTelemetry` now writes the **delta** between estimated and actual cost (positive = correct underestimate, negative = correct overestimate).

```ts
// packages/ai/src/cost.ts
export async function tryReserveBudget(estimatedUsd: number, capUsd: number) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const estCents = Math.ceil(estimatedUsd * 100);
  const capCents = Math.ceil(capUsd * 100);
  // ON CONFLICT DO UPDATE WHERE pre-cap; CTE for atomicity.
  const row = await getDb().execute(sql`
    INSERT INTO daily_ai_spend (day, total_usd_cents)
    VALUES (${dayKey}, ${estCents})
    ON CONFLICT (day) DO UPDATE
      SET total_usd_cents = daily_ai_spend.total_usd_cents + ${estCents}
      WHERE daily_ai_spend.total_usd_cents + ${estCents} <= ${capCents}
    RETURNING total_usd_cents
  `);
  if (row.length === 0) {
    const current = await dailySpendUsd();
    return { ok: false as const, spent: current };
  }
  return { ok: true as const, spent: Number(row[0].total_usd_cents) / 100 };
}
```

5. Replace `enforceDailyBudget(env.MAX_DAILY_USD)` in `runChat` with `tryReserveBudget(estimatedTurnCostUsd, env.MAX_DAILY_USD)`. Estimate `0.01` USD per turn as a starting point.

#### Acceptance criteria

- 100 concurrent chat requests at 99% of cap result in **at most one** request being allowed.
- `dailySpendUsd()` returns the same number as the new counter at any time (acts as audit).

#### Tests

- `packages/ai/test/budget-race.test.ts`: spawn 50 parallel `tryReserveBudget` calls; assert sum of approved `estimatedUsd` ≤ cap.

#### Risk / rollback

- Risk: medium. New table + atomic UPDATE pattern. Test against staging Supabase first.
- Rollback: keep both code paths behind a feature flag (`USE_ATOMIC_BUDGET=1`) for one week.

---

### 8. `memory_embeddings` upsert is not atomic

**Severity:** Medium  
**Reference:** Review §22  
**Files:** `packages/ai/src/memory/memory-index.ts`

#### Problem

```ts
await db.delete(memoryEmbeddings).where(...);
await db.insert(memoryEmbeddings).values({...});
```

Crash between the two leaves the row missing forever. Subsequent searches silently miss this journal entry.

#### Fix

Use `INSERT … ON CONFLICT DO UPDATE` with the existing `(kind, sourceId)` uniqueness constraint:

```sql
-- migration
ALTER TABLE memory_embeddings
  ADD CONSTRAINT memory_embeddings_kind_source_uk UNIQUE (kind, source_id);
```

```ts
// memory-index.ts
await db
  .insert(schema.memoryEmbeddings)
  .values({ kind, sourceId, symbol, text, model, embedding, meta, occurredAt })
  .onConflictDoUpdate({
    target: [schema.memoryEmbeddings.kind, schema.memoryEmbeddings.sourceId],
    set: {
      text: sql`excluded.text`,
      symbol: sql`excluded.symbol`,
      model: sql`excluded.model`,
      embedding: sql`excluded.embedding`,
      meta: sql`excluded.meta`,
      occurredAt: sql`excluded.occurred_at`,
      // createdAt stays at original insert time
    },
  });
```

#### Acceptance criteria

- Re-embedding the same journal entry twice yields exactly one row.
- Concurrent re-embeddings of the same entry don't error (no PK collision).

#### Tests

- `packages/ai/test/memory-upsert.test.ts`.

#### Risk / rollback

- Risk: requires migration. Run `pnpm --filter db migrate:apply` against staging first.

---

### 9. Multi-statement persistence pairs are not transactional

**Severity:** Medium  
**Reference:** Review §20  
**Files:** `packages/ai/src/persistence.ts`, `packages/ai/src/briefings/persistence.ts`, `packages/ai/src/journal/persistence.ts`

#### Problem

`appendUserMessage` does INSERT then UPDATE. A connection failure in between leaves the message persisted but the thread's `updated_at` un-bumped. Sidebar sort breaks. Same pattern in several other helpers.

#### Fix

Wrap each multi-statement write in a transaction:

```ts
export async function appendUserMessage(threadId: string, message: UIMessage): Promise<void> {
  const text = extractText(message);
  await getDb().transaction(async (tx) => {
    await tx.insert(schema.chatMessages).values({
      threadId,
      role: 'user',
      content: text,
      parts: message.parts ?? null,
    });
    await tx
      .update(schema.chatThreads)
      .set({ updatedAt: new Date() })
      .where(eq(schema.chatThreads.id, threadId));
  });
}
```

Audit and convert: `appendUserMessage`, `appendAssistantMessage`, `recordTelemetry+messageId`, `createSnapshot+expiry`, `recordEmitted+message`.

#### Acceptance criteria

- All `INSERT + UPDATE` and `INSERT + INSERT` pairs in `packages/ai/` use `db.transaction`.
- `pnpm --filter ai test` passes.

#### Tests

- Existing tests should keep passing. Add one test that simulates a tx failure (mock the second statement) and asserts the first is rolled back.

#### Risk / rollback

- Risk: minimal. `postgres-js` driver supports transactions natively.

---

### 10. Briefings job marks `(eventId, kind)` fired even on empty LLM output

**Severity:** Medium  
**Reference:** Review §34  
**Files:** `packages/ai/src/briefings/generate.ts`

#### Problem

If `generateText` returns empty AND deterministic fallback is also a stub, the briefing is persisted and `recordEmitted` is called. PK then prevents retry forever.

#### Fix

```ts
const summary = await composeEventSummary(event, kind, env);
if (summary.trim().length < 50) {
  // Don't burn the (eventId, kind) idempotency slot on a stub.
  return { emitted: false, reason: 'summary_too_short' };
}
// ... appendAssistantMessage + recordEmitted
```

Apply the same guard to `emitWeeklyReview`.

#### Acceptance criteria

- A pre-event briefing with a stubbed LLM and `event.actual === null` does not write `briefings_emitted`. Next 5-min cron tick retries.
- After three failed attempts, optionally promote to a `dlq_briefings_emitted` table to avoid infinite retries (Phase 2 if needed).

#### Tests

- `packages/ai/test/briefings-empty.test.ts`.

#### Risk / rollback

- Risk: low. The retry path is bounded by event-time windows.

---

### 11. `parseIndicatorSpec` silently accepts malformed strings

**Severity:** Low  
**Reference:** Review §54  
**Files:** `packages/ai/src/alerts/evaluator.ts`, `packages/shared/src/schemas/alerts.ts`

#### Problem

`"rsi:14:bogus"` parses as `rsi(14)` with the rest discarded. The user's intent was something else; the alert silently behaves differently.

#### Fix

Validate strictly:

```ts
const SPEC_RE = /^(sma|ema|rsi|atr|macd|bollinger|pivots)(?::([0-9]+(?:,[0-9]+){0,2}))?$/i;
function parseIndicatorSpec(spec: string) {
  const m = SPEC_RE.exec(spec.toLowerCase());
  if (!m) return null;
  // ... existing param parsing
}
```

Tighten the schema in `AlertRuleSchema.indicator` to match the regex.

#### Acceptance criteria

- `"rsi:14"` parses successfully.
- `"rsi:14:bogus"` fails zod validation at API boundary (400) and at the model tool boundary.
- Alerts with invalid specs in the DB never reach the evaluator (filtered at load).

#### Tests

- `packages/ai/test/parse-indicator-spec.test.ts`.

#### Risk / rollback

- Risk: low. Existing alerts may be invalidated; run a one-time data audit before deploying.

---

### 12. Composer `maxLength` allows overflow

**Severity:** Low  
**Reference:** Review §55  
**Files:** `apps/web/src/components/chat/composer.tsx`

#### Problem

`maxLength={MAX_TEXT_CHARS + 100}` is a paste fail-safe but users can sit at 8001-8100 chars indefinitely. The send button disables but the soft-limit display shows red, leading to the user thinking they hit a hard cap when they're actually past it.

#### Fix

Strict `maxLength={MAX_TEXT_CHARS}` and clamp paste in `onPaste`:

```tsx
<textarea
  maxLength={MAX_TEXT_CHARS}
  onPaste={handlePaste}
  // ...
/>

function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
  // existing image handling first...
  const t = e.clipboardData?.getData('text');
  if (t && (value.length + t.length) > MAX_TEXT_CHARS) {
    e.preventDefault();
    setValue((value + t).slice(0, MAX_TEXT_CHARS));
  }
}
```

#### Acceptance criteria

- Cannot type or paste past `MAX_TEXT_CHARS`.
- Counter shows `8000/8000` exactly at the cap.

#### Tests

- Manual smoke: paste a 10k-char string into the composer.

#### Risk / rollback

- Risk: minimal.

---

## Verification plan (whole phase)

1. `pnpm turbo run typecheck` clean.
2. `pnpm turbo run test` clean — all tests added in this phase pass.
3. Run the eval suite: `pnpm --filter ai eval -- --cases`.
4. Smoke deploy to a Vercel preview.
5. Manual checklist:
   - Log out + log in (cookies §1).
   - `Journal: long XAU @ 2400 SL 2390 TP 2420` from a fresh thread (§2).
   - Set a candleClose alert at a level just below current price; wait one tf; expect fire (§3).
   - Set an indicatorLevel/indicatorCross alert; verify semantics (§4).
   - Paste 10 MB image; expect 400 (§6).
   - Run 50 chat turns concurrently in a script; check `daily_ai_spend.total_usd_cents` matches `SUM(est_cost_usd) * 100` to within 1% (§7).

## Rollout

- One PR per logical group: `(§1)`, `(§2,§5)`, `(§3,§4,§11)`, `(§6)`, `(§7,§8,§9)`, `(§10)`, `(§12)`.
- Each PR includes: tests, migration (where applicable), rollback plan in description.
- Deploy off-hours when possible.
- After §1 ships: post a single Telegram alert "Sessions invalidated; please re-login".

## Definition of done

- [ ] All 12 issues' acceptance criteria pass.
- [ ] `docs/14-ai-agent-handoff.md` updated to reference the new patterns (atomic budget, transactional persistence).
- [ ] One run of the manual checklist passes against a Vercel preview.
- [ ] Production deploy is green for 24 h with no Sentry regression.
