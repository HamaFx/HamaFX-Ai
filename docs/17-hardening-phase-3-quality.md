# Hardening Phase 3 — Quality, Performance, Polish

> **Theme:** Things that aren't broken but **drag on developer experience, cost, or UX polish**. Each item is small in isolation; together they raise the floor.

## Goal

After this phase the codebase is **friendly to extend**:

- No silent failures in the chat surface.
- Token / latency / DB cost predictable.
- AI output verified by signals that don't fire false positives.
- One canonical pattern per concept (no dual exports, no module-global state for per-request context).
- Web push, telemetry, and observability tell a coherent story.

## Scope

- 23 issues, all quality-of-life class.
- Touches mostly UX, AI tool plumbing, and small ergonomics.
- No DB migrations.

## Out of scope

- Anything that's a bug → those are in Phases 1 and 2.

## Pre-requisites

- Phases 1 and 2 fully shipped and stable for 1 week.

## Sequencing

```
Day 1: AI tool plumbing       (§1, §2, §3, §4)
Day 2: Verification quality   (§5, §6)
Day 3: UI polish              (§7, §8, §9, §10, §11)
Day 4: Ops + observability    (§12, §13, §14, §15)
Day 5: Cleanup + DX           (§16-§23)
```

Each day stands alone; ship daily.

## Estimated effort

- 1 senior engineer · 5 working days.
- Total LOC change: ~700 across many files.

---

## Day 1 — AI tool plumbing

### 1. Per-request context uses module-global state

**Severity:** Medium  
**Reference:** Review §30  
**Files:** `packages/ai/src/agent.ts`, `packages/ai/src/tools/analyze-chart-image.ts`, `packages/ai/src/tools/summarize-thread.ts`, possibly `packages/ai/src/context.ts`

#### Problem

`setAnalyzeChartImageContext({ threadId, env })` stores in a module variable. With warm Lambdas serving concurrent requests, request A's context overwrites request B's right before B's tool runs. Cross-talk possible.

#### Fix

Use Node's `AsyncLocalStorage` for per-invocation context:

```ts
// packages/ai/src/context-store.ts
import { AsyncLocalStorage } from 'node:async_hooks';

interface ToolContext {
  threadId: string;
  env: { /* ... */ };
}

const toolStore = new AsyncLocalStorage<ToolContext>();

export function withToolContext<T>(ctx: ToolContext, fn: () => Promise<T>): Promise<T> {
  return toolStore.run(ctx, fn);
}

export function getToolContext(): ToolContext {
  const ctx = toolStore.getStore();
  if (!ctx) throw new Error('Tool called outside of withToolContext()');
  return ctx;
}
```

Then in `runChat`:

```ts
return withToolContext({ threadId, env: pickToolEnv(env) }, async () => {
  // existing streamText() invocation
});
```

Tools that need the context:

```ts
// packages/ai/src/tools/analyze-chart-image.ts
execute: async (args) => {
  const { threadId, env } = getToolContext();
  // ...
}
```

Delete the `setAnalyzeChartImageContext` / `setSummarizeThreadContext` setters.

#### Acceptance criteria

- Two parallel chat turns from different threads complete with no cross-talk in `analyze_chart_image` (verify via test that injects parallel calls and asserts each tool sees its own threadId).

#### Tests

- `packages/ai/test/tool-context.test.ts`.

---

### 2. Tools have no central instrumentation wrapper

**Severity:** Medium  
**Reference:** Review §29  
**Files:** `packages/ai/src/tools/index.ts`, all tool files

#### Problem

Per-tool telemetry happens in `agent.ts.onStepFinish` by inspecting AI SDK content parts. Errors thrown inside `tool.execute` are surfaced by the SDK but error codes aren't captured uniformly.

#### Fix

Higher-order wrapper:

```ts
// packages/ai/src/tools/with-telemetry.ts
import { tool, type Tool } from 'ai';
import { recordToolTelemetry } from '../persistence';

export function withTelemetry<I, O>(name: string, t: Tool<I, O>): Tool<I, O> {
  return {
    ...t,
    execute: async (input, opts) => {
      const startedAt = Date.now();
      try {
        const result = await t.execute!(input, opts);
        void recordToolTelemetry({
          threadId: getToolContext().threadId,
          messageId: null,
          tool: name,
          ms: Date.now() - startedAt,
          ok: true,
        });
        return result;
      } catch (err) {
        void recordToolTelemetry({
          threadId: getToolContext().threadId,
          messageId: null,
          tool: name,
          ms: Date.now() - startedAt,
          ok: false,
          errorCode: err instanceof Error ? err.name : 'unknown',
        });
        throw err;
      }
    },
  } as Tool<I, O>;
}
```

