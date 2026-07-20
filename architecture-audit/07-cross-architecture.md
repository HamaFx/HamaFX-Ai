# 07 — Cross-Architecture Review

## Executive Summary

**Score: 7.5/10** — The overall architecture is well-structured at the package level with clean dependency flow (config → shared → db+indicators → data → ai → web+worker). However, several cross-cutting concerns reveal coupling patterns, shared mutable state, and architectural drift that need addressing as the codebase scales.

## 1. Coupling & Cohesion

### Package-Level: ✅ Excellent

The dependency chain is unidirectional and clean:
```
config → shared → db + indicators → data → ai → web + worker
```

No circular dependencies exist between packages. The `config/eslint/index.js` enforces this with the `no-restricted-imports` rule preventing direct `@hamafx/*` imports from route files.

### Module-Level: ⚠️ Moderate Internal Coupling

Within `packages/ai/`, modules are tightly coupled through direct imports:
- `agent.ts` imports from `model.ts`, `routing.ts`, `planner.ts`, `cost.ts`, `persistence.ts`, `verification.ts`, `tool-context.ts`, `diagnostics/`, `fallback.ts`, `model-resolution.ts`, `llm-throttle.ts`, `rate-limits.ts`, `title.ts`, `message-text.ts`, `memory/thread-summary.ts`
- All tool files import from `tool-context.ts`, and many import from `persistence.ts` and `model.ts`

This creates a dense dependency graph where touching one module ripples through many others.

### Frontend-Backend: ✅ Good Decoupling

The frontend communicates exclusively through HTTP API routes. No direct DB access from client components. The `api-client.ts` and `market-client.ts` abstractions centralize API communication.

## 2. Shared Mutable State

### Global Singletons (Identified Instances):

| Singleton | Location | Risk |
|-----------|----------|------|
| `_client`, `_sql`, `_replicaClient`, `_replicaSql`, `_adminClient`, `_adminSql` (DB connections) | `packages/db/src/client.ts` | Medium — 6 singletons, lazy init |
| `_pglite`, `_db`, `_activeDataDir` (PGlite) | `packages/db/src/pglite-client.ts` | Low — test/development only |
| `_mode` (DB mode) | `packages/db/src/local-db.ts` | Low |
| `_defaultClient` (LLM) | `packages/ai/src/llm-client.ts` | Medium — overridable via `setLlmClient()` |
| `_dispatcher` (Bot) | `packages/ai/src/bot/dispatcher.ts` | Low — lazy init, getter pattern |
| `_instance` (Sentiment) | `packages/ai/src/sentiment/social-sentiment-service.ts` | Low — lazy init, getter pattern |
| `_sdk` (OpenTelemetry) | `packages/ai/src/instrumentation.ts` | Low — init once at startup |
| `_tenantCaches` | `packages/data/src/cache/index.ts` | Medium — LRU eviction, no TTL cleanup |
| `_runningJobs` | `apps/worker/src/scheduler.ts` | Medium — can get stuck entries (mitigated by STAB-19) |
| `toolRegistry` | `packages/ai/src/tools/registry.ts` | Low — idempotent registration |

**Total: 14+ global singletons** across the codebase.

**Assessment**: The count of global singletons is higher than initially reported. While some are appropriate (connection pools, caches), the lack of a DI container means test isolation requires patching these globals. The `AsyncLocalStorage` pattern for `ToolContext` is the right approach for per-request state.

## 3. Circular Dependencies

### Package-Level: ✅ None Found

Verified: no package imports from a package that depends on it.

### Module-Level (Within ai package): ⚠️ Potential

Several modules have bidirectional knowledge:
- `routing.ts` → `semantic-routing.ts` → `routing.ts` (via types)
- `multi-agent/types.ts` imports from `prompt/system.ts` which is in the parent package

These are managed through type-only imports and careful barrel exports, but they represent places where refactoring could create actual cycles.

## 4. Architecture Drift

### Planned vs Actual Architecture

| Planned Pattern | Actual Implementation | Deviation |
|----------------|----------------------|-----------|
| Service Layer (PF-22) | Pass-through facades | Services add indirection without value |
| Repository Pattern | `db/queries/` functions | No interface, all concrete Drizzle |
| Dependency Injection | `setLlmClient()`, `AsyncLocalStorage` | Minimal; most deps are direct imports |
| Tool Plugin System (PF-02) | `ToolRegistry` class | Well-implemented, no drift |

### AI Package Size Growth

The AI package has grown to encompass: chat, tools, multi-agent, alerts, journal, portfolio, sentiment, notifications, bot, telegram, diagnostics, memory, embeddings, push, briefings, snapshots, CoT, sharing, eval, retry, fallback.

