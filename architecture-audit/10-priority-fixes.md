# 10 — Priority Fixes

## Overview

This document ranks all identified issues by priority, estimated effort, and impact. Each recommendation includes a concrete implementation approach.

## Priority Legend

| Priority | Meaning |
|----------|---------|
| 🔴 P0 | Must fix — blocking scalability or maintainability |
| 🟡 P1 | Should fix — significant improvement, moderate urgency |
| 🟢 P2 | Nice to fix — incremental improvement, low urgency |

---

## 🔴 P0 — Critical Fixes

### P0-1: Split agent.ts (~800 lines → ~50 lines + composed stages)

**Principle**: SRP  
**Effort**: HIGH (2-3 days)  
**Impact**: HIGH  
**Risk of not fixing**: agent.ts grows beyond maintainable size, changes become high-risk

**Approach**:
```typescript
// New: packages/ai/src/chat/pipeline.ts
class ChatPipeline {
  constructor(
    private budget: BudgetStage,
    private history: HistoryStage,
    private routing: RouteStage,
    private streaming: StreamStage,
    private persistence: PersistStage,
  ) {}

  async execute(args: RunChatArgs): Promise<StreamTextResult> {
    const reservation = await this.budget.reserve(args);
    await this.history.load(args);
    const routing = await this.routing.classify(args);
    const result = await this.streaming.stream(args, routing);
    await this.persistence.save(args, result);
    await this.budget.reconcile(args, result.cost);
    return result;
  }
}
```

**Files to create**:
- `packages/ai/src/chat/pipeline.ts` — Composes stages
- `packages/ai/src/chat/budget-stage.ts` — Budget reservation + reconciliation
- `packages/ai/src/chat/history-stage.ts` — History loading + compaction
- `packages/ai/src/chat/route-stage.ts` — Turn routing + model resolution
- `packages/ai/src/chat/stream-stage.ts` — streamText with retry loop
- `packages/ai/src/chat/persist-stage.ts` — Message + telemetry persistence

**Tests needed**: Pipeline integration test, each stage unit test

---

### P0-2: Inject Database Abstraction into Tools

**Principle**: DIP  
**Effort**: HIGH (2-3 days)  
**Impact**: HIGH  
**Risk of not fixing**: 30+ tools are tightly coupled to Drizzle/Postgres, making DB migration impossible

**Approach**:
```typescript
// Add db to ToolContext
export interface ToolContext {
  // ... existing
  db: Database; // Abstraction, not Drizzle client
}

// In tools:
const { db } = getToolContext();
const positions = await db.positions.listOpen(userId);
```

**Files to modify**: 10 tool files in `packages/ai/src/tools/`, plus 38 other files across `packages/ai/src/` (48 total), `tool-context.ts`, `agent.ts`, and all consumers.

**Approach**: Add `db` field to `ToolContext` using existing repository-like query functions from `@hamafx/db/queries`. Create a `Database` interface that mirrors the query layer.

---

### P0-3: Convert Indicator Registry from Switch to Plugin

**Principle**: OCP  
**Effort**: MEDIUM (1 day)  
**Impact**: MEDIUM  
**Risk of not fixing**: Adding new indicators requires modifying core dispatch code

**Approach**: Apply the same `ToolRegistry` pattern:
```typescript
// packages/indicators/src/indicator-registry.ts
const indicatorRegistry = new IndicatorRegistry();

indicatorRegistry.register('sma', sma, { paramsSchema: PeriodOnly });
indicatorRegistry.register('ema', ema, { paramsSchema: PeriodOnly });
// ... etc

// Instead of switch (kind):
const indicator = indicatorRegistry.get(kind);
return indicator.compute(candles, params);
```

**Files to modify**: `packages/indicators/src/registry.ts`, individual indicator files

---

## 🟡 P1 — High Priority

### P1-1: Split model.ts (~750 lines → 4 focused modules)

**Principle**: SRP  
**Effort**: MEDIUM (1 day)  
**Impact**: MEDIUM

**Approach**:
```
packages/ai/src/model/
  index.ts          — Re-exports only
  strategy-map.ts   — MODEL_ROUTER + TIER_TO_DOMAIN
  chat-resolver.ts  — resolveChatModel, resolveModelForProvider
  vision-resolver.ts — resolveVisionModel
  embedding-resolver.ts — resolveEmbeddingModel
  override-resolver.ts — resolveOverrideModel, derivePlannerModel
  helpers.ts        — parsePickedModelId, envFallbackKeys, supportsPromptCaching
```

---

### P1-2: Split SharedContext into Focused Context Types

**Principle**: ISP  
**Effort**: MEDIUM (1 day)  
**Impact**: MEDIUM

**Approach**:
```typescript
interface AgentBaseContext {
  symbol: string;
  threadId: string;
  userId: string;
}

interface AgentDataContext {
  snapshot: LiveSnapshot;
  prefetchedData?: string;
}

interface AgentConfigContext {
  userSettings: UserSettingsRow;
  customInstructions?: string;
}

interface AgentIOContext {
  userMessage: UIMessage;
  history: UIMessage[];
  signal: AbortSignal | null;
  env: MultiAgentEnv;
}

// Each agent declares what it needs:
interface TechnicalAgentContext extends AgentBaseContext, AgentDataContext, AgentIOContext {}
```