Apply in registry:

```ts
// packages/ai/src/tools/index.ts
export const tools = {
  get_price: withTelemetry('get_price', getPriceTool),
  // ... all tools
};
```

Remove the `onStepFinish` telemetry path (now redundant); keep the step-counter for tool-call counts.

#### Acceptance criteria

- Every tool execution writes one row to `chat_tool_telemetry`.
- A tool that throws produces a row with `ok = false, error_code = <Error.name>`.

#### Tests

- `packages/ai/test/tool-telemetry-wrapper.test.ts`.

---

### 3. Chat `signal` not propagated to long-running tools

**Severity:** Medium  
**Reference:** Review §31  
**Files:** `packages/ai/src/agent.ts`, all long-running tools

#### Problem

The AI SDK doesn't auto-propagate `streamText.abortSignal` into tools' `execute(input, { signal })`. Tools like `analyze_fundamental` or `search_knowledge` keep running after the user closes the tab.

#### Fix

Pass the signal through `withToolContext` + tool wrapper:

```ts
// withTelemetry wrapper above gains:
execute: async (input, opts) => {
  const ctx = getToolContext();
  const signal = ctx.signal;
  // pass signal forward when the tool's underlying APIs support it
  return t.execute!(input, { ...opts, abortSignal: signal });
}
```

Long-running tools (`get_news`, `get_calendar`, `search_knowledge`, `analyze_fundamental`) read the signal at the top:

```ts
execute: async ({ ... }, { abortSignal }) => {
  if (abortSignal?.aborted) throw new AbortError();
  // ...
}
```

#### Acceptance criteria

- Close the chat tab during an `analyze_fundamental` turn. The server logs show the tool exiting early instead of completing.

#### Tests

- Manual.

---

### 4. Title generator and planner duplicate `dailySpendUsd()` calls

**Severity:** Low  
**Reference:** Review §32  
**Files:** `packages/ai/src/title.ts`, `packages/ai/src/planner.ts`, `packages/ai/src/cost.ts`, `packages/ai/src/agent.ts`

#### Problem

Each LLM-side helper (planner, title, briefings) reads the daily spend independently. Per turn that uses both, that's 2 SUM queries.

#### Fix

Cache the budget snapshot per turn via the new `withToolContext` from §1:

```ts
// agent.ts
return withToolContext({ threadId, env, signal, budget: { spent: await dailySpendUsd(), max: env.MAX_DAILY_USD } }, async () => { ... });
```

Helpers read from `getToolContext().budget` instead of querying the DB.

After Phase 2 §7 lands the atomic counter, this becomes one row read per turn (extremely cheap), but the in-memory cache for downstream helpers still saves a round-trip.

#### Acceptance criteria

- A chat turn that runs both planner and title generator does at most one budget read.

#### Tests

- Spy on `dailySpendUsd` in a test and assert call count.

---

## Day 2 — Verification quality

### 5. Citation enforcer false positives

**Severity:** Medium  
**Reference:** Review §21  
**Files:** `packages/ai/src/verification.ts`

#### Problem

- `PRICE_REGEX` matches version-like decimals (`1.0`, `2024.05`).
- `ATTRIBUTION_REGEX` is satisfied by the word "from", which appears in many non-attribution contexts.
- Result: noisy soft warnings train the user to ignore them.

#### Fix

1. Restrict PRICE_REGEX to "looks like a price for our 3 symbols":

```ts
const PRICE_REGEX = new RegExp(
  String.raw`(?<!\d\.)\b(` +
  // gold: 1xxx.xx to 4xxxx.xx
  `[1-4]\d{3}\.\d{1,2}` +
  `|` +
  // FX: 0.xxxx or 1.xxxx
  `[01]\.\d{4,5}` +
  `)\b(?!\d)`,
  'g',
);
```

2. Require an explicit reference verb, not just any of "from/per":

```ts
const ATTRIBUTION_REGEX = /\b(per|via|according to|sourced from|cite[sd]?|reported by|tool result)\b/i;
```

3. Match against actual tool **calls** not tool **names**: tighten `readToolNames` to count only `tool-call` parts (not `tool-result`) and only when the call landed during this turn (not from an older message replayed).

4. Drop the "soft stance" → make it a single-line muted footer: `"Numbers in this answer weren't verified against a tool call this turn."` Single message instead of N claims.

#### Acceptance criteria

- 10 hand-curated assistant texts with verified outputs do not produce a warning.
- 10 texts with hallucinated prices produce one warning each.
- False positive rate < 10% on a sample of 50 historical answers.

