# HamaFX-Ai — AI / Agentic / Chat System: Improvement & Remediation Prompt Plan

> **Purpose:** This is an implementation brief for a coding agent. It analyses the AI, agentic
> (single-agent + multi-agent), and chat systems of the `HamaFX/hamafx-ai` monorepo and enumerates
> every upgrade, improvement, bug, flaw, polish, and cleanup found, with evidence and concrete
> acceptance criteria. Work top-down by severity. Do **not** change trading/indicator math or DB
> data; focus on the AI orchestration, persistence, streaming, routing, and chat UX layers.

## 0. Repo orientation (read first)

- **Monorepo:** pnpm workspaces + turbo. Node ≥20.11, pnpm 9.15.4.
- **AI package:** `packages/ai/src` (~25k LOC). Key files:
  - `agent.ts` — `runChat()` single-agent orchestrator (872 lines).
  - `multi-agent/` — orchestrator + specialist agents (`technical`, `fundamental`, `risk`, `sentiment`, `decision`), `modes.ts`, `persistence.ts`, `context.ts`, `stream.ts`, `types.ts`.
  - `tools/` — 32 AI-SDK tools + `with-telemetry.ts` + `mutation-guard.ts`.
  - `routing.ts`, `planner.ts`, `model.ts`, `cost.ts`, `fallback.ts`, `prompt/system.ts`, `verification.ts`, `rag.ts`, `memory/`, `briefings/`, `alerts/`, `telegram/`, `bot/`, `decision-signals/`.
- **Web app:** `apps/web/src`
  - API: `app/api/chat/route.ts` (single + multi-agent entry), `app/api/chat/threads/[id]/opinions/route.ts`, `.../summary`, `.../export`, `.../fork`.
  - UI: `components/chat/chat-screen.tsx` (698 lines), `message.tsx`, `parts/*`, `parts/agent-deliberation.tsx`, `composer.tsx`, `chat-top-bar.tsx`.
- **DB:** `packages/db/src/schema/*` (drizzle). Relevant: `chat.ts` (`chatThreads`, `chatMessages`), `agent-opinions.ts`, `telemetry.ts`, `daily-ai-spend.ts`, `decision-signals.ts`, `briefings.ts`, `memory.ts`, `news.ts`.
- **Verify build after changes:** `pnpm install && pnpm typecheck && pnpm lint && pnpm test`. AI eval: `pnpm --filter @hamafx/ai eval -- --cases` (needs a running server + session cookie).

Severity legend: **P0** = data-loss / correctness broken in production paths; **P1** = wrong results, cost/security risk; **P2** = quality/consistency; **P3** = polish/cleanup/docs.

---

## P0 — Critical (fix first)

### P0-1 — Multi-agent turns are never persisted; agent opinions fail silently
**Area:** multi-agent persistence / chat history
**Files:** `apps/web/src/app/api/chat/route.ts` (~L84–180), `packages/ai/src/multi-agent/orchestrator.ts` (`runMultiAgentChat`), `packages/ai/src/multi-agent/persistence.ts` (`saveAgentOpinions`), `packages/db/src/schema/agent-opinions.ts` (L38 FK).

**Problem / evidence:**
- Single-agent `runChat()` persists both messages (`appendUserMessage` at `agent.ts:186`, `appendAssistantMessage` in `onFinish` at `agent.ts:596`).
- The multi-agent path does **neither**. A grep of `packages/ai/src/multi-agent/` for `appendUserMessage` / `appendAssistantMessage` / `chatMessages` returns **nothing**. `runMultiAgentChat` only calls `saveAgentOpinions(...)`.
- The route generates `assistantMessageId = crypto.randomUUID()` (route L110) and passes it as `messageId`, but **no `chat_messages` row is ever inserted** for it.
- `agent_opinions.message_id` has `.references(() => chatMessages.id, { onDelete: 'cascade' })` (agent-opinions.ts L38). So `saveAgentOpinions` violates the FK and **throws**, but the orchestrator wraps it in `.catch(() => console.warn(...))` (orchestrator L163) → **opinions are silently dropped**.
- Net effect: multi-agent (`quick` / `standard` / `full` / `auto`) conversations exist only in client memory. On reload they **vanish**; `/opinions` returns `[]`; telemetry/history is incomplete.

