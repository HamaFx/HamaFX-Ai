# Requirements Document

## Introduction

Phase 2 takes the feature-complete Phase 1 product and gives it the depth we deferred — RAG-grounded answers, composite analysis tools, journal stats, daily snapshots, Telegram alerts, voice input, briefings, weekly review, chart annotations, Finnhub candle fallback, and FRED actuals backfill — without breaking any of the project's hard rules: personal-mode (single user, single `APP_PASSWORD`, no `user_id`, no RLS), single Vercel deploy (no `apps/worker/`), schemas in `packages/shared/src/schemas` first, no `any`, no `enum`, no deep cross-package imports, supported symbols `XAUUSD | EURUSD | GBPUSD`. Phase 1 ended with the agent groundtruthed against 8 atomic tools (`get_price`, `get_candles`, `get_indicators`, `get_market_structure`, `get_news`, `get_calendar`, `set_alert`, `log_journal`); Phase 2 adds the composite, RAG, annotation, and stats tools the model needs to reason like the user does.

The work spans `packages/ai`, `packages/data`, `packages/db`, `packages/shared`, `apps/web`, `.github/workflows`, and `docs/`. Two additive DB migrations are needed (a `briefings` thread marker on `chat_threads`, an `actuals_filled_at` column on `economic_events`); everything else extends existing tables or is purely code.

Item out of scope: continuing Phase 3 (vision, CoT reports, sharable snapshots, web push). Phase 2 closes when the agent answers all 10 acceptance prompts using the new tools, the Telegram channel delivers a real alert, voice input works on mobile Chrome and iOS Safari, and the briefings + weekly review crons produce a written artifact each cycle.

## Glossary

- **System** — the HamaFX-Ai application as deployed on Vercel.
- **AI_Agent** — `packages/ai/src/agent.ts#runChat`, the per-turn entrypoint.
- **Tool** — a single AI tool registered in `packages/ai/src/tools/index.ts`.
- **Composite_Tool** — a tool whose `execute()` orchestrates other tools' adapters server-side; the model sees one summary instead of N round-trips.
- **RAG_Index** — the populated `news_embeddings` table with its HNSW cosine index.
- **Snapshot_Row** — one row in `snapshots` (`{ symbol, kind, asOf, data }`).
- **Briefing_Message** — one assistant `chat_messages` row in the dedicated `briefings` thread, persisted by a cron handler.
- **Briefings_Thread** — the single `chat_threads` row with `pinned_symbol = null`, `model_override = null`, and a `briefings = true` marker; the cron handlers always reuse this thread.
- **Telegram_Channel** — the `'telegram'` value of `AlertChannelSchema`; delivery uses the Bot API at `api.telegram.org`.
- **Voice_Input** — the chat composer extension that uses the Web Speech API (`SpeechRecognition`) to capture spoken input on mobile.
- **Auto_Journal** — the path that detects "Journal: I shorted X at Y …" in a user message and calls `log_journal` automatically before the model decides to.
- **Annotate_Chart_Tool** — `annotate_chart`, a new AI tool whose output is a typed `OverlaySet` the chart UI consumes through the existing `components/chart/overlays.ts` plumbing.
- **Snapshots_Cron** — `/api/cron/snapshots`, the cron endpoint that recomputes daily HLOC + pivots + ATR + key levels per symbol.
- **Briefings_Cron** — `/api/cron/briefings`, the cron endpoint that authors pre-event and post-event briefings into `Briefings_Thread`.
- **Weekly_Review_Cron** — `/api/cron/weekly-review`, runs Sunday and writes a journal-derived review into `Briefings_Thread`.
- **FRED_Backfill_Cron** — `/api/cron/fred-actuals`, fills `economic_events.actual` for events whose `actual` was null at ingestion time.
- **Cron_Secret_Header** — `Authorization: Bearer ${CRON_SECRET}` — the only authentication for `/api/cron/*` endpoints.
- **Daily_Budget_Guardrail** — the existing per-day token-spend cap from Phase 1 (`MAX_DAILY_USD`).

## Requirements

### Requirement 1: News RAG via `search_knowledge`

**User Story:** As the single user, I want the agent to ground macro answers in the news I've already ingested instead of speculating, so that "what's the gold-relevant news this week" returns sourced summaries with cosine-ranked citations.

