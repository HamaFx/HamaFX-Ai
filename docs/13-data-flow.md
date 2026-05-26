# 13 — Data Flow

> Sequence diagrams for every flow that crosses two or more layers. If you're adding a new flow, draw the sequence first, then implement.

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
    W->>W: middleware: auth + ratelimit
    W->>DB: load thread + last 30 messages
    W->>R: GET prices:* (snapshot)
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
    A->>DB: persist final message + tool calls
```

## 2. Live price stream (WebSocket fan-out)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant W as apps/web
    participant K as apps/worker
    participant TD as Twelve Data WS
    participant R as Upstash

    U->>W: GET /api/internal/ws-token
    W-->>U: { token } (5 min JWT)
    U->>K: WS /v1/prices?token=...&symbols=XAUUSD,EURUSD,GBPUSD
    K->>K: verify JWT
    Note over K: shared upstream<br/>connection per process
    alt no upstream yet
      K->>TD: WS connect + subscribe XAU/USD,EUR/USD,GBP/USD
    end
    TD-->>K: tick frames
    K->>R: PUBLISH prices:<symbol>
    K-->>U: tick frames (multiplexed)

    Note over U,K: heartbeat every 25s

    alt upstream dies
      K->>TD: reconnect (expo backoff)
      K->>K: switch to REST polling 1Hz fallback
    end
```

## 3. News ingestion pipeline (cron)

```mermaid
sequenceDiagram
    autonumber
    participant C as Cron (worker)
    participant MX as Marketaux
    participant FH as Finnhub
    participant E as Embedder (AI Gateway)
    participant DB as Supabase

    loop every 2 min
      C->>MX: GET news?since=last_fetched
      MX-->>C: articles[]
      C->>FH: GET company-news for relevant tickers
      FH-->>C: articles[]
      C->>C: filter by symbol/currency/keyword
      C->>C: dedupe by url-hash
      par for each new article
        C->>E: embed(title + summary)
        E-->>C: vector
        C->>DB: upsert news_articles + news_embeddings
      end
    end
```

## 4. Economic calendar refresh

```mermaid
sequenceDiagram
    autonumber
    participant C as Cron (worker)
    participant TE as Trading Economics
    participant FRED as FRED
    participant DB as Supabase
    participant R as Upstash

    loop every 5 min
      C->>TE: GET calendar?from=now-1h&to=now+7d
      TE-->>C: events[]
      C->>FRED: GET key macro series (CPI, NFP, ...)
      FRED-->>C: observations
      C->>DB: upsert economic_events
      C->>R: SET calendar:next-high-impact ttl=300
    end
```

## 5. Alert evaluation loop

```mermaid
sequenceDiagram
    autonumber
    participant C as Cron (worker)
    participant DB as Supabase
    participant R as Upstash
    participant U as User device
    participant N as Notifier (email/push)

    loop every 30 s
      C->>DB: SELECT active alerts
      C->>R: read latest prices
      par evaluate each rule
        C->>C: rule.match(price, indicators)
        alt match
          C->>DB: mark alert fired (idempotent)
          C->>N: send notification(s)
          N-->>U: email / web-push
        end
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
    U->>K: WS /v1/prices for live last bar
```

## 7. Setting an alert from chat

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant A as Agent
    participant T as Tool runtime
    participant DB as Supabase
    participant W as Worker (cron)

    U->>A: "Alert me if XAUUSD 1H closes < 2378"
    A->>A: parse intent
    A->>T: set_alert({ symbol: XAUUSD, rule: { type: closeBelow, tf: 1h, level: 2378 } })
    T->>DB: insert alerts row (idempotency-keyed)
    DB-->>T: { alertId }
    T-->>A: tool-result
    A-->>U: "Alert set ✓ — I'll notify when 1H closes below 2 378."

    Note over W: later
    W->>DB: read alerts; evaluate
    W-->>U: notification on trigger
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

## 9. Auth & first-load

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant W as apps/web
    participant SB as Supabase Auth
    participant DB as Supabase DB

    U->>W: GET /chat
    W->>W: middleware: no session → redirect /login
    U->>W: POST /login { email }
    W->>SB: signInWithOtp({ email })
    SB-->>U: email with magic link
    U->>W: GET /api/auth/callback?code=...
    W->>SB: exchangeCodeForSession
    SB-->>W: session
    W->>DB: upsert user_prefs (defaults if first login)
    W-->>U: 302 /chat (cookie set)
```

## 10. Failure: provider down, graceful degrade

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant W as apps/web
    participant R as Upstash
    participant DA as packages/data
    participant P1 as Primary
    participant P2 as Fallback

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