---

### P1-3: Add Alert Rule Type Registry

**Principle**: OCP  
**Effort**: MEDIUM (1 day)  
**Impact**: MEDIUM  
**Risk of not fixing**: Adding alert rule types requires modifying 3 files

**Approach**: Create an `AlertRuleRegistry` with per-type evaluators, validators, and UI descriptors. Each rule type registers itself.

**Files to modify**: `packages/ai/src/alerts/evaluator.ts`, `spec.ts`, `tools/set-alert.ts`

---

### P1-4: Eliminate as unknown as DTO Casts in Service Layer

**Principle**: SRP + Type Safety  
**Effort**: MEDIUM (0.5 day)  
**Impact**: LOW-MEDIUM

**Approach**: Define proper DTO types and use mapping functions instead of casts. Or remove the service layer and call ai/data packages directly if the layer isn't adding value.

**Files to modify**: `apps/web/src/lib/services/chat.ts`, `portfolio.ts`, `journal.ts`, `alerts.ts`, `calendar.ts`

---

### P1-5: Consolidate Timeframe Utilities

**Principle**: SRP + DRY  
**Effort**: LOW (0.5 day)  
**Impact**: LOW

**Approach**: Create `packages/shared/src/timeframe-utils.ts` with:
```typescript
export function timeframeToSeconds(tf: Timeframe): number { ... }
export function timeframeToMs(tf: Timeframe): number { ... }
export function candlesPerDay(tf: Timeframe): number { ... }
```

Replace 6 duplicated switch statements with calls to these utilities.

---

## 🟢 P2 — Nice to Fix

### P2-1: Externalize Routing Keywords to Config

**Principle**: OCP  
**Effort**: LOW (0.5 day)  
**Impact**: LOW

Move `FUNDAMENTAL_PATTERNS`, `TECHNICAL_PATTERNS`, `SUMMARY_PATTERNS` arrays from `routing.ts` to a JSON config file or database table.

---

### P2-2: Add Provider Plugin Discovery

**Principle**: OCP + DIP  
**Effort**: MEDIUM (1-2 days)  
**Impact**: MEDIUM

Allow market data providers and AI providers to be discovered from a directory or config, rather than hardcoded in registry maps.

---

### P2-3: Add DI Container

**Principle**: DIP  
**Effort**: HIGH (3-5 days)  
**Impact**: HIGH (long-term)

Introduce a lightweight DI container (e.g., homemade or `tsyringe`). Register singletons (DB client, LLM client, cache) and inject them into consumers. Enables true test isolation.

---

### P2-4: Extract React Data Fetching into Hooks

**Principle**: SRP  
**Effort**: LOW (0.5 day)  
**Impact**: LOW

Move `fetch()` calls from `chat-screen.tsx`, `composer.tsx`, `wizard.tsx` into custom hooks: `useThreadSummary()`, `useOnboardingProgress()`, `useImageUpload()`.

---

### P2-5: Split AI Package into Sub-Packages

**Principle**: SRP + Modularity  
**Effort**: HIGH (3-5 days)  
**Impact**: HIGH (long-term)

Proposed structure:
```
packages/
  ai-core/     — chat, tools, routing, model resolution
  ai-agents/   — multi-agent orchestrator, agents
  ai-features/ — alerts, journal, portfolio, notifications, bot
```

---

### P2-6: Add Sequence Diagrams

**Principle**: Documentation  
**Effort**: LOW (0.5 day)  
**Impact**: LOW

Add Mermaid sequence diagrams to docs/ for:
- Full chat turn lifecycle
- Multi-agent orchestration flow
- Market data failover flow

---

## Effort / Impact Matrix

```
Impact
  HIGH │ P0-1, P0-2      │ P2-3, P2-5
       │ (God file split,  │ (DI container,
       │  DB abstraction)  │  sub-packages)
       │                   │
MEDIUM │ P0-3, P1-1, P1-2 │ P2-2
       │ (Indicator reg,   │ (Plugin system)
       │  model split,     │
       │  context split)   │
       │                   │
  LOW  │ P1-4, P1-5        │ P2-1, P2-4, P2-6
       │ (DTO casts,       │ (Keywords config,
       │  timeframe utils) │  data fetching hooks,
       │                   │  sequence diagrams)
       └───────────────────┴──────────────────
           LOW    MEDIUM    HIGH
                 Effort
```

## Recommended Sprint Plan

### Sprint 1 (Week 1): Foundation
- P0-1: Split agent.ts
- P0-2: Inject DB abstraction into tools
- P1-5: Consolidate timeframe utilities

### Sprint 2 (Week 2): Extensibility
- P0-3: Convert indicator registry to plugin
- P1-1: Split model.ts
- P1-3: Add alert rule type registry

### Sprint 3 (Week 3): Cleanup
- P1-2: Split SharedContext
- P1-4: Eliminate as unknown as casts
- P2-1: Externalize routing keywords
- P2-4: Extract React data fetching into hooks

### Sprint 4+ (Future): Strategic
- P2-3: Add DI container
- P2-2: Provider plugin discovery
- P2-5: Split AI package
- P2-6: Add sequence diagrams

---

*Report generated as part of the comprehensive SOLID architecture audit of HamaFX-Ai.*
