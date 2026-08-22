# AI System Improvement Plan — Closing the 10 Gaps

> Generated from a full architecture review of the Mastra migration (Phases 0–8).
> Each gap is rated by severity and effort. Implementation order is by dependency,
> not by severity — some gaps are prerequisites for others.

## Implementation Order

1. **Gap #3** — Wire `initializeKestrelMastra()` at boot (prerequisite: storage ready before any Mastra call)
2. **Gap #4** — Add Mastra observability flush/shutdown to worker (depends on #1 for instance access)
3. **Gap #2** — Wire Mastra storage retention pruning (depends on #1 for storage access)
4. **Gap #8** — Postgres advisory lock for multi-worker claim safety (depends on #1 for storage)
5. **Gap #1** — Wire semantic routing (depends on nothing, but benefits from #1 for reliable storage)
6. **Gap #5** — Attach custom scorers (deterministic, always-on)
7. **Gap #6** — Add UnicodeNormalizer to mutation extraction path
8. **Gap #9** — Deduplicate mutation classification
9. **Gap #7** — Remove generic stream-runner.ts
10. **Gap #10** — Runtime warning for WORKER_COUNT > 1 (folded into #8)

---

## Gap #3 — Wire `initializeKestrelMastra()` at boot

**Severity:** Low (storage initializes lazily, so it works — but first request is slower)
**Effort:** Small (2 files, ~10 lines each)

### Files to change

#### `apps/web/src/instrumentation.ts`
Add eager Mastra storage initialization after Langfuse init:

```ts
// After initLangfuse({ service: 'web' });
const { initializeKestrelMastra } = await import('@kestrel/ai/mastra');
await initializeKestrelMastra().catch((err) => {
  console.warn('[instrumentation] Mastra storage init failed (non-fatal; lazy init will retry)', err);
});
```

#### `apps/worker/src/index.ts`
Add after `initLangfuse({ service: 'worker' })`:

```ts
const { initializeKestrelMastra } = await import('@kestrel/ai/mastra');
await initializeKestrelMastra().catch((err) => {
  log.warn('Mastra storage init failed (non-fatal; lazy init will retry)', { err: String(err) });
});
```

### Tests
- Existing tests unaffected (they inject instances via `_setKestrelMastraForTest`).
- Add an integration test that asserts `initializeKestrelMastra` is idempotent (call twice, no error).

---

## Gap #4 — Add Mastra observability flush/shutdown to worker

**Severity:** Medium (traces may be lost on process exit)
**Effort:** Small (1 file, ~5 lines)

### File to change

#### `apps/worker/src/index.ts`

In the shutdown registrations block, after `onShutdown(() => shutdownLangfuse())`:

```ts
onShutdown(() => {
  const { flushMastraObservability, getKestrelMastra } = require('@kestrel/ai/mastra');
  return flushMastraObservability(getKestrelMastra().instance).catch(() => {});
});
```

### Notes
- The web (Vercel) doesn't need this — serverless functions flush on freeze.
- `flushMastraObservability` is already best-effort (never throws).

---

## Gap #2 — Wire Mastra storage retention pruning

**Severity:** Low (Mastra tables grow slowly, but unbounded)
**Effort:** Small (2 files)

### File to change

#### `packages/ai/src/mastra-v2/storage.ts`
Export a helper that calls `storage.prune()`:

```ts
/**
 * Run Mastra's age-based retention pruning (Phase 0 config, wired here).
 * Best-effort: logs failures, never throws. Called from the worker's
 * daily retention job alongside the Drizzle retention cleanup.
 */
export async function pruneMastraStorage(): Promise<{
  pruned: boolean;
  error?: string;
}> {
  try {
    const { storage } = createMastraStorage(process.env);
    const store = storage as MastraCompositeStore & { prune?: () => Promise<void> };
    if (typeof store.prune === 'function') {
      await store.prune();
      return { pruned: true };
    }
    return { pruned: false, error: 'storage.prune() not available' };
  } catch (error) {
    return { pruned: false, error: error instanceof Error ? error.message : String(error) };
  }
}
```