**Fix:**
1. In `runMultiAgentChat`, **persist the user message first** (reuse `appendUserMessage(threadId, userMessage)`), then after fusion **insert the assistant message** via `appendAssistantMessage(threadId, ui)` where `ui` carries the final text (plus a structured `data-agent-opinions`/deliberation part if desired). Use the returned real `messageId`.
2. Persist agent opinions **only after** the assistant `chat_messages` row exists, using that real id. Wrap message-insert + opinions-insert in a single transaction so opinions never orphan.
3. Record per-turn telemetry (`recordTelemetry`) for multi-agent turns like single mode does (model, tokens, cost, ms, `kind` breadcrumbs per specialist).
4. Do not silently swallow FK errors — log at `error` and surface a degraded response marker.

**Acceptance criteria:**
- After a `full`-mode turn, reloading the thread shows the user message + assistant answer.
- `GET /api/chat/threads/{id}/opinions` returns the persisted specialist opinions.
- `chat_telemetry` has rows for multi-agent turns (cost reconciled).
- New integration test: run `runMultiAgentChat` against a test DB, assert `chat_messages` (2 rows) + `agent_opinions` (N rows) exist and reference each other.

---

## P1 — High

### P1-2 — Budget reservation leaks on failed turns
**Area:** cost guardrail
**Files:** `packages/ai/src/agent.ts` (reserve L178, delta only in `onFinish` L656), `packages/ai/src/multi-agent/orchestrator.ts` (reserve L76, delta L149), `packages/ai/src/cost.ts`.

**Problem / evidence:**
- `tryReserveBudget(userId, DEFAULT_TURN_ESTIMATE_USD, ...)` adds an estimate to `daily_ai_spend` **before** streaming.
- `applyBudgetDelta(actualCost - reservedUsd)` runs **only inside `onFinish`** (`agent.ts:656`). Any throw before `onFinish` — model-resolution failure, provider threshold, exhausted fallback chain (`throw lastError` L738), planner/context errors — leaves the reservation **stuck** in the daily counter.
- Same shape in the orchestrator: reservation at L76; if `buildSharedContext` or `Promise.all(specialists)` throws, delta never applies.
- Consequence: repeated failures inflate `daily_ai_spend`, prematurely tripping `BudgetExceededError` for real turns.

**Fix:** Wrap each turn so the reservation is always reconciled. Simplest robust approach: `try { ... } finally { if (!reconciled) applyBudgetDelta(userId, actualCostSoFar - reservedUsd) }`, or release the full reservation (`applyBudgetDelta(userId, -reservedUsd)`) on any path that throws before `onFinish` recorded real cost. Ensure double-reconciliation cannot occur (guard with a `reconciled` flag).

**Acceptance criteria:** Unit test: force a model-resolution throw; assert `daily_ai_spend` net change is `0` (reservation released). Force a successful turn; assert counter equals actual cost. No path both reserves and never reconciles.

### P1-3 — Specialist agents run tools with empty `userId` / `threadId`
**Area:** multi-agent tool context / user scoping
**Files:** `packages/ai/src/multi-agent/agents/base-agent.ts` (L65–73), `packages/ai/src/multi-agent/orchestrator.ts` (L96–105).

**Problem / evidence:**
- Orchestrator wraps `agent.run(ctx)` in `withToolContext` with the **real** ids (orchestrator L96–105), but `BaseAgent.run` immediately builds **its own** `toolContext` with `threadId: ''` and `userId: ''` (base-agent L66–67) and wraps `generateText` in a second `withToolContext`, which **overrides** the outer one.
- Any user-scoped tool a specialist calls (`get_journal_stats`, `get_portfolio_snapshot`, `search_knowledge` memory corpus, `log_journal`) resolves against an empty user → wrong/empty data, or (for mutations) writes with an empty `userId`.
- Contrast: `DecisionAgent.fuse` correctly threads real ids via `execCtx` (decision-agent L79, L89–90).

