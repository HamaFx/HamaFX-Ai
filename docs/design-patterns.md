# HamaFX-Ai Design Patterns

> PF-18 — Documenting the architectural patterns used across the codebase.

## 1. Strategy Pattern — Model Routing

**Location:** `packages/ai/src/model.ts`

**Purpose:** Route a chat turn to the appropriate LLM model based on the routing domain (fundamental, technical, summary, vision).

**Implementation:**
- `MODEL_ROUTER` is a `Record<ModelDomain, DomainRoutingStrategy>` map
- Each strategy encapsulates how to resolve a model for its domain
- `routeModelByDomain()` dispatches using the map — adding a new domain means adding an entry, not editing the dispatch function

**Files:** `model.ts` (PF-03)

## 2. Command Pattern — Worker Jobs

**Location:** `apps/worker/src/jobs/types.ts`, `apps/worker/src/scheduler.ts`

**Purpose:** Register and dispatch worker jobs by name.

**Implementation:**
- `Job` interface with `name`, `schedule`, `run()` method
- `JOB_REGISTRY` map of job name → `Job` instance
- The scheduler looks up jobs by name in the registry rather than using if/else dispatch

**Files:** `types.ts`, `scheduler.ts`, `jobs/index.ts` (PF-04)

## 3. Registry Pattern — AI Tools

**Location:** `packages/ai/src/tools/registry.ts`

**Purpose:** Allow tools to self-register so `agent.ts` doesn't need to import them directly.

**Implementation:**
- `ToolRegistry` singleton class with `register()`, `resolve()`, `resolveForPlan()`
- Each tool file calls `toolRegistry.register()` at import time
- `agent.ts` resolves tools via `toolRegistry.resolve()` without importing individual tool files

**Files:** `tools/registry.ts`, `tools/index.ts`, `tools/by-domain.ts` (PF-02)

## 4. Specification Pattern — Alert Rules

**Location:** `packages/ai/src/alerts/spec.ts`

**Purpose:** Evaluate alert conditions using composable specification objects.

**Implementation:**
- `AlertSpec` interface with `isSatisfiedBy()` method
- `LevelSpec` — fires when value crosses a threshold
- `CrossingSpec` — fires when value *transitions* through a threshold
- `AndSpec` / `OrSpec` — logical composition of specs
- `specFromRule()` factory converts a persisted `AlertRule` into a spec

**Files:** `alerts/spec.ts`, `alerts/evaluator.ts` (PF-08)

## 5. Middleware Chain — API Routes

**Location:** `apps/web/src/lib/api.ts`

**Purpose:** Compose middleware functions (auth, rate-limit, validation) into a single handler.

**Implementation:**
- `compose(...middlewares)` chains middleware left-to-right
- Each middleware can short-circuit by returning a Response, or call `next()` to delegate
- `authMiddleware()` is a factory that creates an auth-check middleware

**Files:** `lib/api.ts` (PF-10)

## 6. Adapter Pattern — Market Data

**Location:** `packages/data/src/adapters/`

**Purpose:** Abstract multiple market data providers behind a unified interface.

**Implementation:**
- `getPrice()`, `getCandles()` call `runWithFailover()` which tries providers in priority order
- Each provider adapter implements the same operation

**Files:** `data/src/adapters/price.ts`, `candles.ts`, `data/src/failover.ts`

## 7. Template Method Pattern — BaseAgent

**Location:** `packages/ai/src/multi-agent/agents/base-agent.ts`

**Purpose:** Share the agent execution flow while letting subclasses define their specific behavior.

**Implementation:**
- `BaseAgent` defines `run()` with the shared flow (resolve model, build system prompt, call LLM, parse output)
- Subclasses implement `systemPrompt()`, `tools()`, `parseOutput()` abstract methods
- Concrete agents: `TechnicalAgent`, `FundamentalAgent`, `RiskAgent`, `SentimentAgent`, `DecisionAgent`

**Files:** `base-agent.ts`, `technical-agent.ts`, `fundamental-agent.ts`, `risk-agent.ts`, `sentiment-agent.ts`, `decision-agent.ts`

## 8. Proxy Pattern — Tool Telemetry

**Location:** `packages/ai/src/tools/with-telemetry.ts`

**Purpose:** Automatically record telemetry for every tool invocation without modifying tool code.

**Implementation:**
- Each tool is wrapped with a proxy that records timing, success/failure, and output metrics
- Applied automatically by `ToolRegistry.register()` — tools don't need to know about telemetry

## 9. Failover Pattern — Data Providers

**Location:** `packages/data/src/failover.ts`, `packages/data/src/health.ts`

**Purpose:** Route requests through multiple providers with health-aware ordering.

**Implementation:**
- `runWithFailover()` tries providers in order, falling back on failure
- `Health` class tracks provider success/failure, adjusts scores for prioritization

## 10. Cache-Aside with Stale-While-Revalidate

**Location:** `packages/data/src/cache/`

**Purpose:** Cache data with TTL-based freshness and stale-while-error fallback.

**Implementation:**
- `Cache` interface with `fetch()` and `fetchWithMeta()`
- `MemoryCache` — process-local, LRU eviction, single-flight for concurrent callers
- `RedisCache` — cross-instance via Upstash Redis REST API, tag-based invalidation

**Files:** `cache/types.ts`, `cache/memory.ts`, `cache/redis.ts`

## 11. State Pattern — Thread Lifecycle

**Location:** `packages/ai/src/thread-state.ts`

**Purpose:** Model thread state transitions (created → active → archived/deleted).

**Implementation:**
- `ThreadStateHandler` interface per state defining allowed operations and transitions
- `getThreadStateHandler()` returns the handler for a given state
- `canTransitionThread()` validates transitions before performing them

**Files:** `thread-state.ts` (PF-17)

## 12. Strategy Pattern — Per-Provider Model Resolution

**Location:** `packages/ai/src/byok-providers.ts`

**Purpose:** Each AI provider (Google, Anthropic, OpenAI, etc.) defines its own model resolution strategy.

**Implementation:**
- Each provider spec has a `factory(apiKey) => (modelId) => LanguageModel` function
- `resolveChatModel()` iterates configured providers in priority order
- Circuit breaker (`model-circuit-breaker.ts`) skips providers with repeated failures

## 13. Factory Pattern — LlmClient

**Location:** `packages/ai/src/llm-client.ts`

**Purpose:** Abstract the Vercel AI SDK behind an interface so tests can swap implementations.

**Implementation:**
- `LlmClient` interface with `generateText()` and `streamText()`
- `VercelLlmClient` — default implementation delegating to the `ai` SDK
- `getLlmClient()` / `setLlmClient()` — singleton factory with override support

**Files:** `llm-client.ts` (PF-07)

## 14. Query/Repository Pattern — Data Access

**Location:** `packages/db/src/queries/`

**Purpose:** Decouple high-level modules from Drizzle ORM internals.

**Implementation:**
- Namespace-based query helpers (e.g., `queries.threads.list()`, `queries.alerts.create()`)
- Consumers import from the queries barrel instead of importing `schema` directly
- Each query function encapsulates a single database operation with proper scoping

**Files:** `queries/threads.ts`, `alerts.ts`, `journal.ts`, `push.ts`, `cot.ts`, `portfolio.ts`, `telemetry.ts` (PF-01)
