# Plan 04 — Decompose `runChatInner` (Surgically)

**Covers finding:** SRP-1 (see `docs/audit/solid-findings.md`).
**Package:** `packages/ai` (`src/agent.ts`).
**Est. blast radius:** `agent.ts` internals only. **No** change to `runChat`'s
signature, streaming output, or telemetry.

> ⚠️ **This is the highest-risk plan.** `runChatInner` is the product's hottest
> path. The goal is to extract **two** well-bounded collaborators, not to shatter
> the function. Over-extraction here trades a readable god-function for an
> indirection maze — explicitly out of scope.

---

## 1. The problem (with citations)

`packages/ai/src/agent.ts:132-776` — `runChatInner` is a single ~640-line function
owning at least eight responsibilities with shared mutable locals
(`attempts`, `lastError`, `currentModelOverride`, `nonEssentialDisabled`,
`checkedProviders`, declared around `agent.ts:256-268`):

1. Budget reservation (`tryReserveBudget`, `agent.ts:163-171`).
2. User settings load + display-name derivation (`:139-157`).
3. User-message persistence (`:172`).
4. History + snapshot load (`:175-181`).
5. Rolling-summary compaction (`:184-199`).
6. System-message filtering + `UIMessage`→`ModelMessage` conversion (`:201-230`).
7. Model routing + BYOK decryption (`:231-253`).
8. A 5-attempt **retry/fallback loop** with per-provider budget-alert checks,
   streaming, and end-of-turn **budget reconciliation** (`:256-776`).

Responsibilities 1+8 (budget reserve/reconcile) and the retry loop (8) are the
two coherent, testable seams worth extracting. The rest is legitimately linear
"turn setup" prose.

---

## 2. Target design (minimal — exactly two extractions)

Both new units live in `packages/ai/src/` next to `agent.ts`. Neither introduces
a new abstraction/interface — they are plain functions taking explicit params
(no hidden state), so they are unit-testable in isolation.

### A. `budget-reservation.ts` — reserve + reconcile as a pair
```ts
export interface BudgetHandle {
  reservedUsd: number;
  released: boolean;
  /** Reconcile the reservation against observed cost (delta true-up). */
  reconcile(observedUsd: number): Promise<void>;
  /** Release the reservation on non-retryable error / client disconnect. */
  release(): Promise<void>;
}
export async function reserveTurnBudget(args: {
  userId: string; estimateUsd: number; maxDailyUsd: number;
}): Promise<BudgetHandle>; // throws BudgetExceededError when reservation fails
```
This wraps `tryReserveBudget` + the STAB-02 "already released" bookkeeping and the
final `recordTelemetry` reconciliation that currently lives inline.

### B. `chat-retry-loop.ts` — the fallback/retry executor
```ts
export interface RetryLoopArgs {
  maxAttempts: number;                 // currently 5
  attempt: (ctx: AttemptContext) => Promise<AttemptResult>;
  onFallback?: (info: FallbackPartPayload) => void;
  signal?: AbortSignal;
}
export async function runChatWithFallback(args: RetryLoopArgs): Promise<StreamResult>;
```
`attempt` receives the current model override + `nonEssentialDisabled` flag and
returns either success or a classified error (reuse `classifyStreamError` /
`makeFallbackPart` from `./fallback`, `agent.ts:32`). The loop owns
`attempts++`, `lastError`, `currentModelOverride`, `nonEssentialDisabled`, and
`checkedProviders` — turning five shared mutable locals into loop-local state.

`runChatInner` then reads top-to-bottom as: setup → `reserveTurnBudget` → build
messages → route → `runChatWithFallback` → `budget.reconcile()`.

---

## 3. Implementation sequence

1. **Characterize current behavior first.** Before refactoring, ensure there are
   passing tests around retries/budget (see `packages/ai/test/multi-agent/budget.test.ts`,
   `multi-agent/fallback.test.ts`, and any `agent`-level test). If coverage of the
   single-agent `runChatInner` retry path is thin, add a characterization test
   that drives `runChat` with a mocked `LlmClient` that fails N times then
   succeeds, asserting attempt count, fallback part emission, and final budget
   reconciliation. **Do not refactor until this is green.**
2. **Extract B (retry loop)** into `chat-retry-loop.ts`. Move the loop body
   verbatim; pass in the closOVER values as explicit params. Keep
   `classifyStreamError`, `makeFallbackPart`, `estimateContextUsage`, and the
   `maxAttempts = 5` constant behavior identical.
3. **Extract A (budget)** into `budget-reservation.ts`. Move `tryReserveBudget`
   call, the `reservedUsd` tracking, STAB-02 release bookkeeping, and the
   post-loop reconciliation. Preserve the `BudgetExceededError` throw
   (`agent.ts:168-170`) and the NaN floor guard (`DEFAULT_MAX_DAILY_USD`,
   `agent.ts:155`).
4. **Rewire `runChatInner`** to call the two new functions. Keep every
   `recordStep`/`completeStep` diagnostic call at the **same logical points** so
   traces are unchanged. Keep the outer `runChat` wrapper (`agent.ts:109-130`)
   and its diagnostic/Sentry error attachment **exactly** as-is.
5. **Do not extract** setup steps 2-7 — leave them inline in `runChatInner`.

---

## 4. What NOT to change (scope boundary)

- **Do not** change `runChat`'s exported signature (`RunChatArgs`) or return type.
- **Do not** change the streamed response shape, SSE frames, or `onFinish`
  semantics — downstream web route + UI depend on them.
- **Do not** alter routing (`routeTurn`), compaction (`compactThread`), or BYOK
  decryption logic — only relocate the two seams named above.
- **Do not** change diagnostic step names/order (`recordStep(...)`) — traces and
  any snapshot tests key off them.
- **Do not** extract more than the two collaborators. No new DI, no strategy
  pattern, no per-step classes.
- **Do not** touch the multi-agent path (`orchestrator.ts`) — that's a different
  entrypoint.

---

## 5. Verification

- **Typecheck:** `pnpm --filter @hamafx/ai typecheck`.
- **Full AI suite:** `pnpm --filter @hamafx/ai test`. Must be green with **no
  test-logic changes** beyond the new characterization test — behavior is
  identical by construction. Watch `multi-agent/budget.test.ts`,
  `multi-agent/fallback.test.ts`.
- **New unit tests:** `budget-reservation.test.ts` (reserve success, reserve
  exceeds → throws, reconcile true-up delta, release idempotency) and
  `chat-retry-loop.test.ts` (succeeds first try; fails-then-succeeds; exhausts
  `maxAttempts`; respects abort signal).
- **Manual check:** run a normal chat turn (streams normally), a turn that
  triggers a provider fallback (fallback part appears, retries bounded at 5), and
  a turn at/over the daily budget cap (`BudgetExceededError` surfaces as before).
- **Diff gate:** `git diff` should show `runChatInner` shrinking substantially
  while `runChat` (`agent.ts:109-130`) is untouched.
