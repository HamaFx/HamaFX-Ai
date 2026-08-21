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
| D6 | Mastra server/Studio | **Dev AND prod** (separate `mastra` process in Docker alongside the worker) | Traces UI, memory viewer, workflow control, and `mastra api` CLI available in operations. |
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
3. **`mastra` CLI (`1.25.1`, its latest) fails to bundle the config** (`Cannot read properties of undefined (reading 'readFile')`) — a CLI-vs-core version skew on independent tracks. The config itself loads and initializes fine; Studio wiring is deferred to Phase 8 (observability), where we also decide the Docker entrypoint.

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

### Phase 4 — Streaming + conversational chat

**Goal:** real token streaming on conversational paths; verified reports stay on generate+verify but stream the final verified text.

Files:
- `packages/ai/src/mastra-v2/runners/conversation.ts` — `agent.stream()` with `requestContext`, memory, guardrails, tools; emits text chunks + tool-call parts.
- `apps/web/src/lib/chat-transport.ts` + chat components — consume Mastra text stream chunks (AI SDK UI-message-compatible envelope so the PWA keeps its transport shape).
- `packages/ai/src/mastra/run.ts` (conversation path), `canonical-chat.ts` — switch to `stream()`; `mastraChatResponse` variants for streamed vs completed.
- Capability table: `supportsStreaming: true` for conversation/symbol capabilities; report capability stays false (by design, verification must complete first).

APIs: `agent.stream(input, opts)` → `textStream`/`fullStream`/`partialStream`, `onChunk`, `onIterationComplete` (progress events).

Acceptance: progressive output on canonical chat + XAUUSD conversation + Quick/Standard; cancellation aborts the stream; verified report card still renders after verification.

### Phase 5 — Guardrails & processors

**Goal:** LLM-based injection detection + input normalization on every chat path; keep the lexical route gate as fast-path, not sole defense.

Files:
- `packages/ai/src/mastra-v2/guardrails.ts` — `PromptInjectionDetector` (resolved fast-tier model via the existing BYOK resolver; `threshold` tuned per capability; strategy `block` on research paths, `rewrite`/`block` on conversation) + `UnicodeNormalizer({ stripControlChars, collapseWhitespace })`.
- Applied via `inputProcessors` on every chat-facing agent; the deterministic route layer remains as a zero-cost pre-filter.
- New regression cases added to `eval/regression-cases.json` for injection variants the LLM detector catches and regex missed.

APIs: `inputProcessors: [new UnicodeNormalizer(...), new PromptInjectionDetector({ model, threshold, strategy, detectionTypes })]`.

Acceptance: injection/jailbreak/system-override variants blocked on all chat paths; detector model resolution uses the user's BYOK provider; detector failures fail closed.

### Phase 6 — Evals & training loop

**Goal:** live sampled scoring + datasets/experiments; every run produces score records that flow into the governed export.

Files:
- `packages/ai/src/mastra-v2/evals/scorers.ts` — prebuilt scorers (faithfulness, hallucination, answer-relevancy, bias, toxicity) configured on chat/research agents with `sampling: { type: 'ratio', rate: 0.05–0.1 }`; model for scorers = operator-pinned fast tier.
- `packages/ai/src/mastra-v2/evals/custom.ts` — custom scorers wrapping the existing report verifier (grounding pass/fail → 0/1) and citation oracle (0..1).
- `packages/ai/src/mastra-v2/evals/datasets.ts` — migrate `eval/cases.json`, `prompts.json`, `regression-cases.json` into Mastra datasets; experiment runner for prompt/workflow A/B.
- `packages/ai/src/mastra-v2/evals/gate.ts` — the existing `EvalQualityGate` re-exposed as a Mastra gate consuming score records; CI wiring added (offline MSW fixtures) but **not executed** until the validation round.
- `packages/ai/src/eval/training-export.ts` — score records joined into the governed dataset export (keeps annotation gating).

APIs: `scorers` agent option, `createXScorer`, datasets (`mastra.datasets`), experiments, `runEvals`, score domain storage.