**Fix:** Pass real `threadId`/`userId` (and a live budget snapshot) into `BaseAgent.run` (add them to `SharedContext` or a run-arg) and use them when constructing the inner `toolContext`. Remove the hardcoded empty strings and the redundant double `withToolContext` if the outer one already carries the right context.

**Acceptance criteria:** A specialist calling `get_journal_stats` returns the current user's stats in a multi-agent turn. Test asserts `getToolContext().userId` inside a specialist equals the caller's id.

### P1-4 — Multi-agent uses a bespoke SSE protocol with no real streaming, dead metadata, and too-low timeout
**Area:** chat streaming / UX
**Files:** `apps/web/src/app/api/chat/route.ts` (L34 `maxDuration=60`; custom `ReadableStream` L113–178), `apps/web/src/components/chat/chat-screen.tsx` (`sendMultiAgentMessage` L169–270, esp. L239–249).

**Problem / evidence:**
- Single mode returns the AI SDK stream (`result.toUIMessageStreamResponse()`, route L199). Multi-agent mode hand-rolls `data: {type:'text'|'metadata'|'error'}` frames — a **second, incompatible** wire protocol requiring a **separate client path** (`sendMultiAgentMessage`) that duplicates auth/CSRF/error handling and diverges from `useChat`.
- Final answer is sent as **one** `text` frame (route L146), so `finalText += parsed.text` (chat-screen L240) yields **no token streaming** — the user stares at a spinner for the whole pipeline (`full` ≈ 5 LLM calls).
- The `metadata` frame carrying `agentOpinions` is received and **discarded**: `// Could store for later display` (chat-screen L247–249) — a no-op. Combined with P0-1, opinions are neither persisted nor shown after the turn.
- `maxDuration = 60` (route L34) applies to the whole function; `full` mode (4 specialists + fusion, `MODE_OPTIONS.full.latencyS`≈8 nominal but real LLM latency is far higher under load) can exceed 60s → truncated stream.

**Fix (staged):**
1. **Unify streaming:** emit multi-agent output through the AI SDK UI-message stream (custom `data-*` parts for `agent-progress` and `agent-opinions`), and stream the fusion agent's tokens with `streamText` instead of a single `generateText` blob. This lets the client reuse `useChat` and one transport; delete `sendMultiAgentMessage`.
2. If full unification is out of scope now, **at minimum**: (a) stream the final text incrementally; (b) render/persist opinions (wire the `metadata` opinions into `agent-deliberation.tsx` and DB via P0-1); (c) raise `maxDuration` (e.g. 300 on a Node runtime that allows it) or offload `full` mode to the worker/a queued job with polling.

**Acceptance criteria:** Multi-agent answers render token-by-token; opinions display in the deliberation UI and survive reload; `full` mode completes without stream truncation under realistic latency; ideally a single client transport handles both modes.

---

## P2 — Medium

### P2-5 — Decision-signal symbol is mis-attributed
**Files:** `packages/ai/src/agent.ts` `extractAndPersistSignal` (L842–872).
**Problem:** The doc comment (L837–839) says the symbol should resolve from (1) thread `pinnedSymbol`, (2) user-message text, (3) first snapshot symbol. The code only ever uses `Object.entries(snapshot.prices)[0]` (L853–857). A gold-focused answer can be logged as a EURUSD signal (whatever sorts first), corrupting decision-signal backtests.
**Fix:** Implement the documented precedence: pinned symbol → symbol parsed from the user message / assistant text → snapshot fallback. Skip signal creation if no symbol can be confidently resolved.
**Acceptance:** Unit test with a pinned symbol and multi-symbol snapshot asserts the signal uses the pinned symbol.

