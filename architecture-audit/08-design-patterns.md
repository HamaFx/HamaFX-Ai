# 08 — Design Patterns Review

## Executive Summary

The codebase demonstrates mature use of design patterns with 15+ patterns identified. The strategic patterns (Strategy, Factory, Registry, Failover) are well-implemented. Several patterns are correctly applied but need refinement. A few missing patterns would significantly improve maintainability.

## Pattern Inventory

### 1. Strategy Pattern ✅ Excellent

**Location**: `packages/ai/src/model.ts` — `MODEL_ROUTER`

```typescript
export const MODEL_ROUTER: Record<ModelDomain, DomainRoutingStrategy> = {
  fundamental: { description: '...', resolve: (ctx) => resolveChatModel(ctx, 'fundamental') },
  technical: { description: '...', resolve: (ctx) => resolveChatModel(ctx, 'technical') },
  summary: { description: '...', resolve: (ctx) => resolveChatModel(ctx, 'summary') },
};
```

**Assessment**: Clean OCP-compliant implementation. Adding a domain requires one map entry.

### 2. Factory Pattern ✅ Good

**Location**: `packages/ai/src/_providers/types.ts` — `factory` field on `ByokProviderSpec`

```typescript
factory: (apiKey: string) => (modelId: string) => LanguageModel;
```

**Assessment**: Each provider declares how to create its models. Testable and extensible. The `vertex-factory.ts` is a specialized factory for Vertex AI.

### 3. Registry Pattern ✅ Good

**Location**: Multiple places:
- `packages/ai/src/tools/registry.ts` — `ToolRegistry` class with `register()`, `resolve()`, `resolveForPlan()`
- `packages/ai/src/tools/` — 4 category files (`market.ts`, `analysis.ts`, `journal.ts`, `system.ts`) that batch-register tools
- `packages/ai/src/_providers/registry.ts` — `BYOK_PROVIDERS` record
- `packages/data/src/providers/market-data-providers.ts` — `MARKET_DATA_PROVIDERS`
- `apps/worker/src/jobs/index.ts` — `JOBS` record (PF-04) with per-job schedule + healthchecks metadata

**Assessment**: The `ToolRegistry` class with category-based registration is the strongest implementation. The `JOBS` record in the worker is also excellent — adding a job requires one entry with schedule metadata, no dispatch changes. The indicator registry is the weakest (still uses a switch statement), and the market data providers use manual object definitions with boilerplate.

### 4. Adapter Pattern ✅ Good

**Location**: `packages/data/src/adapters/` (price, candles, news, calendar, storage)

**Assessment**: Clean separation between data consumers and provider-specific implementations. The adapter layer normalizes responses into shared DTOs.

### 5. Failover/Chain of Responsibility ✅ Excellent

**Location**: `packages/data/src/failover.ts` — `runWithFailover()`

**Assessment**: Health-aware provider ordering, provider pinning, error ranking, empty-result handling. One of the best-implemented patterns in the codebase.

### 6. Repository Pattern ⚠️ Partial

**Location**: `packages/db/src/queries/` — Query functions

**Assessment**: Functions serve as repositories but:
- No `IRepository` interface — all functions return Drizzle-specific types
- No unit of work pattern
- Mixed read/write concerns in same files

### 7. Template Method Pattern ✅ Good

**Location**: `packages/ai/src/multi-agent/agents/base-agent.ts`

**Assessment**: `run()` is the template method. `systemPrompt()`, `tools()`, `parseOutput()`, `resolveModel()` are the hooks. Clean implementation with LSP compliance.

### 8. Observer Pattern ✅ Good

**Location**: `apps/worker/src/symbol-manager.ts` — EventEmitter-based symbol change notifications

**Assessment**: Clean event-based architecture for per-consumer subscription updates. Used to wire BiQuote and Binance consumers dynamically.

### 9. State Pattern ✅ Good

**Location**: `packages/ai/src/thread-state.ts` — `ThreadStateHandler` implementations

**Assessment**: Clean state machine for thread lifecycle (created → active → archived → deleted). Each state is a separate class.

### 10. Specification/Composite Pattern ✅ Excellent

**Location**: `packages/ai/src/alerts/spec.ts`

```typescript
class LevelSpec implements AlertSpec { ... }
class CrossingSpec implements AlertSpec { ... }
class AndSpec implements AlertSpec { ... }  // Composite
class OrSpec implements AlertSpec { ... }   // Composite
```

