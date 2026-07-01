# 01 — System Architecture

> **New to the project?** Start with [AGENTS.md](./AGENTS.md) for a quick overview.
> Deep dives: [02-codebase.md](./02-codebase.md), [03-ai-agent.md](./03-ai-agent.md), [04-data-layer.md](./04-data-layer.md), [07-worker.md](./07-worker.md).

## Deployment modes

HamaFX-Ai supports three deployment targets with the same source code:

| Mode | Database | Scheduler | Setup |
|------|----------|-----------|-------|
| **Local native** | PGlite (embedded Postgres) | node-cron (embedded) | `pnpm dev:local` |
| **Local Docker** | Postgres 16 + pgvector | node-cron (embedded) | `docker compose -f docker-compose.prod.yml up -d` |
| **Production** | Supabase Postgres | systemd timers (GCE VM) | Vercel + GCE |

This document describes the production cloud architecture. See [08-deployment.md](./08-deployment.md) for details.

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
        RH["Route Handlers<br/>/api/chat<br/>/api/market/*<br/>/api/news/*<br/>/api/calendar/*<br/>/api/cron/* (poked by VM)"]
        MW["Middleware<br/>NextAuth Session"]
        ISR["Static + RSC pages"]
    end

    subgraph VM["GCE — hamafx-cron (e2-medium, us-central1-a)"]
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

    MW --- RH
    MW --- ISR

    RH --> GW
    RH --> SB
    RH --> BQ
    RH --> FH
    RH --> AV
    RH --> MX

    SR --> BQ
    Agg --> SB
    Heavy --> SB
    Heavy --> GW
    Heavy --> FRED
    Heavy --> MX
    Light -->|HTTP| RH
    Updater -->|git pull + build| Heavy
    Updater -->|git pull + build| SR
    Backup --> SB
    Backup --> GCS
    SR --> HC
    Heavy --> HC
    Light --> HC
    SR --> Sentry
    Heavy --> Sentry
