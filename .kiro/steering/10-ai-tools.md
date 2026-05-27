---
inclusion: fileMatch
fileMatchPattern: 'packages/ai/**'
---

# Steering: AI tools & agent

When working in `packages/ai/**`:

1. Tools are atomic. One responsibility per tool. Composite reasoning is the model's job.
2. Every tool defines:
   - Input zod schema in `@shared/schemas/...`
   - Output zod schema in `@shared/schemas/...`
   - A `description` that's a single, declarative sentence.
   - A matching React part in `apps/web/src/components/chat/parts/<name>.tsx`.
3. Tools never throw on data-source failure. They return `{ ok: false, error: { code, message } }` so the model can reason and explain.
4. Tools that mutate user data (`set_alert`, `log_journal`) take the `userId` from the **server context**, never from tool args.
5. Add an entry to `packages/ai/src/eval/cases.json` when adding a tool.
6. Never log full prompts in production. Use `LOG_PROMPTS=1` for short debugging windows only.

## Tools

Phase 1 atomic tools (one data source / mutation each):

- `get_price` · `get_candles` · `get_indicators` · `get_market_structure`
- `get_news` · `get_calendar`
- `set_alert` · `log_journal`

Phase 2 composite + RAG + visual tools:

- `search_knowledge` — pgvector cosine over `news_embeddings`; one embed call per invocation.
- `analyze_technical` — multi-timeframe trend + bias + momentum + structure + levels in one call.
- `analyze_fundamental` — currency-scoped calendar + news + sentiment buckets in one call.
- `get_journal_stats` — global stats + per-symbol + per-tag breakdowns.
- `annotate_chart` — emits the `OverlaySet` shape the chart UI consumes (markers + price lines).

Phase 3 multimodal + breadth tools:

- `analyze_chart_image` — vision: extracts symbol/tf/trend/levels + an optional `OverlaySet` from the most recent user-attached chart image.
- `get_correlation` — Pearson rolling correlation matrix over the 3 supported symbols + a 50/50 EUR/GBP geometric DXY proxy with 24h change.
- `get_cot` — CFTC Commitment-of-Traders weekly samples for the requested symbol; reads from `cot_reports` (populated by `/api/cron/cot`).
- `share_snapshot` — persists a `(title, body, overlay?)` row and returns a signed `/share/[id]?t=<token>` URL that bypasses the password gate.

Phase 7b risk + intermarket + memory tools:

- `compute_risk` — pure-function position sizing: size, $ risk/reward, RR, pips-to-stop/target.
- `get_session_levels` — Asia / London / NY OHLC + opening prints + `forming` flag for the current trading day.
- `get_intermarket` — DXY proxy + gold pulse + XAU↔DXY correlation + deterministic regime tag (`risk-on`/`risk-off`/`neutral`) + `regimeBreak` flag.
- `forecast_volatility` — ATR-based forward range with event multiplier when high-impact macro events land in the horizon window.
- `get_seasonality` — per-month / per-weekday / per-hour median + IQR + win-rate buckets.
- `compute_position_health` — joins open journal rows to live mid prices: pips P/L, R, distance to stop/target.
- `replay_setup` — closed-set rule replay (EMA cross / RSI threshold) with ATR-multiple or fixed-pip exits.
- `summarize_thread` — synopsis + 3 durable insights, optionally embedded into `memory_embeddings`.

Phase 7c verification tool:

- `verify_call` — re-checks (entry, stop, target) geometry and scans recent structure for nearest opposing liquidity. Emits caveats inline with `agree: false`; never blocks.

## Models (Phase 7a — domain-routed)

Per-turn model selection is handled by `routeTurn()` in `packages/ai/src/routing.ts`. Each chat turn picks one of:

- **Fundamental** (`AI_FUNDAMENTAL_MODEL`, default `google-vertex/gemini-2.5-pro`) — macro / news / "why" reasoning.
- **Technical** (`AI_TECHNICAL_MODEL`, default `google-vertex/gemini-2.5-flash`) — chart structure, indicators, levels, top-down reads.
- **Summary** (`AI_SUMMARY_MODEL`, default `google-vertex/gemini-2.5-flash`) — news / calendar / journal recap, lists.
- **Vision** (`AI_VISION_MODEL`, default `google-vertex/gemini-2.5-pro`) — image-attached turns.
- **Generic** fallback (`AI_DEFAULT_MODEL`, default `google-vertex/gemini-2.5-flash`).
- **Title** (`AI_TITLE_MODEL`, default `google-vertex/gemini-2.5-flash-lite`) — first-turn auto-title.
- **Embeddings** (`AI_EMBEDDING_MODEL`, default `openai/text-embedding-3-small`) — 1536-dim, used by `news_embeddings` and `memory_embeddings`.

The router writes a `routing_<domain>` row to `chat_telemetry` per turn so the choice is auditable on `/settings/usage` and `/settings/agent`.

Three transports are supported:

1. **Vercel AI Gateway** (`AI_GATEWAY_API_KEY`) — routes any prefixed model id (e.g. `openai/gpt-4.1`).
2. **Direct Google Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`) — pair with a `google/...` id; free tier.
3. **Direct Google Vertex** (`GOOGLE_VERTEX_PROJECT` + `GOOGLE_VERTEX_LOCATION` + `GOOGLE_APPLICATION_CREDENTIALS_JSON`) — pair with a `google-vertex/...` id; bills GCP, bypasses the gateway entirely.

The resolver in `packages/ai/src/model.ts` picks per-call by model id prefix. Never hit non-Google provider SDKs directly.

## Plan-then-act + verification (Phase 7c)

For analytical turns the agent runs `runPlanner()` BEFORE `streamText`. The planner emits JSON `{ steps[], expectedTools[], rationale }` on the cheap summary model and persists it as a sibling system message with a `data-plan` UI part. The chat surface renders it as a collapsible "Thinking" pill above the assistant's answer. Trivial turns skip the planner; failures fall back to a deterministic checklist.

Two verification layers:
- **`verify_call` tool** — the agent invokes it after naming a setup; emits geometry + opposing-liquidity caveats inline.
- **Citation enforcement** in `packages/ai/src/verification.ts` — post-finish heuristic that flags prices/events not backed by a tool call. Stance is `'soft'` — never blocks.

## Memory index (Phase 7b)

Two pgvector tables:
- **`news_embeddings`** — 1536-dim, populated by `/api/cron/news` and `/api/cron/embedding-backfill`.
- **`memory_embeddings`** — 1536-dim, with `kind` discriminator (`journal` / `briefing` / `thread_synopsis`). Populated by best-effort fire-and-forget upserts from journal CRUD, briefings cron, and the `summarize_thread` tool.

`search_knowledge` runs hybrid retrieval: dense cosine over `news_embeddings` PLUS Postgres FTS over `news_articles(title || summary)`, fused via reciprocal-rank fusion (RRF, k=60), then time-decayed via `exp(-ln2 · age / halflifeDays)`. Pass `kinds: ['news', 'journal', 'briefing', 'thread_synopsis']` to widen recall to the memory index.

## System prompt

Source of truth: `packages/ai/src/prompts/system.md`. Edit there, not in TS strings.
