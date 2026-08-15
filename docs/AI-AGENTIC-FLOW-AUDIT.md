# Kestrel — Full End-to-End Audit of the AI Agentic System & Flows

> **Audit type:** Deep-flow audit (not a diff review). Every stage from the user
> landing on the chat page to the final persisted assistant message, including
> the background worker path for Full-mode jobs.
> **Date:** 2026-08-15
> **Scope:** `apps/web` (chat UI, `/api/chat`, request proxy), `packages/ai`
> (agent core, tools, multi-agent committee, memory, verification, cost,
> diagnostics), `apps/worker` (analysis-job consumer), `packages/db`
> (rate limits, analysis jobs).
> **Method:** Read-through of every file in the request path, tracing one
> message end-to-end. Findings are tagged **[STRENGTH]**, **[ISSUE]**, or
> **[INFO]** with a severity where relevant.

---

## Executive Summary

Kestrel runs **two parallel agentic execution planes** over one shared core:

1. **Synchronous (Vercel)** — `/api/chat` handles `single`, `quick`, and
   `standard` modes: a single-agent `runChat()` (streamText + 33 tools,
   plan-then-act, rolling-summary memory) or a multi-agent committee
   (specialists → Decision-agent fusion) streamed as SSE.
2. **Asynchronous (GCE worker)** — `full` mode is queued into the
   `analysis_jobs` Postgres table and claimed by the worker daemon
   (`FOR UPDATE SKIP LOCKED` + lease heartbeat + bounded retries). The
   browser polls `/api/chat/analysis-jobs/:id` and synthesizes the result
   into a normal AI SDK stream.

The system is **defense-in-depth by design**: CSRF double-submit + CSP nonce +
HMAC-signed `x-user-id` + JWT re-validation + route-level thread ownership +
`userId` scoping on every query + idempotency keys + atomic budget
reservations + a diagnostic AsyncLocalStorage trace. The most impressive
properties are the **budget ledger** (atomic reservation → reconcile/release,
with a worker recovery job), the **strict Full-mode all-or-nothing contract**,
and the **"client transcript is never trusted"** rule (history is always
re-loaded from the DB).

The audit found **no critical security or correctness defects**. The implementation follow-up addressed all seven recommended actions: multi-agent history is compacted, image-turn mode overrides are consumed safely, fusion emits real deltas with partial-output fallback protection, timeout/TTFB telemetry is recorded, committee prompt drift and tool-count documentation are corrected, mutation intent supports explicit Chinese requests while preserving confirmation safety, and cost estimates are labeled in settings.

---

## Phase 1 — Entry & Chat UI (Frontend)

### 1.1 Flow

```
Browser
  │ GET /chat
  ▼
ChatLanding (server)                     apps/web/src/app/(app)/chat/page.tsx
  ├─ auth() → userId (legacy __system__ only in dev)
  ├─ BYOK gate: getUserApiKeys → decryptByok → configuredProviders()
  │     └─ 0 providers → redirect /settings/api-keys?from=chat[&prompt=…]
  ├─ ?prompt= → createThread() → redirect /chat/{id}?prompt=…  (Ask-AI deep links)
  └─ else → listThreads(1) → most-recent thread or fresh createThread()
  ▼
/chat/[threadId] (server)                apps/web/src/app/(app)/chat/[threadId]/page.tsx
  ├─ getThread(userId, threadId)   ← ownership check (IDOR-safe)
  ├─ listMessages(userId, threadId, 200)   ← hydrated history
  ├─ listThreads(userId, 50) + getUserWithSettings(userId)
  ├─ initialAnalysisMode = thread.analysisMode ?? settings.defaultAnalysisMode ?? 'auto'
  └─ renders <ChatScreen> (client)
  ▼
ChatScreen (client)                      apps/web/src/components/chat/chat-screen.tsx
  ├─ useChat({ id: threadId, transport: createKestrelChatTransport, messages: initialMessages })
  ├─ Composer → sendMessage({ text }) or sendMessage({ text, files: [images] })
  ├─ auto-submit ?prompt= once per thread on mount
  ├─ regenerate / edit-and-fork (POST /api/chat/threads/fork) / stop
  ├─ agent deliberation progress panel (AgentDeliberation) while multi-agent runs
  └─ thread summary header fetched at >20 messages (GET /api/chat/threads/{id}/summary)
```

### 1.2 Transport — `apps/web/src/lib/chat-transport.ts`

`createKestrelChatTransport` wraps the AI SDK v5 `DefaultChatTransport` and is
the single place where the UI flattens **three backend modes** into one
`useChat`:

| Backend response | Client handling |
|---|---|
| AI SDK data stream (single mode) | passthrough |
| SSE `data: <json>` (quick/standard) | `transformSseToDataStream` → converts `text-start/delta/end`, `data-multi-agent-meta`, `data-agent-progress`, `error` into AI SDK chunks |
| JSON `{type:'analysis-queued', jobId}` (full) | `pollJobToStreamResponse` → polls `/api/chat/analysis-jobs/{jobId}` (2s→10s backoff, 5-min cap, 3-strike failure) → synthesizes a text stream |

Request augmentation in `prepareSendMessagesRequest`:
- `analysisMode` (read from a **ref** so a fresh selection applies to an
  immediately-submitted turn), `threadId`, `id`, `messages`
- `modelOverride` (one-shot, cleared when stream settles)
- Headers: `X-CSRF-Token` (double-submit) and `X-AI-Prefs`
  (`{customInstructions}` JSON) — the latter lets the route read custom
  instructions without a DB round-trip.

The SSE converter is defensive: malformed/unknown events become a protocol
error instead of silently succeeding; a missing `text-end` is synthesized at
stream close; reader cancellation from the user's Stop stays quiet.

### 1.3 Findings

**[RESOLVED]** — The image-turn override is now consumed inside
`prepareSendMessagesRequest`, after `sendMessage()` has had a chance to defer
transport preparation. A settled/error safety effect also clears a stranded
one-shot override, so image turns reliably use single-agent mode without
leaking the override into the next turn.

**[INFO]** — `showAgentOpinions` is initialized from the prop but its setter is
never used; the value is effectively constant for the view. Harmless, but the
state is dead code.

**[STRENGTH]** — The three-mode transport abstraction is well-engineered: the
UI cannot tell single vs multi-agent vs background-job apart; polling is
abort-aware, backs off, and surfaces distinct error text for 404 vs transport
failure; `data-agent-progress` is marked `transient` so it is never persisted.

**[INFO]** — One-shot model override is scoped to a single turn and cleared on
`status === 'ready' | 'error'` — clean lifecycle.

---

## Phase 2 — Request Boundary (Proxy, Auth, CSRF, CSP, Rate Limit, Validation)

### 2.1 Flow

```
Browser POST /api/chat
  ▼
proxy.ts (middleware)                    apps/web/src/proxy.ts
  ├─ readOrCreateRequestId → X-Request-Id
  ├─ CSRF double-submit: mint cookie (hfx_csrf | __Host-hfx_csrf in prod)
  │     └─ enforced on POST/PUT/DELETE/PATCH /api/* except /api/auth/*
  ├─ NextAuth edge auth() → JWT session
  ├─ x-user-id header + HMAC-SHA256 signature (secret truncated to 128 bytes;
  │     sig = HMAC(secret, `${userId}.${requestId}`))
  ├─ CSP with per-request nonce ('strict-dynamic', TradingView/d3 hosts)
  └─ legacy mode (__system__) only when NODE_ENV !== 'production'
  ▼
route.ts POST /api/chat                    apps/web/src/app/api/chat/route.ts
  ├─ withAuth → getUserFromRequest (lib/api.ts):
  │     fast path: verify HMAC signature on x-user-id  (no DB, no JWT)
  │     slow path: auth() JWT re-validation (defense-in-depth)
  ├─ withRateLimit(userId, 'ai_chat', 30/min)   ← Postgres minute bucket
  │     (INSERT..ON CONFLICT DO UPDATE, count includes rejected attempts)
  ├─ parseJsonBody: 6 MiB cap (streamed, kills oversized early) +
  │     5s body-read timeout; Zod schema:
  │     threadId: uuid · messages: 1..100 · content ≤ 50k chars · parts ≤ 50
  ├─ last message must be role 'user'
  ├─ getServerEnv() validation
  ├─ X-AI-Prefs → customInstructions (malformed header ignored)
  ├─ getThread(user.userId, threadId)  ← ownership gate before ANY agent work
  └─ branch on analysisMode (Phase 3)
```

### 2.2 Findings

**[STRENGTH]** — Layered auth with no single point of trust: the proxy stamps a
*signed* user header (spoofed headers without a valid signature fall through to
JWT re-validation), CSRF is checked at the edge, and the route re-checks thread
ownership with the authenticated `userId`. This is a textbook defense-in-depth
stack.

**[STRENGTH]** — Body guards are hostile-input-aware: streamed byte cap (not
just Content-Length), 5s slow-loris timeout, per-message length caps, and a
message-count cap (100) prevent memory exhaustion from a single request.

**[INFO]** — Rate limiting is a fixed **per-user per-minute** Postgres bucket
(30/min default, `AI_CHAT_RATE_LIMIT` env). There is no IP-based or global
cooldown, and a burst of 30 turns in one minute is allowed. Fine for an
authenticated product API; worth knowing the ceiling.