#### Acceptance Criteria

1. THE System SHALL provide an AI tool `search_knowledge` registered in `packages/ai/src/tools/index.ts` whose input zod schema accepts `{ query: string, since?: number, symbol?: Symbol, limit?: number (1..10, default 5) }` and whose output schema returns `{ items: Array<{ id, title, source, publisher, publishedAt, sentiment, sentimentScore, similarity, summary, url }>, model: string, pipelinePending: boolean }`.
2. WHEN `search_knowledge` is invoked, THE System SHALL embed the query string using the same model id stored in `news_embeddings.model` for the candidate corpus, fail fast with `pipelinePending: true` and `items: []` if `news_embeddings` is empty.
3. THE System SHALL retrieve the top `limit` rows from `news_embeddings` ordered by cosine similarity, joined to `news_articles` for the displayed fields, and SHALL filter by `symbol` (any-of `news_articles.symbols`) and by `publishedAt >= since` when those inputs are supplied.
4. THE System SHALL include a `similarity` score in `[0, 1]` for each item where `1` is identical and `0` is orthogonal, derived from the pgvector cosine distance.
5. THE `search_knowledge` tool SHALL NOT cross the `Daily_Budget_Guardrail`; one embedding call is permitted per invocation.
6. THE System SHALL render each `search_knowledge` result in chat via a bespoke `Chat_Part_Renderer` at `apps/web/src/components/chat/parts/search-knowledge.tsx` that links each item to `/news?id=<id>` and shows the `similarity` as a percentage.
7. THE schema entries SHALL be added to `packages/shared/src/schemas/search-knowledge.ts` and re-exported from the package barrel before any consumer imports them.

### Requirement 2: Composite tool `analyze_technical`

**User Story:** As the single user, I want one call that produces a multi-timeframe technical readout (4H trend, 1H bias, 15M setup, key levels, RSI/MACD posture, structure tags) so that the agent doesn't have to issue eight tool calls for a top-down read.

#### Acceptance Criteria

1. THE System SHALL provide an AI tool `analyze_technical` whose input is `{ symbol: Symbol, timeframes?: Timeframe[] (default ['4h','1h','15m']) }` and whose output is `{ symbol, asOf, perTimeframe: Array<{ tf, trend: 'up' | 'down' | 'range', bias: 'bullish' | 'bearish' | 'neutral', momentum: { rsi14: number, macdHist: number }, structure: { swingHigh, swingLow, latestStructureEvent }, levels: { pivot, r1, s1, atr14 } }>, summary: string }`.
2. WHEN invoked, the tool SHALL fetch candles via the same adapter `get_candles` uses, compute indicators via the indicator registry, and compute structure via `@hamafx/indicators/smc/structure` — all inside `execute()` with a single failover plan.
3. IF any per-timeframe fetch fails, THE tool SHALL still return a partial result with that timeframe's entry omitted from `perTimeframe`, and SHALL include a one-line `summary` warning the user that data was incomplete.
4. THE System SHALL render `analyze_technical` results in chat via a bespoke `Chat_Part_Renderer` at `apps/web/src/components/chat/parts/analyze-technical.tsx` that lists each timeframe in a compact card with `.tabular-nums`, `text-bull`/`text-bear` for direction, and a "view chart" link to `/chart/<symbol>?tf=<tf>`.
5. THE per-timeframe `latestStructureEvent` SHALL be one of `'BOS_up' | 'BOS_down' | 'CHoCH_up' | 'CHoCH_down' | null` produced by the existing structure module.
6. THE System SHALL NOT introduce a second-pass LLM call inside the tool; the `summary` string is computed deterministically from the per-timeframe fields.
7. THE System SHALL add the input/output schemas to `packages/shared/src/schemas/analyze-technical.ts` and re-export from the barrel.

### Requirement 3: Composite tool `analyze_fundamental`

**User Story:** As the single user, I want one call that aggregates the next 24h of high-impact macro events for the symbol's currencies plus a sentiment-weighted news headline pull, so that "what's the fundamental backdrop on EURUSD?" returns a structured snapshot.

#### Acceptance Criteria