**Assessment**: Excellent use of the Specification pattern with composites. This is production-quality OO design.

### 11. Command Pattern ✅ Good

**Location**: `packages/ai/src/bot/` — `BotDispatcher`, `BotCommand` interface

**Assessment**: Clean command dispatch with `parseCommand()` → `dispatcher.handle()`. Each command (ask, chart, alert, price, etc.) is a separate file.

### 12. Decorator/Wrapper Pattern ✅ Good

**Location**: `packages/ai/src/tools/with-telemetry.ts` — `withTelemetry()` wraps tools

**Assessment**: Non-invasive telemetry instrumentation. Each tool is automatically wrapped at registration time.

### 13. Singleton Pattern ⚠️ Problematic

**Location**: Multiple global singletons (see Cross-Architecture report)

**Assessment**: While appropriate for connection pools and caches, the lack of lifecycle management and test isolation is a concern. Consider a DI container instead.

### 14. Facade Pattern ⚠️ Under-implemented

**Location**: `apps/web/src/lib/services/` — Service layer

**Assessment**: These are labeled as services but function as thin pass-through facades. They should encapsulate business logic, not just delegate.

### 15. Builder Pattern (Missing) ❌

**Location**: Not present

**Assessment**: The `RunChatArgs` construction in route handlers builds complex objects manually. A builder pattern (or the AI SDK's built-in approach) would simplify this.

## Missing Patterns

### 1. Dependency Injection Container ❌

**Impact**: HIGH

The codebase would benefit enormously from a lightweight DI container (e.g., `tsyringe`, `inversify`, or a simple homemade one). This would:
- Eliminate global singletons
- Make tests truly isolated
- Enable easy swapping of implementations
- Document dependencies explicitly

### 2. Plugin/Extension System ❌

**Impact**: MEDIUM

Market data providers, AI providers, and tools are currently hardcoded in registries. A plugin discovery system would enable:
- Third-party provider contributions
- Feature-flag-based enablement
- Dynamic loading for reduced bundle size

### 3. Circuit Breaker Pattern (Partially Present) ⚠️

**Location**: `packages/ai/src/model-circuit-breaker.ts`

**Assessment**: The circuit breaker exists but is only used for AI model providers. It should also protect:
- Market data provider calls
- External API calls (Finnhub, Binance)
- Database write operations

### 4. CQRS Pattern (Partially Present) ⚠️

**Assessment**: Read replicas (`getDbRO()`, `withTenantDbRO()`) are used for market data reads. However, write operations are not separated from reads at the service level. Full CQRS would benefit the high-read market data paths.

### 5. Event Sourcing (Missing) ❌

**Impact**: LOW (Future)

For audit trails, trade journaling, and AI decision tracking, event sourcing would provide:
- Complete replay capability
- Natural audit log
- Time-travel debugging

## Pattern Implementation Quality

| Pattern | Implementation | Correctness | Extensibility |
|---------|---------------|-------------|---------------|
| Strategy (Model Router) | Map-based dispatch | ✅ | ✅ |
| Factory (Provider) | Factory functions | ✅ | ✅ |
| Registry (Tools) | Class with methods | ✅ | ✅ |
| Adapter (Data) | Function wrappers | ✅ | ✅ |
| Failover | Health-aware ordering | ✅ | ✅ |
| Repository | Query functions | ⚠️ | ❌ |
| Template Method | Abstract base class | ✅ | ✅ |
| Observer | EventEmitter | ✅ | ✅ |
| State | State class per status | ✅ | ✅ |
| Specification | Composite pattern | ✅ | ✅ |
| Command | Dispatcher + interface | ✅ | ✅ |
| Decorator | Function wrapper | ✅ | ✅ |
| Singleton | Module-level vars | ⚠️ | ❌ |
| Facade | Service functions | ❌ | ❌ |

---

## Recommendations

1. **Promote Repository to first-class**: Add `IThreadRepository`, `IAlertRepository`, etc. interfaces
2. **Add DI container**: Eliminates singleton anti-pattern, improves testability
3. **Extract AI sub-packages**: Prevent the AI package from becoming a monolith
4. **Plugin system for providers**: Enables community contributions and feature flags
5. **Apply Circuit Breaker broadly**: Protect all external service calls
