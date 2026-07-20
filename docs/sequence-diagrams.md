# Sequence Diagrams

> **P2-6** — Architecture audit fix. Mermaid sequence diagrams for the three most complex flows in the system.

---

## 1. Full Chat Turn Lifecycle

```mermaid
sequenceDiagram
    actor User
    participant Browser as Browser (PWA)
    participant Route as /api/chat
    participant Agent as runChat() (agent.ts)
    participant Router as routeTurn()
    participant Model as resolveModelForTurn()
    participant LLM as AI Provider
    participant DB as Postgres

    User->>Browser: Types message
    Browser->>Route: POST /api/chat (SSE)
    Route->>Agent: runChat(args)

    Note over Agent: 1. Budget guardrail
    Agent->>DB: tryReserveBudget(userId)
    DB-->>Agent: reservation { spent, max }

    Note over Agent: 2. Persist user message
    Agent->>DB: appendUserMessage(threadId, msg)

    Note over Agent: 3. Load history + snapshot (parallel)
    par History
        Agent->>DB: listMessages(userId, threadId)
        DB-->>Agent: history[]
    and Snapshot
        Agent->>DB: buildLiveSnapshot()
        DB-->>Agent: snapshot
    end

    Note over Agent: 4. Compact + route
    Agent->>Agent: compactThread(history)
    Agent->>Router: routeTurn(userMessage)
    Router-->>Agent: { domain, planRequired }

    Note over Agent: 5. Model resolution (retry loop)
    loop until success or 5 attempts
        Agent->>Model: resolveModelForTurn(ctx)
        Model->>Model: resolveChatModel + circuit check
        Model-->>Agent: { model, modelId, providerId }
    end

    Note over Agent: 6. Plan-then-act (if needed)
    opt planRequired
        Agent->>LLM: runPlanner (cheap model)
        LLM-->>Agent: plan { steps, expectedTools }
    end

    Note over Agent: 7. Stream with tools
    Agent->>LLM: streamText(model, system, messages, tools)
    LLM-->>Agent: SSE stream (tool calls + text)
    Agent-->>Browser: toUIMessageStreamResponse()

    Note over Agent: 8. On finish: persist + telemetry
    Agent->>DB: appendAssistantMessage()
    Agent->>DB: recordTelemetry()
    Agent->>DB: applyBudgetDelta()

    Note over Agent: 9. Auto-title (background)
    Agent-)LLM: runAutoTitleBackground (fire-and-forget)
```

---

## 2. Multi-Agent Orchestration Flow

```mermaid
sequenceDiagram
    participant User
    participant Agent as runChat()
    participant Orchestrator as runMultiAgentChat()
    participant Context as buildSharedContext()
    participant Base as BaseAgent (×4)
    participant LLM as AI Provider
    participant Decision as DecisionAgent

    User->>Agent: "Should I go long on XAUUSD?"
    Agent->>Orchestrator: runMultiAgentChat(args)

    Note over Orchestrator: 1. Mode detection
    Orchestrator->>Orchestrator: autoDetectMode(userMessage)
    Orchestrator-->>Orchestrator: mode = 'technical'

    Note over Orchestrator: 2. Shared context
    Orchestrator->>Context: buildSharedContext()
    Context->>Context: Pre-fetch candles (4h, 1h, 15m)
    Context->>Context: Build live snapshot
    Context-->>Orchestrator: SharedContext

    Note over Orchestrator: 3. Specialist analysis (parallel)
    par Technical Specialist
        Orchestrator->>Base: TechnicalAgent.run(ctx)
        Base->>LLM: generateText(system + history)
        LLM-->>Base: AgentOpinion { bias, confidence, reasoning }
    and Fundamental Specialist
        Orchestrator->>Base: FundamentalAgent.run(ctx)
        Base->>LLM: generateText(system + history)
        LLM-->>Base: AgentOpinion
    and Risk Specialist
        Orchestrator->>Base: RiskAgent.run(ctx)
        Base->>LLM: generateText(system + history)
        LLM-->>Base: AgentOpinion
    and Sentiment Specialist
        Orchestrator->>Base: SentimentAgent.run(ctx)
        Base->>LLM: generateText(system + history)
        LLM-->>Base: AgentOpinion
    end

    Note over Orchestrator: 4. Committee deliberation
    Orchestrator->>Decision: DecisionAgent.run(ctx, opinions[])
    Decision->>LLM: generateText(opinions + deliberation prompt)
    LLM-->>Decision: FinalAnalysis { recommendation, rationale }
    Decision-->>Orchestrator: MultiAgentResult

    Orchestrator-->>Agent: { finalAnalysis, opinions[] }
```