1. THE System SHALL provide an AI tool `analyze_fundamental` whose input is `{ symbol: Symbol, horizonHours?: number (1..168, default 24) }` and whose output is `{ symbol, currencies: Currency[], events: EconomicEvent[], headlines: ToolNewsItem[], sentiment: { positive: number, negative: number, neutral: number }, summary: string }`.
2. WHEN invoked, THE tool SHALL derive the `currencies` from the symbol (`USD` for `XAUUSD`; `EUR + USD` for `EURUSD`; `GBP + USD` for `GBPUSD`), filter `economic_events` by `currency IN currencies AND date BETWEEN now AND now + horizon AND importance IN ('medium','high')`, and pull the latest 5 news items per currency aggregated and de-duplicated by `id`.
3. THE `sentiment` distribution SHALL be the count of `positive`, `negative`, `neutral` items in `headlines` (no inference; bucket by `news_articles.sentiment`).
4. IF `economic_events` is empty, THE tool SHALL return `events: []` and set `summary` to call out the missing pipeline rather than silently dropping the section.
5. THE System SHALL render the result in chat via a bespoke `Chat_Part_Renderer` at `apps/web/src/components/chat/parts/analyze-fundamental.tsx` with a compact event list, a sentiment chip strip, and a deep link to `/calendar?symbol=<symbol>`.
6. THE `summary` string SHALL be deterministic (no LLM second pass) and explicitly cite the `from … to …` UTC window.

### Requirement 4: Journal stats tool `get_journal_stats`

**User Story:** As the single user, I want the agent to answer "what's my win rate this month, and what symbols am I best on?" without me leaving chat, so that journal insight is one prompt away.

#### Acceptance Criteria

1. THE System SHALL provide an AI tool `get_journal_stats` whose input is `{ sinceMs?: number, untilMs?: number, symbol?: Symbol, side?: TradeSide }` and whose output is `{ stats: JournalStats, bySymbol: Array<{ symbol, count, winRate, avgR }>, byTag: Array<{ tag, count, winRate, avgR }> }`.
2. THE tool SHALL reuse `computeStats` from `@hamafx/ai` for the global `stats` block, and SHALL compute per-symbol and per-tag breakdowns by grouping the same filtered set in the SQL layer.
3. IF the filtered set is empty, THE tool SHALL return `stats` with all-zero counts and empty `bySymbol`/`byTag` arrays, and SHALL NOT throw.
4. THE System SHALL render the result in chat via a bespoke `Chat_Part_Renderer` at `apps/web/src/components/chat/parts/get-journal-stats.tsx` showing the global stats card and a top-3 list per breakdown (linked to `/journal?symbol=<...>` / `/journal?tag=<...>`).
5. THE input schema SHALL be added to `packages/shared/src/schemas/get-journal-stats.ts` and re-exported from the barrel.

### Requirement 5: Chart annotations via `annotate_chart`

**User Story:** As the single user, I want the agent to drop SMC swings, BOS/CHoCH markers, FVG bands, OB levels, and liquidity sweeps onto the chart from chat — "mark the previous day's high/low and Asian range on XAUUSD" — so that I read intraday context visually instead of in prose.

#### Acceptance Criteria

