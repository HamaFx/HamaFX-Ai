# 02 — Data Flows & Integrations

> **Version:** 2026-07-04 · **Verified against:** commit `1803c17` (main)
> **Cross-references:** [01-architecture.md](./01-architecture.md) · [03-backend-api.md](./03-backend-api.md) · [05-security-auth-compliance.md](./05-security-auth-compliance.md)

---

## 1. Market Data Providers

### 1.1 Provider Inventory

| Provider | Purpose | API Key Required | Source Directory | Env Var |
|----------|---------|-----------------|------------------|---------|
| **BiQuote** | Primary price/candle source. SignalR WebSocket for live ticks + REST for historical. | No (keyless read endpoints) | `packages/data/src/providers/biquote/` | `BIQUOTE_BASE_URL` (optional, default: `https://biquote.io`) |
| **Finnhub** | Fallback FX prices/candles, secondary news, economic calendar | Yes | `packages/data/src/providers/finnhub/` | `FINNHUB_API_KEY` |
| **Marketaux** | Primary financial news + sentiment scoring | Yes | `packages/data/src/providers/marketaux/` | `MARKETAUX_API_KEY` |
| **FRED** | Macro time-series (CPI, NFP, unemployment) + economic calendar + intermarket resonance | Yes | `packages/data/src/providers/fred/` | `FRED_API_KEY` |

| **Binance** | Crypto WebSocket consumer (BTC, ETH, SOL, BNB, XRP, ADA) | No (public streams) | `packages/data/src/providers/binance/` | `BINANCE_CRYPTO_SYMBOLS` (default: `BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT`) |
| **CFTC** | Commitment-of-Traders reports | No (public API) | `packages/data/src/providers/cftc/` | None |
| **AlphaVantage** | Backup historical FX (deep history) | Yes | **No provider directory exists** | `ALPHAVANTAGE_API_KEY` (in `.env.example` but no implementation) |
| **Trading Economics** | Economic calendar | Yes | **No provider directory exists** | `TRADING_ECONOMICS_KEY` (in `.env.example` but no implementation) |

> **Known gap:** `ALPHAVANTAGE_API_KEY` and `TRADING_ECONOMICS_KEY` appear in `.env.example` and are validated by `packages/shared/src/env.ts`, but no provider implementation directories exist under `packages/data/src/providers/`. These are either planned or legacy references.

### 1.2 BiQuote — Primary Price Source

**REST endpoints** (`packages/data/src/providers/biquote/rest.ts`):
- `fetchTick(symbol)` — latest bid/ask
- `fetchLatest(symbol)` — latest tick data
- `fetchOhlc(symbol, timeframe, from, to)` — historical OHLC candles

**SignalR WebSocket** (worker only — `apps/worker/src/signalr/consumer.ts`):
- Hub URL: `https://biquote.io/hubs/tick` (configurable via `BIQUOTE_HUB_URL`)
- Events: `ReceiveTick` (server→client), `Subscribe(symbols[])` (client→server)
- Subscribes to: XAUUSD, EURUSD, GBPUSD
- Ticks validated against `BiquoteSignalRTickSchema` (Zod) in `packages/shared/src/schemas/biquote.ts`
- Normalized to `NormalizedTick` { symbol, bid, ask, mid, ts, source: 'biquote-signalr' }

**Symbol mapping** (`packages/data/src/providers/biquote/map.ts`): `toBiquoteSymbol()`, `toBiquoteTimeframe()`, `parseBiquoteDate()`
**Symbol filter** (`packages/data/src/providers/biquote/filter.ts`): `assertSupportedSymbol()`

**Licensing status:** BiQuote is keyless for read endpoints. No terms of service or licensing documentation exists in the repo. **Redistribution rights for paying subscribers are unresolved.**

### 1.3 Finnhub — Fallback

**REST endpoints** (`packages/data/src/providers/finnhub/rest.ts`):
- `fetchPrice(symbol)` — FX price
- `fetchCandles(symbol, resolution, from, to)` — OHLC candles
- `synth4HFrom1H(symbol, from, to)` — synthesizes 4H candles from 1H data
- `fetchNews(symbol)` — forex/news articles

**Symbol mapping** (`packages/data/src/providers/finnhub/map.ts`): `toFinnhubSymbol()`, `toFinnhubResolution()`

