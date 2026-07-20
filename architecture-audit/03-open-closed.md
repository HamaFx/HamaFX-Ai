# 03 — Open/Closed Principle (OCP) Audit

## Executive Summary

**Score: 7.5/10** — The codebase demonstrates strong OCP awareness in its strategic design (tool registry, model routing strategy map, provider registry, alert specification). However, several switch statements and keyword-based classification systems require modification when adding new variants.

## Strengths

### 1. Tool Plugin Registry (Excellent OCP)

`packages/ai/src/tools/registry.ts` — The `ToolRegistry` class allows adding tools without modifying `agent.ts`. Each tool self-registers:

```typescript
// Adding a new tool requires NO changes to agent.ts
toolRegistry.register('new_tool', newToolImplementation);
```

The `domainToolFilter()` in `tools/by-domain.ts` enables per-domain tool subsetting without modifying the registry.

**OCP Score**: ✅ Excellent

### 2. Model Domain Routing (Excellent OCP)

`packages/ai/src/model.ts` — The `MODEL_ROUTER` strategy map is open for extension, closed for modification:

```typescript
export const MODEL_ROUTER: Record<ModelDomain, DomainRoutingStrategy> = {
  fundamental: { ... },
  technical: { ... },
  summary: { ... },
  vision: { ... },
  embedding: { ... },
};
```

Adding a new domain requires adding one entry to the map — no other code changes.

**OCP Score**: ✅ Excellent

### 3. BYOK Provider Registry (Excellent OCP)

`packages/ai/src/_providers/registry.ts` — Adding a new AI provider involves:
1. Create a provider spec file
2. Add it to `BYOK_PROVIDERS`
3. Add to `PROVIDER_PRIORITY` in `model.ts`

No existing provider code needs modification.

**OCP Score**: ✅ Excellent

### 4. MarketDataProvider Interface (Good OCP)

`packages/data/src/providers/market-data-provider.ts` — The `MarketDataProvider` interface and `MARKET_DATA_PROVIDERS` record allow adding new data sources without changing the adapter layer. The `runWithFailover()` function works with any `ProviderAttempt<T>`.

**OCP Score**: ✅ Good

### 5. Alert Specification Pattern (Excellent OCP)

`packages/ai/src/alerts/spec.ts` — The `AlertSpec` interface with `LevelSpec`, `CrossingSpec`, `AndSpec`, `OrSpec` composites allows new rule types without modifying the evaluator.

**OCP Score**: ✅ Excellent

## Violations

### 1. Indicator Registry Switch Statement 🔴 CRITICAL

`packages/indicators/src/registry.ts` (lines 91-125):

```typescript
switch (kind) {
  case 'sma': return sma(candles, params.period);
  case 'ema': return ema(candles, params.period);
  case 'rsi': return rsi(candles, params.period);
  case 'atr': return atr(candles, params.period);
  case 'macd': return macd(candles, ...);
  case 'bollinger': return bollinger(candles, ...);
  case 'pivots': return pivotsAligned(candles);
}
```

**Problem**: Adding a new indicator requires modifying this switch.  
**Fix**: Use an indicator registry similar to the tool registry pattern.

**Severity**: 🔴 CRITICAL

### 2. Alert Rule Type Switch Statements 🔴 CRITICAL

Found in **3 files** with identical patterns:

- `packages/ai/src/alerts/evaluator.ts` (line 409): `switch (rule.type) { case 'priceCross': ... case 'candleClose': ... case 'indicatorCross': ... }`
- `packages/ai/src/alerts/spec.ts` (line 195): Same pattern
- `packages/ai/src/tools/set-alert.ts` (line 43): Same pattern

**Problem**: Adding a new alert rule type requires changes in 3 files.  
**Fix**: Registry-based dispatch. Each rule type registers its own evaluator and validator.

**Severity**: 🔴 CRITICAL

### 3. Turn Routing Keyword Classification ⚠️

`packages/ai/src/routing.ts` — Uses hardcoded keyword arrays (`FUNDAMENTAL_PATTERNS`, `TECHNICAL_PATTERNS`, `SUMMARY_PATTERNS`). Adding new keywords requires modifying these arrays.

**Mitigation**: The semantic routing fallback (`classifyTurnLLM`) provides an AI-based alternative. The keyword system is a fast-path optimization. However, the keyword lists should be externalized to a configuration file or database table.

**Severity**: 🟡 MEDIUM

### 4. Timeframe Switch Statements 🔵

Found in **6 files** (detailed in SRP report). Adding a new timeframe (e.g., `2h`, `12h`) requires modifying all 6 files.

**Fix**: Use a timeframe configuration map or registry pattern.

**Severity**: 🔵 LOW (timeframe set is relatively stable)

### 5. Model Provider Priority List ⚠️

`packages/ai/src/model.ts` (line 61):

```typescript
const PROVIDER_PRIORITY: ProviderId[] = [
  'google', 'vertex', 'anthropic', 'openai',
  'openrouter', 'xai', 'mistral', 'groq', 'deepseek', 'iamhc',
];
```

Adding a new provider requires adding to this hardcoded list.  
**Fix**: Providers should declare their own priority; the list should be derived from provider specs.

**Severity**: 🟡 MEDIUM

### 6. Domain-to-Tier Mapping (Hardcoded)

`packages/ai/src/model.ts` (line 225):

```typescript
export const TIER_TO_DOMAIN: Record<string, ModelDomain> = {
  fast: 'summary',
  mid: 'technical',
  strong: 'fundamental',
};
```

Adding a new tier requires modifying this map. Should be derived from provider specs.

**Severity**: 🟠 MEDIUM-LOW

### 7. Duplicated Provider Mapping in `market-data-providers.ts`

`packages/data/src/providers/market-data-providers.ts` — Provider implementations (`biquoteProvider`, `finnhubProvider`, `liveTicksProvider`, `binanceProvider`) are manually defined objects with duplicated boilerplate. Adding a new market data provider requires duplicating ~60 lines of boilerplate.

**Fix**: Factory function or builder pattern for market data providers.

**Severity**: 🟠 MEDIUM-LOW

### 8. Price Adapter Hardcoded Provider Order

`packages/data/src/adapters/price.ts` — The provider attempts array is built inline with hardcoded ordering logic. Adding a new price source requires modifying this function.

**Mitigation**: Partially mitigated by `marketDataProvider` user preference and the `pinned` mechanism in `runWithFailover()`.

**Severity**: 🟠 MEDIUM-LOW

---

**Additional Strengths Found During Deep Review**:
- **Job Registry (PF-04)**: The `JOBS` record in `apps/worker/src/jobs/index.ts` is exemplary OCP — adding a job means adding one entry, no other code changes
- **Tool Category Registration**: Adding a tool to `market.ts`, `analysis.ts`, `journal.ts`, or `system.ts` registers it — no dispatch switch needed
- **Domain Tool Filter**: `DOMAIN_TOOLS` map in `by-domain.ts` is open for extension without modifying the filter function
- **Alert Delivery Channels**: Adding a new delivery channel (email, telegram, web-push) means adding one function in `delivery.ts` — the channel loop stays unchanged

## OCP Score: 7.5/10 → Adjusted to 8.0/10

**Rationale**: The strategic architecture demonstrates excellent OCP design across tools, jobs, providers, and alert specs. The indicator dispatch and alert rule type switches remain the primary OCP violations, but they are isolated to specific modules.