Export from `mastra-v2/index.ts` and `mastra/index.ts`.

#### `apps/worker/src/jobs/retention.ts`
Add after the Drizzle retention cleanup:

```ts
import { pruneMastraStorage } from '@kestrel/ai/mastra';

// Inside runRetention():
const mastraRetention = await pruneMastraStorage();
ctx.log.info('Mastra storage pruning', mastraRetention);
```

### Tests
- Unit test: mock storage with a `prune()` spy, assert it's called.
- Unit test: mock storage without `prune()`, assert graceful degradation.

---

## Gap #8 — Postgres advisory lock for multi-worker claim safety

**Severity:** Low now (single worker), Medium future (scaling)
**Effort:** Medium (1 new file + modify claim logic)

### New file: `packages/ai/src/mastra-v2/advisory-lock.ts`

```ts
import { sql } from 'drizzle-orm';
import { getDb } from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';

const alog = createCategorizedLogger('ai', { component: 'mastra-advisory-lock' });

/**
 * Try to acquire a Postgres advisory lock for a workflow claim.
 * Returns a release function. No-op (returns a no-op release) when
 * the DB is not Postgres or the lock call fails — the existing
 * read-verify-write claim remains as the fallback.
 *
 * Advisory locks are automatically released when the DB session
 * (connection) is returned to the pool, so even a worker crash
 * releases the lock.
 */
export async function tryWorkflowClaimLock(
  workflowName: string,
): Promise<() => void> {
  try {
    const db = getDb();
    // Hash the workflow name into a 32-bit int for the lock key.
    const key = hashTo32Bit(workflowName);
    const result = await db.execute(
      sql.raw(`SELECT pg_try_advisory_lock(${key}) AS acquired`),
    );
    const acquired = (result as unknown as [{ acquired: boolean }])[0]?.acquired;
    if (!acquired) {
      alog.debug('advisory lock not acquired', { workflowName });
      return () => {};
    }
    return () => {
      db.execute(sql.raw(`SELECT pg_advisory_unlock(${key})`))
        .catch(() => {});
    };
  } catch (error) {
    alog.warn('advisory lock failed; using read-verify-write fallback', {
      workflowName,
      error: error instanceof Error ? error.message : String(error),
    });
    return () => {};
  }
}

function hashTo32Bit(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
```

### Modify: `packages/ai/src/mastra-v2/workflows/full-analysis.ts`

In `claimNextFullAnalysisRun`:

```ts
import { tryWorkflowClaimLock } from '../advisory-lock';

export async function claimNextFullAnalysisRun(
  workerRunId: string,
): Promise<FullAnalysisClaim | null> {
  const store = await workflowsStore();
  if (!store) return null;

  // Acquire advisory lock to prevent concurrent claims.
  const releaseLock = await tryWorkflowClaimLock(FULL_ANALYSIS_WORKFLOW_ID);
  try {
    // ... existing claim logic unchanged ...
  } finally {
    releaseLock();
  }
}
```

### Runtime warning for multi-worker

In the same file, add a check at the top of `claimNextFullAnalysisRun`:

```ts
if (process.env.WORKER_COUNT && Number(process.env.WORKER_COUNT) > 1) {
  // Advisory lock is active; log that multi-worker mode is detected.
  flog.info('Multi-worker mode detected; advisory lock active', {
    workerCount: process.env.WORKER_COUNT,
  });
}
```

### Tests
- Unit test: mock `getDb().execute()`, assert `pg_try_advisory_lock` is called.
- Unit test: when lock not acquired, claim returns null without listing.
- Integration test: two concurrent claims on real PGlite (no advisory lock support → graceful fallback to read-verify-write).

---

## Gap #1 — Wire semantic routing

**Severity:** Medium (better routing accuracy, paraphrased questions misclassified)
**Effort:** Small (2 files)

### Decision: Default ON, kill-switch via `AI_SEMANTIC_ROUTING_ENABLED=false`