**Licensing status:** Finnhub free tier exists. Terms of service at finnhub.io. **Redistribution rights for paying subscribers are unresolved.** No terms file in repo.

### 1.4 Marketaux — News & Sentiment

**REST endpoints** (`packages/data/src/providers/marketaux/rest.ts`):
- `fetchLatest(params)` — financial news articles with sentiment
- `DEFAULT_SEARCH` — default search parameters

**Mapping** (`packages/data/src/providers/marketaux/map.ts`): `extractSymbols()`, `aggregateSentiment()`

**Licensing status:** Marketaux free tier exists (limited requests). **Redistribution rights for paying subscribers are unresolved.** No terms file in repo.

### 1.5 FRED — Macro Data

**REST endpoints** (`packages/data/src/providers/fred/rest.ts`):
- `fetchReleaseDates(releaseId)` — upcoming release dates for economic indicators
- `fetchObservations(releaseId, params)` — actual data values

**Mapping** (`packages/data/src/providers/fred/map.ts`): `FRED_RELEASES` (curated list), `fredImportance()`, `fredMeta()`

**Resonance** (`packages/data/src/providers/fred/resonance.ts`): `fetchResonanceInputs()` — fetches data for intermarket resonance calculations (real yield, DXY gold divergences)

**Licensing status:** FRED is a free public API from the Federal Reserve Bank of St. Louis. Terms at fred.stlouisfed.org. **Redistribution of FRED data is generally permitted with attribution.** No attribution file in repo.

### 1.7 Binance — Crypto

**REST endpoints** (`packages/data/src/providers/binance/rest.ts`):
- `fetchCandles(symbol, interval, from, to)` — historical klines
- `fetchTickerPrice(symbol)` — latest price

**WebSocket consumer** (worker only — `apps/worker/src/binance/consumer.ts`):
- WSS URL: `wss://stream.binance.com:9443` (configurable via `BINANCE_WS_URL`, use `wss://stream.binance.us:9443` for US)
- Symbols: `BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT` (configurable via `BINANCE_CRYPTO_SYMBOLS`)

**Licensing status:** Binance public market data streams are freely accessible. **Redistribution rights for paying subscribers are unresolved.** No terms file in repo.

### 1.8 CFTC — Commitment of Traders

**REST endpoints** (`packages/data/src/providers/cftc/rest.ts`):
- `fetchLatestRows(reportType)` — latest CoT report rows
- `parseCftcInt(value)` — integer parsing helper

**Mapping** (`packages/data/src/providers/cftc/map.ts`): `toCftcName()`

**Licensing status:** CFTC data is public domain (U.S. government work). Redistribution permitted.

---

## 2. Failover Architecture

`packages/data/src/failover.ts` — `runWithFailover()`:

```
+------------------------------------------------------------------+
|                    ADAPTER (e.g. getPrice)                        |
|                                                                  |
|  1. Build provider list (e.g. [biquote, finnhub])    |
|  2. Reorder by health score (getScore per provider)              |
|     - Pinned providers stay in position                          |
|  3. Try each provider in order:                                  |
|     +---> Provider A (biquote)                                   |
|     |     Success? → recordSuccess, return result                |
|     |     Fail?    → recordFailure, continue                     |
|     v                                                            |
|     +---> Provider B (finnhub)                                   |
|     |     Success? → recordSuccess, return result                |
|     |     Fail?    → recordFailure, continue                     |
|     v                                                            |

+------------------------------------------------------------------+
```

**Key behaviors:**
- `ProviderEmptyError` — sentinel that bypasses health-failure write (used by live_ticks/candles_1m pseudo-providers during worker restart)
- `pinned: true` — keeps a provider in its caller-specified position regardless of health score
- `PROVIDER_QUOTA_EXCEEDED` — still tries next provider (may be on different quota), re-throws quota error preferentially
- Throttle reservations live in `packages/data/src/cache/throttle.ts`, applied at adapter layer

**Health tracking** (`packages/data/src/health.ts`):
- `getHealth()` — returns `HealthSnapshot` per provider
- `getScore(providerId)` — recent success rate
- `recordSuccess(providerId)` / `recordFailure(providerId, error)`

**Circuit breaker** (`packages/data/src/circuit-breaker.ts`): per-provider circuit breaker to prevent cascading failures.

---

## 3. AI/LLM Providers

