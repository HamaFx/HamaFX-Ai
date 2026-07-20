# 02 — Single Responsibility Principle (SRP) Audit

## Executive Summary

**Score: 6.5/10** — The codebase has made deliberate efforts toward SRP (tool registry extraction, budget guard module, data adapter layer), but several core files remain God classes/services. The `agent.ts` file at ~800 lines is the most critical violation, orchestrating 8+ distinct responsibilities.

## Strengths

1. **Tool Registry (PF-02)**: `ToolRegistry` class cleanly separates tool registration from execution. Each tool self-registers; `agent.ts` doesn't wire tools manually.
2. **Budget Guard (PF-05)**: Extracted from `agent.ts` into a focused `budget-guard.ts` module with clear reserve/reconcile/release lifecycle.
3. **Data Adapter Layer**: `packages/data/src/adapters/` cleanly separates price, candles, news, calendar, and storage concerns.
4. **Alert Specification Pattern**: `LevelSpec`, `CrossingSpec`, `AndSpec`, `OrSpec` — each has one job (evaluate a rule).
5. **LlmClient Abstraction (PF-07)**: Clean separation of the Vercel AI SDK behind an `LlmClient` interface.

## Critical Violations

### 1. God File: `packages/ai/src/agent.ts` (918 lines)

**Current responsibilities** (8+ distinct concerns):
1. Budget reservation and reconciliation
2. User message persistence
3. History loading and compaction (rolling summary)
4. Model resolution with retry loop (5 attempts, fallback chain)
5. Plan-then-act planner invocation
6. System prompt assembly with custom instructions
7. Context-window token estimation and truncation
8. Streaming with `onFinish` callback (message persistence, telemetry, budget reconciliation, auto-title)
9. Citation enforcement
10. Tool telemetry buffering

**Recommended separation**:
- `ChatPipeline` class with composed stages: `BudgetStage → HistoryStage → RouteStage → StreamStage → PersistStage`
- Each stage is independently testable
- `agent.ts` becomes a thin orchestrator (~50 lines)

**Severity**: 🔴 CRITICAL

### 2. God File: `packages/ai/src/model.ts` (762 lines)

**Current responsibilities**:
1. Model resolution by domain (ChatModelResolution)
2. Vision model resolution
3. Embedding model resolution
4. Override model resolution
5. Planner/title model derivation
6. Provider priority ordering
7. Env fallback key mapping
8. Prompt caching detection
9. Circuit breaker integration

**Recommended**: Split into `chat-model-resolver.ts`, `vision-model-resolver.ts`, `embedding-model-resolver.ts`, and keep `model.ts` as the strategy-map dispatcher.

**Severity**: 🟡 HIGH

### 3. God File: `apps/worker/src/index.ts` (530 lines)

**Current responsibilities**:
1. Worker lifecycle (startup, shutdown)
2. SignalR consumer management
3. Binance WebSocket consumer
4. Tick batching and buffer management
5. Candle aggregator callback
6. Healthcheck heartbeat
7. Sentry integration
8. Langfuse initialization
9. Symbol manager event wiring

**Recommended**: Extract `TickPipeline`, `HealthMonitor`, and `LifecycleManager` classes.

**Severity**: 🟡 HIGH

### 4. Route Handlers with Business Logic

While the codebase has a service layer pattern (PF-22), several route handlers still contain business logic:

**`apps/web/src/app/api/chat/route.ts`** — The streaming chat endpoint remains a "thick controller" by design (SSE streaming is inherently HTTP-coupled), but budget enforcement, model override parsing, and multi-agent dispatch logic should be extracted to service functions.

**Severity**: 🟡 MEDIUM

### 5. `apps/web/src/components/chat/composer.tsx` (623 lines)

Mixes: voice input, slash commands, image upload, drag-and-drop, send logic, error handling, touch detection, and language detection.

**Recommended**: Extract `useImageUpload`, `useVoiceInput`, `useSlashCommands` hooks.

**Severity**: 🟡 MEDIUM

## Moderate Violations

### 6. `packages/ai/src/multi-agent/orchestrator.ts` (~280 lines)

Handles: budget reservation, shared context building, specialist fan-out, fusion, citation enforcement, message persistence, telemetry.

**Recommended**: Split budget and persistence into separate concerns, injected as dependencies.

**Severity**: 🟠 MEDIUM-LOW

### 7. Duplicated Timeframe Switch Statements

Found in **6 files**:
- `apps/web/src/lib/datetime.ts`
- `apps/web/src/hooks/use-structure.ts`
- `apps/web/src/hooks/use-chart-data.ts`
- `packages/ai/src/alerts/evaluator.ts`
- `packages/indicators/src/smc/defaults.ts`
- `packages/shared/src/timeframes.ts`

Each repeats `case '1m': ... case '5m': ...` logic. Consolidate into a single timeframe utility.

**Severity**: 🟠 MEDIUM-LOW

### 8. Service Layer Is a Thin Pass-through

`apps/web/src/lib/services/chat.ts`, `portfolio.ts`, `journal.ts`, `alerts.ts` — Most functions are 3-5 line pass-throughs using `as unknown as DTO` casts. They add indirection without adding value.

**Either**: Remove them and let routes call `@hamafx/ai` directly (since ai package already abstracts DB), **or** add actual business logic (validation, transformation, authorization) to justify the layer.

**Severity**: 🟠 MEDIUM-LOW

## Minor Violations

### 9. React Components with Data Fetching

`chat-screen.tsx` (line 160): `fetch('/api/chat/threads/${threadId}/summary')`  
`wizard.tsx` (line 124): `fetch('/api/onboarding/save-progress')`  
`composer.tsx` (line 238): `fetchCsrf('/api/upload')`

These should use the `market-client.ts` or `api-client.ts` abstractions.

**Severity**: 🔵 LOW

---

**Additional Strengths Found During Deep Review**:
- **Tool Category System (PF-13)**: Tools are organized into 4 category files (`market.ts`, `analysis.ts`, `journal.ts`, `system.ts`) that self-register — clean SRP
- **Mutation Guard**: `mutation-guard.ts` cleanly separates write-intent validation from tool execution
- **Domain Tool Filter**: `by-domain.ts` isolates per-domain tool selection logic
- **Alert Delivery**: `delivery.ts` cleanly separates email, Telegram, and web-push delivery channels
- **Notification System**: `noise-control.ts` (pure logic) is cleanly separated from `noise-state.ts` (DB persistence)
- **Worker Jobs**: Each job is a single file with one `run*()` function — excellent SRP at the job level

## SRP Score: 6.5/10

**Rationale**: Strong SRP at the module level (tools, jobs, notifications). The central `agent.ts` (918 lines) and `model.ts` (762 lines) remain the primary SRP concern.
