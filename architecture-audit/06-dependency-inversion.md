# 06 — Dependency Inversion Principle (DIP) Audit

## Executive Summary

**Score: 6.0/10** — This is the weakest SOLID principle in the codebase. While strategic abstractions exist (`LlmClient`, `Cache`, `MarketDataProvider`, `NoiseState`), the codebase has widespread direct dependencies on concrete implementations, particularly `getDb()` from `@hamafx/db` in tool files and route handlers. The dependency chain is top-down clean at the package level, but many modules depend on concretions rather than abstractions.

## Strengths

### 1. LlmClient Abstraction (Good DIP)

`packages/ai/src/llm-client.ts` — The `LlmClient` interface abstracts the Vercel AI SDK. Tests can inject a mock via `setLlmClient()`. `agent.ts` uses `getLlmClient()` rather than importing `streamText` directly.

**DIP Score**: ✅ Good

### 2. Cache Abstraction (Good DIP)

`packages/data/src/cache/types.ts` — The `Cache` interface abstracts storage backends. `MemoryCache` and `RedisCache` are concrete implementations. Adapters use `getDefaultCache()` rather than instantiating caches directly. Auto-selects Redis when `REDIS_URL` is set (PF-14).

**DIP Score**: ✅ Good

### 3. MarketDataProvider Interface (Good DIP)

`packages/data/src/providers/market-data-provider.ts` — Adapter code depends on the `MarketDataProvider` interface, not on BiQuote, Finnhub, or Binance directly. `runWithFailover()` works with any `ProviderAttempt<T>`.

**DIP Score**: ✅ Good

### 4. NoiseState Abstraction (Good DIP)

`packages/ai/src/notifications/noise-control.ts` — `NoiseState` interface with `InMemoryNoiseState` and `DbNoiseState` implementations. Consumers depend on the interface.

**DIP Score**: ✅ Good

### 5. Service Layer Pattern (PF-22) (Partial DIP)

`apps/web/src/lib/services/` — Route handlers depend on service functions rather than domain packages directly. The ESLint rule (`no-restricted-imports`) enforces this at build time.

**Limitation**: Services currently pass through to `@hamafx/ai` without adding abstraction value. See SRP analysis.

**DIP Score**: ⚠️ Partial

## Critical Violations

### 1. Direct getDb() Throughout the AI Package 🔴 CRITICAL

