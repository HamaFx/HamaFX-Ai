# 01 — System Architecture

## High-level view

HamaFX-Ai is split into **three deployable units** plus shared packages:

1. **`apps/web`** — Next.js 15 App Router (Vercel). UI + AI chat + light API routes.
2. **`apps/worker`** — Hono (Node) service (Fly.io or Railway). WebSocket fan-out, cron ingestion, heavy compute.
3. **External managed services** — Supabase (Postgres + Auth + Realtime + Storage), Upstash Redis, Vercel AI Gateway, data providers.

```mermaid
flowchart LR
    subgraph Client["📱 Client (PWA)"]
        UI["Next.js UI<br/>shadcn + Tailwind"]
        Chart["lightweight-charts<br/>+ TV Widget"]
        Chat["AI Chat (useChat)"]
    end

    subgraph Vercel["▲ Vercel — apps/web"]
        RH["Route Handlers<br/>/api/chat<br/>/api/market/*<br/>/api/news/*"]
        Edge["Edge Middleware<br/>auth, rate limit, geo"]
        ISR["Static + ISR pages"]
    end

    subgraph Worker["🛠 apps/worker (Fly.io / Railway)"]
        WS["WebSocket gateway<br/>Hono + ws"]
        Cron["Cron jobs<br/>news, calendar, snapshots"]
        Compute["Heavy compute<br/>indicators, backtests"]
    end

    subgraph Managed["☁ Managed services"]
        SB[("Supabase<br/>Postgres + pgvector<br/>Auth · Storage")]
        UP[("Upstash Redis<br/>cache + ratelimit + queue")]
        GW["Vercel AI Gateway<br/>(OpenAI · Anthropic · Google)"]
    end

    subgraph Providers["🌐 Data providers"]
        TD["Twelve Data<br/>FX + XAU REST/WS"]
        FH["Finnhub<br/>news, calendar"]
        AV["Alpha Vantage<br/>fallback FX"]
        MX["Marketaux / finlight<br/>news + sentiment"]
        TE["Trading Economics<br/>macro calendar"]
        FRED["FRED<br/>macro series"]
    end

    UI --> Chat
    UI --> Chart
    Chat -->|SSE| RH
    Chart -->|REST| RH
    Chart -->|WS| WS
    UI -.SWR.-> RH

    RH --> GW
    RH --> SB
    RH --> UP
    RH --> WS

    Cron --> TD
    Cron --> FH
    Cron --> MX
    Cron --> TE
    Cron --> FRED
    Cron --> SB
    Cron --> UP

    WS --> TD
    WS --> UP

    Compute --> SB
```

## Why two deployable units?

Vercel is excellent for the web app and short-lived AI streaming, but has constraints we need to escape for trading data:

| Need                                        | Vercel? | Worker? |
| ------------------------------------------- | ------- | ------- |
| Persistent WebSocket to a price provider    | ❌       | ✅       |
| Cron > a few minutes runtime                | ⚠️       | ✅       |
| Long-lived in-memory caches (price tape)    | ❌       | ✅       |
| Streaming SSE to browser (chat)             | ✅       | ✅       |
| ISR / static pages, edge auth               | ✅       | ❌       |
| Tight Next.js DX, zero-config previews      | ✅       | ❌       |

So we keep **stateless / request-scoped** logic on Vercel and put **stateful / connection-holding** logic on the worker.

## Request flows (summary — full diagrams in `13-data-flow.md`)

### A. Chat turn (most common)

```mermaid
sequenceDiagram
    participant U as User
    participant W as Web (Vercel)
    participant G as AI Gateway
    participant T as Tools (price/news/etc)
    participant S as Supabase

    U->>W: POST /api/chat (messages)
    W->>S: load thread + user prefs
    W->>G: streamText() with tools
    G-->>W: tool-call: getCandles(XAUUSD, 1H)
    W->>T: getCandles → Twelve Data (cached)
    T-->>W: candles
    W-->>G: tool-result
    G-->>W: SSE stream tokens
    W-->>U: stream + tool UI parts
    W->>S: persist messages
```

### B. Live price tile

```mermaid
sequenceDiagram
    participant U as User
    participant W as Web
    participant K as Worker (WS gateway)
    participant TD as Twelve Data WS

    U->>W: open page
    W->>K: WS connect /v1/prices?symbols=XAUUSD,EURUSD,GBPUSD
    K->>TD: WS subscribe (single shared upstream)
    TD-->>K: tick
    K-->>U: ticks (multiplexed)
```

A single upstream WebSocket is shared across all connected users — drastically reducing provider quota usage.

### C. News / calendar ingestion (cron)

```mermaid
sequenceDiagram
    participant C as Cron (worker)
    participant N as News APIs
    participant E as Embedder
    participant S as Supabase

    C->>N: poll every 2-5 min
    N-->>C: articles
    C->>C: filter for XAU/EUR/GBP/USD
    C->>E: embed (text-embedding-3-small)
    C->>S: upsert articles + vectors (pgvector)
```

The agent later does RAG against this table — see `07-ai-agent.md`.

## Layered architecture

```mermaid
flowchart TB
    subgraph L1["L1 — Presentation (apps/web/src/app, components)"]
        P1[Pages] --- P2[Feature components] --- P3[shadcn/ui primitives]
    end
    subgraph L2["L2 — Application (packages/ai, packages/indicators)"]
        A1[Agent + tools] --- A2[Indicator engine] --- A3[Analysis composers]
    end
    subgraph L3["L3 — Data access (packages/data)"]
        D1[Provider adapters] --- D2[Cache layer] --- D3[Normalised DTOs]
    end
    subgraph L4["L4 — Infrastructure"]
        I1[Supabase] --- I2[Upstash] --- I3[AI Gateway] --- I4[External APIs]
    end

    L1 --> L2
    L2 --> L3
    L3 --> L4
```

**Strict rule**: a layer may import from layers **below** it, never above. UI never calls a provider directly — it goes via `packages/data` or a route handler.

## Shared types boundary

`packages/shared` exports zod schemas + inferred TS types for:

- `Symbol` (`"XAUUSD" | "EURUSD" | "GBPUSD"`)
- `Timeframe` (`"1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w"`)
- `Candle`, `Tick`, `OrderBookLevel`
- `IndicatorRequest`, `IndicatorResult`
- `NewsArticle`, `EconomicEvent`
- `ChatMessage`, `ToolName`, `ToolInput<T>`, `ToolOutput<T>`

The same schemas validate inputs at:

1. UI form boundaries
2. API route handlers
3. AI tool definitions
4. DB write paths

This is what makes the system safe for AI agents to refactor.

## Failure & resilience

- **Provider failover**: each data type has primary + fallback adapter; on error or stale cache, we transparently fall back. See `06-data-sources.md`.
- **Circuit breaker**: per-provider error rate triggers temporary disable (Upstash counter).
- **Idempotent writes**: chat messages, alerts, journal entries use client-generated UUIDs.
- **Graceful degradation**: if charts API is down, chat still works with last cached snapshot and a warning banner.
- **No silent staleness**: every tool result includes `fetchedAt` and `source`; the chat UI surfaces "data is N seconds old".

## Observability (sketch — full in `12-security-and-config.md`)

- Structured logs via `pino` on worker, `console` + Vercel logs on web.
- Tracing: OpenTelemetry exporter to a single backend (Axiom or Better Stack — TBD).
- Metrics: latency histograms for `chat.firstToken`, `tool.<name>.duration`, `provider.<name>.error`.
- AI-specific: prompt version, model id, tool-call count, token usage per turn — persisted to a `chat_telemetry` table.