### P2-6 — Routing "domain→model" map is stale; cost tiering lost
**Files:** `packages/ai/src/routing.ts` (header comment L17–32, `env` unused L75), `packages/ai/src/agent.ts` ("Phase F collapses the per-domain picker into a single chat_model" L236–240), `docs/03-ai-agent.md` (§ "Domain-Based Model Routing").
**Problem:** Docs + routing comments claim each domain maps to a specific model (fundamental→Pro, technical→Flash, summary→Flash-lite). In current code the model is a single `chatModel` (`resolveChatModel`); `routeTurn` now only sets `planRequired` and enables Vertex Google-Search grounding for `fundamental` (agent L538–540). So the intended cheap/expensive tiering is gone, and `routeTurn`'s `env` arg is dead (`void args.env`).
**Fix:** Decide direction (see Open Question Q3): either (a) restore per-domain/cost-tier model selection wired to `BYOK_PROVIDERS[...].defaultModels`, or (b) formally drop domain-model routing, delete the dead `env` param, and update docs + comments to describe the real behaviour (domain → plan + grounding only).
**Acceptance:** Code comments and `docs/03-ai-agent.md` match actual behaviour; no dead params; if tiering restored, a fundamental turn provably selects the higher tier.

### P2-7 — Two overlapping multi-agent systems ("committee" vs orchestrator)
**Files:** `packages/ai/src/tools/convene-committee.ts` (Economist/Technician/Risk/Moderator), `packages/ai/src/multi-agent/*` (technical/fundamental/risk/sentiment/decision), `packages/ai/src/prompt/system.ts` (L92 instructs `convene_committee`), `agent.ts` L529–532 (`nonEssentialDisabled` deletes `convene_committee`).
**Problem:** Two independent "panel of analysts" implementations with different personas, outputs (grade A–F + go/no-go vs bias/confidence fusion), and code paths. The system prompt only knows `convene_committee`; the newer `analysisMode` orchestrator is invoked out-of-band from the route. When budget is low, `convene_committee` is removed from the toolset (agent L530) but the prompt still tells the model to call it (system.ts L92) → the model attempts a non-existent tool.
**Fix:** Choose one canonical multi-agent implementation (recommend the `multi-agent/` orchestrator; see Q1). Migrate `convene_committee`'s grade/go-no-go output into it, or keep `convene_committee` as a thin wrapper over the orchestrator. Make the system prompt conditional on which tools are actually active (don't instruct disabled tools).
**Acceptance:** Single multi-agent code path; prompt never references a tool absent from the active toolset; no duplicate persona prompts.

### P2-8 — Fallback logic duplicated + provider/tier drift
**Files:** `packages/ai/src/agent.ts` (two near-identical fallback blocks: L307–359 resolution catch, L694–735 stream catch), `packages/ai/src/fallback.ts`, `packages/ai/src/byok-providers.ts`.
**Problem:**
- The provider-advance logic (find next provider in `aiFallbackChain` with a usable key) is copy-pasted in both catch blocks — drift risk.
- On resolution failure the "current provider" defaults to `'google'` (agent L323–325) even if the failing override was another provider → chain index math can skip/repeat providers.
- Fallback always switches to `defaultModels.technical` (agent L353–354, L730–731), so a `fundamental`/Pro-grounded turn silently **downgrades** to a technical-tier model and loses Google-Search grounding.
**Fix:** Extract `pickNextProvider(chain, currentProvider, keys)` and `buildFallbackOverride(providerId, routingDomain)` helpers; pick the tier that matches the routing domain (fundamental→pro tier where available); track the real current provider even when resolution fails.
**Acceptance:** One shared fallback helper (unit-tested for chain traversal + key gating); fundamental fallback preserves the top tier when the fallback provider offers one.

### P2-9 — `auto` mode never resolves to `single`; trivial questions spin up agents
**Files:** `packages/ai/src/multi-agent/modes.ts` (`autoDetectMode` L34–44 default `standard`).
**Problem:** `autoDetectMode` never returns `single` (default is `standard`), so `auto` always triggers the multi-agent path (min. 2 LLM calls) — including the buggy persistence path (P0-1) and cost — even for greetings or "thanks". A bare price question routes to `quick`, still spinning an agent for a value already in `LIVE_SNAPSHOT`.
**Fix:** Add a `single` branch for greetings/acknowledgements/trivial lookups already covered by the snapshot; keep multi-agent for genuine analysis/decision questions. Consider defaulting truly ambiguous short prompts to `single`.
**Acceptance:** Unit tests: "hi", "thanks", "what's the gold price" → `single` (or snapshot-served); "should I buy gold here (entry/stop)" → `full`.