### 3.1 BYOK Registry — 9 Providers

`packages/ai/src/byok-providers.ts`:

| Provider | ProviderId | SDK Package | Notes |
|----------|-----------|-------------|-------|
| Google Gemini | `google` | `@ai-sdk/google` | Direct API, free tier available |
| OpenAI | `openai` | `@ai-sdk/openai` | GPT models |
| Anthropic | `anthropic` | `@ai-sdk/anthropic` | Claude models |
| Groq | `groq` | `@ai-sdk/groq` | Fast inference |
| DeepSeek | `deepseek` | `@ai-sdk/deepseek` | Cost-effective |
| Mistral | `mistral` | `@ai-sdk/mistral` | Open-weight models |
| OpenRouter | `openrouter` | `@ai-sdk/openrouter` | Multi-model router |
| xAI | `xai` | `@ai-sdk/xai` | Grok models |
| Vertex AI | `vertex` | `@ai-sdk/google-vertex` | Google Cloud Vertex AI |

**Encryption:** BYOK API keys encrypted at rest with AES-256-GCM (`packages/shared/src/encryption.ts`). Uses `ENCRYPTION_SECRET` env var (32-byte hex). Keys decrypted in memory only during tool execution.

**Feature flag:** `BYOK_ENABLED=0` by default. Must be set to `1` to enable per-user key storage.

### 3.2 Vercel AI Gateway

When `AI_GATEWAY_API_KEY` is set, it takes precedence over direct provider calls. The gateway routes to any supported provider by prefixed model id (e.g., `openai/gpt-4.1`, `google/gemini-2.5-flash`).

### 3.3 Vertex AI

Configured via service account JSON:
- `GOOGLE_VERTEX_PROJECT` — GCP project ID
- `GOOGLE_VERTEX_LOCATION` — region (default: `us-central1`)
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — full service account key JSON (single line, server-only)

Vertex AI also provides Google Search grounding via `getVertexGoogleSearchTool()` in `packages/ai/src/model.ts`.

### 3.4 Model Routing

`packages/ai/src/routing.ts` — `routeTurn()`:

| Turn domain | Model selection logic |
|-------------|----------------------|
| Fundamental | Uses fundamental-analysis-capable model |
| Technical | Uses technical-analysis-capable model |
| Summary | Uses cheaper/summary model |
| Vision | Uses vision-capable model (for chart image analysis) |

**Per-user overrides:** Users can pick specific models in `/settings/models` — stored in `user_settings` table. `resolveOverrideModel()` checks user preferences first, falls back to `AI_DEFAULT_MODEL` env var (default: `google/gemini-2.5-flash`).

**Fallback chain:** Users can configure a fallback chain in `/settings/models` — if the primary model fails, the next in chain is tried.

### 3.5 Default Models

| Env var | Default | Purpose |
|---------|---------|---------|
| `AI_DEFAULT_MODEL` | `google/gemini-2.5-flash` | Main chat model (ultimate fallback) |
| `AI_TITLE_MODEL` | `google/gemini-2.5-flash-lite` | Auto-title generation + planner fallback |
| `AI_EMBEDDING_MODEL` | `openai/text-embedding-3-small` | RAG/memory embeddings |

---

## 4. Other External Integrations

### 4.1 Telegram Bot

**Source:** `packages/ai/src/telegram/` + `packages/ai/src/bot/`

| Component | Source | Purpose |
|-----------|--------|---------|
| Client | `packages/ai/src/telegram/client.ts` | Telegram Bot API client |
| Webhook handler | `packages/ai/src/telegram/webhook.ts` | Incoming update processing |
| Rate limiter | `packages/ai/src/telegram/rate-limiter.ts` | Per-user rate limiting |
| Idempotency | `packages/ai/src/telegram/idempotency.ts` | Deduplication of updates |
| Dispatcher | `packages/ai/src/bot/dispatcher.ts` | Command routing |
| Linking | `packages/ai/src/bot/linking.ts` | Bot-to-account linking via code |

**Bot commands** (16): alert, analyze, ask, calendar, chart, committee, help, link, me, news, positions, price, settings, status, track

**Webhook endpoint:** `POST /api/telegram/webhook` (verified via `TELEGRAM_SECRET_TOKEN` header)
**Bot linking:** `POST /api/bot/link-code` — generates linking code, `POST /api/bot/unlink`
**Setup script:** `apps/web/scripts/setup-telegram-webhook.ts`