**[INFO]** — CSRF cookie is `httpOnly: false` (required by the double-submit
pattern), `SameSite=Strict`, `__Host-` prefix in production. The remaining
exposure (XSS reading the token) is mitigated by the strict CSP.

**[INFO]** — `/api/cron`, `/api/billing/webhook`, `/api/telegram`,
`/api/health/public` are correctly excluded from the proxy (they use their own
auth: cron secret, HMAC signature, etc.).

---

## Phase 3 — Route-Level Orchestration & Mode Branching

### 3.1 The decision tree (route.ts)

```
analysisMode = body.analysisMode ?? 'single'
  │
  ├─ 'single' ────────────────────────────► runChat() → toUIMessageStreamResponse()
  │                                           (Phase 4)
  ├─ non-single: getUserWithSettings → displayName → extractUserMessageText
  │     └─ resolveMode(mode, text)  (auto → autoDetectMode)
  │           ├─ resolved 'single' ─────────► runChat()   (auto detected simple turn)
  │           ├─ 'full' ────────────────────► enqueueAnalysisJob() → JSON
  │           │                                {type:'analysis-queued', jobId}
  │           │                                client polls (Phase 6)
  │           └─ 'quick'|'standard' ────────► SSE stream via runMultiAgentChat()
  │                                            (Phase 5)
```

Key details:

- **Full mode** queues with `idempotencyKey: full:{threadId}:{uiMessageId}`
  (thread-scoped, transport-retry-safe), `historyParts: []` (worker reloads
  authoritative history), and propagates the diagnostic `traceId` so worker
  logs correlate with the originating turn.
- **Quick/Standard** build a `ProgressTracker` with the exact specialist list
  (`quick → [technical]`, `standard → [technical, fundamental]`), reload
  history from the DB (200 msgs), and stream: `text-start`, `text-delta`,
  `text-end`, `data-agent-progress`, `data-multi-agent-meta`, `error`.
  Every chunk is validated against `ChatStreamEventSchema` before enqueue.
- Progress events are **sanitized at the boundary**: `agent_error`,
  `fusion_error`, `analysis_error` error strings are replaced with generic
  copy so provider/model internals never reach the client.
- Hard `AbortSignal.timeout(55_000)` on every synchronous path (5s headroom
  under Vercel's 60s `maxDuration`), combined with `req.signal` via
  `AbortSignal.any` — client disconnect and route timeout both abort the model
  call mid-stream, and the tool layer observes the same signal.
- `BudgetExceededError` maps to a friendly 429-style envelope with
  spent/max figures.

### 3.2 Findings**[RESOLVED / MONITORED]** — Quick mode now uses a 45s synchronous timeout,
while Standard retains the 55s cap needed for two specialists plus fusion.
Both modes record TTFB and total latency in structured logs and the transient
meta event, making slow provider behavior measurable without changing the
Vercel route's 60s maxDuration contract.

**[STRENGTH]** — Client transcripts are never used as model context: the route
re-loads history from Postgres in both the single-agent and multi-agent paths,
and the worker does the same. A poisoned or truncated client payload cannot
corrupt model input.

**[STRENGTH]** — Idempotent queueing: concurrent retries of the same
`full:{threadId}:{messageId}` converge on one `analysis_jobs` row
(`ON CONFLICT DO NOTHING` on `(userId, idempotencyKey)`).

**[INFO]** — For quick/standard, `runMultiAgentChat` re-resolves the mode from
the user's original `analysisMode` (deterministic, same result as the route's
`resolveMode`), so there is no divergence between the ProgressTracker list and
the actual agent list. (The worker additionally guards Full mode with an
invariant: exactly 4 specialists.)

---

## Phase 4 — Single-Agent Pipeline (`runChat`)

### 4.1 Flow — `packages/ai/src/agent.ts`

