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

## Models

- Default chat: `google-vertex/gemini-2.5-flash` (or any gateway-routed slug, see `resolveModel` in `packages/ai/src/model.ts`).
- Titles / cheap calls: `google-vertex/gemini-2.5-flash-lite`.
- Embeddings: `openai/text-embedding-3-small` (1536-dim, matches the `news_embeddings` column).

Three transports are supported:

1. **Vercel AI Gateway** (`AI_GATEWAY_API_KEY`) — routes any prefixed model id (e.g. `openai/gpt-4.1`).
2. **Direct Google Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`) — pair with a `google/...` id; free tier.
3. **Direct Google Vertex** (`GOOGLE_VERTEX_PROJECT` + `GOOGLE_VERTEX_LOCATION` + `GOOGLE_APPLICATION_CREDENTIALS_JSON`) — pair with a `google-vertex/...` id; bills GCP, bypasses the gateway entirely.

The resolver in `packages/ai/src/model.ts` picks per-call by model id prefix. Never hit non-Google provider SDKs directly.

## System prompt

Source of truth: `packages/ai/src/prompts/system.md`. Edit there, not in TS strings.