### P2-10 — Plan message role/round-trip consistency
**Files:** `packages/ai/src/planner.ts` (persists a `data-plan` part), `packages/ai/src/agent.ts` (L212–234 drops `role: 'system'` before `convertToModelMessages`).
**Problem:** agent.ts comments describe the plan as a **system** row that is dropped before model conversion (L212–219), while planner.ts describes persisting it as an **assistant** message with a `data-plan` part. If the plan lands as an assistant row, it is fed back on the next turn via `convertToModelMessages`, which may emit empty/garbled content for a `data-plan` part. Verify the actual persisted role and that reload/next-turn conversion is clean.
**Fix:** Make the persisted role and the drop-filter consistent (plan is UI/context-only — exclude it from `modelMessages` regardless of role, e.g. filter any part of type `data-plan`). Add a regression test that a thread containing a plan part converts to model messages without empty assistant turns.
**Acceptance:** Reloading a thread with a plan pill produces valid `modelMessages`; provider never receives a stray empty/`data-plan` assistant message.

---

## P3 — Polish / cleanup / docs / tests

### P3-11 — Env object construction is repeated 4–5× and drifts
**Files:** `agent.ts` (planner env L392–403, toolContext env L468–479, title env L775–785), `route.ts` (two big env literals L127–134, L188–195).
**Problem:** The same `{ AI_GATEWAY_API_KEY, GOOGLE_*, AI_DEFAULT_MODEL, ... }` object is hand-built in ≥5 places; `AI_EMBEDDING_MODEL` is present in some and missing in others — a latent bug source.
**Fix:** Add a single `pickAiEnv(env)` helper (in `packages/ai` or `@hamafx/shared`) returning the canonical subset; use everywhere.
**Acceptance:** One helper; no divergence; typecheck passes.

### P3-12 — Stale documentation & broken anchors
**Files:** `packages/ai/src/prompt/system.ts` L17 (`see docs/07-ai-agent.md` — file does not exist; AI doc is `docs/03-ai-agent.md`), `docs/03-ai-agent.md` L13 TOC anchor `#tool-catalogue-30-tools` (heading says "32 Tools"), README "32 AI Tools" matrix history.
**Problem:** Repo's own review notes already flagged these (`docs/archive/review/04-ai-agent-safety-cost-review.md`). Docs also still describe per-domain model routing (see P2-6).
**Fix:** Fix the file reference in `system.ts`; fix the TOC anchor; reconcile the routing section with real behaviour; verify the tool matrix lists all 32 registered tools.
**Acceptance:** No dangling doc refs; anchors resolve; docs match code.

### P3-13 — Test coverage gaps on the hot path
**Files:** only 7 `*.test.ts` in `packages/ai/src` (`bot/dispatcher`, `bot/linking`, `decision-signals/backtest-engine`, `notifications/noise-control`, `portfolio/risk-service`, `retry`, `sentiment/social-sentiment-service`).
**Problem:** No unit tests for `routeTurn`, `planner` fallback chain, `resolveChatModel`/fallback, `cost` reserve/reconcile, `verification.enforceCitations`, `multi-agent/orchestrator`, `modes.autoDetectMode`, or `agent.runChat` happy/fallback paths — exactly the areas changed above.
**Fix:** Add focused unit tests alongside each fix (routing scoring, planner fallbacks, budget reserve/reconcile incl. leak regression, citation regex boundaries, mode detection, orchestrator persistence). Wire into `pnpm --filter @hamafx/ai test`.
**Acceptance:** New tests cover each P0–P2 fix; coverage on `routing.ts`, `cost.ts`, `modes.ts`, `verification.ts` materially increases.

### P3-14 — Type-safety hardening
**Files:** ~20 `as any` / `as unknown` in `packages/ai/src` (e.g. `tools/index.ts` L77, L90 `as any`; `agent.ts` UIMessage part casts L231, L549–575, L588; `route.ts` L185 `last as any`).
**Problem:** Repeated unsafe casts around `UIMessage.parts` invite the empty-content/`data-plan` class of bugs (P2-10). 
**Fix:** Introduce small typed guards/helpers for UI message parts (`isTextPart`, `toModelParts`) and reuse; remove `as any` where a guard suffices. Keep necessary AI-SDK generic casts documented.
**Acceptance:** `as any` count reduced; no new `eslint-disable @typescript-eslint/no-explicit-any` added; typecheck/lint clean.