```
runChat() ─► withDiagnostics(userId, threadId, runChatInner, {deferCompletion})
  │
  ├─ 1. getUserWithSettings → displayName, maxDailyUsd
  ├─ 2. reserveTurnBudget(userId, maxDailyUsd)         ← $0.01 estimate
  │        tryReserveBudget: atomic INSERT..ON CONFLICT DO UPDATE
  │        WHERE total+candidate <= cap  + ai_budget_reservations ledger row
  ├─ 3. appendUserMessage(userId, threadId, userMessage)
  │        tx: thread-ownership check + insert (idempotencyKey ui:{id})
  │        + touch thread.updatedAt; failure → persistence outbox
  ├─ 4. [listMessages(60), buildLiveSnapshot] in parallel
  │        snapshot: prices (800ms/symbol race), session, copilot health,
  │        market phase, user watchlist
  ├─ 5. compactThread → rolling summary (Phase 7)
  │        filter OUT system-role messages + data-plan parts
  │        (Gemini rejects non-first-position system messages)
  ├─ 6. routeTurn → RoutingDecision { domain, planRequired, rationale }
  │        vision (image) > override > semantic LLM classifier (if enabled,
  │        ≥10 chars, 2s timeout, LRU cache, conf ≥ 0.7) > keyword scoring
  ├─ 7. decryptByok once (PERF-05)
  │
  └─ runChatWithFallback(maxAttempts: 5)
        └─ per attempt:
             ├─ resolveModelForTurn
             │    vision model | modelOverride | domain tier (fundamental→pro,
             │    technical→fast, summary→cheap)
             │    + checkBudgetAlertsAndThresholds (monthly cap, provider
             │    thresholds, 50/80/100% alerts) + circuit breaker
             ├─ runPlanner if planRequired (cheap summary model, budget-guard,
             │    deterministic fallback, persisted as system-role data-plan)
             ├─ buildSystemPrompt(BASE + user ctx + LIVE_SNAPSHOT + market
             │    phase) + compaction.extraSystem + customInstructions
             ├─ estimateContextUsage → warningNote / truncate tail
             ├─ domainToolFilter(domain, userPlan) + drop non-essential tools
             │    when budget-soft-blocked; + googleSearch tool for
             │    fundamental when Vertex configured
             ├─ awaitLlmHeadroom(provider:user)     ← provider rate-limit gate
             ├─ client.streamText(...) via DI LLM_CLIENT token
             │    stopWhen: MAX_TOOL_ITERATIONS; anthropic prompt caching
             ├─ onFinish: enforceCitations → appendAssistantMessage (idempotent)
             │    → provider rate-limit note + providerTests upsert
             │    → flushBatchedToolTelemetry → recordTelemetry
             │    → budget.reconcile(actualCost) → persistDiagnosticContext
             │    → flushLangfuse → waitUntil(runAutoTitleBackground)
             └─ onError (post-handoff): release budget + telemetry + trace
```

The retry loop (`chat-retry-loop.ts`) classifies failures
(`fallback.ts`: 401/403 auth, 429, 5xx, context-overflow, timeout; hard 4xx
NOT retried), walks the user's `aiFallbackChain` via `pickNextFallbackProvider`
(domain-appropriate tier), appends a `data-fallback` part to the final message
so the user sees why the model changed, and releases the budget reservation on
terminal failure (STAB-02 — no stranded spend).

### 4.2 Findings

**[STRENGTH]** — Budget discipline is exemplary: reserve → reconcile/release is
idempotent, ledger-backed, and every failure path (including late
post-handoff stream errors) releases the reservation. `budget.reconcile` never
double-applies; `release` keeps the handle open if the DB write fails.

**[STRENGTH]** — The user message is persisted **before** any model work, so a
failed turn leaves the prompt in history for retries; the assistant message is
persisted with an idempotency key from the SDK message id, so a
transport-retried turn cannot duplicate rows.

**[STRENGTH]** — Prompt hygiene: system-role rows (rolling summary, planner
plans) are filtered before `convertToModelMessages`, context estimation
truncates long tails with a visible warning injected into the prompt, and the
LIVE_SNAPSHOT gives the model ambient prices so it needn't burn a tool call for
trivial quotes.

**[INFO]** — `compactThread` (60-message window) runs before routing, so the
compaction call uses the derived planner model (`derivePlannerModel`), cached
by MD5 digest of the older portion + message-count delta (≥5 new messages
triggers re-compaction). Worst case: one extra cheap LLM call per turn on long
threads.

**[INFO]** — The assistant's persisted `parts` come from
`response.messages.at(-1)`; `stripPartsForStorage` removes
`imageDataUrl/image/data/candles/rawResponse` from tool results so the DB
doesn't bloat with binary/raw payloads — and so the worker's reconstructed
history can't carry huge blobs either.

**[INFO]** — `runAutoTitleBackground` fires via `waitUntil` after onFinish:
only when the thread has no title, budget-guarded, telemetry-recorded. A title
failure never crashes the stream.

---

## Phase 5 — Multi-Agent Committee (Quick / Standard, sync SSE)

### 5.1 Flow — `packages/ai/src/multi-agent/orchestrator.ts`

