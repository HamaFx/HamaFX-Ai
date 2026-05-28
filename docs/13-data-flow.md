# 13 — Data Flow

> Sequence diagrams for every flow that crosses two or more layers. If you're adding a new flow, draw the sequence first, then implement.
>
> Personal-mode reminders (post Phase 8):
>
> - Two deployments: Vercel (`apps/web`) + one GCE VM (`apps/worker`).
> - Cache is the **Next.js Data Cache** (`unstable_cache` + fetch-cache) behind a `Cache` interface in `packages/data/src/cache`.
> - Live prices come from the worker's BiQuote SignalR consumer writing into `live_ticks` (Postgres). REST is a degraded-mode fallback.
> - Heavy scheduled work runs in-process inside `hamafx-worker.service`. Light Vercel-poke crons fire `curl` against `/api/cron/*` from systemd timers on the VM.

## 1. Chat turn (full lifecycle)

```mermaid
sequenceDiagram
    autonumber
    participant U as User (mobile)
    participant W as apps/web (Vercel)
    participant DB as Supabase
    participant C as Next.js Data Cache
    participant A as Agent (AI SDK)
    participant G as AI Gateway
    participant T as Tool runtime
    participant DA as packages/data
    participant P as External providers

    U->>W: POST /api/chat { threadId, message }
    W->>W: middleware: cookie auth + token-cap check
    W->>DB: load thread + last 30 messages
    W->>DB: read live_ticks for context snapshot
    W->>A: streamText({ system, messages, tools })
    A->>G: chat completion (stream, tools)
    G-->>A: tool-call get_candles(XAUUSD,1H,200)
    A->>T: invoke tool
    T->>C: unstable_cache lookup (candles:XAUUSD:1H)
    alt cache hit
      C-->>T: cached candles
    else cache miss
      T->>DA: candlesAdapter.get(...)
      DA->>P: BiQuote REST (failover: Finnhub, Alpha Vantage)
      P-->>DA: raw
      DA-->>T: normalised Candle[]
      T->>C: persist to data cache (TTL per type)
    end
    T-->>A: tool-result
    A->>G: continue with tool-result
    G-->>A: stream tokens + maybe more tool calls
    A-->>W: SSE parts (text + tool parts)
    W-->>U: stream parts to useChat
    A->>DB: persist final message + tool calls + telemetry
```

## 2. Live price tile (worker-fed, REST fallback)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant W as apps/web
    participant DB as Supabase (live_ticks)
    participant Worker as hamafx-worker (VM)
    participant BQ as BiQuote (REST + SignalR)

    rect rgba(0, 100, 200, 0.05)
      note over Worker,BQ: Always-on, written continuously
      Worker->>BQ: SignalR subscribe XAUUSD,EURUSD,GBPUSD
      loop every tick
        BQ-->>Worker: { symbol, bid, ask, ts }
        Worker->>DB: UPSERT live_ticks (per symbol)
      end
    end

    loop every 1.5s while page open
      U->>W: GET /api/market/price?symbols=XAUUSD,EURUSD,GBPUSD
      W->>DB: SELECT mid, ts FROM live_ticks WHERE symbol = ANY(...)
      alt fresh (ts within freshness window)
        DB-->>W: ticks
      else stale (worker behind / down)
        W->>BQ: GET /quote?symbols=...
        BQ-->>W: ticks
        W-->>DB: best-effort UPSERT
      end
      W-->>U: ticks JSON + asOf
    end