---

## 3. Market Data Failover Flow

```mermaid
sequenceDiagram
    participant Client as Browser/API
    participant Adapter as price.ts
    participant Cache as SWR Cache
    participant Registry as marketDataProviders
    participant LiveTicks as live-ticks (Postgres)
    participant BiQuote as BiQuote (REST)
    participant Finnhub as Finnhub (REST)
    participant Binance as Binance (REST)

    Client->>Adapter: getPriceWithMeta("XAUUSD")

    Note over Adapter: 1. Check cache
    Adapter->>Cache: fetchWithMeta(key)
    alt Cache hit (fresh)
        Cache-->>Adapter: { value, stale: false }
        Adapter-->>Client: PriceResult
    else Cache miss or stale
        Note over Adapter: 2. Build provider list from registry
        Adapter->>Registry: marketDataProviders.list()
        Registry-->>Adapter: [live-ticks (pinned), biquote, finnhub]

        Note over Adapter: 3. Failover loop (pinned first)
        Adapter->>LiveTicks: fetchPrice("XAUUSD")
        alt Success (worker running)
            LiveTicks-->>Adapter: { price: 2650.32, provider: "live-ticks", ageMs: 230 }
            Adapter->>Cache: set(key, value)
            Adapter-->>Client: PriceResult
        else Failed (worker down)
            LiveTicks--xAdapter: Error

            Note over Adapter: Fall to next provider
            Adapter->>BiQuote: fetchPrice("XAUUSD")
            alt Success
                BiQuote-->>Adapter: { price: 2650.29, provider: "biquote", ageMs: null }
                Adapter->>Cache: set(key, value)
                Adapter-->>Client: PriceResult { stale: false }
            else Failed
                BiQuote--xAdapter: Error

                Note over Adapter: Last resort
                Adapter->>Finnhub: fetchPrice("XAUUSD")
                alt Success
                    Finnhub-->>Adapter: { price: 2650.35, provider: "finnhub", ageMs: null }
                    Adapter->>Cache: set(key, value)
                    Adapter-->>Client: PriceResult { stale: false }
                else All failed
                    Finnhub--xAdapter: Error

                    Note over Adapter: SWR fallback — serve stale
                    Cache-->>Adapter: stale value (if within SWR window)
                    Adapter-->>Client: PriceResult { stale: true }
                end
            end
        end
    end
```

### Provider Registry OCP Compliance

Adding a new market data provider (e.g., Polygon.io) requires:

1. Implement `MarketDataProvider` interface
2. Register: `marketDataProviders.register(polygonProvider)`
3. No changes to `price.ts` adapter code

```typescript
// Example: adding Polygon.io as a provider
const polygonProvider: MarketDataProvider = {
  name: 'polygon',
  label: 'Polygon.io (REST)',
  pinned: false,
  async fetchPrice(symbol, opts) {
    // ... fetch from Polygon API
    return { price, provider: 'polygon', ageMs: null };
  },
};
marketDataProviders.register(polygonProvider);
```

---

*Generated as part of the comprehensive SOLID architecture audit of HamaFX-Ai (P2-6).*