### P3-15 — Config surface / env validation
**Files:** `.env.example` (81 `KEY=` entries), server env schema in `apps/web/src/lib/env.ts` / `@hamafx/shared`.
**Problem:** 81 environment variables is a large surface; ensure every AI-relevant var (`AI_DEFAULT_MODEL`, `AI_EMBEDDING_MODEL`, `MAX_DAILY_USD`, `MAX_TOOL_ITERATIONS`, Vertex creds, provider keys) is validated at boot and documented, and that optional-vs-required is explicit.
**Fix:** Audit the server env schema against `.env.example`; add missing validation; group/annotate AI vars; fail fast with a clear message when a required AI var is absent.
**Acceptance:** Boot-time validation covers all AI vars; `.env.example` grouped and commented; a missing required var yields a clear startup error.

### P3-16 — `nonEssentialDisabled` prompt/tool consistency (ties into P2-7)
**Files:** `agent.ts` L528–540, `prompt/system.ts`.
**Problem:** When budget is degraded, `convene_committee` and `replay_setup` are removed from the toolset, but the prompt still instructs their use.
**Fix:** Build the tool-usage section of the system prompt from the **active** tool set (or drop the specific instruction when the tool is disabled).
**Acceptance:** With `nonEssentialDisabled=true`, the prompt contains no instruction to call a removed tool.

---

## Suggested upgrades (beyond fixing existing behaviour)

- **U1. Unified streaming abstraction:** one SSE/UI-message contract for single + multi-agent (custom `data-*` parts for progress/opinions). Removes the dual client path and enables token streaming for fusion. (Depends on P1-4.)
- **U2. Queue/worker offload for `full` mode:** run long multi-agent deliberations in `apps/worker` with a job id + polling or push, eliminating the `maxDuration` ceiling.
- **U3. Semantic routing option:** optionally replace/augment keyword scoring with a cheap classifier call (feature-flagged), keeping the deterministic scorer as fallback.
- **U4. Opinion caching / dedupe:** cache specialist opinions by (symbol, timeframe window, inputs hash) for a short TTL to cut cost on repeated "what do you think" turns.
- **U5. Structured decision-signal provenance:** persist which tools/opinions backed a decision signal for auditability in backtests.
- **U6. Prompt-injection test suite:** add cases exercising `mutation-guard` + untrusted-content policy (news/RAG injected instructions) to lock in the existing safeguards.

---

## Recommended execution order

1. **P0-1** (persistence) — unblocks correctness for all multi-agent modes.
2. **P1-2** (budget leak) and **P1-3** (empty ids) — cost + correctness.
3. **P1-4 / U1** (streaming unification) — UX + removes dual path.
4. **P2-5..P2-10** — correctness/consistency.
5. **P3-11..P3-16** — cleanup, docs, tests, config.
6. **U2..U6** — opportunistic upgrades.

Each PR: include tests, run `pnpm typecheck && pnpm lint && pnpm test`, and (where feasible) the AI eval harness. Keep changes scoped to the AI/chat layer; do not alter indicator/trading math or migrate data.

---

## Open questions for the product owner (answer to finalise scope)

- **Q1.** Multi-agent consolidation (P2-7): keep the newer `multi-agent/` orchestrator as canonical and fold `convene_committee` into it, or keep `convene_committee` as the user-facing entry and drop the orchestrator? (Recommendation: keep orchestrator, wrap committee.)
- **Q2.** For `full` mode, is a longer synchronous request acceptable (raise `maxDuration`), or should it move to the worker with polling/push (U2)?
- **Q3.** Model routing (P2-6): restore per-domain cost tiering (cheap for technical/summary, premium for fundamental) or formally commit to the single `chatModel` design and update docs?
- **Q4.** Scope of this engagement: should the implementing agent also **fix** these, or only produce PR-ready patches for review? Any areas explicitly off-limits (e.g. billing, auth, DB migrations)?
- **Q5.** Priority weighting: correctness/bugs first (assumed), or is there pressure to ship a specific new feature that should reorder the plan?