```
runMultiAgentChat()
  ├─ resolveMode(analysisMode, userText)   modes.ts: autoDetectMode
  │     greetings/price-quotes → single; "should i buy/sell/enter" → full;
  │     "full|deep dive|committee"+analysis → full; analyze/outlook → standard
  ├─ budget: tryReserveBudget(MODE_COST_ESTIMATE)  (quick .015 / std .025)
  │     + checkBudgetAlertsAndThresholds (monthly cap; explicit full preserved)
  ├─ appendUserMessage (idempotencyKey …:user)
  ├─ buildSharedContext (context.ts):
  │     buildLiveSnapshot + PREFETCHED candles (1h/4h/1d × 50) + calendar
  │     (7d, 15 events) → ONE shared block all specialists prefer
  ├─ selectAgents(mode): quick [technical] · standard [technical, fundamental]
  ├─ run specialists with limitConcurrency(MULTI_AGENT_CONCURRENCY ?? 3)
  │     BaseAgent.run (base-agent.ts):
  │       system = agent prompt + RESPONSE LANGUAGE + LIVE CONTEXT + prefetch
  │       messages = history (non-system) + user text
  │       generateText({ tools: agent tools, stopWhen: MAX_TOOL_ITERATIONS,
  │                     maxOutputTokens: 3000, abort: agent timeout (15s) })
  │       withAgentModelFallback (tier fast/mid, model fallback)
  │       parseOutput: zod schema → bias/confidence/reasoning/rawData
  │       (+ _tools list from response)
  │     progress events: agents_start/start/done/error → onProgress
  ├─ STRICT FULL: any specialist failure → MultiAgentStrictFailureError,
  │     no partial answer (orchestrator throws before persistence)
  ├─ DecisionAgent.fuse (decision-agent.ts): strong-tier model, NO tools,
  │     opinions block + compacted history + unavailable-agent note
  │     streamText fullStream → onTextChunk(delta) as tokens arrive
  │     (30s timeout); usage/errors are checked before persistence, and a
  │     failed partial stream does not retry into the existing client stream
  │     (non-strict modes still fall back when no text was emitted)
  ├─ enforceCitations(fused text, synthetic tool-call parts from specialist
  │     tool names)
  ├─ appendAssistantMessage (idempotencyKey …:assistant) →
  │     saveAgentOpinions → recordTelemetry
  └─ budget reconcile (delta = actual − estimate) / release on failure
```

### 5.2 Findings

**[RESOLVED]** — `buildSharedContext` now reuses `compactThread` with the same
planner-tier compaction model as single-agent turns. Every specialist and the
Decision agent receives the compacted verbatim tail plus the durable summary
in its system context, while the authoritative history remains DB-sourced.

**[RESOLVED]** — Fusion now forwards each `text-delta` from `fullStream` for
low TTFB, but waits for usage and stream-error checks before persistence and
terminal success. If a provider fails after emitting text, the run terminates
instead of switching providers and duplicating the already-visible prefix.

**[STRENGTH]** — Strict Full mode is genuinely atomic: failed specialist OR
failed Decision agent → throw before any assistant message is persisted or
streamed; the client gets a terminal `failed` snapshot and a sanitized error,
never a partial verdict. Quick/Standard keep a graceful degrade path
(concatenated opinions with a warning banner).

**[STRENGTH]** — `ProgressTracker` gives the UI live per-agent state
(pending/running/done/error + opinion), and `specialists_start` rebuilds the
agent set so retries never leave phantom agents stuck pending.

**[INFO]** — Multi-agent does **not** go through `awaitLlmHeadroom` (the
provider rate-limit gate) that single-agent uses; the mitigations are the
concurrency cap (default 3), per-agent timeouts, and per-agent model fallback.
On low-tier BYOK keys, a 3-wide specialist burst can still 429 — the retry
then fails the agent (non-strict modes continue; Full fails strict). Acceptable
but worth noting.

**[INFO]** — Specialists are stateless `BaseAgent` instances constructed per
turn from a typed factory map (`technical/fundamental/risk/sentiment`);
`DecisionAgent` is deliberately NOT a `BaseAgent` (LSP-1) — the type system
enforces that `decision` cannot be added to the specialist map.

---

## Phase 6 — Full Mode Background Jobs (Worker)

### 6.1 Flow