```

When the worker is healthy, `/api/market/price` is a single Postgres lookup. The REST fallback exists so the UI keeps working through worker outages.

## 3. News ingestion pipeline (VM-driven)

```mermaid
sequenceDiagram
    autonumber
    participant T as systemd timer (VM)
    participant Light as hamafx-light-news.service (curl)
    participant W as /api/cron/news (Vercel)
    participant MX as Marketaux
    participant FH as Finnhub
    participant DB as Supabase
    participant HC as healthchecks.io

    T->>Light: every 5 min
    Light->>W: GET /api/cron/news (Authorization: Bearer CRON_SECRET)
    W->>W: verify secret (timing-safe)
    W->>MX: GET news?since=last_fetched
    MX-->>W: articles[]
    W->>FH: GET company-news (fallback)
    FH-->>W: articles[]
    W->>W: filter by symbol/currency/keyword
    W->>W: dedupe by url-hash
    W->>DB: upsert news_articles (no embeddings here — fast 2xx)
    W-->>Light: 200 { processed: N }
    Light->>HC: ExecStartPost — ping success
```

Embeddings are decoupled — `hamafx-job-embedding-backfill.timer` runs every 6 h on the worker and fills `news_embeddings.embedding` for any rows still NULL. That keeps the Vercel route under the 60 s ceiling and lets the heavier embedding pass take its time on the VM.

```mermaid
sequenceDiagram
    autonumber
    participant T as systemd timer (VM)
    participant Heavy as hamafx-job-embedding-backfill (VM, in-process)
    participant DB as Supabase
    participant E as Embedder (AI Gateway)

    T->>Heavy: every 6 h
    Heavy->>DB: SELECT id, title, summary FROM news_articles WHERE embedding IS NULL LIMIT batch
    par for each batch
      Heavy->>E: embedMany([title + summary])
      E-->>Heavy: vectors
      Heavy->>DB: UPDATE news_embeddings SET embedding = ...
    end
```

## 4. Economic calendar refresh (light cron)

```mermaid
sequenceDiagram
    autonumber
    participant T as systemd timer (VM)
    participant Light as hamafx-light-calendar.service (curl)
    participant W as /api/cron/calendar (Vercel)
    participant TE as Trading Economics
    participant FRED as FRED
    participant DB as Supabase
    participant C as Next.js Data Cache

    T->>Light: every 15 min
    Light->>W: GET /api/cron/calendar (Bearer)
    W->>TE: GET calendar?from=now-1h&to=now+7d
    TE-->>W: events[]
    W->>FRED: GET key macro series (CPI, NFP, ...)
    FRED-->>W: observations
    W->>DB: upsert economic_events
    W->>C: revalidate calendar:next-high-impact tag
```

The `fred-actuals` heavy job (worker, daily 01:30 UTC) backfills `economic_events.actual` once the prints land — light cron writes the schedule, heavy job patches the values.

## 5. Alert evaluation loop (light cron)

```mermaid
sequenceDiagram
    autonumber
    participant T as systemd timer (VM)
    participant Light as hamafx-light-alerts.service (curl)
    participant W as /api/cron/alerts (Vercel)
    participant DB as Supabase
    participant N as Notifier (email/Telegram/web push)
    participant U as User device

    T->>Light: every 5 min
    Light->>W: GET /api/cron/alerts (Bearer)
    W->>DB: SELECT active alerts
    W->>DB: SELECT latest live_ticks
    par evaluate each rule
      W->>W: rule.match(price, indicators)
      alt match
        W->>DB: mark alert fired (set firedAt; idempotent)
        W->>N: send notification(s)
        N-->>U: email / Telegram / push
      end
    end
```

`/api/cron/alerts` marks `firedAt` only after the notifier returns 2xx, so a duplicate fire from a hand-run `curl` during incident response is safe.

## 6. Chart load (cold)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant W as apps/web
    participant C as Next.js Data Cache
    participant DA as packages/data
    participant BQ as BiQuote REST

    U->>W: GET /chart/XAUUSD?tf=1h
    W-->>U: HTML shell (RSC) + skeleton
    U->>W: GET /api/market/candles?symbol=XAUUSD&tf=1h&limit=300
    W->>C: unstable_cache lookup (candles:XAUUSD:1h)
    alt hit
      C-->>W: candles
    else miss
      W->>DA: candlesAdapter.get(...)
      DA->>BQ: GET /ohlc?symbol=XAUUSD&interval=1h
      BQ-->>DA: bars
      DA-->>W: normalised
      W->>C: persist (TTL 30s)
    end
    W-->>U: JSON
    U->>U: lightweight-charts render

    Note over U,W: live last bar updated via /api/market/price polling (live_ticks-fed)
```

