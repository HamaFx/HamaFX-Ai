# Kestrel AI v2 — Mastra-Native Advanced System Build Plan

**Status:** Approved build plan — implementation order, decisions, and acceptance criteria
**Last updated:** 2026-08-20
**Scope:** Full advancement of the AI agent system to a Mastra-native, testable, loggable, improvable, trainable architecture

> This is the build plan. Current implementation reference stays in [AI-AGENT-ARCHITECTURE.md](AI-AGENT-ARCHITECTURE.md); decisions/gates stay in [AI-AGENT-MASTRA-ROADMAP.md](AI-AGENT-MASTRA-ROADMAP.md); dated evidence goes in [AI-AGENT-VALIDATION-LOG.md](AI-AGENT-VALIDATION-LOG.md). The system is built **complete first, tested later** per operator direction; unit tests are written alongside each phase and executed in a later validation round.

## 1. Recorded decisions (2026-08-20)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Mastra runtime storage | **Composite: PostgresStore (prod, `mastra` schema) + LibSQL file store (local dev); observability domain stays on Langfuse** | Best output quality: Mastra-managed schema tracks Mastra's own evolution (no adapter to maintain), no conflict with Drizzle business tables, zero-setup local dev preserved (LibSQL is file-based, matches the PGlite philosophy), and the high-volume observability domain goes to the telemetry backend already in production use. |
| D2 | Durable Full-mode execution | **Replace `analysis_jobs` with Mastra durable workflows/agents** | Restart survival, observe()/reconnect, snapshots, and suspend/resume come free; the existing lease/heartbeat system is hand-rolled infrastructure Mastra now provides. |
| D3 | Memory | **Full Mastra memory**: thread message history + working memory (preferences) + observational memory + semantic recall via BYOK embeddings, scoped `resourceId = userId`, `thread = threadId` | Replaces custom `memory-context.ts` and rolling compaction on Mastra paths with the framework's native, tested implementation. |
| D4 | Guardrails | **LLM-based `PromptInjectionDetector` + `UnicodeNormalizer` on ALL chat paths** (fast-tier resolved model) | Replaces regex-only injection safety with real detection; normalizer removes Unicode/control-char bypasses. |
| D5 | Committees | **Mastra Workflow as the primary primitive** (specialists as steps); **Network deferred** to a gated future capability | Workflow is deterministic, matches the strict Full-mode no-partial-result contract, supports per-step retries/scorers/time-travel. Network's autonomous delegation weakens those guarantees and stays gated behind evaluation (roadmap Phase 8 exit criteria). |
| D6 | Mastra server/Studio | **Shipped via a standalone server** (`pnpm --filter @kestrel/ai mastra:studio` → `:4111`) — Studio serves the real instance (storage, traces, memory, run snapshots) without the CLI bundler | The `mastra` CLI cannot bundle this repo's config: its rollup bundle inlines the workspace graph (pino, drizzle, …) and the post-bundle validation stubs externals to `{}`, crashing on module-scope `pino(...)`; the 1.x CLI is also on a separate release track from core 1.60. `mastra-v2/studio-server.ts` bypasses the CLI entirely — it calls `createNodeServer()` from `@mastra/deployer/server` against the built `@kestrel/ai` instance and serves the CLI's bundled Studio UI via `MASTRA_STUDIO_PATH`. Observability additionally ships via Langfuse + the admin Mastra Runs tab (Phase 8). Component registration on the instance stays deferred — agents/workflows are per-request BYOK factories by design (registry `phase: 2/4/7`), so Studio shows storage/telemetry rather than a static graph. |
| D7 | Live eval | **Sampled live scoring** on production agents (~5–10% via `@mastra/evals`) | Continuous quality signal feeding the governed dataset export → Langfuse → future fine-tuning. |
| D8 | Explicitly excluded | Voice, code mode, workspace/sandbox, A2A/ACP protocols, Mastra platform hosting, channels | Not needed for the research-copilot product contract. |

**Retained (not replaced):** capability policy (`capabilities.ts`), BYOK provider resolution + AI SDK `LanguageModel` transport, budget guards, Drizzle business schema, market-data failover, auth/tenancy, pino + Langfuse + run telemetry, governed dataset export, eval quality gate, admin dashboard.

## 2. Packages to add

```jsonc
// packages/ai (installed Phase 0)
"@mastra/core": "^1.60.0",      // shared Mastra instance — bumped from ^1.59.0 (broken build, see Phase 0 status)
"@mastra/pg": "^1.21.0",        // PostgresStore — prod runtime state (latest; independently versioned)
"@mastra/libsql": "^1.21.0",    // LibSQLStore — local dev runtime state (latest)
"@mastra/server": "^1.60.0",    // Mastra server (Studio wiring lands in Phase 8)
"@mastra/evals": "(Phase 6)",   // prebuilt scorers, datasets, experiments
```

`Memory` is exported by `@mastra/core` (v1.59, `dist/memory`); use the package export the installed version exposes (`@mastra/core/memory` or `@mastra/memory`). Phase 1 installed `@mastra/memory@^1.27.0` (independently versioned; the concrete Memory class) — core 1.60's `@mastra/core/memory` re-exports it.

## 3. Target architecture

```text
apps/web (Next.js) ──┐
apps/worker ────────┼──▶ packages/ai/src/mastra-v2/  (shared Mastra instance + registry)
mastra process ─────┘         │
                              ├── Storage (PostgresStore prod / LibSQL dev)
                              │     domains: memory, workflows, scores, datasets, experiments, backgroundTasks, schedules, threadState
                              ├── Memory (thread + working + observational + semantic recall; resourceId=userId)
                              ├── Agents (xauusd-research, conversation, symbol-modes, canonical-chat, worker text, title)
                              ├── Workflows (research/mode pipeline, mutation approvals with suspend/resume)
                              ├── Guardrails (PromptInjectionDetector, UnicodeNormalizer)
                              ├── Evals (live sampled scorers, datasets, experiments, CI gate)
                              └── Server/Studio (dev + prod)  → traces, memory, workflow control
Kestrel keeps: auth, tenancy, BYOK resolver → LanguageModel, budgets, Drizzle business data,
market data, capability policy, pino + Langfuse + run telemetry, governed dataset export
```