#### Tests

- `packages/ai/test/verification-precision.test.ts` with golden cases.

---

### 6. `verify_call.PRICE_REGEX` overlap with citation enforcer

While in this area, sanity-check the `verify_call` tool's regex against the citation enforcer. Both regexes should be **either identical or explicitly different**, with comments. Today they overlap fuzzily.

**Action:** centralize into `packages/ai/src/verification/regex.ts` with a single `PRICE_TOKEN` constant used in both places.

---

## Day 3 — UI polish

### 7. Composer images sent inline as base64

**Severity:** Medium  
**Reference:** Review §27  
**Files:** `apps/web/src/components/chat/composer.tsx`, new `apps/web/src/app/api/upload/route.ts`, `apps/web/src/components/chat/chat-screen.tsx`

#### Problem

Up to 4 × 5 MB images base64-encoded into JSON. ~27 MB inflated. Vercel's 4.5 MB body limit makes only 1 small image safe in practice.

#### Fix

Pre-upload to Supabase Storage; pass URL parts.

**Step 1:** new endpoint `POST /api/upload` accepting multipart/form-data, writes to a `chat-images` bucket with TTL 7 days, returns `{ url }`.

**Step 2:** composer flow:

```ts
async function pickImages(files: FileList | null) {
  for (const file of Array.from(files)) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const { url } = await res.json();
    setImages((prev) => [...prev, { id: crypto.randomUUID(), url, mediaType: file.type, name: file.name }]);
  }
}
```

**Step 3:** chat-screen submits `files: [{ type: 'file', mediaType, url }]` (URL form) instead of `data:` URL.

**Step 4:** clean up the bucket via a daily systemd timer that deletes blobs >7 days old.

#### Acceptance criteria

- 4 × 5 MB images upload and chat continues normally.
- The `/api/chat` request body is < 50 KB regardless of image count.

#### Tests

- E2E manual smoke.

---

### 8. `useCandles` polls when the chart is offscreen

**Severity:** Low  
**Reference:** Review §26  
**Files:** `apps/web/src/hooks/use-candles.ts`, the chart component

#### Problem

`refetchInterval` runs while the hook is mounted. The chart hook may live in a layout component that's mounted but not visible.

#### Fix

Gate via IntersectionObserver:

```ts
// apps/web/src/hooks/use-candles.ts
export function useCandles(symbol: Symbol, tf: Timeframe, count = 300, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['market', 'candles', symbol, tf, count],
    queryFn: ({ signal }) => fetchCandles(symbol, tf, count, { signal }),
    enabled: opts.enabled ?? true,
    refetchInterval: refetchIntervalFor(tf),
    // ...
  });
}
```

Chart component:

```ts
const ref = useRef<HTMLDivElement>(null);
const [visible, setVisible] = useState(false);
useEffect(() => {
  const obs = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false));
  if (ref.current) obs.observe(ref.current);
  return () => obs.disconnect();
}, []);

const { data } = useCandles(symbol, tf, 300, { enabled: visible });
```

#### Acceptance criteria

- DevTools network panel shows no `/api/market/candles` requests when scrolled past the chart.

---

### 9. SWR `maxStaleSeconds` for prices is too long

**Severity:** Low  
**Reference:** Review §28  
**Files:** `packages/data/src/cache/ttl.ts`

```ts
export const PRICE_TTL: TtlPolicy = { ttlSeconds: 3, maxStaleSeconds: 10 }; // was 30
```

Drop to 10 s. After Phase 2 §3 the UI shows a clearer stale chip; visible degradation guides the user.

---

### 10. Voice "Listening…" pill doesn't clear on stop on iOS Safari

**Severity:** Low  
**Reference:** Review §36  
**Files:** `apps/web/src/components/chat/composer.tsx`, `apps/web/src/hooks/use-voice-input.ts`

#### Fix

In the composer's stop handler, optimistically flip `voice.active` via a callback:

```ts
// use-voice-input.ts: extend the hook
const stop = useCallback(() => {
  ref.current?.stop();
  setActive(false); // optimistic; onend may arrive later or never on iOS Safari
}, []);
```

#### Acceptance criteria

- iOS Safari, tap mic, speak, tap mic again — pill disappears within 100 ms.

---

### 11. Voice input language doesn't track user setting

**Files:** `apps/web/src/hooks/use-voice-input.ts`

While in this hook: confirm `lang` honors `navigator.language` only and does not affect layout/RTL. Already documented in steering rule #37, but verify.

---

## Day 4 — Ops + observability

### 12. Worker logger pretty mode under journald