For 1m candles specifically, the worker's aggregator emits closes into `candles_1m` so the chart never has to roundtrip to BiQuote for the most-recent minute — see `apps/worker/src/aggregator/candle-1m.ts`.

## 7. Setting an alert from chat

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant A as Agent
    participant T as Tool runtime
    participant DB as Supabase
    participant Cron as hamafx-light-alerts (VM)

    U->>A: "Alert me if XAUUSD 1H closes < 2378"
    A->>A: parse intent
    A->>T: set_alert({ symbol: XAUUSD, rule: { type: closeBelow, tf: 1h, level: 2378 } })
    T->>DB: insert alerts row
    DB-->>T: { alertId }
    T-->>A: tool-result
    A-->>U: "Alert set ✓ — I'll notify when 1H closes below 2 378."

    Note over Cron: every 5 minutes
    Cron->>DB: read alerts; evaluate against live_ticks
    Cron-->>U: notification on trigger
```

## 8. RAG retrieval inside `analyze_fundamental`

```mermaid
sequenceDiagram
    autonumber
    participant A as Agent
    participant T as Tool runtime
    participant E as Embedder
    participant DB as Supabase (pgvector)

    A->>T: analyze_fundamental({ symbol: XAUUSD })
    T->>T: build query "drivers for XAUUSD now"
    T->>E: embed(query)
    E-->>T: queryVec
    T->>DB: SELECT … FROM news_articles + news_embeddings — hybrid: dense cosine + Postgres FTS, fused via RRF (k=60), time-decayed
    DB-->>T: chunks (top N)
    T->>T: assemble structured FA report
    T-->>A: tool-result (sources + bullets)
```

`search_knowledge` widens recall to the memory index (`memory_embeddings.kind ∈ {journal, briefing, thread_synopsis}`) when called with `kinds: [...]`. See `packages/ai/src/rag.ts`.

## 9. Login & first load

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant W as apps/web

    U->>W: GET /chat
    W->>W: middleware reads `hfx_auth` cookie
    alt no/invalid cookie
      W-->>U: 302 /login
      U->>W: POST /api/auth/login { password }
      W->>W: timing-safe compare to APP_PASSWORD
      alt match
        W-->>U: Set-Cookie hfx_auth=<signed>; HttpOnly; Secure; 30d
        W-->>U: 302 /chat
      else mismatch
        W-->>U: 401 (with login rate-limit headers)
      end
    else valid cookie
      W-->>U: render
    end
```

## 10. Failure: provider down, graceful degrade

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant W as apps/web
    participant C as Next.js Data Cache
    participant DA as packages/data
    participant P1 as BiQuote (primary)
    participant P2 as Finnhub (fallback)

    U->>W: /api/market/candles?symbol=XAUUSD&tf=1h
    W->>DA: candlesAdapter.get(...)
    DA->>P1: GET (timeout 1.5s)
    P1--xDA: 5xx (or rate limited)
    DA->>DA: bump P1 health → deprioritise next call
    DA->>P2: GET
    P2-->>DA: bars
    DA-->>W: normalised + source=finnhub
    W->>C: persist (TTL 10s)
    W-->>U: JSON { source: "finnhub", staleHint: false }
    Note over U: UI shows fallback badge
```

The per-provider rolling success/error window in `runWithFailover` keeps a flapping primary from being retried first on the next call. Adaptive 429 backoff lowers the in-memory bucket cap to ~80 % for a cool-off window then recovers. Both encode the "stale-while-error" rule from `06-data-sources.md`: when everything fails, the most recent cached value is returned with `meta.stale = true` up to the SWR ceiling.
