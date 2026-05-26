# 13 — Data Flow

> Sequence diagrams for every flow that crosses two or more layers. If you're adding a new flow, draw the sequence first, then implement.
>
> Personal-mode: there is **no worker** — everything runs inside the Next.js deploy. Cron is **Vercel Cron**.

## 1. Chat turn (full lifecycle)

```mermaid
sequenceDiagram
    autonumber
    participant U as User (mobile)
    participant W as apps/web (Vercel)
    participant DB as Supabase
    participant R as Upstash
    participant A as Agent (AI SDK)
    participant G as AI Gateway
    participant T as Tool runtime
    participant DA as packages/data
    participant P as External providers

    U->>W: POST /api/chat { threadId, message }
    W->>W: middleware: cookie auth + token-cap check
    W->>DB: load thread + last 30 messages
    W->>R: GET prices:* (snapshot for context)
    W->>A: streamText({ system, messages, tools })
    A->>G: chat completion (stream, tools)
    G-->>A: tool-call get_candles(XAUUSD,1H,200)
    A->>T: invoke tool
    T->>R: GET candles:XAUUSD:1H
    alt cache hit
      R-->>T: cached candles
    else cache miss
      T->>DA: candlesAdapter.get(...)
      DA->>P: Twelve Data REST
      P-->>DA: raw
      DA-->>T: normalised Candle[]
      T->>R: SET candles:XAUUSD:1H ttl=5s
    end
    T-->>A: tool-result
    A->>G: continue with tool-result
    G-->>A: stream tokens + maybe more tool calls
    A-->>W: SSE parts (text + tool parts)
    W-->>U: stream parts to useChat
    A->>DB: persist final message + tool calls + telemetry
```

## 2. Live price tile (polling)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant W as apps/web
    participant R as Upstash
    participant DA as packages/data
    participant TD as Twelve Data

    loop every 1.5s while page open
      U->>W: GET /api/market/price?symbols=XAUUSD,EURUSD,GBPUSD
      W->>R: GET prices:*
      alt cache hit (≤ 3s old)
        R-->>W: cached ticks
      else miss / stale
        W->>DA: priceAdapter.getMany([...])
        DA->>TD: GET /price (multi)
        TD-->>DA: prices
        DA-->>W: normalised Ticks
        W->>R: SET prices:* ttl=3s
      end
      W-->>U: ticks JSON
    end
```

The 1–2 s polling cadence is gentle on free-tier providers because the cache absorbs most of it (only one Vercel function instance refetches per TTL window).

## 3. News ingestion pipeline (Vercel Cron)

```mermaid
sequenceDiagram
    autonumber
    participant V as Vercel Cron
    participant W as /api/cron/news
    participant MX as Marketaux
    participant FH as Finnhub
    participant E as Embedder (AI Gateway)
    participant DB as Supabase

    V->>W: POST (Authorization: Bearer CRON_SECRET) every 5 min
    W->>W: verify secret (timing-safe)
    W->>MX: GET news?since=last_fetched
    MX-->>W: articles[]
    W->>FH: GET company-news
    FH-->>W: articles[]
    W->>W: filter by symbol/currency/keyword
    W->>W: dedupe by url-hash
    par for each new article
      W->>E: embed(title + summary)
      E-->>W: vector
      W->>DB: upsert news_articles + news_embeddings
    end
    W-->>V: 200 { processed: N }
```

## 4. Economic calendar refresh (Vercel Cron)

```mermaid
sequenceDiagram
    autonumber
    participant V as Vercel Cron
    participant W as /api/cron/calendar
    participant TE as Trading Economics
    participant FRED as FRED
    participant DB as Supabase
    participant R as Upstash

    V->>W: POST every 15 min
    W->>TE: GET calendar?from=now-1h&to=now+7d
    TE-->>W: events[]
    W->>FRED: GET key macro series (CPI, NFP, ...)
    FRED-->>W: observations
    W->>DB: upsert economic_events
    W->>R: SET calendar:next-high-impact ttl=900
```

## 5. Alert evaluation loop (Vercel Cron)

```mermaid
sequenceDiagram
    autonumber
    participant V as Vercel Cron
    participant W as /api/cron/alerts
    participant DB as Supabase
    participant R as Upstash
    participant N as Notifier (email/Telegram)
    participant U as User device

    V->>W: POST every 1 min (Pro) / 2-5 min (Hobby)
    W->>DB: SELECT active alerts
    W->>R: read latest cached prices
    par evaluate each rule
      W->>W: rule.match(price, indicators)
      alt match
        W->>DB: mark alert fired (set firedAt; idempotent)
        W->>N: send notification(s)
        N-->>U: email / Telegram message
      end
    end
```

## 6. Chart load (cold)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant W as apps/web
    participant R as Upstash
    participant DA as packages/data
    participant TD as Twelve Data

    U->>W: GET /chart/XAUUSD?tf=1h
    W-->>U: HTML shell (RSC) + skeleton
    U->>W: GET /api/market/candles?symbol=XAUUSD&tf=1h&limit=300
    W->>R: GET candles:XAUUSD:1h
    alt hit
      R-->>W: candles
    else miss
      W->>DA: candlesAdapter.get(...)
      DA->>TD: GET /time_series
      TD-->>DA: bars
      DA-->>W: normalised
      W->>R: SET ttl=30s
    end
    W-->>U: JSON
    U->>U: lightweight-charts render

    Note over U,W: live last bar updated via /api/market/price polling
```

## 7. Setting an alert from chat

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant A as Agent
    participant T as Tool runtime
    participant DB as Supabase
    participant V as Vercel Cron (later)

    U->>A: "Alert me if XAUUSD 1H closes < 2378"
    A->>A: parse intent
    A->>T: set_alert({ symbol: XAUUSD, rule: { type: closeBelow, tf: 1h, level: 2378 } })
    T->>DB: insert alerts row
    DB-->>T: { alertId }
    T-->>A: tool-result
    A-->>U: "Alert set ✓ — I'll notify when 1H closes below 2 378."

    Note over V: later (every minute)
    V->>DB: read alerts; evaluate
    V-->>U: notification on trigger
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
    T->>DB: SELECT ... ORDER BY vec <=> queryVec LIMIT 8 WHERE published_at > now()-7d
    DB-->>T: chunks
    T->>T: assemble structured FA report
    T-->>A: tool-result (sources + bullets)
```

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
    participant R as Upstash
    participant DA as packages/data
    participant P1 as Primary provider
    participant P2 as Fallback provider

    U->>W: /api/market/candles?symbol=XAUUSD&tf=1h
    W->>DA: candlesAdapter.get(...)
    DA->>P1: GET (timeout 1.5s)
    P1--xDA: 5xx
    DA->>P2: GET
    P2-->>DA: bars
    DA-->>W: normalised + source=fallback
    W->>R: SET ttl=10s
    W-->>U: JSON { source: "finnhub", staleHint: false }
    Note over U: UI shows fallback badge
```