## 4. Phases

Each phase lists goal → files → APIs → acceptance. Tests are written with the code; **execution of the suites is deferred to the validation round** per operator instruction. Typecheck stays green throughout (`pnpm typecheck`).

### Phase 0 — Mastra foundation: instance, storage, server, telemetry

**Goal:** one shared Mastra instance that web, worker, and the standalone server all use; runtime state persisted; Studio reachable.

Files:
- `packages/ai/src/mastra-v2/storage.ts` — composite storage selection: `PostgresStore` (prod, `DATABASE_URL`/direct connection, `mastra` schema namespace) / `LibSQLStore` (dev, `file:./.kestrel/mastra.db`, gitignored). Config via `MASTRA_STORAGE=postgres|libsql`.
- `packages/ai/src/mastra-v2/telemetry.ts` — Mastra telemetry export wired to the existing Langfuse/OpenTelemetry setup (`instrumentation.ts`); run IDs propagated via `requestContext` (`runId`, `userId`, `threadId`) so Mastra traces, pino logs, and Langfuse traces share one identity.
- `packages/ai/src/mastra-v2/instance.ts` — the `Mastra` instance: agents, workflows, storage, telemetry.
- `packages/ai/src/mastra-v2/registry.ts` — capability-driven agent/workflow registration (each capability id maps to a Mastra agent or workflow, preserving `capabilities.ts` as the fail-closed gate).
- `packages/ai/mastra.config.ts` + `packages/ai/src/mastra-v2/server.ts` — `mastra dev` entry for Studio; a standalone server entrypoint used in Docker (dev and prod).
- `docker/` — `mastra` service next to the worker (same image, `mastra dev`-less prod entrypoint).

APIs: `new Mastra({ agents, workflows, storage, telemetry })`, `PostgresStore`, `LibSQLStore`, `mastra.getAgent()`, `mastra.getWorkflow()`.

Acceptance: web/worker resolve agents from the shared instance; Studio loads at `:4111` (dev) and the prod server route serves ops API; run IDs appear in Langfuse and pino.

**Known check:** PostgresStore uses a `pg`-style client — confirm direct-connection config and that `mastra`-schema auto-init is idempotent (`IF NOT EXISTS`) so it can never collide with Drizzle migrations. Local dev uses LibSQL, so PGlite is untouched.

#### Phase 0 status — DONE (2026-08-20)

Shipped and verified (`pnpm typecheck` green monorepo-wide; `@kestrel/ai` suite 130 files / 1,193 tests pass, incl. 26 new `mastra-v2-*` tests):

- `src/mastra-v2/storage.ts` — `PostgresStore` (prod, direct connection, `mastra` schema namespace, retention config, TLS policy mirroring `@kestrel/db`) / `LibSQLStore` (dev, `file:./.kestrel/mastra.db`). `initializeMastraStorage()` idempotent.
- `src/mastra-v2/instance.ts` — shared `Mastra` instance with storage + logger + server config (`MASTRA_SERVER_PORT`/`HOST`, default `4111`/`0.0.0.0`); workers disabled for web, `runWorkers: true` opt-in for the standalone server.
- `src/mastra-v2/logger.ts` — `IMastraLogger` adapter forwarding Mastra log lines into the shared pino stream.
- `src/mastra-v2/registry.ts` — capability → component mapping + typed resolution, fail-closed.
- `mastra.config.ts` — CLI entry for Studio (config load verified via tsx).

Findings that changed the plan:

1. **`@mastra/core@1.59.0` is a broken build** — its `.d.ts` declares `KNOWLEDGE_*_SCHEMA` storage exports that its built JS never exports, and `@mastra/libsql`/`@mastra/pg@1.21.0` import them at runtime, so any import crashes. Bumped core to `^1.60.0` (ships the exports); all existing Mastra code unaffected. `@mastra/libsql`/`@mastra/pg` stay `^1.21.0` (their latest; independently versioned).
2. **libsql `:memory:` is per-connection** — schema init and domain writes would hit different databases. Never use it; tests use temp-file URLs; doc comment updated.
3. **`mastra` CLI fails to bundle the config** — the rollup bundle inlines the workspace graph and its post-bundle validation stubs externals to `{}`, crashing on module-scope `pino(...)`; the 1.x CLI is also on a separate release track from core 1.60. The config itself loads and initializes fine (verified via plain Node + `node --conditions=react-server`). Studio shipped anyway via the standalone server (decision D6) — `packages/ai/src/mastra-v2/studio-server.ts` + `pnpm --filter @kestrel/ai mastra:studio`, which calls `createNodeServer()` directly against the built instance and bypasses the CLI bundler entirely. (The `typescript-paths` rollup plugin used by the CLI also crashes on TS 7's removed `ts.sys`; a pnpm patch degrades it gracefully so `mastra dev` at least gets past bundling if the validation wall is ever lifted.)

### Phase 1 — Memory & context

**Goal:** full Mastra memory replaces `memory-context.ts` and rolling compaction on all Mastra paths; preferences come from working memory; strict user scoping preserved.

Files:
- `packages/ai/src/mastra-v2/memory.ts` — one `Memory` instance over the Phase 0 storage: `lastMessages` (~20), `workingMemory: { enabled: true }` (resource-scoped), `semanticRecall` (BYOK embedding model via the existing resolver), observational memory (fast-tier model, gated `ENABLE_MASTRA_OBSERVATIONAL_MEMORY`).
- `packages/ai/src/mastra-v2/context.ts` — per-call memory wiring: `thread: threadId`, `resource: userId`, plus a one-time **working-memory seed migration** that writes `userSettings` (defaultSymbol, language, timezone, report style, preferred timeframes) into working memory from Drizzle.
- `packages/ai/src/mastra/run.ts`, `mode-runner.ts`, `canonical-chat.ts` — switch from `loadMastraMemoryContext` to the Mastra `memory` option; delete `memory-context.ts` when no longer referenced.
- `packages/ai/src/memory/thread-summary.ts` — compaction falls back to observational memory on Mastra paths; keep the deterministic fallback for the shadow only.

APIs: `new Memory({ options: { lastMessages, workingMemory, semanticRecall, observationalMemory } })`, `agent.generate(input, { memory: { thread, resource } })`, working memory markdown blocks.

Acceptance: no cross-user leakage (memory keyed by `userId` as `resource`); preferences visible to agents; long threads stay within context via observational memory; `ENABLE_MASTRA_MEMORY` flag retired.

#### Phase 1 status — DONE (2026-08-21)

Shipped and verified (monorepo typecheck green 14/14; `@kestrel/ai` suite 132 files / 1,214 tests pass, incl. 21 new memory tests):

- `src/mastra-v2/memory.ts` — `createKestrelMemory()`: one `Memory` per request over the shared Phase 0 storage/vector. `lastMessages: 20`; working memory resource-scoped w/ template; semantic recall `topK: 4`, scope `resource`, gated by `ENABLE_MASTRA_SEMANTIC_RECALL` (default on); observational memory gated by `ENABLE_MASTRA_OBSERVATIONAL_MEMORY` (default off). BYOK embedder wraps the existing `embedTexts` + `resolveEmbeddingModel` as an AI SDK v2 `EmbeddingModel` (`createKestrelEmbedder`). Vector store selection mirrors storage (`PgVector` prod / `LibSQLVector` dev) with a process-wide singleton (`getKestrelVectorStore`).
- `src/mastra-v2/context.ts` — `memoryCallOptions()` (`thread`/`resource=userId`), `seedWorkingMemoryFromSettings()` (idempotent one-time Drizzle → working-memory migration), `backfillThreadHistoryIfNeeded()` (one-time per-thread copy of recent Drizzle history into Mastra storage for pre-migration threads), and `prepareKestrelMemory()` combining all three. Every step degrades gracefully (never blocks a turn).
- Wired into `run.ts` (XAUUSD report + conversation paths build memory + backfill), `report-generation.ts` (threads `callOptions` through to `generate`), `mode-runner.ts` (specialists get read-only memory: seeded working memory, no thread writes), `canonical-chat.ts` (native memory loads history itself — only the new message is sent, explicit-history fallback when memory is unavailable), `agent.ts` (agent accepts per-request `memory`).
- Deleted `src/mastra/memory-context.ts`; `ENABLE_MASTRA_MEMORY` flag retired. `memoryContext` plumbing removed from request contexts/instructions.

Findings:

1. **Mastra `Memory` silently no-ops on malformed calls** — `saveThread`/`saveMessages` accept wrong shapes without throwing (the `{ thread }` wrapper shape). The backfill guards with `getThreadById` + `recall` first; tests assert real round-trips.
2. **Existing tests mocked `../src/model` without `resolveEmbeddingModel`** — memory's debug logging calls it; the mocks were extended (no production impact).
3. **`createXauusdMastraAgent` now receives `{ model, memory }`** — the run.test assertion was relaxed to `objectContaining({ model })`.

### Phase 2 — Workflows: modes + verified reports

**Goal:** Quick/Standard/Full and the XAUUSD verified-report pipeline become Mastra workflows; delete the manual committee in `mode-runner.ts`.

Files:
- `packages/ai/src/mastra-v2/workflows/symbol-research.ts` — one workflow used by Quick/Standard/Full:
  - Step `collect-packet` (deterministic `collectSymbolResearchPacket`, fail closed on blocked).
  - Steps `technical` → `fundamental` → `risk` → `sentiment` (parallel; per-step retry with backoff replacing the current `withRetry` loop; per-step `scorers` for step-level eval).
  - Step `fusion` (no retry regression: give fusion the same retry policy as specialists).
  - Step `verify` (Full mode strict: any specialist failure → terminal failure, no partial result).
- `packages/ai/src/mastra-v2/workflows/xauusd-report.ts` — packet → generate (structured) → verify → bounded repair → persist, as workflow steps so repair attempts and verification are observable snapshots.
- `packages/ai/src/mastra/mode-runner.ts` — delegates to the workflow; agent-opinion persistence (`multi-agent/persistence.ts`) retained.
- Capability registry updated: `symbol-research` and `xauusd-research` now point at workflow ids; `supportsStreaming` stays honest until Phase 4.

APIs: `createStep`/`createWorkflow`, `.then()`/`.parallel()`, `run({ inputData })`, step `retryConfig`, step `scorers`, `mastra.getWorkflow(id).run()`.

Acceptance: same message/meta contract as today (`data-multi-agent-meta`), same strict Full semantics, per-step retries, workflow snapshots visible in Studio.

#### Phase 2 status — DONE (2026-08-21)

Shipped and verified (monorepo typecheck green; `@kestrel/ai` suite 134 files / 1,222 tests pass, incl. 12 new workflow tests):

- `src/mastra-v2/workflows/symbol-research.ts` — per-request workflow for Quick/Standard/Full: `collect-packet` (deterministic, `bail`s with the graceful blocked text on blocked packets) → `parallel` specialists (dynamic set per mode; **per-step `retries: 1`** + workflow `retryConfig { attempts: 2, delay: 2000 }` replaces the old `withRetry` loop; transient errors throw so Mastra retries, permanent 4xx/auth/context errors return an explicit marker) → `verify` (Full strict: any specialist failure throws `MastraModeStrictFailureError` — terminal, no partial result) → `fusion` (LLM synthesis for standard/full, direct formatting for single/quick; same retry policy). Full opinion metadata (model, tokens, cost, latency) flows out for `data-multi-agent-meta`.
- `src/mastra-v2/workflows/xauusd-report.ts` — per-request workflow: `collect-packet` → `generate` (structured output, no tools) → `repair` (bounded `dowhile`, `REPORT_REPAIR_LIMIT = 2` → max 3 generations) → `finalize` (ready, deterministic `patchTimeframeConflictDisclosure`, or terminal `XauusdReportVerificationError`). Every generation/verification/repair attempt is an observable workflow step; `mastra_report_repair_total` metrics preserved. Structured-output validation throws (SDK rejects before the verifier runs) are treated as repair findings exactly like the old loop.
- `src/mastra/mode-runner.ts` — thin wrapper now: model resolution + telemetry + per-call memory stay, the committee itself lives in the workflow. Strict Full failures are recomputed from the run's step results and rethrown as `MastraModeStrictFailureError`. Result contract (`finalText`/`agentOpinions`/`packet`/`stats`/cost/latency) unchanged for web + worker.
- `src/mastra/run.ts` — the XAUUSD verified-report path runs the workflow (`runId` + `resourceId=userId`); follow-up and conversation paths unchanged. Run snapshots persist to the shared Mastra storage (`mastra: getKestrelMastra().instance`), so repair attempts are visible as workflow run state.
- `src/mastra/report-generation.ts` — `generateVerifiedXauusdReport` removed (loop moved into the workflow); `repairPrompt`/`verificationFindings` exported for reuse.
- Registry updated: `xauusd-research` and `symbol-research` both map to workflow ids (`phase: 2`); `xauusd-conversation` stays agent (`phase: 4`). Per-request workflows are factories — run snapshots persist, but instance registration stays deferred to Phase 8 (Studio) as planned.

Findings:

1. **`getStepResult` inside a step returns the raw output**, not the `{ status, output }` wrapper that appears on the run result's `steps` record — the verify/fusion steps read outputs directly.
2. **Failed runs wrap step errors** (`runResult.error` is a serialized `{ name, message }`, not the original instance) — tests assert message/name; Full-mode strict failures are rebuilt from the run's step results.
3. **Structured-output validation failures throw from `agent.generate`**, before the verifier runs — the workflow's generate step catches those and routes them into repair findings (matches the old loop).
4. **`WorkflowState.workflowId` is declared but runtime returns `workflowName`** — snapshot tests assert `workflowName`.
5. **Behavior note:** in Quick/Standard modes a *permanent* specialist failure still yields a partial answer (marker → verify passes → fusion skips it), but a *transient* double-failure now fails the run (previously the specialist was silently skipped). This is the intended strictness: per-step retries absorb short-lived provider pressure, and a specialist that still fails twice is a real problem worth surfacing.

### Phase 3 — Durable execution: replace `analysis_jobs`

**Goal:** Full-mode jobs survive restarts and support observe/reconnect; delete the lease/heartbeat hand-rolling.

Files:
- `packages/ai/src/mastra-v2/workflows/full-analysis.ts` — the symbol-research workflow wrapped as a **durable workflow** (`startAsync`/suspension supported by workflow storage snapshots).
- `apps/worker/src/jobs/multi-agent-analysis.ts` — replaced by a thin consumer that claims **Mastra durable runs** (workflow run records) instead of `analysis_jobs`; the existing budget reservation, idempotent message writes, trace correlation, and retention cleanup move onto workflow run state.
- `apps/web/src/app/api/chat/route.ts` — Full mode enqueues a workflow run (`startAsync`) and returns the run id; the UI polls workflow state or uses `observe()`/PubSub where the transport supports it.
- `packages/db` — `analysis_jobs` table + related helpers removed once the migration of in-flight jobs is documented (retention window for stragglers).

APIs: `workflow.startAsync(inputData)`, workflow run state via storage (`threadState`/`workflows` domains), `createDurableAgent` only if an agent-loop (not fixed DAG) is ever needed for follow-ups.

Acceptance: no duplicate messages on restart; terminal no-partial-result preserved; run state observable in Studio; `analysis_jobs` gone.

#### Phase 3 status — DONE (2026-08-21)

Shipped and verified (monorepo typecheck green; AI 1,230 tests pass, DB 166 pass, worker 101 pass):

- `packages/ai/src/mastra-v2/workflows/full-analysis.ts` — durable queue over Mastra workflow run records: deterministic `fullAnalysisRunId()`, `enqueueFullAnalysis()` (pending snapshot with `payload` + `requestContext`), `claimNextFullAnalysisRun` (status → running), `completeFullAnalysisRun`/`failFullAnalysisRun`/`requeueFullAnalysisRun`, `recoverStaleFullAnalysisRuns` (pending/running past heartbeat → requeue/fail by attempt cap), `getFullAnalysisRun` (poll), `purgeOldFullAnalysisRuns` (retention), `getFullAnalysisQueueHealth`.
- `apps/worker/src/jobs/multi-agent-analysis.ts` — thin consumer: claims Mastra durable runs, resolves the `symbol-research` workflow with the shared Mastra instance, executes via `createRun({runId})` + `start({inputData})`, writes idempotent messages with `budget.reconcile` on completion.
- `apps/web/src/app/api/chat/route.ts` — Full mode enqueues `fullAnalysisRunId({userId, threadId, ...})` and returns `{ type: 'analysis-queued', jobId: runId }`. The UI polls `/api/chat/analysis-jobs/[runId]` which reads workflow run state directly.
- `apps/web/src/app/api/chat/analysis-jobs/[jobId]/route.ts` — poll route returns `{ status, progress, result?, error? }` from Mastra workflow run state.
- `packages/db` — `analysis_jobs` table removed via idempotent migration 0084; schema, queries, exports, retention, diagnostic-trace references all removed.
- `apps/web/src/lib/services/admin-health.ts` — queue health now queries `mastra_workflow_snapshot` instead of `analysis_jobs`.
- `infra/cron-vm/scripts/export-tenant.sh`, `delete-tenant.sh` — `analysis_jobs` references removed.
- `createSymbolResearchWorkflow` accepts a `workflowId` param — the durable queue uses `full-analysis` so claimed runs never collide with synchronous `symbol-research` snapshots.

Findings:

1. **Single-worker topology for claims:** `persistWorkflowSnapshot` has no CAS semantics — claims rely on the single-worker topology + idempotent message writes. A future multi-worker deployment would need external locking (pg advisory locks).
2. **`Workflow.getWorkflowRunById` scopes by the workflow's own id**, so the durable queue must use a distinct workflow id (`full-analysis`) that the synchronous `symbol-research` factory does not register.
3. **`workflow.run({ runId })` can adopt a run record created externally** — the web creates a pending snapshot via `createRun({runId, ...})` and the worker later calls `workflow.run({runId})` to execute it. Verification probe confirmed this works end-to-end.
4. **Failed run errors are wrapped** — the worker recomputes `MastraModeStrictFailureError` from step results.

### Phase 4 — Streaming + conversational chat

**Goal:** real token streaming on conversational paths; verified reports stay on generate+verify but stream the final verified text.

Files:
- `packages/ai/src/mastra-v2/runners/conversation.ts` — `agent.stream()` with `requestContext`, memory, guardrails, tools; emits text chunks + tool-call parts.
- `apps/web/src/lib/chat-transport.ts` + chat components — consume Mastra text stream chunks (AI SDK UI-message-compatible envelope so the PWA keeps its transport shape).
- `packages/ai/src/mastra/run.ts` (conversation path), `canonical-chat.ts` — switch to `stream()`; `mastraChatResponse` variants for streamed vs completed.
- Capability table: `supportsStreaming: true` for conversation/symbol capabilities; report capability stays false (by design, verification must complete first).

APIs: `agent.stream(input, opts)` → `textStream`/`fullStream`/`partialStream`, `onChunk`, `onIterationComplete` (progress events).

Acceptance: progressive output on canonical chat + XAUUSD conversation + Quick/Standard; cancellation aborts the stream; verified report card still renders after verification.

#### Phase 4 status — DONE (2026-08-21)

Shipped and verified (monorepo typecheck green AI+web; AI 1,232 tests pass, web 1,007 pass, worker 101 pass):

- `packages/ai/src/mastra/stream-runner.ts` — shared Mastra `agent.stream()` runner with incremental callbacks, accumulated final text, usage extraction, request context, and abort propagation.
- `packages/ai/src/mastra/canonical-chat.ts` — extracted shared `setupCanonicalChat` helper; added `runMastraCanonicalChatStream` that yields `textStream` chunks with a deferred `completion` promise carrying usage, routing, and tool names.
- `packages/ai/src/mastra/run.ts` — added `runXauusdMastraConversationStream` producing an `XauusdMastraConversationStream` with lazy text iterable and deferred completion.
- `apps/web/src/lib/services/mastra-stream-response.ts` — validated SSE adapter that emits text deltas immediately, sends terminal metadata before `text-end`, and respects `AbortSignal`.
- `apps/web/src/lib/services/mastra-canonical-chat-stream.ts` — streaming canonical chat service that yields provider chunks immediately, persists the assistant message only after stream completion, and reconciles budget from actual usage.
- `apps/web/src/lib/services/mastra-chat-stream.ts` — streaming XAUUSD conversation service with the same deferred-persistence safety.
- `apps/web/src/app/api/chat/route.ts` — conversational XAUUSD and canonical chat paths call the streaming services. Verified XAUUSD reports, Full-mode jobs, and Quick/Standard modes retain their existing response contracts.
- Capability table: `xauusd-conversation`, `xauusd-research`, and `symbol-research` capabilities now advertise `supportsStreaming: true`; mutation workflows stay false. Verified reports are still buffered until their verifier succeeds.

Findings:

1. **Streaming broken persistence:** `appendAssistantMessage` must not be called until `completion` resolves because the assistant text, usage, and metadata are only available after the stream is fully consumed. The new services embed the persistence step after `yield* stream.text` completes within the lazy text iterable that `mastraStreamResponse` reads.
2. **Budget release:** if an error occurs during streaming, `budget.release()` is called rather than `reconcile` because no model run completed. The old `generate()` path followed a different code path but the semantics are identical.

### Phase 5 — Guardrails & processors

**Goal:** LLM-based injection detection + input normalization on every chat path; keep the lexical route gate as fast-path, not sole defense.

Files:
- `packages/ai/src/mastra-v2/guardrails.ts` — `PromptInjectionDetector` (resolved fast-tier model via the existing BYOK resolver; `threshold` tuned per capability; strategy `block` on research paths, `rewrite`/`block` on conversation) + `UnicodeNormalizer({ stripControlChars, collapseWhitespace })`.
- Applied via `inputProcessors` on every chat-facing agent; the deterministic route layer remains as a zero-cost pre-filter.
- New regression cases added to `eval/regression-cases.json` for injection variants the LLM detector catches and regex missed.

APIs: `inputProcessors: [new UnicodeNormalizer(...), new PromptInjectionDetector({ model, threshold, strategy, detectionTypes })]`.

Acceptance: injection/jailbreak/system-override variants blocked on all chat paths; detector model resolution uses the user's BYOK provider; detector failures fail closed.

#### Phase 5 status — DONE (2026-08-21)

Shipped and verified (monorepo typecheck green; AI 1,236 tests pass, web 1,007 pass, worker 101 pass):

- `packages/ai/src/mastra-v2/guardrails.ts` — `buildGuardrailInputProcessors()` wraps Mastra's built-in `UnicodeNormalizer` (strip control chars, preserve emojis, collapse whitespace, trim) + `PromptInjectionDetector` (BYOK fast-tier model via `resolveChatModel` with `technical` domain; threshold 0.7; detectionTypes injection/jailbreak/system-override; lastMessageOnly; includeScores; onDetection audit logging). Strategy is configurable: `block` for research paths, `rewrite` for conversation. When no BYOK model is resolvable the detector degrades gracefully to Unicode normalization only (with a logged warning) — deterministic route gate remains the zero-cost first line.
- Convenience helpers `buildConversationGuardrails()` (rewrite) and `buildResearchGuardrails()` (block).
- Wired via `inputProcessors` into: canonical chat (`canonical-chat.ts`), XAUUSD conversation + followup (`run.ts`), XAUUSD agent factory (`agent.ts` accepts `inputProcessors`), and symbol-research specialists + fusion agents (`symbol-research.ts` workflow deps + `mode-runner.ts`).
- 5 new regression cases (`reg-51` … `reg-55`) in `eval/regression-cases.json` covering Unicode control-char bypass, zero-width whitespace jailbreak, homoglyph role-override, encoded instruction payload, and Unicode system-override; catalog test updated 50 → 55.

Findings:

1. **Mastra ships the guardrails already** — `PromptInjectionDetector` and `UnicodeNormalizer` are built into `@mastra/core/processors` (no `@mastra/evals` dependency needed). The plan's custom classes were unnecessary; a thin wrapper with BYOK resolution + strategy selection was the whole Phase.
2. **`resolveChatModel` has no `fast` domain** — the plan said "fast-tier model"; the catalog tiers are `fundamental|technical|summary|vision|embedding`. `technical` is the fast tier (e.g. `gemini-3.5-flash-lite`, `claude-sonnet-5`), so the detector resolves `technical`.
3. **`inputProcessors` typing** — the option must be `Array<InputProcessorOrWorkflow>` (from `@mastra/core/processors`); a loose `{id}` shape fails `exactOptionalPropertyTypes`.

### Phase 6 — Evals & training loop

**Goal:** live sampled scoring + datasets/experiments; every run produces score records that flow into the governed export.

#### Phase 6 status — DONE (2026-08-21)

Shipped and verified (monorepo typecheck green; AI 1,256 tests pass, web 1,007 pass, worker 101 pass):

- `packages/ai/src/mastra-v2/evals/scorers.ts` — prebuilt scorers (faithfulness, hallucination, answer-relevancy, bias, toxicity) from `@mastra/evals/scorers/prebuilt` with `createScorer`/`MastraScorer` APIs from `@mastra/core/evals` (native in core 1.60 — the separate `@mastra/evals` package is only needed for the prebuilt LLM-judge scorers). Judge model = BYOK fast tier via `resolveChatModel(..., 'technical')` (same as Phase 5); sampling ratio configurable (conversation 5%, research 10%); graceful degradation to empty entries when no model resolves. `resolveJudgeModel()` exported for reuse.
- `packages/ai/src/mastra-v2/evals/custom.ts` — `createGroundingScorer()` (runs `verifyXauusdReport`; strict 1.0 only) and `createCitationScorer()` (0..1 oracle ratio). Both deterministic — no LLM judge, free to attach to every turn.
- `packages/ai/src/eval/citation-oracle.ts` — the legacy `computeCitationScore` extracted into a pure module (no fs/crypto/network imports) so the custom scorers reuse it without dragging the eval runner into the web bundle; `runner.ts` re-exports it for backward compatibility.
- `packages/ai/src/mastra-v2/evals/scores.ts` — `ScoreRecord` projection + `listScoresForRun()`/`toScoreRecord()` reading the `scores` storage domain.
- `packages/ai/src/mastra-v2/evals/gate.ts` — `recordsToGateObserved()` maps score records into the canonical `EvalQualityGate` envelope (inverted scorers — hallucination/bias/toxicity — pass when low ≤0.2; grounding strict 1.0; citation ≥ minCitationScore; partial thresholds merged over defaults); `createMastraEvalGate()` + `createScoreThresholdGate()` for `runEvals` gates.
- `packages/ai/src/mastra-v2/evals/datasets.ts` — `migrateLegacyEvalCasesToDatasets()` migrates all three legacy catalogs (`cases.json` 20, `prompts.json` 10, `regression-cases.json` 55) into Mastra datasets (`mastra.datasets`, idempotent via caller-defined ids, `externalId` = source case id); `runDatasetExperiment()` replays a dataset through `runEvals` with per-scorer means + pass/fail summary (the A/B surface — run the same dataset against two agent variants and compare).
- `packages/ai/src/eval/training-export.ts` — `scoreRecords` option joins live scores into the governed export (`liveScores` per case, last-wins per scorer, annotation gating preserved).
- Wired into live agents: canonical chat (generate + stream paths), XAUUSD conversation (3 call sites in `run.ts`), and symbol-research specialists + fusion agents via `mode-runner.ts` deps.

Findings:

1. **Core 1.60 ships the evals engine natively** — `@mastra/core/evals` exports `createScorer`, `MastraScorer`, `runEvals`, thresholds, and the `scores`/`datasets`/`experiments` storage domains. The separate `@mastra/evals` package (1.9.0, installed) is only the source of the five prebuilt LLM-judge scorers under the `scorers/prebuilt` subpath export — the root export is intentionally empty.
2. **Scorer direction matters** — hallucination/bias/toxicity are inverted (low = good); the gate must treat them differently from faithfulness/answer-relevancy/citation/grounding. A naive `score >= 0.5` pass predicate misjudges them.
3. **`ScorerRun` input** — scorer `run()` input uses `targetTraceId`/`targetSpanId` (not `traceId`) and `requestContext`; passing bare `traceId` fails `exactOptionalPropertyTypes`.
4. **Partial thresholds crash the legacy gate** — `addMaximumFailure` only guards `null`, not `undefined`; `recordsToGateObserved` merges partial caller thresholds over `DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS`.
5. **`@mastra/evals` must be added to `packages/ai/package.json`** — `@mastra/evals@^1.9.0` (peer-compatible with core 1.60).

Acceptance met: score records land in the `scores` domain (sampled live scoring + `runEvals`); governed export joins live scores; dataset replay produces per-scorer/gate results.

### Phase 7 — Mutations with suspend/resume

**Goal:** the disabled mutation capability becomes real: draft → suspend → explicit user confirmation → resume → validated, audited write.

#### Phase 7 status — DONE (2026-08-21)

Shipped and verified (monorepo typecheck green; AI 1,265 tests pass, web 1,008 pass, worker 101 pass):

- `packages/ai/src/mastra/mutation-policy.ts` — confirmation tokens are now stateful: `issueMutationConfirmationToken()` (32 random bytes base64url + expiry, HMAC-SHA256 over `token:mutation:userId:expiresAt`), `storedConfirmationForToken()` (the persisted digest — never the raw token), and `verifyMutationConfirmationToken()` (timing-safe compare + expiry; false on any mismatch — replay, cross-user, or cross-run tokens all fail). Secret = `AUTH_COOKIE_SECRET` (fail-closed in prod when absent); `ttlMs` default 15 min. New `assertMastraMutationDraftAllowed()` for the draft gate (enabled + context only — confirmation is NOT required to start the flow).
- `packages/ai/src/mastra-v2/workflows/mutation.ts` — `createMutationWorkflow(kind, deps)` per mutation kind with a deterministic 3-step graph: `draft` (validate + dry-run + mint token + store digest in run state + `suspend()` with the confirmation-card payload incl. the raw token) → `execute` (resume branch of draft re-validates token timing-safe + expiry + policy, then performs the injected Drizzle write and writes `mutation.<kind>.executed` audit row) → `notify` (returns the output). Mastra resumes a suspended workflow by re-running the suspended step with `resumeData`, so the confirm logic lives in the draft step's resume branch — this is the plan's `confirm` step. `runMutationWorkflow()` driver starts (returns the suspension payload) or resumes (returns the executed output) and propagates the underlying policy error on failure.
- Input schemas per kind (discriminated union): `set_alert` (AlertRule + channels/note/snooze), `log_journal` (symbol/side/entry/stop/target/outcome/notes/tags…), `share_snapshot` (title/body/symbol/tf/ttl), `run_system_action` (action/params). Executors + audit writer are injected by the composition edge (web route) per DIP-1 — the workflow never imports `getDb`.
- `apps/web/src/app/api/chat/mutations/confirm/route.ts` — `POST /api/chat/mutations/confirm` with `{ mutation, runId, confirmationToken }`: `withAuth` → policy gate → ownership check (run `resourceId` must equal the authenticated user) → fresh workflow factory against the shared Mastra instance → `runMutationWorkflow` resume. Executors use the existing `createAlert`/`createJournalEntry` queries + a plain `sharedSnapshots` insert (no query helper exists yet); `run_system_action` writes only the audit row.
- Exported through `@kestrel/ai/mastra` (incl. `getKestrelMastra` for the route); capability `mutation-workflows` remains gated on `ENABLE_MASTRA_MUTATIONS=true`.

Findings:

1. **Mastra suspends at the step, not between steps** — a suspended workflow resumes by re-running the suspended step with `resumeData`. The plan's separate `confirm` step therefore lives in the `draft` step's resume branch; a distinct post-draft confirm step would never run on first pass.
2. **Token must be returned to the client in the suspend payload** — the server keeps only the digest in run state; the raw token exists solely in the confirmation-card payload the draft returns. The confirm route re-validates it against the stored digest.
3. **`Workflow.then()` is chainable and `.commit()` is required** — without `.commit()` the run fails with "Uncommitted step flow changes".
4. **Run failures wrap step errors** — `run.start()` returns `status: 'failed'` with a serialized error object; the driver unwraps it (`toError`) so callers see the real `MastraMutationPolicyError` reason (disabled / invalid token / expired) instead of a generic wrapper.
5. **Shared `shared_snapshots` insert** — no `@kestrel/db` query helper exists for share snapshots; the route does a plain Drizzle insert. A future query module would centralize it.

Acceptance met: no mutation executes without a single-use server-confirmed resume (timing-safe digest + expiry + policy, ownership checked); every write emits an audit row; suspended runs are visible as workflow snapshots (Studio / `listWorkflowRuns`). The draft→confirm UI card is exercised through the suspend payload contract; a chat-route integration point that *starts* mutation workflows remains for Phase 9 surface work.

### Phase 8 — Observability unification: DONE (2026-08-21)

**Goal:** one run identity across Mastra traces, pino, Langfuse, and metrics; Studio in prod.

Shipped:

- `packages/ai/src/mastra-v2/telemetry.ts` — `createMastraObservability()` wires Mastra's `Observability` (from `@mastra/observability` 1.17.1) with `LangfuseExporter` (from `@mastra/langfuse` 1.5.0) when `LANGFUSE_*` is configured; sampling via `MASTRA_OBSERVABILITY_SAMPLING` (0..1); construction is fully fail-safe (an observability outage never breaks the AI run). `runTracingOptions()` attaches `runId`/`userId`/`threadId`/`kind` metadata + stable tags to every trace root span; `langfuseTraceUrl()` builds admin deep links; `flushMastraObservability()`/`shutdownMastraObservability()` are best-effort lifecycle helpers (flush also called at `finishMastraRun`).
- `packages/ai/src/mastra-v2/logger.ts` — `MastraPinoLogger` already routes through the shared pino (category `ai`, component `mastra`) which auto-injects `traceId`/`requestId`/`runId` from AsyncLocalStorage. Added `createRunLogger()` + `logWorkflowStart/End/Error()` for run-scoped workflow lifecycle logging (workflow steps run outside the diagnostic ALS, so run identity is bound explicitly).
- Tracing wired at every production run boundary: canonical chat (generate + stream), symbol-research workflow (`mode-runner`), mutation driver (start + resume), XAUUSD report workflow, xauusd conversation (generate + stream), and `text-runner`.
- Admin dashboard — new **Mastra Runs** tab: `packages/ai/src/mastra-v2/observability-view.ts` projects one row per run from `chat_telemetry` (provider/cost/latency) + workflow snapshots (stage/status/failed steps) + scores domain (was it grounded), with a Langfuse deep link. Web route `apps/web/api/admin/mastra-runs` + `admin-mastra-runs.tsx` (time-window filter, refresh, run/status/score/cost/latency columns).
- **Latent bug fixed**: score reads used `storage.scores` property access, which is undefined on the Mastra composite — domains resolve via `getStore('scores')`. Also, the libsql pagination helper treats `page` as 0-indexed (`offset = page * perPage`), so `listScoresForRun` passes `{ page: 0, perPage: false }` to fetch all rows for a run.
- Tests: `mastra-observability.test.ts` (10) — tracing options, sampling, Langfuse URL + entrypoint gating, provider derivation, kind→workflow mapping, snapshot summarization, telemetry-only degradation, workflow+score join, score mean.

Acceptance: a single run id answers "which stage failed, which provider, what did it cost, was it grounded" across all surfaces — workflow snapshot (stage), `chat_telemetry` model/`estCostUsd` (provider/cost), scores domain (grounded), Langfuse trace link (full trace), pino logs with `runId` (log stream).

**Verification:** AI typecheck clean, **1,275 tests pass**; web **1,008**; worker **101**; AI package rebuilt.

### Phase 9 — Deletion of the legacy plane: DONE (2026-08-21)

**Goal:** remove every vestige now that Mastra owns all production paths (the shadow archive is preserved — the `ai_shadow_comparisons` table + admin AI Compare viewer remain as the historical record).

Deleted (files, not behavior):
- Legacy orchestration: `packages/ai/src/agent.ts` (`runChat`), `chat/` (attempt, auto-title, helpers, resolve-model, stream-callbacks, system-prompt, tools), `chat-retry-loop.ts`, `planner.ts` (AI SDK fallback branch), `title.ts` (AI SDK fallback branch), `tools/convene-committee.ts`, `tools/summarize-thread.ts`, `multi-agent/index.ts` barrel (kept `modes.ts` — `resolveMode` is live in the chat route — and `persistence.ts` — live via `persistence-recovery.ts`).
- Shadow surface: `apps/web/src/lib/services/mastra-shadow-comparison.ts`, `mastra-shadow-stream.ts`, `mastra-shadow-routing.ts` + their tests — the last production consumers of `runChat`. The `ai_shadow_comparisons` DB table + admin AI Compare read route stay as the archive.
- Probes: `packages/ai/scripts/` (eval-run-local, db/insert/resolve/stream probes, cleanup).
- Vestigial: `defaultGenerateOptionsLegacy` removed from `mastra/agent.ts` + `mastra/canonical-chat.ts` (per-call `maxSteps` already set everywhere); `ENABLE_MASTRA_TEXT` dual-path branches were already gone (only a test referenced it).
- Exports: removed `@kestrel/ai/agent`, `@kestrel/ai/multi-agent`, `@kestrel/ai/planner`, `@kestrel/ai/title` subpaths; pruned `RunChatArgs` (types.ts + root barrel) and the `runPlanner`/`generateTitle` root exports. `@kestrel/ai/tools*` subpaths stay — the legacy read-only tool implementations are the live tool surface for Mastra agents (`read-only-tools.ts`, `legacy-tool-adapter.ts`, canonical-chat allowlist), so the deterministic helpers + tool defs were kept per plan.
- Registry: `tools/registry.ts` is now 31 tools (removed `convene_committee` + `summarize_thread` entries from `system.ts`/`journal.ts` maps); tests updated accordingly.

Acceptance: `rg "runChat"` returns only doc comments; `streamText`/`generateText` calls exist only in the retained BYOK provider transport (`llm-client.ts`, `model-chat.ts`, `provider-tester.ts`) and the standalone `memory/thread-summary.ts` helper; production chat imports only `@kestrel/ai/mastra` + deterministic helpers.

**Verification:** full monorepo typecheck clean (14 packages); AI **1,215 tests**, web **999**, worker **101**; AI package rebuilt (253 files, down from 278).

## 5. Testability design (written with code, executed later)

- **Workflow step tests**: each step pure-ish with injected deps (container tokens) — packet blocked, specialist failure, fusion, verification, repair, suspend/resume.
- **Memory tests**: resource scoping (no cross-user), working-memory seed, observational memory with mocked background agent.
- **Guardrail tests**: injection variants, unicode/control-char bypasses, detector-failure fail-closed.
- **Eval tests**: custom verifier/citation scorers against the existing fixtures; gate thresholds; dataset A/B.
- **Durable workflow tests**: restart resume, observe/reconnect, no duplicate writes (idempotency keys preserved).
- **E2E (Playwright)**: streamed chat, report card after verify, mutation confirm→resume→audit, Studio presence.
- All existing suites kept green; new fixtures use the MSW offline pattern (no provider calls).

## 6. Risk register

| Risk | Mitigation |
|------|------------|
| Mastra `mastra`-schema auto-init vs. Drizzle migration discipline | Namespaced tables owned by Mastra only; verify idempotent DDL; never add them to drizzle migrations; document in `AGENTS.md` migration rules. |
| PostgresStore on Supabase pooler | Use direct connection (non-pooling) for Mastra storage, same rule as migrations. |
| PGlite compatibility | Local dev uses LibSQL file store; PGlite remains the business-DB path untouched. |
| Memory cross-user leakage | `resource = userId` strictly; regression tests assert no cross-user recall; capability gate unchanged. |
| Observational-memory model cost | Gated flag; fast-tier model; sampling/limits. |
| Streaming transport change | Keep AI SDK UI-message-compatible envelope; fallback to completed response. |
| Mastra version drift (1.59 → 2.x) | Pin versions; APIs used are the documented current surface; upgrade reviewed in a dedicated change. |
| Live scorer cost/latency | Sampling ratios (5–10%); operator-pinned cheap model; scorers never block the user response. |

## 7. Rollout & rollback

1. Build phases 0→9 against the existing feature flags (new paths behind `MASTRA_V2=*` flags; current Mastra paths remain live).
2. Flip each path when its acceptance criteria pass locally; full validation round (tests + live eval) happens per operator schedule, then flags default on.
3. Rollback = disable `MASTRA_V2_*` flags; Phase 0–8 are additive, Phase 9 (deletion) is the only irreversible step and is sequenced last.

## 8. Post-completion follow-ups

All phases 0–9 are shipped. Remaining surface work, in priority order:

1. **Live validation round** — execute the suites + manual eval runs per operator schedule (plan §5 lists the E2E cases: streamed chat, report card after verify, mutation confirm→resume→audit).
2. **Operator enablement** — flip `ENABLE_MASTRA_MUTATIONS` (draft entry point now wired into the chat route) and validate the confirm card end-to-end.
3. **Studio** — reachable via `pnpm --filter @kestrel/ai mastra:studio` (`:4111`, decision D6): the standalone server serves the real instance (storage, traces, memory, run snapshots) without the CLI bundler. Optional future work: register canonical (non-BYK) components on the instance so Studio renders a static agent/workflow graph, or revisit `mastra dev` if the CLI's validation wall is lifted.
4. **Thread auto-title** — shipped in the completion pass (Mastra text-runner title step); monitor title quality/coverage in the live validation round.