**Env vars:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_SECRET_TOKEN`### 4.2 Resend (Email)

**Env vars:** `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_TO_EMAIL`

Used for alert delivery via email. Configured in alert delivery pipeline (`packages/ai/src/alerts/delivery.ts`).

### 4.4 Web Push (VAPID)

**Env vars:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` must equal `VAPID_PUBLIC_KEY` exactly — the browser uses it as `applicationServerKey` when subscribing.

**API routes:** `POST /api/push/subscribe`, `POST /api/push/unsubscribe`
**Push send:** `packages/ai/src/push/send.ts`
**Persistence:** `packages/ai/src/push/persistence.ts` → `push_subscriptions` table

### 4.5 Langfuse (LLM Observability)

**Env vars:** `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` (default: `http://localhost:3001`)

Self-hosted Langfuse runs as a Docker container (`docker-compose.yml` → `langfuse` service on port 3001). When any env var is unset, Langfuse tracing is silently disabled.

**Integration:** `packages/ai/src/instrumentation.ts` — `initLangfuse()` / `shutdownLangfuse()`

### 4.6 Sentry (Error Tracking)

**Env vars:** `SENTRY_DSN` (server), `NEXT_PUBLIC_SENTRY_DSN` (client)

**Web app:** `apps/web/src/sentry.server.config.ts`, `apps/web/src/sentry.edge.config.ts`, `apps/web/src/instrumentation.ts`
**Worker:** `apps/worker/src/sentry.ts`

Both apps tag every event with `{ service, commit_sha }` so a single DSN dashboards both. The web app never pulls in the client SDK unless `NEXT_PUBLIC_SENTRY_DSN` is set.

### 4.7 healthchecks.io

**Env vars:** Multiple `HC_*` UUIDs (see `apps/worker/src/env.ts`)

| UUID env var | Purpose |
|-------------|---------|
| `HC_SIGNALR_UUID` | SignalR consumer heartbeat |
| `HC_BACKUP_DB_UUID` | DB backup job |
| `HC_BACKUP_JOURNAL_UUID` | Journal backup job |
| `HC_VERIFY_RESTORE_UUID` | Verify-restore job |
| `HC_UPDATE_UUID` | Self-update job |
| `HC_JOB_EMBEDDING_BACKFILL_UUID` | Embedding backfill job |
| `HC_JOB_BRIEFINGS_UUID` | Briefings job |
| `HC_JOB_SNAPSHOTS_UUID` | Snapshots job |
| `HC_JOB_COT_UUID` | CoT job |
| `HC_JOB_FRED_ACTUALS_UUID` | FRED actuals job |
| `HC_JOB_WEEKLY_REVIEW_UUID` | Weekly review job |
| `HC_JOB_RESONANCE_SYNC_UUID` | Resonance sync job |
| `HC_TENANT_EXPORT_UUID` | Tenant export rehearsal |
| `HC_TENANT_DELETE_UUID` | Tenant delete rehearsal |

**Implementation:** `apps/worker/src/healthchecks.ts` — `ping(uuid)` sends heartbeat. Pings every 30s while consumer is alive.

### 4.8 Supabase