**Severity:** Low  
**Reference:** Review §52  
**Files:** `apps/worker/src/log.ts`

`Logger` `pretty` mode is on when `NODE_ENV !== 'production'`. The systemd unit's `EnvironmentFile=` typically does not set `NODE_ENV`. Force JSON in production via the unit:

```ini
[Service]
Environment=NODE_ENV=production
```

And/or set `forceJson: true` when invoked from the runner.

#### Acceptance criteria

- `journalctl -u hamafx-worker.service --output=cat` shows JSON lines, not pretty-printed lines.

---

### 13. `cron/news` doesn't backfill missed windows

**Severity:** Medium  
**Reference:** Review §33  
**Files:** `apps/web/src/app/api/cron/news/route.ts`, `packages/data/src/providers/finnhub/rest.ts`

#### Fix

Use Finnhub's `minId` pagination based on the highest `id` we've seen. Persist the high-water mark in a tiny table or just compute from the existing news_articles table:

```ts
const lastSeenId = await getDb()
  .select({ max: sql<number>`max((meta->>'finnhub_id')::int)` })
  .from(schema.newsArticles);
// pass lastSeenId to fetchNews({ minId: lastSeenId, limit: 200 })
```

Loop until empty or `limit * 4` cap.

#### Acceptance criteria

- Pause the cron for 30 min. On resume, all articles published during that window appear in `news_articles`.

---

### 14. `cron/warm-cache` only warms 1h candles

**Severity:** Low  
**Reference:** Review §51  
**Files:** `apps/web/src/app/api/cron/warm-cache/route.ts`

Add a 4h warmer at lower frequency (every 10 min):

```ts
const TIMEFRAMES_TO_WARM: Array<'1h' | '4h'> = ['1h'];
const slowTfsByMinute = new Date().getUTCMinutes() % 10 === 0 ? ['4h'] as const : [];
// ... iterate slowTfs separately
```

---

### 15. `assertCronAuth` has dead code

**Severity:** Low  
**Reference:** Review §40  
**Files:** `apps/web/src/lib/cron.ts`

#### Fix

Delete `assertCronAuth` entirely. The async `withCronAuth` is the only used path. Document the auth contract once in a JSDoc on `withCronAuth`.

---

## Day 5 — Cleanup + DX

### 16. `runWithFailover` re-throws the **first** error

**Severity:** Low  
**Reference:** Review §41  
**Files:** `packages/data/src/failover.ts`

#### Fix

Track the most-actionable error: `PROVIDER_QUOTA_EXCEEDED` > `PROVIDER_HTTP_ERROR` > everything else. Re-throw the highest-priority one.

```ts
function rank(err: ProviderError): number {
  if (err.code === 'PROVIDER_QUOTA_EXCEEDED') return 3;
  if (err.code === 'PROVIDER_HTTP_ERROR') return 2;
  if (err.code === 'PROVIDER_TIMEOUT') return 2;
  return 1;
}
// pick max-rank error to throw
```

---

### 17. `chat-screen` thread refresh fetches messages it doesn't need

**Severity:** Low  
**Reference:** Review §42  
**Files:** `apps/web/src/app/api/chat/threads/[id]/route.ts`, `apps/web/src/components/chat/chat-screen.tsx`

#### Fix

Add `?fields=thread` query param support to the GET endpoint; chat-screen passes it when only the title is needed.

```ts
// route.ts
if (url.searchParams.get('fields') === 'thread') {
  return Response.json({ thread });
}
```

---

### 18. Comments claim Twelve Data is retired but env var stays

**Severity:** Low  
**Reference:** Review §45  
**Files:** `packages/shared/src/env.ts`, `packages/data/src/providers/twelve-data/`

#### Fix

Either commit to removal:

- Drop `TWELVEDATA_API_KEY` from `ProvidersEnv`.
- Delete the empty `packages/data/src/providers/twelve-data/` directory.

OR keep with a clear deprecation comment and a runtime warning if set.

Recommended: remove. Empty folders + dead env vars accumulate technical debt.

---

### 19. Worker jobs do deep imports across packages

**Severity:** Low  
**Reference:** Review §46  
**Files:** `apps/worker/src/jobs/cot.ts`, `apps/worker/src/jobs/fred-actuals.ts`, `packages/data/src/index.ts`

#### Fix

Re-export `cftc` and `fred` providers from `@hamafx/data`:

```ts
// packages/data/src/index.ts
export * as cftc from './providers/cftc';
export * as fred from './providers/fred';
```

Update job imports:

```ts
// before
import { fetchLatestRows, parseCftcInt, toCftcName } from '@hamafx/data/providers/cftc';
// after
import { cftc } from '@hamafx/data';
const { fetchLatestRows, parseCftcInt, toCftcName } = cftc;
```

---

### 20. Vector literal helper

**Severity:** Trivial  
**Reference:** Review §47  
**Files:** `packages/ai/src/rag.ts`, `packages/ai/src/memory/memory-index.ts`

#### Fix

```ts
// packages/ai/src/embeddings.ts
export function vectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(',')}]`;
}
```

Use in both files.

---

### 21. `chatMessages.parts` JSONB unbounded

**Severity:** Low  
**Reference:** Review §48  
**Files:** `packages/ai/src/persistence.ts`, `packages/ai/src/agent.ts`

#### Fix

Strip non-essential fields before persist:

```ts
function stripPartsForStorage(parts: UIMessage['parts']): UIMessage['parts'] {
  return parts.map((p) => {
    if (p.type === 'tool-result' && typeof p === 'object' && 'output' in p) {
      // Trim huge tool outputs (e.g. analyze_chart_image with raw image data)
      const output = (p as any).output;
      if (typeof output === 'object' && output !== null && 'imageDataUrl' in output) {
        return { ...p, output: { ...output, imageDataUrl: undefined } };
      }
    }
    return p;
  });
}
```

Apply in `appendAssistantMessage`.

---

### 22. CSRF on state-changing endpoints

**Severity:** Low  
**Reference:** Review §53  
**Files:** `apps/web/src/middleware.ts`, all `/api/*` POST/DELETE routes

#### Fix

Double-submit cookie pattern, low effort:

```ts
// middleware.ts: on every request, set a cookie `hfx_csrf` if missing.
// On state-changing requests, verify `X-CSRF-Token` header == cookie value.
```

```ts
// composer / market-client / etc.: read cookie via document.cookie, set header.
```

For the chat endpoint specifically (uses fetch with credentials), this is straightforward. For the cron endpoints (bearer auth), exempt them.

#### Acceptance criteria

- `curl -X POST /api/journal -d '...' -H 'Cookie: hfx_auth=…'` (without CSRF token) → 403.

---

### 23. SW skipWaiting on upgrade

**Severity:** Low  
**Reference:** Review §49  
**Files:** `apps/web/scripts/sw.template.js`

#### Fix

Remove `self.skipWaiting()` from `install`. Move to a message handler:

```js
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
```

Client-side, when the user explicitly accepts an update banner:

```ts
navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
```

For personal-mode this is overkill; just document the trade-off and keep `skipWaiting` if instant updates matter more than mid-page-load safety.

**Recommendation:** keep `skipWaiting`, add a one-line comment documenting the decision.

---

## Verification plan (whole phase)

1. `pnpm turbo run typecheck && pnpm turbo run test` clean.
2. `pnpm --filter ai eval -- --cases` clean.
3. Manual smoke:
   - Chat with images → uploads land in Supabase Storage; chat works (§7).
   - 30 messages in one thread → no observable lag from polling (§8).
   - 50 historical assistant messages → < 10% citation false positives (§5).
   - `curl` POST without CSRF token → 403 (§22).

## Rollout

- Land a PR per day, deploy at end of day, watch metrics overnight.
- §22 (CSRF) ships behind a feature flag for one week before enforcement.

## Definition of done

- [ ] All 23 acceptance criteria pass.
- [ ] `docs/05-ui-ux.md` updated for image upload flow.
- [ ] `docs/07-ai-agent.md` updated for the verification regex centralization.
- [ ] `docs/14-ai-agent-handoff.md` reflects new conventions: `withToolContext`, `withTelemetry`, no module-global state in tools.
- [ ] All deferred decisions (e.g. SW skipWaiting trade-off) have a JSDoc explaining the choice.

---

# Cross-phase summary

| Phase | Theme               | Issues | Estimated days | Blocker level |
| ----- | ------------------- | ------ | -------------- | ------------- |
| 1     | Correctness/Security | 12     | 3-4 days       | Ship first    |
| 2     | Reliability/Concurrency | 9   | 5-6 days       | Ship after Phase 1 stable for 1 week |
| 3     | Quality/Polish      | 23     | 5 days         | Ship after Phase 2 stable for 1 week |

**Total review issues addressed: 44** (12 + 9 + 23 = 44 — original review listed 55, the remainder were trivial or already acceptable trade-offs noted but not actionable).

**Total cross-phase estimated effort:** ~14 working days for one senior engineer, end to end. Realistic calendar time including review cycles and waiting periods between phases: ~5 weeks.