**48 files** across `packages/ai/src/` import from `@hamafx/db` directly, including:
- **10 tool files** in `tools/` (get-calendar, get-news, analyze-fundamental, analyze-chart-image, forecast-volatility, get-journal-stats, get-intermarket-resonance, convene-committee, run-system-action, get-system-diagnostics)
- **7 bot command files** (ask, analyze, price, alert, settings, news, status)
- **Core module files** (agent.ts, cost.ts, persistence.ts, context.ts, planner.ts, usage.ts, rag.ts, catalogue.ts)
- **Feature modules** (alerts/persistence, alerts/evaluator, journal/persistence, portfolio/position-service, briefings/*, snapshots/*, share/*, cot/*, push/*, news-persistence, calendar-persistence, memory/*, notifications/*, diagnostics/*, multi-agent/*)

```typescript
// Typical pattern repeated across 48 files:
import { getDb, schema } from '@hamafx/db';
const db = getDb();
```

These modules should receive a `Database` abstraction rather than calling `getDb()` directly. Direct DB access makes them:
- Hard to unit test (must mock `getDb()`)
- Impossible to swap DB implementations
- Tightly coupled to Drizzle ORM specifics

**Fix**: Add `db` to `ToolContext` and inject through `getToolContext()`. For non-tool modules, pass DB as a parameter or use a DI container.

**Severity**: 🔴 CRITICAL

### 2. Direct getDb() in agent.ts 🔴

`packages/ai/src/agent.ts` calls `getDb()` and `getUserWithSettings()` directly. The DB is a concrete dependency, not injected.

**Severity**: 🔴 CRITICAL

### 3. Direct getDb() in Job Files 🔴

`apps/worker/src/scheduler.ts` and individual job files import `getDb()` directly. Jobs should receive a database handle through dependency injection.

**Severity**: 🔴 CRITICAL

### 4. Direct Postgres Import in db/client.ts ⚠️

`packages/db/src/client.ts` imports `postgres` (the Postgres.js library) directly. While this is the DB package's responsibility, the lack of a DB interface means the entire codebase is coupled to Postgres through Drizzle.

**Mitigation**: PGlite provides an alternative, but it's a Drizzle-level abstraction, not a DB interface.

**Severity**: 🟡 HIGH

### 5. Direct @hamafx/ai Imports from ai Package Internals 🟡

Within `packages/ai/`, many files import from sibling modules directly rather than through interfaces:
- Tool files import from `../persistence` directly
- Agent.ts imports from `../model`, `../routing`, `../planner` directly
- These are package-internal and acceptable at a module level, but represent concrete dependencies

**Severity**: 🟡 HIGH

### 6. Hardcoded Provider Selection in agent.ts Retry Loop ⚠️

`packages/ai/src/agent.ts` — The retry loop calls `pickNextFallbackProvider()` with hardcoded references to specific provider types. The fallback chain logic is tightly coupled to the BYOK provider system.

**Severity**: 🟠 MEDIUM

### 7. Direct env access in Adapter Files ⚠️

`packages/data/src/adapters/price.ts` and `candles.ts` access `process.env` directly for API keys. While partially mitigated by the `apiKeys` parameter, the fallback path reads `process.env.FINNHUB_API_KEY` and `process.env.BIQUOTE_BASE_URL` directly.

**Fix**: Adapters should receive all configuration through parameters or a config provider.

**Severity**: 🟠 MEDIUM

### 8. Global Singletons Without DI ⚠️

**14+ global mutable singletons** exist across the codebase without dependency injection:

```typescript
// packages/db/src/client.ts — 6 singletons
let _client: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;
let _replicaClient: DbClient | null = null;
let _replicaSql: ReturnType<typeof postgres> | null = null;
let _adminClient: DbClient | null = null;
let _adminSql: ReturnType<typeof postgres> | null = null;

// packages/db/src/pglite-client.ts — 3 singletons
let _pglite: PGlite | null = null;
let _db: PgliteDatabase | null = null;
let _activeDataDir: string | null = null;

// packages/db/src/local-db.ts — 1 singleton
let _mode: 'postgres' | 'pglite' | null = null;

// packages/ai/src/llm-client.ts — 1 singleton
let _defaultClient: LlmClient | null = null;

// packages/ai/src/bot/dispatcher.ts — 1 singleton
let _dispatcher: BotDispatcher | null = null;

// packages/ai/src/sentiment/social-sentiment-service.ts — 1 singleton
let _instance: SocialSentimentService | null = null;

// packages/ai/src/instrumentation.ts — 1 singleton
let _sdk: NodeSDK | null = null;

// packages/data/src/cache/index.ts — 1 singleton
const _tenantCaches = new Map<string, Cache>();

// apps/worker/src/scheduler.ts — 1 singleton
const _runningJobs = new Set<keyof typeof JOBS>();
```

These globals make testing and lifecycle management difficult.  
**Fix**: Use a DI container or context object for these singletons.

**Severity**: 🟡 HIGH

### 9. Concrete Agent Instantiation 🔵

`packages/ai/src/multi-agent/orchestrator.ts`:

```typescript
const AGENT_FACTORIES: Record<AgentName, () => BaseAgent> = {
  technical: () => new TechnicalAgent(),
  fundamental: () => new FundamentalAgent(),
  // ...
};
```

Adding a new agent requires modifying this map. Consider auto-discovery or registration.

**Severity**: 🔵 LOW

---

## Dependency Flow Analysis

### Current Flow (Concrete):
```
Route → Service → @hamafx/ai (runChat) → getDb() → Postgres
                                        → getLlmClient() → Vercel AI SDK
                                        → tool files → getDb() → Postgres
```

### Ideal Flow (Abstracted):
```
Route → Service → ChatPipeline(IAIService, IDatabase, IModelResolver)
                        → IDatabase.query()
                        → IModelResolver.resolve()
                        → tools → IToolContext.db
```

---

**Additional Findings During Deep Review**:
- **`setLlmClient()` override**: Good DIP for LLM testing — tests can inject a mock client
- **`AsyncLocalStorage` for ToolContext**: Per-request state without globals — excellent pattern
- **`NoiseState` interface**: Clean abstraction over `InMemoryNoiseState` and `DbNoiseState`
- **Tool tools use `getToolContext().userId`**: Mutation tools (set_alert, log_journal, share_snapshot) get userId from context, not from direct DB queries — partial DIP improvement
- **Many read-only tools (get-price, get-candles, get-indicators, get-correlation, get-cot, compute-risk, verify-call, annotate-chart, get-session-levels) don't import `@hamafx/db` at all**: ~20 of the ~32 tools have NO direct DB dependency — this is better than the report initially suggested

## DIP Score: 6.5/10 (Adjusted up — 20/32 tools have no direct DB dependency)