```
POST /api/chat (full)                    route.ts
  └─ enqueueAnalysisJob({userId, threadId, mode:'full', idempotencyKey,
        traceId, status:'pending', historyParts: []})
      (ON CONFLICT (userId, idempotencyKey) DO NOTHING)
  └─ returns JSON {type:'analysis-queued', jobId}
Browser polls GET /api/chat/analysis-jobs/{jobId}   (2s→10s, ≤5min, 3 strikes)
  └─ withAuth + jobId format check + getAnalysisJob(userId, jobId)  ← user-scoped
  └─ on complete → synthesize text-start/one delta/text-end + meta part

Worker (apps/worker/src/jobs/multi-agent-analysis.ts, poll every ~3s):
  ├─ claimNextPendingJob(): FOR UPDATE SKIP LOCKED, workerRunId lease,
  │     attemptCount++  (packages/db/src/queries/analysis-jobs.ts)
  ├─ lease heartbeat every 30s (conditional on status='running' AND lease)
  ├─ load user settings + user row; reconstruct userMessage from parts
  │     (text fallback for legacy rows)
  ├─ re-check thread ownership; reload authoritative history (200)
  ├─ traceIdStorage.run(job.traceId, …) — log correlation
  ├─ runMultiAgentChat(..., idempotencyKey: analysis-job:{jobId},
  │     onProgress → ProgressTracker snapshots persisted serially
  │     to job.progress)   (Full-mode invariant: exactly 4 specialists)
  ├─ complete: status='complete', result{finalText, agentOpinions, mode,
  │     totalCostUsd, totalLatencyMs, messageId}
  │     (update conditional on lease — lost lease ⇒ abandoned)
  ├─ failure: isRetryableAnalysisError (timeout/network/429/5xx patterns)
  │     → requeue as 'pending' (≤3 attempts) else 'failed'
  │     + terminal progress snapshot ('retrying'/'failed')
  ├─ recoverStaleJobs (5-min stale, bounded attempts)
  └─ retention: purge completed/failed jobs older than 7 days
```

### 6.2 Findings

**[STRENGTH]** — The queue is a proper distributed work queue: lease-token
conditional writes mean a dead worker cannot resurrect a job it no longer owns;
`recoverStaleJobs` requeues-with-attempt-cap; completion/failure writes are
conditional on the lease, so double-processing cannot double-persist. Message
persistence inside the pipeline uses `analysis-job:{jobId}:user|assistant`
idempotency keys, so a worker crash between persist steps doesn't duplicate
rows on retry.

**[STRENGTH]** — Trace correlation: the web request's diagnostic `traceId` is
stored on the job and re-applied in the worker via `traceIdStorage`, and the
diagnostic context is seeded with `runId` + `jobId`, so one turn is traceable
across the web/worker boundary and in the admin diagnostic explorer.

**[STRENGTH]** — The polling endpoint sanitizes everything user-facing: stable
generic error copy, no provider/database details, user-scoped lookup, jobId
format validation.

**[INFO]** — Same non-progressive delivery as Phase 5: the client synthesizes
the final text as one `text-delta` (message id from the persisted
`result.messageId`, so retries align with the DB row).

**[INFO]** — The worker reuses the exact same `@kestrel/ai` pipeline as the web
route (dynamic import of `runMultiAgentChat`), so sync and async paths cannot
drift behaviorally.

**[INFO]** — `historyParts: []` on the queued job + authoritative reload in the
worker is the correct "never trust the client snapshot" pattern, carried all
the way through.

---

## Phase 7 — Tool Layer (Registry, Execution, Telemetry, Guards)

### 7.1 Architecture

- **Registry** (`tools/registry.ts`): singleton; `register()` wraps every tool
  in `withTelemetry`; `resolve(names)` / `resolveForPlan(names, plan)` for
  per-tenant gating (PF-16); category files (`market.ts`, `analysis.ts`,
  `journal.ts`, `system.ts`, `web.ts`) self-register on import.
- **Tool count**: `TOOL_NAMES` in `@kestrel/shared` currently lists **33**
  tools (the recently-added `web_search` makes 33).
- **Domain subsetting** (`tools/by-domain.ts`): `ALWAYS_TOOLS`
  (get_price, set_alert, log_journal, summarize_thread, search_knowledge) +
  per-domain sets; `generic` gets everything. Cuts tool-description tokens
  60–80%.
- **Execution wrapper** (`tools/with-telemetry.ts`): per-tool timeout
  (default 25s; overrides: analyze_chart_image 45s, convene_committee 60s,
  replay_setup 40s, get_price 5s, get_candles 10s, get_indicators 10s),
  parent-abort propagation + race, batched telemetry (M4), diagnostic
  steps, output-size estimation, normalized error codes.
- **Mutation guard** (`tools/mutation-guard.ts`): `set_alert`, `log_journal`,
  `share_snapshot`, `run_system_action` require intent keywords in the latest
  user message; `run_system_action` additionally requires an action mention.
- **Web search** (`tools/web-search.ts`): Exa→Tavily→Brave failover, per-turn
  call cap (default 2), in-memory cache (256 entries, TTL), URL/scheme
  validation, HTML/control-char stripping, results marked UNTRUSTED in the
  tool description; + Vertex `googleSearch` tool for fundamental domain when
  `GOOGLE_VERTEX_PROJECT` is set.