**Risk**: The package is becoming a monolith. Consider splitting into:
- `@hamafx/ai-core` — chat, tools, routing, model resolution
- `@hamafx/ai-multi-agent` — orchestrator, agents
- `@hamafx/ai-features` — alerts, journal, portfolio, notifications

## 5. Layer Violations

### Found Violations:

1. **DB access from tool files**: Tools bypass the repository layer, directly calling `getDb()` and Drizzle queries. (See DIP report)
2. **Direct fetch() in React components**: `chat-screen.tsx`, `composer.tsx`, `wizard.tsx` — should use API client abstractions
3. **`@hamafx/db` import in onboarding components**: `wizard-step-symbols.tsx` imports `SymbolCatalogRow` type from `@hamafx/db` — acceptable for types, but indicates conceptual layer bleeding
4. **process.env in adapter files**: `price.ts`, `candles.ts` read env vars directly instead of receiving config

## 6. Package Organization Assessment

### Well-Organized:
- `packages/shared/src/schemas/` — Clean, per-domain schema files
- `packages/data/src/providers/` — Each provider has its own directory
- `packages/ai/src/tools/` — One file per tool, clean naming
- `apps/web/src/components/chat/parts/` — One component per tool output type

### Could Improve:
- `packages/ai/src/` — 90+ files in root, some large. Could use subdirectories: `chat/`, `tools/`, `providers/`
- `apps/web/src/app/api/` — Deep nesting with many single-route directories. Consider route grouping
- `packages/db/drizzle/` — 54 migration files in one directory. Consider yearly subdirectories

## 7. Dead Abstractions & Over-engineering

### Dead Abstractions:
- **Service Layer (PF-22)**: Currently adds indirection without value. Either add real business logic or remove the layer.
- **`DomainRoutingStrategy` for `embedding`**: The `resolve` method throws — should not be in the strategy map.

### Over-engineering:
- The `OrSpec`/`AndSpec` composite pattern for alerts is elegant but used for only 2-3 rule types. Consider if the complexity is justified.
- `ThreadStateHandler` with state pattern — only 4 states, transitions are simple. Pattern adds conceptual overhead for minimal benefit.

### Under-engineering:
- No DI container or service locator despite growing dependency graph
- No plugin/extension system for market data providers (hardcoded in adapter files)
- No feature flag system for gradual rollouts (though `feature_flags` table exists)

## 8. File Size Analysis

| Tier | Files | Examples |
|------|-------|----------|
| Monster (>700 lines) | 2 | `agent.ts` (918), `model.ts` (762) |
| Large (400-700) | 3 | `worker/src/index.ts` (530), `composer.tsx` (623), `orchestrator.ts` (280) |
| Medium (200-400) | 15+ | `routing.ts`, `orchestrator.ts`, `composer.tsx`, etc. |
| Small (<200) | Most | Tools, hooks, utilities |

**Goal**: No file should exceed 300 lines. The two monster files need immediate attention.

## 9. Test Coverage & Architecture Alignment

### Coverage: Good (590+ vitest cases, 16 E2E specs)

| Package | Test Files | Notes |
|---------|-----------|-------|
| `ai/` | 50+ | Excellent — most critical paths covered |
| `data/` | 10 | Good — failover, cache, provider mapping |
| `db/` | 8 | Good — migration chain, schema drift, rate limiting |
| `indicators/` | 12 | Good — property-based tests, fixtures |
| `web/` | 20+ | Good — hooks, route handlers, UI components |
| `worker/` | 17 | Good — consumer, scheduler, jobs |
| `shared/` | 8 | Adequate |

### Architecture Test Gaps:
- No integration tests for the full `runChat` pipeline with actual tool calls
- No contract tests between services and routes
- Limited chaos/load testing for multi-agent concurrency

## 10. Documentation Quality

### Strengths:
- Comprehensive `docs/` directory with 15+ architecture documents
- `AGENTS.md` — excellent guide for AI coding agents
- Inline comments explain WHY, not just WHAT
- Phase annotations (PF-02, STAB-06, etc.) link to audit findings

### Gaps:
- No sequence diagrams for multi-agent orchestration
- No decision records (ADRs) for architectural choices
- API route documentation relies on code inspection

---

## Cross-Architecture Score: 7.5/10

**Rationale**: The package-level architecture is solid with clean dependencies. Strengths include the PF-04 job registry pattern, PF-13 tool category organization, domain-based tool filtering, and the mutation guard for write tools. The codebase suffers from growing module-level coupling in the AI package (48 direct DB imports), 14+ global singletons, and a service layer that adds indirection without value. The two monster files (`agent.ts` at 918 lines, `model.ts` at 762 lines) are architectural bottlenecks that should be prioritized for refactoring.
