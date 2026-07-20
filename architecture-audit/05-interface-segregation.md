# 05 — Interface Segregation Principle (ISP) Audit

## Executive Summary

**Score: 7.0/10** — The codebase has many well-designed small interfaces but also several "fat" interfaces that force consumers to depend on methods they don't use. The project generally follows ISP well at the function level but has issues at the context/configuration level.

## Strengths

### 1. Cache Interface (Good ISP)

`packages/data/src/cache/types.ts`:

```typescript
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, opts?: { ttlSeconds?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  fetchWithMeta<T>(key: string, fetcher: () => Promise<T>, opts?: CacheFetchOptions): Promise<{ value: T; meta: CacheEntryMeta }>;
}
```

Small, focused — 5 methods, all related to caching. No unused methods.

**ISP Score**: ✅ Good

### 2. LlmClient Interface (Good ISP)

`packages/ai/src/llm-client.ts`:

```typescript
export interface LlmClient {
  generateText(opts: GenerateTextOpts): Promise<GenerateTextResult>;
  streamText(opts: StreamTextOpts): Promise<StreamTextResult>;
}
```

Minimal — just 2 methods. Test implementations only need to implement 2 methods.

**ISP Score**: ✅ Excellent

### 3. MarketDataProvider Interface (Good ISP)

`packages/data/src/providers/market-data-provider.ts`:

```typescript
export interface MarketDataProvider {
  id: string;
  displayName: string;
  testConnection(apiKeys?: Record<string, string>): Promise<{ ok: boolean; error?: string }>;
  fetchTick(symbol, options?): Promise<Tick>;
  fetchCandles(symbol, tf, count, options?): Promise<Candle[]>;
}
```

Focused on market data operations only — 3 methods + identity.

**ISP Score**: ✅ Good

## Violations

### 1. SharedContext (Fat Interface) 🔴

`packages/ai/src/multi-agent/types.ts`:

```typescript
export interface SharedContext {
  symbol: string;
  threadId: string;
  userId: string;
  snapshot: LiveSnapshot;
  userSettings: UserSettingsRow;
  customInstructions?: string;
  userMessage: UIMessage;
  history: UIMessage[];
  signal: AbortSignal | null;
  env: MultiAgentEnv;
  prefetchedData?: string;
}
```

**11 properties** mixing concerns:
- Identity (`symbol`, `threadId`, `userId`)
- Live data (`snapshot`, `prefetchedData`)
- User config (`userSettings`, `customInstructions`)
- IO concerns (`userMessage`, `history`, `signal`, `env`)

**Problem**: Every agent receives all 11 properties even if it only needs 3-4. The TechnicalAgent doesn't need `customInstructions`. The SentimentAgent doesn't need `prefetchedData`.

**Fix**: Split into:
- `AgentIdentityContext` — symbol, threadId, userId
- `AgentDataContext` — snapshot, prefetchedData
- `AgentIOContext` — userMessage, history, signal, env
- `AgentConfigContext` — userSettings, customInstructions

Then compose: `TechnicalAgentContext = AgentIdentityContext & AgentDataContext & AgentIOContext`

**Severity**: 🔴 CRITICAL

### 2. ToolContext (Fat Interface) ⚠️

`packages/ai/src/tool-context.ts`:

```typescript
export interface ToolContext {
  threadId: string;
  userId: string;
  latestUserMessageText?: string;
  env: ToolEnv;
  signal: AbortSignal | null;
  budget: { spent: number; max: number };
  userSettings: UserSettingsRow;
  toolTelemetryBuffer?: BatchedToolTelemetry[];
}
```

**8 properties** — most tools need only 3-4 of them. A read-only tool like `get_price` doesn't need `budget` or `toolTelemetryBuffer`. A read tool doesn't need `latestUserMessageText`.

**Fix**: Split into:
- `ToolIdentityContext` — threadId, userId
- `ToolEnvContext` — env, signal
- `ToolBudgetContext` — budget
- `ToolTelemetryContext` — toolTelemetryBuffer

**Severity**: 🟡 HIGH

### 3. RunChatArgs (Mixed Concerns) ⚠️

`packages/ai/src/types.ts`:

```typescript
export interface RunChatArgs {
  threadId: string;
  userId: string;
  userMessage: UIMessage;
  env: ServerEnv;
  modelOverride?: string | null;
  customInstructions?: string;
  signal?: AbortSignal | null;
}
```