- **System prompt** carries an Untrusted Content Policy (tool output is data,
  never instructions; never call mutation tools from tool content) and a
  tool-usage contract (prefer `get_indicators`, use LIVE_SNAPSHOT instead of
  `get_price`, explicit timeframes, etc.).

### 7.2 Findings

**[RESOLVED]** — The canonical prompt now directs trading-decision questions
to the selected analyst committee and explicitly states that the legacy
`convene_committee` tool is not advertised in domain-routed analytical turns.
The tool remains available only where the generic registry intentionally exposes
it, avoiding an expensive nested committee call in specialist domains.

**[RESOLVED]** — Human-facing repository docs now report 33 tools, matching the
canonical shared `TOOL_NAMES` list. The generated architecture snapshot remains
a manually refreshed reference artifact per the repository instructions.

**[STRENGTH]** — The mutation guard is a genuine safety net: tools that write
user data (alerts, journal, share links) or run system actions are gated on
user intent in the *latest* message, and the system prompt's Untrusted Content
Policy covers prompt-injection via news/RAG/web content.

**[RESOLVED / SAFETY TRADE-OFF RETAINED]** — Mutation intent now recognizes
explicit Chinese alert, journal, share, and sync requests. Bare follow-up
confirmations still do not authorize a mutation because the stateless guard
cannot safely bind a confirmation to one pending action; this remains a
deliberate safety-over-convenience choice.

**[STRENGTH]** — Tool telemetry is uniform: every invocation produces one
`chat_tool_telemetry` row (buffered and bulk-flushed at onFinish), plus a
diagnostic step, plus timeout/abort propagation from the route signal down to
the provider fetch — a hung tool cannot consume the whole turn.

---

## Phase 8 — Memory, Verification, Cost, Diagnostics, Persistence, Data

### 8.1 Memory — rolling thread summary (`memory/thread-summary.ts`)

`compactThread`: KEEP_VERBATIM 12 / SUMMARISE_AFTER 30 / MIN_NEW 5 / MD5 digest
cache / 1400-char cap / budget-guarded LLM (planner-tier model) / deterministic
fallback ("Earlier N messages… latest: …") / persisted as a system message with
a `thread-summary` part; summary messages are excluded from future compaction
inputs. Failure degrades to truncation — the chat never regresses on a memory
side-effect.

### 8.2 Verification (`verification.ts`)

`enforceCitations` scans the finished assistant text for price tokens
(instrument-banded regex: gold `1xxx–4xxxx`, FX `0.xxx/1.xxx`) and event
tokens, and only flags when no relevant numeric/news tool was called *this
turn* (counts `tool-call` parts, never `tool-result` — prevents stale replay
from satisfying the check). Output is ONE muted footer
(`data-citation-warning`, stance "soft") with per-claim `findings` for
drill-down. Multi-agent passes synthetic tool-call parts built from specialist
tool names (Q2).

### 8.3 Cost controls (`cost.ts`, `budget-reservation.ts`)

- `estimateCostUsd` = conservative upper-bound list prices (Q1 2026) keyed by
  provider prefix normalization (`google-vertex/` → `google/`).
- Daily guardrail: `daily_ai_spend` counter + `ai_budget_reservations` ledger,
  atomic `INSERT..ON CONFLICT … WHERE total+candidate <= cap` (concurrent 99%
  turns serialize correctly), NaN guards, `reconcile`/`release` idempotent and
  locked (`FOR UPDATE`), `recoverStaleBudgetReservations` worker job (every
  10 min).
- Monthly: 50/80/100% spend alerts + hard block; per-provider thresholds;
  alerts via email/Telegram with alert-state persistence on the settings row.

### 8.4 Diagnostics (`diagnostics/`)

`withDiagnostics` = AsyncLocalStorage run context (traceId/userId/threadId/
requestId/runId/jobId), `recordStep`/`completeStep`/`recordError`, automatic
secret redaction at record time, persistence to `diagnostic_traces`, attachment
of the redacted trace to errors for Sentry, admin explorer UI, `DEBUG_TRACE_PATH`
file output option. The full-mode worker joins the same trace via `job.traceId`.

### 8.5 Persistence (`persistence/message-persistence.ts`)

Transactions verify thread ownership on every write; idempotency keys
(`ui:{id}`, `full:{thread}:{msg}`, `analysis-job:{jobId}:…`) prevent duplicate
rows on retry; failures are enqueued to the persistence outbox
(`persistence-outbox.ts`) and replayed by the `persistence-recovery` worker
job; `stripPartsForStorage` prunes binary/raw payloads from tool results.

### 8.6 Data layer