Acceptance: score records land in storage domain `scores`; governed export includes live scores; dataset A/B runs produce gate results.

### Phase 7 — Mutations with suspend/resume

**Goal:** the disabled mutation capability becomes real: draft → suspend → explicit user confirmation → resume → validated, audited write.

Files:
- `packages/ai/src/mastra-v2/workflows/mutation.ts` — `createWorkflow` per mutation kind (alert, journal, share, operator action): step `draft` (validate + dry-run) → **`suspend()`** (persisted snapshot; user sees a confirmation card) → step `confirm` (server-side re-validation of `confirmationToken` + `mutation-policy.ts`) → step `execute` (audited Drizzle write) → step `notify`.
- `packages/ai/src/mastra/mutation-policy.ts` — confirmation tokens become stateful (issued by the workflow, single-use, expiring).
- `apps/web` — confirmation UI resolves suspended runs (`mastra.getWorkflow(id).resume({ runId, inputData })` or the server API).
- Capability registry: `mutation-workflows` still requires `ENABLE_MASTRA_MUTATIONS=true`; research agents remain tool-less of mutations.

APIs: `suspend({ runId, context })`, `workflow.resume({ runId, inputData })`, `listSuspendedRuns`, workflow snapshots domain.

Acceptance: no mutation executes without a single-use server-confirmed resume; audit row on every write; Studio shows suspended runs.

### Phase 8 — Observability unification

**Goal:** one run identity across Mastra traces, pino, Langfuse, and metrics; Studio in prod.

Files:
- `packages/ai/src/mastra-v2/telemetry.ts` — Langfuse export with trace linkage to `runId`; `mastra_run_*` metrics retained; per-tool telemetry merged with existing `tool-telemetry.ts`.
- `packages/ai/src/mastra-v2/logger.ts` — pino category `ai/mastra` with `traceId` from the existing AsyncLocalStorage; every workflow step logs start/end/error with run id.
- Admin dashboard — Mastra run/trace viewer section (reads score + run state) alongside the existing AI Compare/log stream.

Acceptance: a single run id answers "which stage failed, which provider, what did it cost, was it grounded" across all surfaces.

### Phase 9 — Deletion of the legacy plane

**Goal:** remove every vestige now that Mastra owns all production paths (after the shadow archive is preserved per roadmap Phase H).

Delete list (files, not behavior):
- Legacy orchestration: `packages/ai/src/agent.ts` (`runChat`), `chat/` (attempt, stream-callbacks, resolve-model, tools, system-prompt), `chat-retry-loop.ts`, `tools/` 33-tool registry (keep pure deterministic helpers reused by Mastra adapters — market.ts calculations, structure/session/technical projections, sentiment service, web-search cache), `tools/convene-committee.ts`, `tools/summarize-thread.ts`, `multi-agent/` legacy agents (keep `modes.ts` mode selection + opinion persistence), `planner.ts` AI SDK fallback branch, `title.ts` AI SDK fallback branch.
- Vestigial: `defaultGenerateOptionsLegacy` in `mastra/agent.ts`; `ENABLE_MASTRA_TEXT` dual-path branches (planner, semantic routing, journal review, compaction, chart-image); `packages/ai/scripts/` probes; `memory-context.ts`; shadow comparator + `ai_shadow_comparisons` (after final archive export).
- Exports: remove `@kestrel/ai/agent`, `@kestrel/ai/tools`, `@kestrel/ai/multi-agent` legacy barrels; keep AI SDK `LanguageModel`/provider transport (BYOK layer).

Acceptance: `rg "runChat|streamText|generateText" packages/ai/src apps/web/src apps/worker/src` returns only the retained provider/transport utilities; production imports only `@kestrel/ai/mastra-v2` + deterministic helpers.

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

## 8. Immediate next step

Phase 3 (durable execution) — Full-mode jobs become durable Mastra workflow runs (`startAsync`/suspend-resume) so they survive restarts and are observable; the worker then claims Mastra run records instead of `analysis_jobs`.