### File to change

#### `packages/ai/src/routing.ts`

Add a helper that resolves the semantic routing config:

```ts
const SEMANTIC_ROUTING_ENABLED =
  (process.env.AI_SEMANTIC_ROUTING_ENABLED ?? 'true') !== 'false';

/**
 * Build the semantic routing config for routeTurn when enabled.
 * Returns null when disabled or no planner model can be resolved.
 */
export function resolveSemanticRoutingConfig(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
  signal?: AbortSignal | null,
): RouteTurnOptions['semanticRouting'] | null {
  if (!SEMANTIC_ROUTING_ENABLED) return null;
  const modelId = derivePlannerModel(userSettings, env);
  if (!modelId) return null;
  return { modelId, env, signal };
}
```

Import `derivePlannerModel` from `./model`.

### File to change

#### `packages/ai/src/mastra/canonical-chat.ts`

In `setupCanonicalChat()`, pass the semantic routing config:

```ts
import { resolveSemanticRoutingConfig } from '../routing';

// In routeTurn call:
const routing = await routeTurn({
  userMessage: args.userMessage,
  ...(args.modelOverride ? { modelOverride: args.modelOverride } : {}),
  ...(resolveSemanticRoutingConfig(args.settings, args.env, args.signal) ?? {}),
});
```

### Tests
- Existing `routing.test.ts` covers keyword fallback when semantic routing returns null.
- Add test: when `AI_SEMANTIC_ROUTING_ENABLED=false`, `resolveSemanticRoutingConfig` returns null.
- Add test: when no planner model is resolvable, returns null (degrades to keyword).

---

## Gap #5 — Attach custom scorers (deterministic, always-on)

**Severity:** Low (built but unused — wasted potential)
**Effort:** Small (2 files)

### File to change

#### `packages/ai/src/mastra-v2/evals/scorers.ts`

Add a new builder for the custom scorers and attach them to the existing builder output:

```ts
import { createCitationScorer, createGroundingScorer } from './custom';

/**
 * Build the deterministic custom scorers (grounding + citation).
 * These have no LLM judge, so no sampling ratio — they run on
 * every turn. Returns an empty entries map when the scorers cannot
 * be constructed (never throws in practice).
 */
export function buildCustomScorers(): BuiltScorers {
  try {
    const grounding = createGroundingScorer();
    const citation = createCitationScorer();
    return {
      scorers: [grounding, citation],
      entries: {
        'kestrel-grounding': { scorer: grounding },
        'kestrel-citation': { scorer: citation },
      },
      judgeModel: null,
      skipped: [],
      warnings: [],
    };
  } catch (error) {
    return { scorers: [], entries: {}, judgeModel: null, skipped: [], warnings: ['custom scorers failed to build'] };
  }
}
```

Modify `buildConversationScorers` and `buildResearchScorers` to merge custom scorers:

```ts
export function buildConversationScorers(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
  sampling: ScorerSampling = { type: 'ratio', rate: 0.05 },
): BuiltScorers {
  const prebuilt = buildPrebuiltScorers({
    settings, env,
    enabled: ['faithfulness', 'answer-relevancy', 'toxicity'],
    sampling,
  });
  const custom = buildCustomScorers();
  return mergeScorers(prebuilt, custom);
}

function mergeScorers(a: BuiltScorers, b: BuiltScorers): BuiltScorers {
  return {
    scorers: [...a.scorers, ...b.scorers],
    entries: { ...a.entries, ...b.entries },
    judgeModel: a.judgeModel,
    skipped: [...a.skipped, ...b.skipped],
    warnings: [...a.warnings, ...b.warnings],
  };
}
```

Do the same for `buildResearchScorers`.

### Tests
- Assert `buildConversationScorers()` includes `kestrel-grounding` and `kestrel-citation` in entries.
- Assert custom scorers have no `sampling` property (always-on).

---

## Gap #6 — Add UnicodeNormalizer to mutation extraction