`@kestrel/data` runWithFailover (health-aware ordering, pinned providers for
ticks/candles), per-symbol 800ms snapshot races, SWR at every level. The
request proxy deliberately does not import `@kestrel/db` (lightweight
security boundary).

### 8.7 Findings

**[STRENGTH]** — The budget system is the standout subsystem: single source of
truth (counter, not telemetry), reservation ledger with crash recovery,
idempotent terminal transitions, and alerts with persisted alert-state. A
crashed provider call cannot silently consume a user's daily budget.

**[STRENGTH]** — Citation enforcement is honest by design: "soft" stance,
single footer line (no warning wall), per-claim findings, and it correctly
distinguishes "covered by a tool this turn" from "mentioned in history".

**[INFO]** — Cost accounting is estimate-based (upper bounds from list prices).
Reconciliation moves the ledger to the *estimate* of actual usage, not the
provider's bill. For a consumer copilot this bias is conservative (good), but
the numbers in /settings/usage are estimates, not invoices.

**[INFO]** — PGlite (dev) vs Postgres (prod) divergence is well-documented and
defended (error-wrapping extraction via `err.cause`, driver-shape
normalization in `rate-limit.ts`/`cost.ts`).

---

## Cross-Cutting Observations

| # | Observation | Type |
|---|---|---|
| C1 | Defense-in-depth is consistent: proxy CSRF → HMAC-signed user header → JWT re-validation → route ownership check → userId-scoped queries → idempotent writes. | STRENGTH |
| C2 | One pipeline, two planes: sync (Vercel) and async (worker) both call `runMultiAgentChat` from `@kestrel/ai`; behavior cannot drift. | STRENGTH |
| C3 | Abort signals are threaded end-to-end: route timeout ∪ client disconnect → streamText → tool context → tool wrapper → provider fetch. Stop works, hung tools can't eat the turn. | STRENGTH |
| C4 | Single-agent has LLM-throttle + circuit breaker + fallback chain; multi-agent has concurrency cap + agent timeouts + per-agent model fallback but no shared throttle. | INFO |
| C5 | Sanitization discipline at every public boundary: SSE events, job polling, error envelopes, progress events — internal details never leak to the client. | STRENGTH |
| C6 | AsyncLocalStorage (tool context, diagnostics, trace/request/run ids) replaces global state everywhere — no cross-user leakage by construction. | STRENGTH |
| C7 | Two committee implementations coexist: the `convene_committee` tool (legacy, 4-LLM in one tool call) and the multi-agent mode pipeline. Only the latter is reachable in analytical turns (see Phase 7 finding). | INFO |
| C8 | Estimation points (cost, MODE_COST_ESTIMATE, MODE_OPTIONS latency) are heuristics; they drive guardrails and UI promises respectively, and are periodically reconciled. | INFO |

---

## Recommended Actions — implementation status

1. **Completed — Multi-agent compaction.** `buildSharedContext` reuses the
   rolling-summary engine and bounds specialist/Decision history.
2. **Completed — Image override race.** The transport callback reads and clears
   the one-shot override; settled/error cleanup prevents leakage.
3. **Completed — Fusion streaming.** Decision deltas are forwarded as they
   arrive, while persistence waits for usage/error validation and partial-output
   failures do not trigger duplicate provider fallback.
4. **Completed — Committee/docs drift.** The prompt no longer advertises the
   unavailable legacy tool in analytical domains, and repository docs report 33
   tools. The generated architecture snapshot remains intentionally manual.
5. **Completed — Synchronous latency hardening.** Quick mode uses a 45s timeout;
   Standard retains the 55s cap, and quick/standard responses log and expose
   TTFB alongside total latency.
6. **Completed — Mutation intent UX.** Explicit Chinese alert, journal, share,
   and sync requests are recognized. Bare follow-up confirmations remain
   blocked because the stateless guard cannot safely bind “yes” to one pending
   mutation.
7. **Completed — Cost transparency.** Settings and usage surfaces explain that
   costs are conservative provider-rate estimates rather than invoices.

---

## Verdict

**A mature, layered agentic system with unusually strong operational
guardrails.** The message path is coherent end-to-end: one `useChat` surface
over three transport shapes; a hardened request boundary; a single-agent core
with budget ledger, retry/fallback chain, plan-then-act, compaction, citation
enforcement and diagnostics; a strict, progress-streamed multi-agent committee;
and a durable worker queue for Full mode with lease-based idempotency and
trace correlation. No critical defects found. The gaps are engineering-quality
items (compaction for multi-agent, streaming fidelity, one ref race, doc
drift) rather than correctness or security holes.

*Generated by Buffy (Codebuff) — full-flow audit, 2026-08-15.*
