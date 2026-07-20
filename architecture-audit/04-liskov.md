# 04 — Liskov Substitution Principle (LSP) Audit

## Executive Summary

**Score: 8.5/10** — The codebase uses inheritance sparingly and correctly. Where inheritance exists (`BaseAgent`, `BaseWsConsumer`, `ThreadStateHandler`, `AlertSpec`), implementations generally respect base class contracts. TypeScript's structural typing and the project's preference for composition over inheritance reduce LSP risk.

## Strengths

### 1. BaseAgent Contract (Strong LSP Compliance)

`packages/ai/src/multi-agent/agents/base-agent.ts` defines a clean abstract contract:

- `abstract name: AgentName` — Subclasses provide their identity
- `abstract modelTier: ModelTier` — Declares computational tier
- `abstract systemPrompt(): string` — Returns agent-specific prompt
- `abstract tools(): Record<string, Tool>` — Declares tool dependencies
- `protected abstract parseOutput(text: string)` — Structured output parsing
- `async run(ctx: SharedContext): Promise<AgentOpinion>` — Template method

All 5 concrete agents (`TechnicalAgent`, `FundamentalAgent`, `RiskAgent`, `SentimentAgent`, `DecisionAgent`) implement these contracts faithfully. No agent throws `UnsupportedOperationException` or returns null unexpectedly.

**LSP Score**: ✅ Excellent

### 2. ThreadStateHandler (Good LSP)

`packages/ai/src/thread-state.ts` — Four state implementations (`CreatedState`, `ActiveState`, `ArchivedState`, `DeletedState`) all implement the same `ThreadStateHandler` contract with consistent behavior for `canTransition()`. The state pattern here correctly uses polymorphism without contract violations.

**LSP Score**: ✅ Good

### 3. Alert Specification Hierarchy (Excellent LSP)

`packages/ai/src/alerts/spec.ts` — `LevelSpec`, `CrossingSpec`, `AndSpec`, `OrSpec` all implement `AlertSpec`:
- Substitutable for the base type
- No strengthening of preconditions
- No weakening of postconditions
- Composite pattern correctly composes child specs

**LSP Score**: ✅ Excellent

### 4. Cache Interface Implementations (Good LSP)

`packages/data/src/cache/` — `MemoryCache` and `RedisCache` both implement `Cache` with consistent behavior. The `fetchWithMeta()` method returns consistent shapes regardless of backend.

**LSP Score**: ✅ Good

### 5. BinanceStreamConsumer extends BaseWsConsumer (Good LSP)

`apps/worker/src/binance/consumer.ts` — Extends `BaseWsConsumer` without violating the base class contract. Overrides are additive, not destructive.

**LSP Score**: ✅ Good

## Minor Concerns

### 1. DecisionAgent Special Case ⚠️

`packages/ai/src/multi-agent/agents/decision-agent.ts` extends `BaseAgent` but has a significantly different execution pattern — it has a `fuse()` method that takes opinions rather than the standard `run()` path. While `run()` is still callable (delegates to a simpler flow), the agent is conceptually different from other specialists (it fuses, they analyze).

**Risk**: If code iterates over agents and calls `run()`, `DecisionAgent`'s behavior diverges from the semantic contract of "analyze and produce an opinion."

**Mitigation**: The orchestrator explicitly checks for `DecisionAgent` and calls `fuse()` instead. This is explicit rather than polymorphic, which is actually good LSP discipline.

**Severity**: 🟢 INFO (not a violation, but worth documenting)

### 2. WorkerLogger Implements Logger 🟢

`apps/worker/src/log.ts` — `WorkerLogger implements Logger`. The `Logger` interface is minimal (4 methods), and the implementation is clean. No contract violations.

**Severity**: 🟢 NONE

### 3. NoiseState Implementations 🟢

`packages/ai/src/notifications/` — `InMemoryNoiseState` and `DbNoiseState` both implement `NoiseState`. The interface is small (5 methods), and both implementations behave consistently.

**Severity**: 🟢 NONE

## Inheritance Usage Analysis

The codebase has very limited inheritance:

| Base Class | Subclasses | LSP Risk |
|-----------|-----------|----------|
| `BaseAgent` (abstract) | 5 agents | Low |
| `BaseWsConsumer` | 1 (BinanceStreamConsumer) | Low |
| `ThreadStateHandler` (interface) | 4 states | None |
| `AlertSpec` (interface) | 4 specs | None |
| `Cache` (interface) | 2 (MemoryCache, RedisCache) | None |
| `NoiseState` (interface) | 2 (InMemory, Db) | None |
| `Logger` (interface) | 1 (WorkerLogger) | None |
| `LlmClient` (interface) | 1 (VercelLlmClient) | None |

**Key observation**: The codebase overwhelmingly favors interfaces over abstract classes, and composition over inheritance. This is excellent practice that minimizes LSP risk.

## Areas Where LSP Doesn't Apply

Several patterns use structural typing or duck typing rather than nominal inheritance:

1. **Tool functions**: Tools self-register as plain objects satisfying `Tool` type (from AI SDK), not through class hierarchy
2. **Provider adapters**: Market data providers implement `MarketDataProvider` interface with object literals, not classes
3. **Cron jobs**: `JobRegistration` is a plain type, jobs are registered as objects in a map

These patterns are LSP-neutral — they avoid the inheritance trap entirely.

---

**Additional Findings During Deep Review**:
- **`BinanceStreamConsumer extends BaseWsConsumer`**: Verified — clean extension with additive overrides, no contract violations
- **All 5 BaseAgent subclasses**: Each faithfully implements `name`, `modelTier`, `systemPrompt()`, `tools()`, `parseOutput()`. No null returns, no unexpected throws
- **`DecisionAgent.fuse()`**: Deliberately NOT called through `run()` — the orchestrator calls `fuse()` explicitly. This is correct LSP discipline
- **`NoiseState` implementations**: `InMemoryNoiseState` and `DbNoiseState` — identical behavior, different backends. Clean LSP
- **`Logger` interface**: `WorkerLogger` implementation is minimal and consistent

## LSP Score: 8.5/10 (Unchanged — confirmed by deep review)

**Rationale**: The codebase's minimal use of inheritance, strong preference for interfaces, and careful contract design result in very low LSP risk. The `BaseAgent` hierarchy is well-designed. No contract violations were found. The only note is that `DecisionAgent` has a different semantic role from other specialists, but the orchestrator handles this explicitly rather than relying on polymorphic substitution.