**Severity:** Low (extraction model receives raw user text without normalization)
**Effort:** Small (1 file)

### File to change

#### `packages/ai/src/mastra/text-runner.ts`

In `runMastraStructured()`, add the UnicodeNormalizer as an input processor:

```ts
import { UnicodeNormalizer } from '@mastra/core/processors';

// In the Agent constructor for runMastraStructured:
const agent = new Agent({
  id: `kestrel-mastra-${args.task.replace(/[^a-z0-9-]/gi, '-')}`,
  name: `Kestrel Mastra ${args.task}`,
  description: 'Bounded structured Kestrel generation executed through Mastra.',
  model: args.model,
  instructions: args.system,
  inputProcessors: [new UnicodeNormalizer({
    stripControlChars: true,
    preserveEmojis: true,
    collapseWhitespace: true,
    trim: true,
  })],
});
```

Also add to `runMastraText()` for consistency.

### Tests
- Unit test: pass text with control characters to `runMastraStructured`, assert the model receives normalized text (via mock model).

---

## Gap #9 — Deduplicate mutation classification

**Severity:** Trivial
**Effort:** Trivial (2 files, ~5 lines)

### File to change

#### `apps/web/src/lib/services/mastra-mutation-draft.ts`

Change `startMutationDraft` to accept an optional `kind` parameter:

```ts
export interface StartMutationDraftArgs {
  userId: string;
  threadId: string;
  userText: string;
  /** Pre-classified mutation kind (avoids double classification). */
  kind?: MutationKind;
}
```

Use the passed kind, fall back to classification:

```ts
const kind = args.kind ?? classifyMutationRequest(userText);
if (!kind) {
  throw new MutationExtractionError('No supported mutation detected in this request.', 'set_alert');
}
```

#### `apps/web/src/app/api/chat/route.ts`

Pass the already-classified kind:

```ts
const draft = await startMutationDraft({
  userId: user.userId,
  threadId: body.threadId,
  userText,
  kind: mutationKind,
});
```

### Tests
- Existing tests should pass unchanged (the `kind` param is optional).

---

## Gap #7 — Remove generic stream-runner.ts

**Severity:** Trivial (dead code)
**Effort:** Trivial (delete file + remove exports)

### Files to change

1. Delete `packages/ai/src/mastra/stream-runner.ts`
2. Remove exports from `packages/ai/src/mastra/index.ts`:
   ```diff
   - export {
   -   runMastraStream,
   -   type MastraStreamChunk,
   -   type MastraStreamRunArgs,
   -   type MastraStreamRunResult,
   - } from './stream-runner';
   ```
3. Delete `packages/ai/src/mastra/stream-runner.test.ts` (if exists)
4. Search for and remove any imports of `runMastraStream` across the codebase.

### Tests
- Run `pnpm typecheck` to confirm no broken imports.

---

## Summary Table

| # | Gap | Severity | Effort | Files |
|---|-----|----------|--------|-------|
| 1 | Semantic routing not wired | Medium | Small | routing.ts, canonical-chat.ts |
| 2 | Storage retention pruning | Low | Small | storage.ts, retention.ts |
| 3 | initializeKestrelMastra at boot | Low | Small | instrumentation.ts, worker/index.ts |
| 4 | Mastra observability flush | Medium | Small | worker/index.ts |
| 5 | Custom scorers not attached | Low | Small | scorers.ts |
| 6 | Extraction path unguarded | Low | Small | text-runner.ts |
| 7 | Remove stream-runner.ts | Trivial | Trivial | delete + cleanup |
| 8 | Multi-worker advisory lock | Low/Medium | Medium | new advisory-lock.ts, full-analysis.ts |
| 9 | Deduplicate mutation classification | Trivial | Trivial | mastra-mutation-draft.ts, route.ts |
| 10 | Runtime WORKER_COUNT warning | — | Trivial | folded into #8 |

## Estimated total effort: ~1-2 days

All changes are backward-compatible (additive or removing dead code).
No schema migrations needed. No new dependencies.