1. THE System SHALL provide an AI tool `annotate_chart` whose input is `{ symbol: Symbol, tf: Timeframe, kinds: Array<'swings' | 'bos_choch' | 'fvg' | 'order_blocks' | 'liquidity' | 'pdh_pdl' | 'asian_range'>, lookback?: number (default 3), count?: number (default 300) }` and whose output is the typed `OverlaySet` shape already consumed by `apps/web/src/components/chart/chart.tsx` (`{ markers: MarkerPrimitive[], priceLines: PriceLinePrimitive[] }`).
2. THE tool SHALL compute `swings`, `bos_choch`, `fvg`, `order_blocks`, `liquidity` via `@hamafx/indicators/smc/*` and SHALL compute `pdh_pdl` (previous day's high/low) and `asian_range` (00:00–07:00 UTC range) deterministically from the candles fetch.
3. THE System SHALL render `annotate_chart` results in chat via a bespoke `Chat_Part_Renderer` at `apps/web/src/components/chat/parts/annotate-chart.tsx` that shows a summary header (counts per kind) plus a "Open in chart" deep link to `/chart/<symbol>?tf=<tf>&overlays=<kinds>`.
4. THE `/chart/<symbol>` page SHALL accept the `overlays` URL parameter (`nuqs`) and pre-toggle the matching overlay categories on first paint without a re-fetch.
5. THE `OverlaySet` returned by `annotate_chart` SHALL serialize cleanly through the AI SDK's tool-output JSON encoder; any non-serializable fields SHALL be stripped before return.

### Requirement 6: Snapshots cron + read API

**User Story:** As the single user, I want a precomputed daily snapshot (HLOC, pivots, ATR, key levels) per symbol so that the agent answers "what's the daily pivot on EURUSD" in one DB read instead of recomputing from candles every time.

#### Acceptance Criteria

1. THE System SHALL implement `/api/cron/snapshots` so that on each invocation it computes a `Snapshot_Row` for each supported symbol with `kind = 'daily'` and `asOf = previous UTC midnight`, and SHALL upsert (`ON CONFLICT (symbol, kind, asOf) DO UPDATE`) so re-runs are idempotent.
2. THE snapshot `data` JSON SHALL include `{ open, high, low, close, pivot, r1, r2, s1, s2, atr14, prevDayHigh, prevDayLow, asianRangeHigh, asianRangeLow }`.
3. THE cron handler SHALL validate `Authorization: Bearer ${CRON_SECRET}` and reject otherwise with HTTP 401.
4. THE System SHALL register the cron in `.github/workflows/cron-snapshots.yml` to fire once per day at `5 0 * * *` UTC.
5. THE System SHALL provide a server function `getLatestSnapshot(symbol, kind = 'daily'): Promise<SnapshotRow | null>` exported from `@hamafx/ai` (or a new `@hamafx/snapshots` if it grows) that the system prompt builder, chart UI, and `analyze_technical` can call.
6. WHEN the snapshots table is empty, every consumer SHALL fall back to the existing on-demand candle path silently — Phase 2 SHALL NOT introduce a hard dependency on snapshots.

### Requirement 7: Telegram alert delivery

**User Story:** As the single user, I want fired alerts pushed to Telegram so I get an instant mobile notification without needing to install web push or check email.

#### Acceptance Criteria

1. THE System SHALL implement Telegram delivery in `packages/ai/src/alerts/delivery.ts` so that the `'telegram'` channel POSTs to `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage` with `{ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'MarkdownV2' }`, and SHALL mark the alert fired only after a 2xx response (matching the Resend ordering rule from Requirement 7 of Phase 1).
2. IF `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is missing, THE delivery path SHALL return `{ ok: false, message: 'not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing)' }` and SHALL NOT throw.
3. THE delivery code SHALL escape user-controlled fields per Telegram's MarkdownV2 rules to prevent malformed messages.
4. THE Settings page at `/settings` SHALL include a "Send test Telegram message" control under the Notifications section that POSTs to a new admin endpoint `/api/admin/test-telegram` and renders one of three states (sent + message id, missing env names, error text) — mirroring the existing `Send test alert email` button.
5. THE `/api/admin/test-telegram` endpoint SHALL be gated by the existing password cookie middleware and SHALL recheck `requireSession()` defense-in-depth.
6. THE alerts evaluator SHALL try channels in the order they appear in `alert.channels`; falling through to the next channel on a non-2xx response from Telegram is permitted.

### Requirement 8: Voice input in chat

**User Story:** As the single user on a phone, I want to dictate prompts to chat so I can ask the agent without typing while watching the chart.

#### Acceptance Criteria

1. THE chat composer at `apps/web/src/components/chat/composer.tsx` SHALL render a microphone button at the input's right edge with a ≥ 44×44 tap target and a visible focus ring.
2. WHEN the microphone button is pressed, THE composer SHALL start a `SpeechRecognition` session (browser `webkitSpeechRecognition` or standard) configured for `interimResults: true`, `continuous: false`, language inferred from `navigator.language` and overridable via a small dropdown next to the button (defaulting to `en-US`).
3. WHILE a session is active, THE composer SHALL show interim results in the textarea live and SHALL display a recording indicator (pulsing red dot) on the microphone button.
4. WHEN the session ends, THE composer SHALL leave the final transcript in the textarea so the user can review or edit before submitting; submission SHALL NOT auto-fire.
5. IF the browser doesn't support `SpeechRecognition`, THE microphone button SHALL be hidden (no broken UI) and the textarea SHALL remain fully usable.
6. THE feature SHALL ship without server-side audio processing; all recognition happens in the browser.

### Requirement 9: Pre-event and post-event briefings

**User Story:** As the single user, I want a written briefing 30 minutes before each high-impact USD/EUR/GBP event and a recap 30 minutes after, dropped into a dedicated chat thread, so I have context without checking the calendar app.

#### Acceptance Criteria

1. THE System SHALL implement `/api/cron/briefings` so that on each invocation it (a) finds high-impact `economic_events` whose `date` is within ±2 minutes of `now + 30m` (pre-event) and emits a pre-event briefing, and (b) finds high-impact events whose `date` was within `[now - 32m, now - 28m]` and whose `actual` is non-null and emits a post-event briefing.
2. WHEN a briefing is emitted, THE handler SHALL append one assistant message to the `Briefings_Thread` (creating it if absent) with a generated summary that references symbol prices from `LIVE_SNAPSHOT`, the event title/forecast/actual, and the 5-minute prior price levels read from cached candles.
3. THE Briefings_Thread SHALL be marked by a new `is_briefings boolean` column on `chat_threads` (additive migration) so the UI can pin it at the top of the thread list.
4. THE handler SHALL be idempotent: a `briefings_event_index` table (or a unique index on `chat_messages.parts->>eventId`) SHALL prevent two pre-event or two post-event briefings firing for the same event.
5. THE handler SHALL use `AI_DEFAULT_MODEL` and respect `MAX_DAILY_USD` — when over budget, it SHALL skip the LLM call and append a deterministic short briefing instead.
6. THE cron SHALL be registered in `.github/workflows/cron-briefings.yml` at `*/5 * * * *` UTC.
7. THE handler SHALL bail out cleanly when `economic_events` is empty (returns `{ processed: 0, note: 'no events' }`).

### Requirement 10: Auto-fill journal from chat

**User Story:** As the single user, I want to type "Journal: I shorted XAUUSD at 2392, SL 2398, TP 2378 — log it" and have the trade saved without an extra round-trip to the agent, so journaling stays at conversational speed.

#### Acceptance Criteria

1. THE `/api/chat` route SHALL inspect each user turn for the prefix `^Journal:` (case-insensitive, optional whitespace) before calling the LLM, and on match SHALL parse the structured fields with a deterministic regex/parser into `{ side, symbol, entry, stop, target, notes }`.
2. WHEN the parser succeeds, THE route SHALL invoke the existing `createEntry` from `@hamafx/ai/journal/persistence` server-side, append a system message describing the saved entry to the thread, and continue to the LLM as normal so the assistant can confirm.
3. IF the parser fails (missing required fields), THE route SHALL leave the user message untouched and let the agent ask for the missing fields via the normal `log_journal` tool flow.
4. THE parser SHALL accept commas or spaces as separators and SHALL be tolerant of `SL`/`stop`/`stop loss`, `TP`/`target`/`take profit`, lowercase symbols, and "long"/"short"/"buy"/"sell" synonyms.
5. THE auto-fill path SHALL NOT bypass the daily-budget guardrail; it SHALL still flow through `enforceDailyBudget` because the LLM turn that follows still fires.

### Requirement 11: Weekly review

**User Story:** As the single user, I want a Sunday weekly review of my journal authored by the agent — wins, losses, average R, top setups, recurring mistakes — dropped into the briefings thread, so I have a written reflection without writing it myself.

#### Acceptance Criteria

1. THE System SHALL implement `/api/cron/weekly-review` so that on each invocation it computes `JournalStats` for the trailing 7 days, gathers the journal entries with non-null `outcome`, and emits one assistant message into the `Briefings_Thread` with: stats summary, top 3 winning trades, top 3 losing trades, observed patterns (most-traded symbol, most-tagged tag), and a 2-sentence reflection prompt for the user.
2. THE cron SHALL be registered in `.github/workflows/cron-weekly-review.yml` at `0 18 * * 0` UTC (Sunday 18:00 UTC).
3. WHEN the journal is empty, THE handler SHALL append a one-line message acknowledging zero trades and SHALL NOT call the LLM.
4. THE handler SHALL respect `MAX_DAILY_USD`: when over budget, it SHALL fall back to a deterministic stats-only message.
5. THE handler SHALL use the existing `Briefings_Thread`; no new thread is created.

### Requirement 12: Finnhub candle fallback

**User Story:** As the single user, I want intraday candles served from Finnhub when Twelve Data is rate-limited, with 4H synthesized from 1H, so that the chart and indicator tools don't go blank during quota outages.

#### Acceptance Criteria

1. THE System SHALL implement a Finnhub candle adapter at `packages/data/src/providers/finnhub/candles.ts` that maps the existing `Timeframe` union to Finnhub's `resolution` parameter, with 4H synthesized client-side from 1H candles (4-bar aggregation: first open, last close, max high, min low, summed volume).
2. THE candle failover order in `packages/data/src/failover.ts` SHALL be `[twelve-data, finnhub]` for 1m / 5m / 15m / 1h / 4h timeframes, falling back from Twelve Data on `PROVIDER_QUOTA_EXCEEDED`, `PROVIDER_RATE_LIMITED`, or `PROVIDER_UNAVAILABLE`.
3. THE Finnhub fallback SHALL respect the existing cache TTL policy from `packages/data/src/cache/ttl.ts`; cached results SHALL be keyed by provider so a Twelve Data hit doesn't return a Finnhub-shaped row.
4. WHEN both providers fail, THE adapter SHALL throw `PROVIDER_UNAVAILABLE` with the underlying error chain so the route handler returns 503 with details.
5. THE Finnhub adapter SHALL be unit-tested at the map layer (`packages/data/test/finnhub-candles-map.test.ts`) with at least one fixture covering 1H → 4H synthesis.

### Requirement 13: FRED actuals backfill

**User Story:** As the single user, I want yesterday's macro actuals filled in automatically (CPI, NFP, unemployment, etc.) so the calendar and `analyze_fundamental` show the actual outcome instead of `null`.

#### Acceptance Criteria

1. THE System SHALL implement `/api/cron/fred-actuals` so that on each invocation it queries `economic_events` for rows where `source = 'fred'` AND `actual IS NULL` AND `date < now`, calls FRED's `/fred/series/observations` for each unique series id, and patches `actual` (and `actuals_filled_at`) where a matching observation exists.
2. THE migration SHALL add `actuals_filled_at timestamp with time zone` to `economic_events` (additive, nullable).
3. THE cron handler SHALL use the existing `withCronAuth` helper for `Authorization: Bearer ${CRON_SECRET}` validation.
4. THE System SHALL register the cron in `.github/workflows/cron-fred-actuals.yml` at `30 1 * * *` UTC.
5. WHEN FRED returns no observation for an event id, THE handler SHALL leave `actual` as `null` and move on; it SHALL NOT throw.
6. THE handler SHALL be idempotent: re-running on the same day SHALL update `actuals_filled_at` only if the row was previously `null`.

### Requirement 14: Roadmap, deployed-state, and steering doc updates

**User Story:** As another agent picking up the repo after Phase 2, I want the docs to reflect what shipped so I don't re-do work or break a hard rule by mistake.

#### Acceptance Criteria

1. `docs/10-roadmap.md` SHALL move every checked Phase 2 box to ✅ and SHALL update Phase 3's "Next" header to reflect what remains.
2. `docs/09a-phase-0-deployed-state.md` SHALL gain a "Phase 2" subsection listing the new env vars (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), the new cron workflows, and the migrations applied.
3. `docs/04-features.md` SHALL flip the catalog symbols for the items shipped (`F-08`, `F-09`, `X-06`, etc.) to "shipped".
4. `.kiro/steering/10-ai-tools.md` SHALL list the new tools (`search_knowledge`, `analyze_technical`, `analyze_fundamental`, `get_journal_stats`, `annotate_chart`) under "Tools" so future agents see the complete registry.
5. `.kiro/steering/00-project.md` SHALL stay unchanged — the hard rules don't move.
6. WHEN any Phase 2 commit changes behaviour, the matching doc SHALL be updated in the same PR.