```

## Why the worker now (Phase 8)

The original "single Vercel deploy" rule held until two needs forced our hand:

| Need                                | Why Vercel-only stopped working                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Sub-second live prices              | Polling REST every 1–2 s wasted provider quota and still produced visibly stale candles for live trading. |
| Heavy jobs (RAG backfill, weekly review) | Vercel Hobby has a 60 s function ceiling. An embedding backfill that touches 200 articles needs 90 s+. |
| Persistent BiQuote SignalR feed     | A serverless function can't hold a multi-hour WebSocket.                                                |
| Reliable cron at sub-5-min cadence  | GitHub Actions cron has a 5-minute floor and degrades on shared-runner load.                            |

Phase 8 picked the smallest possible escape hatch: **one `e2-medium` VM in `us-central1-a` running a single Node service plus systemd timers.** Vercel still hosts the chat surface, the read APIs, and the `/api/cron/*` light handlers — the VM just trades persistent connections and longer-running jobs for what Vercel can't do on Hobby.

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
    W->>W: validate NextAuth session
    W->>S: load thread (scoped by userId)
    W->>G: streamText() with tools
    G-->>W: tool-call: getCandles(XAUUSD, 1H)
    W->>T: getCandles → BiQuote (cached via Next Data Cache)
    T-->>W: candles
    W-->>G: tool-result
    G-->>W: SSE stream tokens
    W-->>U: stream + tool UI parts
    W->>S: persist messages (with userId)
```

### B. Live price tile

The tile reads from the live ticks the worker writes into Postgres, with a REST fallback when the worker hasn't published in N seconds.

```mermaid
sequenceDiagram
    participant U as User
    participant W as Web (Vercel)
    participant DB as Supabase (live_ticks)
    participant BQ as BiQuote REST

    loop every 1.5s
      U->>W: GET /api/market/price?symbols=XAUUSD,EURUSD,GBPUSD
      W->>DB: SELECT mid, ts FROM live_ticks WHERE symbol = ANY(...)
      alt ts within freshness window
        DB-->>W: ticks
      else stale
        W->>BQ: GET /quote?symbols=...
        BQ-->>W: ticks
        W-->>DB: UPSERT (best-effort)
      end
      W-->>U: ticks JSON + asOf
    end
```

The worker's BiQuote SignalR consumer keeps `live_ticks` updated continuously (sub-second), so the REST fallback is a degraded-mode path — not the primary one.

### C. News / calendar ingestion (VM-driven)

```mermaid
sequenceDiagram
    participant T as systemd timer (VM)
    participant Light as hamafx-light-news.service (curl)
    participant W as /api/cron/news (Vercel)
    participant N as News APIs
    participant S as Supabase
    participant Heavy as hamafx-job-embedding-backfill (VM)
    participant E as Embedder

    T->>Light: every 5 min
    Light->>W: GET /api/cron/news (Authorization: Bearer CRON_SECRET)
    W->>N: poll Marketaux + Finnhub
    N-->>W: articles
    W->>W: filter for XAU/EUR/GBP/USD
    W->>S: upsert articles (no embedding here — fast 2xx)
    Light->>HC[healthchecks.io ping]: success
    note over Heavy,E: Decoupled — runs every 6h
    Heavy->>S: SELECT articles WHERE embedding IS NULL
    Heavy->>E: embed (text-embedding-3-small)
    Heavy->>S: UPDATE news_embeddings
```

The split keeps the Vercel route under the 60 s ceiling (it just upserts text rows) and lets the heavier embedding pass run on the VM where it can take its time.

The agent later does RAG against this table — see `07-ai-agent.md`.

## Layered architecture

```mermaid
flowchart TB
    subgraph L1["L1 — Presentation (apps/web/src/app, components)"]
        P1[Pages] --- P2[Feature components] --- P3[shadcn/ui primitives]
    end
    subgraph L2["L2 — Application (packages/ai, packages/indicators, apps/worker/src/jobs)"]
        A1[Agent + tools] --- A2[Indicator engine] --- A3[Analysis composers] --- A4[Heavy job runners]
    end
    subgraph L3["L3 — Data access (packages/data, apps/worker/src/persistence)"]
        D1[Provider adapters] --- D2[Cache layer] --- D3[Normalised DTOs] --- D4[live_ticks + candles_1m writers]
    end
    subgraph L4["L4 — Infrastructure"]
        I1[Supabase Postgres] --- I3[AI Gateway] --- I4[External APIs] --- I5[GCS] --- I6[healthchecks.io]
    end

    L1 --> L2
    L2 --> L3
    L3 --> L4
```

**Strict rule**: a layer may import from layers **below** it, never above. UI never calls a provider directly — it goes via `packages/data` or a route handler. The worker imports the same packages/* as the web app — single source of truth for schemas, providers, DB queries.

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

## Observability

- **Vercel logs** for the web app + every `/api/cron/*` call. JSON-structured (`console.log({ level, msg, ...meta })`).
- **journald** on the VM, queryable via `sudo journalctl -u hamafx-<unit>.service`. Same JSON shape.
- **healthchecks.io** pings: SignalR consumer heartbeat (30 s), every heavy job (start/success/fail), every light cron (`ExecStartPost` on success). UUIDs are listed in `infra/cron-vm/RECOVERY.md`.
- **Sentry** (server-only) on both `apps/web` and `apps/worker`. `SENTRY_DSN` shared between server and client SDK; the route handler exception handler and the worker's `captureException` both flush within 2 s.
- **Cost tracking**: a tiny `chat_telemetry` table records (model, input tokens, output tokens, tool calls, ms, est cost, kind) per turn. `/settings/usage` shows last 30 days.

If something breaks: `journalctl` on the VM, Vercel logs for routes, healthchecks.io dashboard for "what stopped firing recently", Sentry for the stack trace.

## Disaster recovery

`infra/cron-vm/RECOVERY.md` is the playbook. Five scenarios covered with concrete commands:

1. Restore the database from yesterday's backup.
2. Restore journal-only from the JSON export.
3. Worker won't start (rollback to a known-good SHA).
4. Provision a fresh VM from scratch.
5. Revoke a leaked service-account key.

A weekly `hamafx-verify-restore.timer` boots a throwaway Postgres in Docker, restores the latest dump, runs row-count assertions, and writes `gs://${GCS_BUCKET}/verify/last-success.txt`. If that file goes stale, healthchecks.io pages.
