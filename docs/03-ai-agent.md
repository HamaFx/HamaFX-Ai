# 03 — AI Agent System

Deep-dive into the brain of HamaFX-Ai: the `runChat` orchestration flow, 30 tools,
model routing, planner, memory/RAG, committee deliberation, citation
verification, budget guardrails, briefings, alert evaluation, and the CLI eval
runner.

---

## Table of Contents

1. [Entry Point: `runChat()`](#entry-point-runchat)
2. [Tool Catalogue (30 Tools)](#tool-catalogue-30-tools)
3. [Domain-Based Model Routing](#domain-based-model-routing)
4. [Plan-Then-Act Planner](#plan-then-act-planner)
5. [System Prompt & Live Snapshot](#system-prompt--live-snapshot)
6. [Thread Compaction (Rolling Summary)](#thread-compaction-rolling-summary)
7. [Memory & RAG (Hybrid Retrieval)](#memory--rag-hybrid-retrieval)
8. [Multi-Agent Committee](#multi-agent-committee)
9. [Citation Verification](#citation-verification)
10. [Budget Guardrail](#budget-guardrail)
11. [Telemetry](#telemetry)
12. [Auto-Title Generation](#auto-title-generation)
13. [Briefings System](#briefings-system)
14. [Alert Evaluation](#alert-evaluation)
15. [Telegram Integration](#telegram-integration)
16. [Eval Harness](#eval-harness)

---

## Entry Point: `runChat()`

**File:** `packages/ai/src/agent.ts` (505 lines)

`runChat()` is the top-level orchestrator called by the `/api/chat` route handler.
Every chat turn flows through a sequence of 6 steps:

```
┌───────────────────────────────────────────────────────────┐
│  runChat(threadId, userMessage, env)                       │
│                                                           │
│  1. tryReserveBudget() ── atomic gate, $0.01 reserve      │
│  2. appendUserMessage() ── persist user prompt immediately │
│  3. Load history + buildLiveSnapshot() ── parallel fetch  │
│  4. compactThread() ── rolling summary if >30 messages    │
│  5. routeTurn() → resolveModel() → [runPlanner()]         │
│  6. streamText() with 30 tools → SSE → client             │
│     └─ onFinish: persist + telemetry + enforceCitations   │
│                  + applyBudgetDelta + runAutoTitle         │
└───────────────────────────────────────────────────────────┘
```

### Step-by-step

**1. Budget Reservation (lines 94–98)**
An atomic `INSERT ... ON CONFLICT DO UPDATE WHERE total+candidate <= cap` reserves
`$0.01` (DEFAULT_TURN_ESTIMATE_USD) against the daily budget counter. If the cap
is already hit, the call throws `BudgetExceededError` before any model invocation.

**2. Persist User Message (line 102)**
The incoming user message is written to `chat_messages` inside a transaction
that also bumps `chat_threads.updatedAt`. Even if the model call fails later,
the prompt is preserved for retry.

**3. Load History & Live Snapshot (lines 106–109)**
History (most recent 60 messages) and a live snapshot (prices, session, health)
are fetched in parallel. The snapshot avoids the model calling `get_price` for
trivial questions.

**4. Thread Compaction (lines 111–117)**
When a thread exceeds 30 messages, the oldest portion is collapsed into a
single system-note summary. The last 12 messages are always kept verbatim.

**5. Routing & Planner (lines 144–234)**
`routeTurn()` classifies the user message into a domain and picks the best model.
If `planRequired` is true (fundamental/technical), `runPlanner()` fires a cheap
LLM call to generate a visible "Thinking" plan before the main stream.

**6. Stream & On-Finish (lines 323–424)**
`streamText()` with full tool registry is wrapped in `withToolContext()`
(AsyncLocalStorage). `stopWhen: stepCountIs(MAX_TOOL_ITERATIONS)` limits the
tool-call loop. The `onFinish` handler:
- Converts the response to a UIMessage and persists it.
- Runs `enforceCitations()` to scan for unsupported price/event claims.
- Writes `chat_telemetry` and reconciles the budget via `applyBudgetDelta()`.
- Fires `waitUntil(runAutoTitleBackground())` for the slow title-generation tail.

### Mid-Stream Graceful Degradation

Every external data call (prices, DB, planner, title generator) is
try/catch-guarded. A price-feed failure, failed planner, or telemetry write
error never crashes the stream — the user still sees the assistant's answer.

---

## Tool Catalogue (30 Tools)

**File:** `packages/ai/src/tools/index.ts`

All tools live under `packages/ai/src/tools/*.ts`. They are registered in a
flat `tools` object and wrapped with `withTelemetry()` for per-invocation
observability. The AI SDK v5 `tool()` helper enforces Zod input schemas at the
boundary. Every tool reads context via `getToolContext()` (AsyncLocalStorage),
never global state.

### Market Data (5 tools)

| Tool                  | Description |
|-----------------------|-------------|
| `get_price`           | Latest mid-price for one symbol (XAUUSD/EURUSD/GBPUSD). Reads from the BiQuote adapter with Finnhub failover. |
| `get_candles`         | OHLCV candles for a symbol × timeframe. Supports 1m through 1w. Returned candles are passed to indicators downstream. |
| `get_indicators`      | Computed technical indicators (SMA, EMA, RSI, MACD, ATR, Bollinger, Pivots). Prefer over manually computing from candles — it's cached and consistent with the chart UI. |
| `get_market_structure` | SMC-style structure analysis: swing highs/lows, BOS (break of structure), CHoCH (change of character), FVG (fair value gaps), order blocks, liquidity levels. |
| `get_session_levels`  | Session-based pivot levels: Asian range, London high/low, NY high/low, previous day's high/low. |

### Analysis (4 tools)

| Tool                  | Description |
|-----------------------|-------------|
| `analyze_technical`   | Multi-timeframe technical read: pulls candles + indicators + structure for 1D/4H/1H/15M. Returns a structured narrative (bias, key levels, momentum). |
| `analyze_fundamental` | Macro/fundamental analysis: upcoming events, recent news sentiment, intermarket context. Optionally invokes Vertex AI Google Search Grounding. |
| `analyze_chart_image` | Vision-model pass over a user-uploaded chart screenshot. Extracts visible levels, patterns, and candle formations. Uses the vision model. |
| `annotate_chart`      | Generates TradingView-compatible annotation JSON (lines, boxes, labels) from analysis output. Rendered by the chart surface. |

### Correlation & Intermarket (3 tools)

| Tool                       | Description |
|----------------------------|-------------|
| `get_correlation`          | Rolling correlation between two instruments (e.g. XAUUSD vs DXY). Computed from daily closes over a configurable window. |
| `get_intermarket`          | Snapshot of intermarket relationships: DXY, US10Y, S&P 500, VIX, crude oil. Returns current values and z-score deviations. |
| `get_intermarket_resonance`| Multi-asset resonance detection: identifies when multiple intermarket signals align in the same direction. Persisted daily by the worker. |

### Risk & Position Management (5 tools)

| Tool                       | Description |
|----------------------------|-------------|
| `compute_risk`             | Position sizing from account size, risk %, entry, stop, and target. Returns units, notional, R:R ratio, and max loss. |
| `compute_position_health`  | Real-time health check of open journal entries: current P&L, distance to stop/target, time-in-trade. |
| `forecast_volatility`      | Expected range forecast using ATR, implied vol proxies, and upcoming event impact. Returns upper/lower bands for a time horizon. |
| `verify_call`              | Retrospective trade review: given an entry/stop/target, checks what actually happened (did it hit TP first? SL first? Neither?). |
| `replay_setup`             | Historical backtest of a rule-based setup (e.g. "EMA50/EMA200 cross with ATR stop"). Returns win rate, avg R, max drawdown, equity curve. |

### News & Calendar (3 tools)

| Tool              | Description |
|-------------------|-------------|
| `get_news`        | Latest news articles for a symbol or currency. Sources: Finnhub, Marketaux. Returns title, summary, sentiment, published time. |
| `get_calendar`    | Upcoming economic events filtered by currency and importance (high/medium/low). Trading Economics as primary source. |
| `search_knowledge`| Hybrid RAG search over news + journal + briefings + thread synopses. Uses pgvector cosine + Postgres FTS with RRF fusion. |

### Actions (4 tools)

| Tool              | Description |
|-------------------|-------------|
| `log_journal`     | Create or update a trade journal entry. Captures symbol, side, entry, stop, target, R:R, tags, notes. Auto-embeds into the memory index. |
| `get_journal_stats`| Aggregated stats from the journal: win rate, avg R, expectancy, P&L curve, per-symbol breakdown, per-session breakdown. |
| `set_alert`       | Create a price-cross, candle-close, or indicator-cross alert. Persisted to DB and evaluated by the cron worker. |
| `share_snapshot`  | Generate a shareable image/link of the current chart state with annotations. |

### Meta & System (4 tools)

| Tool                       | Description |
|----------------------------|-------------|
| `convene_committee`        | Multi-agent deliberation: 3 persona LLM calls (Economist, Technician, Risk Manager) + Moderator synthesis. Returns a grade (A–F) and go/no-go signal. |
| `summarize_thread`         | Generate a synopsis of the current thread. Persisted to memory index for future recall. |
| `get_system_diagnostics`   | Health check: DB row counts, API key validation, sync status, cache freshness. |
| `run_system_action`        | Trigger system maintenance: historical ingest, cache flush, schema validation. Operator-only. |

### Additional Tools (2 tools)

| Tool              | Description |
|-------------------|-------------|
| `get_cot`         | CFTC Commitment of Traders report data for futures positions (commercial, non-commercial, non-reportable). |
| `get_seasonality` | Historical seasonality patterns: average monthly returns, win rate by month/day-of-week for the selected symbol. |

---

## Domain-Based Model Routing

**File:** `packages/ai/src/routing.ts` (232 lines)

Each turn is classified into one of 5 domains via **keyword scoring**. The
classifier inspects only the latest user message text. Three parallel pattern
buckets are scored, and the highest wins. Ties resolve: fundamental >
technical > summary.

### Domain → Model Map

| Domain        | Score Threshold | Model                      | planRequired | Google Search Grounding |
|---------------|:---:|----------------------------|:---:|:---:|
| `fundamental` | ≥ 1 | `AI_FUNDAMENTAL_MODEL` (pro)| yes | yes (Vertex native) |
| `technical`   | ≥ 1 | `AI_TECHNICAL_MODEL` (flash)| yes | no |
| `summary`     | ≥ 1 | `AI_SUMMARY_MODEL` (flash-lite) | no | no |
| `vision`      | —   | `AI_VISION_MODEL` (pro)    | no  | no |
| `generic`     | 0 or override | `AI_DEFAULT_MODEL`     | no  | no |

**Vision** triggers automatically when the message contains an image/file part.
**Generic** fires when no keywords match or `modelOverride` is set (the
"regenerate with model X" UX path).

### Pattern Scoring

- **Fundamental:** `why/because/driver/catalyst`, macro entities (`fed/fomc/cpi/nfp`),
  geopolitical terms, scenario language, committee/review prompts. Weights 1–3.
- **Technical:** indicator names (`rsi/macd/ema/sma`), SMC terms (`bos/choch/fvg`),
  timeframe tokens, level language. Weights 1–3.
- **Summary:** summarise/recap/brief, news/headlines, calendar/event tokens,
  journal/stats terms. Weights 1–3.

The routing decision is recorded in telemetry as `routing_<domain>` for per-domain
spend breakdowns in `/settings/usage`.

### Model Resolution

**File:** `packages/ai/src/model.ts` (129 lines)

Three transports supported:
1. **`google-vertex/`** prefix → direct Vertex AI. Always bypasses the AI
   Gateway. Requires `GOOGLE_VERTEX_PROJECT` + credentials.
2. **AI Gateway** (any other prefixed id when `AI_GATEWAY_API_KEY` is set) →
   Vercel AI Gateway routing. The string is passed through directly.
3. **`google/`** prefix + `GOOGLE_GENERATIVE_AI_API_KEY` → direct Gemini API.

If resolution fails (bad model id, missing env), `runChat` falls back to
`AI_DEFAULT_MODEL` and logs the failure — the user still gets an answer.

For fundamental turns, the model is forced through Vertex AI natively to enable
**Google Search Grounding** (the `googleSearch` tool). This uses the $1,000
Vertex AI Agent Builder credit.

---

## Plan-Then-Act Planner

**File:** `packages/ai/src/planner.ts` (312 lines)

For analytical turns (`fundamental` or `technical` domains), a small pre-step
LLM call generates a JSON plan before the main `streamText`. The plan is
rendered as a collapsible "Thinking" pill in the chat UI.

### How It Works

1. A cheap model (`AI_SUMMARY_MODEL`, typically flash-lite) receives a prompt:
   the routing domain, rationale, and user's message (truncated to 1500 chars).
2. The model returns JSON: `{ steps: string[], expectedTools: string[], rationale: string }`.
3. The plan is persisted as a **system-role message** with a `data-plan` part —
   chronologically before the assistant's main answer.
4. System messages are dropped before `convertToModelMessages()` so they don't
   crash providers that reject mid-conversation system messages.

### Fallback Chain

The planner never blocks the chat. Three fallback paths:

| Condition | Fallback |
|-----------|----------|
| `planRequired === false` | `not_required` — no plan emitted. |
| Budget exhausted (`spent >= MAX_DAILY_USD`) | Deterministic plan from `FALLBACK_STEPS_BY_DOMAIN`. |
| Budget check fails (DB error) | Deterministic plan (conservative). |
| LLM call throws | Deterministic plan. |
| LLM returns unparseable JSON | Deterministic plan. |

Each domain has a hardcoded 3–5 step checklist in `FALLBACK_STEPS_BY_DOMAIN`.
Users see a plan pill regardless of whether it was LLM-generated or
deterministic.

---

## System Prompt & Live Snapshot

**File:** `packages/ai/src/prompt/system.ts` (83 lines)

The system prompt has two layers:

### Static Base (10 Hard Rules)

1. **Scoped** to XAUUSD, EURUSD, GBPUSD only. Refuse everything else politely.
2. **Never invent data.** Always call a tool. The LIVE_SNAPSHOT is the sole
   exception — it's fresh and quotable directly.
3. **Cite sources** for news/macro: publisher + "as of <UTC time>".
4. **State time references** explicitly for prices.
5. **Distinguish bias (multi-day) from setup (intraday).** Always give an
   invalidation level.
6. **Analysis, not advice.** Scenario language: "if X then Y".
7. **Mobile-first:** concise structured answers; expand only on request.
8. **Tool failures** — state them plainly, offer alternatives.
9. **Match user language**, default English.
10. **Operator awareness** — surface system health from LIVE_SNAPSHOT.

Plus: tool usage guidance (prefer `get_indicators`, default timeframes, when to
use `convene_committee`) and output style rules (decimal places, labelling).

### Live Snapshot (Per-Turn Dynamic Block)

```text
# LIVE_SNAPSHOT (auto-injected, fresh as of 2026-06-18T14:32:00.000Z)

- Session: london
  - XAUUSD: 2342.5 (biquote)
  - EURUSD: 1.0852 (biquote)
  - GBPUSD: 1.2728 (biquote)
- Next high-impact: US CPI (USD) at 2026-06-20T12:30:00Z
- Copilot Status: HEALTHY (DB Latency: 12ms)
- Last Intermarket Sync: 2026-06-18
```

Built by `buildLiveSnapshot()` in `packages/ai/src/context.ts`:
- **Session inference:** UTC-hour-based (asia/london/ny/off). Weekends
  correctly detected.
- **Prices:** parallel fetch across all three symbols with 800ms timeout.
  Missing entries silently drop out.
- **Health:** DB latency probe against `intermarket_resonance` table.
  Status: healthy (<250ms), degraded, or unhealthy.
- **Next event:** currently undefined; Phase 1c will plumb from the calendar
  table.

The snapshot saves tokens: the model can answer "what's the price?" without
calling `get_price`, unless the snapshot is more than 10 seconds old.

---

## Thread Compaction (Rolling Summary)

**File:** `packages/ai/src/memory/thread-summary.ts` (222 lines)

### When It Triggers

- `SUMMARISE_AFTER = 30` messages → thread is eligible for compaction.
- `KEEP_VERBATIM = 12` → the most recent 12 messages are always kept
  as-is for context.

### How It Works

1. If history has < 30 messages, return unchanged: `{ extraSystem: null, kept: history }`.
2. Split: oldest N messages are summarised, newest 12 kept verbatim.
3. Check for a **cached summary** (persisted as a system message with a digest
   of the summarised prefix). Cache hit → reuse without LLM call.
4. Cache miss → call `generateText` with the cheapest model (`AI_SUMMARY_MODEL`,
   typically flash-lite). Max summary length: 1400 characters.
5. Persist the summary as a system message for future reuse.
6. If the LLM call fails: **fall back to truncation** (drop the oldest N
   messages, no summary). The user experience never degrades from a memory
   side-effect.

The summary is injected into the system prompt as `compaction.extraSystem`,
prepended before the base system prompt so the model sees:

```
<summary of older conversation>
...
<base system prompt + LIVE_SNAPSHOT>
```

---

## Memory & RAG (Hybrid Retrieval)

**Files:**
- `packages/ai/src/rag.ts` (327 lines) — hybrid retrieval engine
- `packages/ai/src/memory/memory-index.ts` (311 lines) — memory embeddings CRUD

### Dual-Corpus Architecture

| Corpus | Table | Retriever |
|--------|-------|-----------|
| **News** | `news_embeddings` (dedicated) | Dense cosine + Postgres FTS, RRF-fused |
| **Memory** | `memory_embeddings` (unified) | Dense cosine only |

The memory index covers three kinds: `journal`, `briefing`, `thread_synopsis`.
News has its own embeddings table for tighter schema and cheaper reads on
the noisier corpus.

### Hybrid Retrieval (`runRagQuery`)

For news queries, two independent result sets are fetched in parallel:

1. **Dense:** pgvector cosine similarity over `news_embeddings`.
2. **Lexical:** Postgres full-text search (`websearch_to_tsquery`) over
   `news_articles.title || summary` with `ts_rank_cd`.

Then **Reciprocal-Rank Fusion (RRF)** merges the two ranked lists:

```
RRF_score = Σ 1 / (k + rank_i)    where k = 60
```

This makes the system robust to either signal being weak: "FOMC minutes" needs
lexical precision, "macro volatility tonight" needs semantic understanding.

### Time Decay

All results undergo exponential decay:

```
similarity *= exp(-ln(2) × ageDays / halflifeDays)
```

- News halflife: **7 days** (configurable per-query).
- Memory halflife: **30 days**.

### Memory Index Operations

Three `remember*()` functions, all budget-guarded and idempotent:

- **`rememberJournalEntry({ entryId })`** — called after journal create/update.
  Composes a rich text snippet from the entry's symbol, side, entry, stop,
  target, outcome, R-multiple, tags, and notes.
- **`rememberBriefing({ messageId, body, briefingKind })`** — called from the
  briefings generator. The briefing body is embedded for future recall.
- **`rememberThreadSynopsis({ threadId, synopsis, insights })`** — called by
  `summarize_thread`. Synopses and structured insights are embedded together.

All upsert via `ON CONFLICT (kind, source_id) DO UPDATE` — atomic, never
duplicates, always reflects the latest body.

### `search_knowledge` Tool

The tool queries both corpora: embeds the user query (`text-embedding-3-small`),
runs `runRagQuery` for news and `runMemoryQuery` for memory, merges results
sorted by decayed similarity, and returns the top-K. Empty corpora are
surfaced as `pipelinePending: true` so the UI shows a status line instead of
a misleading "no results".

---

## Multi-Agent Committee

**File:** `packages/ai/src/tools/convene-committee.ts` (265 lines)

Invoked by the agent when the user asks "should I take this trade?" or
provides an entry + stop. The committee runs **3 persona LLM calls in
parallel**, then a **Moderator** synthesises the final verdict.

### Architecture

```
User setup (symbol, side, entry, stop, target)
    │
    ├── Pre-fetch context (parallel)
    │   ├── analyze_fundamental (48h horizon)
    │   ├── analyze_technical (1D, 4H, 1H, 15M)
    │   ├── get_journal_stats (per-symbol)
    │   └── compute_risk (position sizing)
    │
    ├── 3 Persona LLM calls (parallel)
    │   ├── Economist — Vertex AI + Google Search Grounding
    │   │    Verdict: bullish/bearish/neutral, confidence 1–10
    │   ├── Technician — multi-TF analysis
    │   │    Verdict: bullish/bearish/neutral, confidence 1–10
    │   └── Risk Manager — journal stats + position sizing
    │        Verdict: bullish/bearish/neutral, confidence 1–10
    │
    └── Moderator synthesis
         Grade: A/B/C/D/F
         Signal: go / caution / no-go
         Consensus: 2–3 sentence summary
```

### Output

```typescript
{
  symbol, side, entry, stop, target,
  verdicts: [economist, technician, riskManager],  // individual reports
  grade: "A" | "B" | "C" | "D" | "F",
  goNoGo: "go" | "caution" | "no-go",
  consensus: "string summary"
}
```

### Failure Handling

- Each persona has a `fallbackVerdict()` returning `neutral` / confidence 1
  when the LLM call fails or the JSON is unparseable.
- The Moderator has a similar C-grade fallback: *"The committee was unable to
  reach a firm consensus. Proceed with caution."*
- The user always gets a structured answer, never an error.

### Google Search Grounding

The Economist persona uses the **Vertex AI `googleSearch` tool**, which
grounds its analysis in live web results. This is the same Google Search
Grounding that's forced for all fundamental-domain turns. The tool provides
real-time breaking news and macro context beyond the pre-fetched fundamental
data.

---

## Citation Verification

**Files:**
- `packages/ai/src/verification.ts` (204 lines)
- `packages/ai/src/verification/regex.ts` (66 lines)

After `streamText` finishes, `enforceCitations()` scans the assistant's text
for factual-looking claims that aren't backed by a tool call this turn.

### Detection Rules

**Price tokens** (`PRICE_TOKEN` regex):
- Gold band: `1xxx.xx`–`4xxxx.xx` (realistic trading range).
- FX bands: `0.xxxx` or `1.xxxx` to 4–5 decimals.
- Boundary guards: excludes timestamps (`2024.05.27`), version strings
  (`1.0.0`), and numeric continuations.

**Event tokens** (`EVENT_TOKEN` regex):
- Macro abbreviations: NFP, CPI, PCE, FOMC, GDP, PPI, PMI.
- Entity names: Fed, ECB, BoE, BoJ.
- Broader terms: nonfarm, jobless.

**Attribution tokens** (`ATTRIBUTION_TOKEN` regex):
- Explicit reference verbs: `per`, `via`, `according to`, `sourced from`,
  `cited`, `reported by`, `tool result`.
- Bare `from` / `source` are deliberately excluded (too noisy).

### Verification Logic

1. If a **numeric tool** was invoked (`get_price`, `get_candles`, etc.), skip
   price checking — the data is backed.
2. If a **news/event tool** was invoked (`get_news`, `get_calendar`, etc.),
   skip event checking.
3. For unmatched claims, check the **containing sentence** for an attribution
   token (e.g. "According to the FOMC minutes, ..."). If present, skip.
4. Collapse remaining unsupported claims into a single `data-citation-warning`
   part with `stance: 'soft'`. The chat UI renders this as a muted footer:
   *"Numbers in this answer weren't verified against a tool call this turn."*

### Design Choices

- **Tool-call parts only:** `tool-result` parts from older messages are ignored
  — only active invocations this turn count as backing evidence.
- **Soft stance:** Warnings are informational footers, not blocking errors.
  The system accepts that some mentions of prices/events are legitimate
  general knowledge (e.g. "the Fed raised rates in 2022").
- **Single-line output:** A noisy assistant won't produce a wall of warnings.

---

## Budget Guardrail

**File:** `packages/ai/src/cost.ts` (210 lines)

### Per-Model Rate Table

Conservative upper-bound rates from Q1 2026 public list prices:

| Model | Input $/1M tokens | Output $/1M tokens |
|-------|:-:|:-:|
| `google/gemini-2.5-flash-lite` | 0.10 | 0.40 |
| `google/gemini-2.5-flash` | 0.30 | 2.50 |
| `google/gemini-2.5-pro` | 1.25 | 10.00 |
| `openai/gpt-4.1` | 5.00 | 15.00 |
| `openai/gpt-4.1-mini` | 0.40 | 1.60 |
| `anthropic/claude-sonnet-4` | 3.00 | 15.00 |
| Unknown (fallback) | 5.00 | 15.00 |

### Atomic Reservation (`tryReserveBudget`)

The previous "sum-then-compare" pattern had a race condition: two concurrent
turns at 99% of the cap could both pass the check. The atomic flow:

```sql
INSERT INTO daily_ai_spend (day, total_usd_cents)
VALUES (:day, :estCents)
ON CONFLICT (day) DO UPDATE
  SET total_usd_cents = daily_ai_spend.total_usd_cents + :estCents
  WHERE daily_ai_spend.total_usd_cents + :estCents <= :capCents
RETURNING total_usd_cents
```

Postgres serialises row-level UPDATEs. Only one concurrent caller wins — the
other gets zero returned rows and immediately returns `{ ok: false }`.

### Post-Call Reconciliation

`applyBudgetDelta(actualCost - reservedUsd)` adjusts the running counter:

- **Positive delta:** the call cost more than estimated → add the balance.
- **Negative delta:** the call cost less → release the over-reservation.
- **Zero:** no adjustment needed.

The counter is clamped at `GREATEST(0, ...)` to prevent negative carry-over
from a release that exceeds the reservation.

### Design Properties

- **Pre-call gate:** no model invocation before budget reservation succeeds.
- **Post-call reconciliation:** the running counter stays aligned with the
  audit SUM in `chat_telemetry`.
- **Default estimate:** $0.01 per turn (conservative — most turns are cheaper).
- **Cap:** `MAX_DAILY_USD` env var, typically $5.00.
- **Failure mode:** `BudgetExceededError` thrown to the route handler → HTTP
  429 response with metadata.

---

## Telemetry

**File:** `packages/ai/src/persistence.ts` (lines 262–343)

### Per-Turn Telemetry (`chat_telemetry`)

| Column | Description |
|--------|-------------|
| `threadId` | Thread reference |
| `messageId` | Assistant message id (null for routing/planner breadcrumbs) |
| `model` | Resolved model id string |
| `inputTokens` / `outputTokens` | Token counts from the provider |
| `toolCalls` | Number of tool invocations this turn |
| `ms` | Wall-clock latency |
| `estCostUsd` | Estimated cost from the rate table |
| `kind` | Discriminator: `null` for assistant turns, or one of 11 breadcrumb kinds |
| `createdAt` | UTC timestamp |

### Kind Discriminators

- **Routing breadcrumbs:** `routing_fundamental`, `routing_technical`,
  `routing_summary`, `routing_vision`, `routing_generic` — one per turn.
- **Planner breadcrumbs:** `plan_generated`, `plan_skipped_budget`, `plan_failed`.
- **Title breadcrumbs:** `title_generated`, `title_skipped_budget`, `title_failed`.

These allow `/settings/usage` to break down spend per domain and show how
often the planner/title generator runs.

### Per-Tool Telemetry (`chat_tool_telemetry`)

| Column | Description |
|--------|-------------|
| `threadId` / `messageId` | Context |
| `tool` | Tool name string |
| `ms` | Execution latency |
| `ok` | Success flag |
| `errorCode` | Error code on failure |

Every tool in the registry is wrapped with `withTelemetry()`, which wraps
the `execute` function to time the invocation and call `recordToolTelemetry()`.
Failures are best-effort logged — never crash the chat turn.

### Usage Analytics (`usage.ts`)

Read-side helpers for `/settings/usage`:
- `listTelemetry(limit)` — most recent turns, newest first.
- Per-day cost buckets (last 7 and 30 days).
- Per-model breakdown (turns, tokens, cost).
- Tool invocation counts from the tool catalogue.
- All computed on-demand from `chat_telemetry` — personal-mode volume is low
  enough that a 30-day scan is well under 100ms.

---

## Auto-Title Generation

**File:** `packages/ai/src/title.ts` + `agent.ts` lines 434–487

After the first assistant message in a thread, `runAutoTitleBackground()`:
1. Checks the thread title is still null (idempotent).
2. Extracts the first user message and first assistant message (truncated to
   1024 chars each).
3. Calls `generateTitle()` — a cheap `generateText` call with the title model.
4. Persists the title + provenance (`'llm'` or `'fallback'`).
5. Records a telemetry breadcrumb.

This runs via `waitUntil()` on Vercel: the response stream closes immediately
so the user never waits for the title. Outside Vercel, `waitUntil` is a
fire-and-forget shim.

Budget-guarded: skips if `spent >= MAX_DAILY_USD`. Falls back to a
deterministic title from the first 80 characters of the user message.

---

## Briefings System

**Files:**
- `packages/ai/src/briefings/generate.ts` (393 lines)
- `packages/ai/src/briefings/persistence.ts`

### Three Briefing Kinds

| Kind | Trigger | Timing |
|------|---------|--------|
| **Pre-event** | High-impact calendar event approaching | 6 hours before |
| **Post-event** | High-impact event just released | 15 minutes after |
| **Weekly review** | End of trading week | Saturday 00:00 UTC |

### Singleton Thread

All briefings land in a single `Briefings_Thread`. Created once, reused
forever. Each briefing is appended as an assistant message with a `briefing`
part marker so the chat UI can distinguish briefings from regular chat.

### Idempotency

`briefings_emitted` table with `(eventId, kind)` unique key. Before
generating, the generator checks `wasEmitted(eventId, kind)`. After
generating, it writes the row. The cron handler reports `processed` vs total
and retries on the next tick.

### Generation Pipeline

1. Load the calendar event from DB.
2. Call `generateText` with the summary model to compose the briefing body
   (LLM-authored when budget allows).
3. If the body is < 50 characters, **refuse to emit** — leave the
   idempotency slot open so the next cron tick retries. This prevents burning
   the slot on a stub.
4. If budget is exhausted, fall back to a deterministic stats-only body
   (event name, time, forecast vs actual, symbol).
5. Persist via `appendAssistantMessage` → write `briefings_emitted` row →
   embed via `rememberBriefing()`.

### Weekly Review

The weekly review aggregates:
- The week's closed journal entries (win rate, avg R, P&L).
- High-impact events that occurred.
- Market structure summary per symbol.
- Intermarket resonance shifts.
- Auto-generated insights.

---

## Alert Evaluation

**Files:**
- `packages/ai/src/alerts/evaluator.ts` (390 lines)
- `packages/ai/src/alerts/delivery.ts`
- `packages/ai/src/alerts/persistence.ts`

### Alert Types

| Type | Trigger | Semantics |
|------|---------|-----------|
| `priceCross` | Live tick crosses `level` | One-shot: fires once, then deactivates |
| `candleClose` | Last closed bar's close crosses `level` | One-shot |
| `indicatorCross` | Indicator value crosses `level` | **True crossing** semantics |

### True Crossing Semantics

`indicatorCross` alerts use **true crossing** detection: the indicator must
transition through the level between the previous evaluator tick and the
current one. An alert for "RSI crosses above 70" **never fires immediately**
on creation — the first tick seeds a `previousValue` baseline, and the alert
only fires on the subsequent tick when the transition is detected.

```typescript
function decideCross(direction, prev, curr, level) {
  if (prev === null || prev === undefined) return false;  // no baseline yet
  return direction === 'above'
    ? prev < level && curr >= level   // crossed up through
    : prev > level && curr <= level;  // crossed down through
}
```

### Evaluation Cycle

The cron worker runs `evaluateAlerts()`:
1. `listEvaluable()` — active, not-yet-fired alerts.
2. Group dependencies (symbols, timeframes), pre-fetch all prices/candles in
   parallel.
3. For each alert, compute the relevant reading and check the match condition.
4. Matched alerts → `deliverAlert()` across all configured channels.
5. Delivery layer only calls `markFired()` after receiving a 2xx from the
   delivery provider. Transient failures retry on the next cron tick.

### Delivery Channels

Three channels, all configurable via env vars:
- **Email:** Resend API (`RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_TO_EMAIL`).
- **Telegram:** Bot API (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).
- **Web Push:** VAPID keypair (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`). RFC 8292 compliant.

---

## Telegram Integration

**File:** `packages/ai/src/telegram/webhook.ts`

A webhook handler that maps Telegram messages to chat threads:
- **Thread mapping:** the user's Telegram `chatId` is hashed to a persistent
  thread ID. Messages from the same chat always land in the same thread.
- **Slash commands:** `/price`, `/bias`, `/news`, `/calendar`, `/journal`,
  `/alerts`, `/help` — each maps to a pre-formatted prompt sent through
  `runChat()`.
- **Inline mode:** not supported (single-user focus).

The webhook endpoint is called by Telegram's Bot API. It validates the bot
token and routes incoming messages through the standard `runChat` pipeline.

---

## Eval Harness

**Files:**
- `packages/ai/src/eval/runner.ts` — CLI runner
- `packages/ai/src/eval/cases.json` — 15 acceptance prompts
- `packages/ai/src/eval/parse-stream.ts` — SSE stream parser

### Usage

```bash
pnpm --filter @hamafx/ai eval -- \
  --base-url http://localhost:3000 \
  --cookie "hfx_auth=..." \
  --cases
```

### 15 Acceptance Prompts

Each prompt defines a real user question with expected tool calls:

| ID | Prompt | Expected Tools |
|----|--------|----------------|
| p01 | "Give me a top-down read on gold from 4H down to 15M." | `analyze_technical` |
| p02 | "What's the bias on EURUSD right now and why?" | `analyze_technical` |
| p03 | "Are there any high-impact USD events in the next 24h?" | `get_calendar` |
| p04 | "Summarise today's gold-relevant news and tell me what to watch." | `get_news` |
| p05 | "Show RSI divergence on GBPUSD 1H if any." | `get_indicators` |
| p06 | "Mark the previous day's high/low and Asian range on XAUUSD." | `annotate_chart` |
| p07 | "If price breaks 2380 on gold, what's the next liquidity above?" | `get_market_structure` |
| p08 | "Set an alert if EURUSD closes a 1H below 1.0820." | `set_alert` |
| p09 | "Journal: I shorted XAUUSD at 2392, SL 2398, TP 2378 — log it." | `log_journal` |
| p10 | "What did I trade last week and what was my win rate?" | `get_journal_stats` |
| p11 | "I'm thinking long EURUSD at 1.0850... Size me up and verify." | `compute_risk`, `verify_call` |
| p12 | "What's the dollar doing today and is gold tracking it?" | `get_intermarket` |
| p13 | "Expected range for XAUUSD over the next 8 hours?" | `forecast_volatility` |
| p14 | "How are my open trades doing right now?" | `compute_position_health` |
| p15 | "Has an EMA50/EMA200 cross with ATR stops actually worked on EURUSD 1H lately?" | `replay_setup` |

### Assertion Types

- **`expectedTools`** — the response must contain tool-call parts matching
  these tool names.
- **`forbiddenTools`** — must NOT contain these tool names.
- **`mustContainSubstrings`** — the final assistant text must include these
  strings.

### Report Output

The runner produces a markdown report with:
- Per-prompt: start time, duration, tokens, cost, invoked tools, pass/fail.
- Aggregate: pass rate, total cost, total tokens.
- Failure details: which assertion failed and why.

Output directory defaults to `docs/eval/`.

### SSE Stream Capture

`parse-stream.ts` parses the Vercel AI SDK SSE stream format (text deltas,
tool-call deltas, tool-result chunks, finish metadata) into structured
objects that the eval harness can assert against without dealing with
chunk-level parsing.

---

## Key Design Principles (Recap)

1. **Nothing blocks the chat.** Every external call (prices, DB, planner,
   title, telemetry) is try/catch-guarded.
2. **Atomic budget gate.** `INSERT ... ON CONFLICT DO UPDATE WHERE` —
   concurrent callers at 99% cap serialise correctly.
3. **AsyncLocalStorage for context.** `withToolContext()` → `getToolContext()`
   per tool invocation. No global state. Concurrent turns on the same warm
   instance are isolated.
4. **Plan-then-act.** Visible thinking step for analytical turns.
   Deterministic fallback always available.
5. **Citation enforcement.** Post-finish scan for unsupported claims.
   Soft warnings, not blocking errors.
6. **Tool telemetry.** Every tool invocation is timed and logged independently
   of the AI SDK's step lifecycle.
7. **Idempotent memories.** Briefings, journal entries, thread synopses —
   all upserted atomically, never duplicated.
8. **Regular eval.** 15 acceptance prompts with tool-trace assertions.
   Run before every deploy.