7 properties. While not as large as SharedContext, `modelOverride` and `customInstructions` are optional concerns that many callers won't use.

**Severity**: 🟠 MEDIUM-LOW

### 4. DomainRoutingStrategy (Unused Method) 🔵

`packages/ai/src/model.ts`:

```typescript
export interface DomainRoutingStrategy {
  description: string;
  resolve: (ctx: DomainRoutingContext) => ChatModelResolution;
}
```

`embedding` strategy's `resolve` throws an error — it's not actually callable. The `description` field is only used for debugging. This is a minor ISP concern.

**Fix**: Remove `embedding` from the strategy map; handle embedding resolution separately (already done via `resolveEmbeddingModel()`).

**Severity**: 🔵 LOW

### 5. MultiAgentEnv (Deep Type Pick) ⚠️

`packages/ai/src/multi-agent/types.ts`:

```typescript
export type MultiAgentEnv = Pick<
  ServerEnv,
  | 'AI_GATEWAY_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'GOOGLE_VERTEX_PROJECT'
  | 'GOOGLE_VERTEX_LOCATION'
  | 'GOOGLE_APPLICATION_CREDENTIALS_JSON'
  | 'GOOGLE_APPLICATION_CREDENTIALS'
  | 'AI_DEFAULT_MODEL'
  | 'AI_EMBEDDING_MODEL'
  | 'MAX_DAILY_USD'
  | 'MAX_TOOL_ITERATIONS'
  | 'LOG_PROMPTS'
> & { MULTI_AGENT_CONCURRENCY?: number };
```

While this is a Pick rather than an interface, it violates ISP conceptually — the multi-agent system depends on 11 env vars even though individual agents use only 3-4 each.

**Severity**: 🟠 MEDIUM-LOW

### 6. ToolPlugin (Inconsistent Usage) 🔵

`packages/ai/src/tools/registry.ts`:

```typescript
export interface ToolPlugin {
  name: string;
  tool: Tool;
  description: string;
  allowedPlans?: string[] | undefined;
}
```

`allowedPlans` is optional — most tools don't use it. Consider splitting into `ToolPlugin` (base) and `GatedToolPlugin extends ToolPlugin`.

**Severity**: 🔵 LOW

### 7. DbThread / DbMessage Types (Property Overlap) 🔵

`packages/ai/src/persistence.ts` defines `DbThread` and `DbMessage` with significant property overlap but no shared base. While not an ISP violation per se, a shared `DbEntity` interface would reduce duplication.

**Severity**: 🔵 LOW

---

## Interface Inventory

| Interface | Methods/Properties | ISP Rating |
|-----------|-------------------|------------|
| `Cache` | 5 | ✅ Good |
| `LlmClient` | 2 | ✅ Excellent |
| `MarketDataProvider` | 3 + identity | ✅ Good |
| `NoiseState` | 5 | ✅ Good |
| `Logger` | 4 | ✅ Good |
| `AlertSpec` | 2 | ✅ Excellent |
| `ThreadStateHandler` | 2 | ✅ Excellent |
| `ToolPlugin` | 4 | ✅ Good |
| `JobRegistration` | 4 | ✅ Good |
| `DomainRoutingStrategy` | 2 | ⚠️ One strategy throws |
| `ToolContext` | 8 | 🔴 Too large |
| `SharedContext` | 11 | 🔴 Too large |
| `MultiAgentEnv` | 11 | ⚠️ Too broad |

---

**Additional Findings During Deep Review**:
- **`JobRegistration`** (4 properties): Well-segmented — name, description, run, schedule. No bloat
- **`BotCommand`** (4 properties): Clean — name, aliases, description, handler
- **`JobContext` → `JobCoreContext` + `JobCancellableContext`** (PF-09): Excellent ISP split — jobs that don't need signals get the base context
- **`NoiseState`** (5 methods): All relevant, no unused methods
- **`LlmClient`** (2 methods): Minimal, testable

## ISP Score: 7.5/10 (Adjusted up for PF-09 JobContext split)

**Rationale**: Most interfaces are well-designed and small. The major violations are `SharedContext` (11 properties) and `ToolContext` (8 properties) — both force consumers to depend on properties they don't use. These are structural issues that affect maintainability as the number of agents and tools grows.
