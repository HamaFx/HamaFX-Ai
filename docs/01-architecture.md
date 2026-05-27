# 01 — System Architecture

## High-level view

HamaFX-Ai runs on **two co-operating deployments**: Vercel hosts the web app + chat + read APIs + light cron pokers, and a single GCE VM (`hamafx-cron`, e2-medium in `us-central1-a`) runs the always-on BiQuote SignalR consumer + heavy scheduled jobs. Phase 8 lifted the previous "single deployable unit" rule once we needed sub-second prices and heavy jobs that don't fit in Vercel Hobby's 60s function ceiling.

```mermaid
flowchart LR
    subgraph Client["📱 Client (PWA)"]
        UI["Next.js UI<br/>shadcn + Tailwind"]
        Chart["lightweight-charts"]
        Chat["AI Chat (useChat)"]
    end

    subgraph Vercel["▲ Vercel — apps/web"]
        RH["Route Handlers<br/>/api/chat<br/>/api/market/*<br/>/api/news/*<br/>/api/calendar/*"]
        MW["Middleware<br/>password gate"]
        ISR["Static + RSC pages"]
    end

    subgraph VM["GCE — hamafx-cron (e2-medium)"]
        SR["SignalR consumer<br/>(always-on Node)"]
        Agg["1m candle aggregator"]
        Heavy["Heavy job runner<br/>(embedding-backfill, briefings,<br/>snapshots, cot, fred-actuals,<br/>weekly-review)"]
        Light["systemd timers<br/>poke /api/cron/* on Vercel"]
        Updater["update.sh<br/>(self-pull every 5 min)"]
        Backup["nightly pg_dump → GCS"]
    end

    subgraph Managed["☁ Managed services"]
        SB[("Supabase Postgres<br/>+ pgvector<br/>(used as DB only)")]
        GCS[("GCS bucket<br/>(backups)")]
        HC[("healthchecks.io")]
        Sentry[("Sentry")]
        GW["Vercel AI Gateway<br/>(OpenAI · Anthropic · Google)"]
    end

    subgraph Providers["🌐 Data providers"]
        BQ["BiQuote<br/>FX + XAU REST + SignalR"]
        FH["Finnhub<br/>news + fallback FX"]
        AV["Alpha Vantage<br/>backup historical"]
        MX["Marketaux<br/>news + sentiment"]
        TE["Trading Economics<br/>macro calendar"]
        FRED["FRED<br/>macro series"]
    end

    UI --> Chat
    UI --> Chart
    Chat -->|SSE| RH
    Chart -->|REST poll 1–2s| RH
    UI -.SWR.-> RH

    MW --- RH
    MW --- ISR

    RH --> GW
    RH --> SB
    RH --> UP
    RH --> TD
    RH --> FH
    RH --> AV

    Cron --> TD
    Cron --> MX
    Cron --> FH
    Cron --> TE
    Cron --> FRED
    Cron --> SB
    Cron --> UP
```

## Why no worker at MVP?

We considered a separate Hono service on Fly.io for persistent upstream WebSockets. For a **single-user app**, the math doesn't justify it:

| Need                          | Vercel-only?           | Trade-off accepted                                                        |
| ----------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| Live prices                   | ✅ via 1–2 s polling   | Slightly worse latency, but provider quotas easily cover it for one user. |
| Cron for news / calendar      | ✅ Vercel Cron         | Limited to Vercel's cron cadence (≥ 1 min) — fine for our 2–5 min jobs.   |
| Alert evaluator               | ✅ Vercel Cron / 1 min | Slightly less responsive than a 30 s loop, fine.                          |
| Long-lived in-memory caches   | ❌                     | Use Upstash Redis instead (faster than free-tier Postgres).               |
| Persistent upstream WebSocket | ❌                     | We don't need it for one user; revisit if/when we do.                     |

If we ever do need a worker, the migration path is clean: drop a Hono service into `apps/worker/`, move `/api/cron/*` into it, and that's it.

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
    W->>S: load thread
    W->>G: streamText() with tools
    G-->>W: tool-call: getCandles(XAUUSD, 1H)
    W->>T: getCandles → Twelve Data (cached in Upstash)
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
    participant TD as Twelve Data REST
    participant UP as Upstash

    loop every 1.5s
      U->>W: GET /api/market/price?symbols=XAUUSD,EURUSD,GBPUSD
      W->>UP: GET prices:*
      alt cache hit
        UP-->>W: ticks
      else miss
        W->>TD: GET /price (multi)
        TD-->>W: ticks
        W->>UP: SET ticks ttl=3s
      end
      W-->>U: ticks JSON
    end
```

### C. News / calendar ingestion (Vercel Cron)

```mermaid
sequenceDiagram
    participant C as Vercel Cron
    participant W as /api/cron/news
    participant N as News APIs
    participant E as Embedder
    participant S as Supabase

    C->>W: trigger (every 5 min)
    W->>N: poll Marketaux + Finnhub
    N-->>W: articles
    W->>W: filter for XAU/EUR/GBP/USD
    W->>E: embed (text-embedding-3-small)
    W->>S: upsert articles + vectors (pgvector)
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
        I1[Supabase Postgres] --- I2[Upstash] --- I3[AI Gateway] --- I4[External APIs]
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
- `Candle`, `Tick`
- `IndicatorRequest`, `IndicatorResult`
- `NewsArticle`, `EconomicEvent`
- `ChatMessage`, `ToolName`, `ToolInput<T>`, `ToolOutput<T>`
- `AlertRule`, `JournalEntry`

The same schemas validate inputs at:

1. UI form boundaries
2. API route handlers
3. AI tool definitions
4. DB write paths

## Failure & resilience

- **Provider failover**: each data type has primary + fallback adapter; on error or stale cache, we transparently fall back. See `06-data-sources.md`.
- **Stale-while-error**: if everything fails, we serve the last cached value and flag the freshness in the UI.
- **Graceful degradation**: if charts API is down, chat still works with last cached snapshot and a warning banner.
- **No silent staleness**: every tool result includes `fetchedAt` and `source`; the UI surfaces "data is N seconds old".

## Observability (light)

Personal mode — we don't need a full observability stack:

- Vercel built-in logs are the primary sink.
- Server code uses simple structured `console.log({ level, msg, ...meta })`.
- Cost tracking: a tiny `chat_telemetry` table records (model, input tokens, output tokens, tool calls, ms) per turn. A `/settings/usage` page shows last 30 days.

## Future: optional worker

If at v2 we want:

- A persistent upstream WebSocket to Twelve Data (sub-second updates)
- Heavy backtests / long-running computations
- Telegram / native push fan-out

…we'll add `apps/worker/` (Hono on Fly.io) and move the cron routes there. Until then, **single-deploy on Vercel**.