**Env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_CA_CERT`

Used for:
- Postgres database hosting (production)
- Storage (optional — `packages/data/src/adapters/storage.ts`)
- CA certificate for TLS (`SUPABASE_CA_CERT` enables `rejectUnauthorized=true`)

### 4.9 GCP Secret Manager

**Env vars:** `SECRETS_VAULT_PROVIDER` (set to `gcp-secret-manager`), `GCP_PROJECT_ID`

When enabled, secrets are fetched from GCP Secret Manager at runtime. Existing `.env` values take precedence — vault secrets only fill in missing keys. Hosted edition only.

**Implementation:** `packages/shared/src/vault.ts`

### 4.10 Social Sentiment (Optional)

**Env vars:** `SOCIAL_SENTIMENT_API_KEY`, `SOCIAL_SENTIMENT_API_URL`

When configured, the AI can fetch retail positioning and social sentiment data. When unset, the sentiment service gracefully returns `available: false` and the Sentiment Agent degrades to news-only.

**Implementation:** `packages/ai/src/sentiment/social-sentiment-service.ts`

---

## 5. Sequence Diagrams

### 5.1 Chat Query → AI Agent → Tools → Data Providers → Response

```
User    Browser    /api/chat    runChat()    Tools    @hamafx/data    Providers
 |        |            |            |          |          |              |
 |--msg-->|            |            |          |          |              |
 |        |--POST----->|            |          |          |              |
 |        |            |--auth+CSRF>|          |          |              |
 |        |            |--rate-limit>          |          |              |
 |        |            |--validate->|          |          |              |
 |        |            |            |--budget-->|          |              |
 |        |            |            |  guard   |          |              |
 |        |            |            |          |          |              |
 |        |            |            |--buildLiveSnapshot-->|              |
 |        |            |            |          |--getPrice-->BiQuote      |
 |        |            |            |          |<--tick-----|              |
 |        |            |            |          |          |              |
 |        |            |            |--compactThread-->|   |              |
 |        |            |            |  (rolling sum) |   |              |
 |        |            |            |          |          |              |
 |        |            |            |--routeTurn()      |              |
 |        |            |            |  (pick model)     |              |
 |        |            |            |          |          |              |
 |        |            |            |--runPlanner()     |              |
 |        |            |            |  (cheap model)    |              |
 |        |            |            |          |          |              |
 |        |            |            |--streamText()     |              |
 |        |            |            |  + 32 tools       |              |
 |        |            |            |          |          |              |
 |        |            |            |          |--get_candles-->@hamafx/data
 |        |            |            |          |          |--BiQuote---->|
 |        |            |            |          |          |<--OHLC-------|
 |        |            |            |          |<--candles-|              |
 |        |            |            |          |          |              |
 |        |            |            |          |--get_news-->@hamafx/data
 |        |            |            |          |          |--Marketaux-->|
 |        |            |            |          |          |<--articles---|
 |        |            |            |          |<--news----|              |
 |        |            |            |          |          |              |
 |        |            |            |--enforceCitations()|              |
 |        |            |            |  (fact-check)      |              |
 |        |            |            |          |          |              |
 |        |            |            |--applyBudgetDelta()|              |
 |        |            |            |          |          |              |
 |        |<--stream---|<--stream---|<----------|          |              |
 |<--UI---|            |            |          |          |              |
 |        |            |            |          |          |              |
```

### 5.2 Live Tick → SignalR → TickBuffer → DB → Candle Aggregation

```
BiQuote     SignalR       TickBuffer    live_ticks    Candle1mAggregator
  Hub        Consumer                     table         candles_1m table
   |            |              |             |               |
   |--Receive-->|              |             |               |
   |  Tick      |              |             |               |
   |            |--validate--> |             |               |
   |            |  (Zod)       |             |               |
   |            |--normalize-->|             |               |
   |            |  (mid,ts)    |             |               |
   |            |              |--buffer-----|               |
   |            |              |             |               |
   |            |              |  (1Hz flush)|               |
   |            |              |--UPSERT---->|               |
   |            |              |             |               |
   |            |              |--onTick---->|               |
   |            |              |             |  (accumulate) |
   |            |              |             |               |
   |            |              |             |  (on close)   |
   |            |              |             |--UPSERT------>|
   |            |              |             |  1m OHLC      |
   |            |              |             |               |
   |            |              |  (30s)      |               |
   |            |--healthchecks.io ping----->|               |
   |            |              |             |               |
```

---

## 6. Data Provider Licensing Summary

| Provider | Key Required | Free Tier | Redistribution to Paying Subscribers | Terms File in Repo |
|----------|-------------|-----------|--------------------------------------|-------------------|
| BiQuote | No | Yes (keyless) | **Unresolved** | No |
| Finnhub | Yes | Yes (limited) | **Unresolved** | No |
| Marketaux | Yes | Yes (limited) | **Unresolved** | No |
| FRED | Yes | Yes (public) | Generally permitted with attribution | No |

| Binance | No | Yes (public streams) | **Unresolved** | No |
| CFTC | No | Yes (public domain) | Permitted (U.S. government work) | No |

> **Critical gap:** No `TERMS.md`, `LICENSE-NOTICES.md`, or provider terms files exist anywhere in the repository. The legal compliance review (`docs/archive/review/11-legal-compliance-review.md`) covers this extensively but is an audit document, not a compliance document. The founder must consult a qualified lawyer before redistributing market data to paying subscribers.
