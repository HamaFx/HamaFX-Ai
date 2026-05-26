# Implementation Plan: Phase 2

## Overview

Convert the design into incremental code changes a coding agent can execute end-to-end. Ordering follows the dependency graph in `design.md`: DB migration first, then `@hamafx/shared` schemas, then library code in `packages/ai` and `packages/data`, then UI consumers in `apps/web`, then GitHub Actions workflows, finally docs. Each task references the requirement clauses it fulfils for traceability.

The hard rules from `00-project.md` and `14-ai-agent-handoff.md` apply: personal-mode (single user, single `APP_PASSWORD`, no `user_id`, no RLS), single Vercel deploy (no `apps/worker/`), schemas before code, no `any`, no `enum`, alias-only cross-package imports, supported symbols `XAUUSD | EURUSD | GBPUSD`. TypeScript throughout.

Tasks marked with `*` are optional (tests). Core implementation tasks are never optional.

## Tasks

- [ ] 1. T1 — DB migration `0002_phase_2.sql`
  - Two additive ALTERs plus one new `briefings_emitted` table. No behaviour change yet — downstream code switches over in subsequent tasks.
  - [ ] 1.1 Add `is_briefings boolean not null default false` to `chat_threads`
    - Update `packages/db/src/schema/chat.ts` with the new column.
    - Update the inferred `ChatThread` type export.
    - _Requirements: 9.3_
    - Files: `packages/db/src/schema/chat.ts`
  - [ ] 1.2 Add `actuals_filled_at timestamp with time zone` to `economic_events`
    - Update `packages/db/src/schema/calendar.ts`.
    - _Requirements: 13.2_
    - Files: `packages/db/src/schema/calendar.ts`
  - [ ] 1.3 Add `briefings_emitted` lookup table
    - Create `packages/db/src/schema/briefings.ts` per design §"Migration".
    - Composite primary key `(event_id, kind)`. FK from `message_id` to `chat_messages.id` with `ON DELETE CASCADE`.
    - Re-export from `packages/db/src/schema/index.ts`.
    - _Requirements: 9.4_
    - Files: `packages/db/src/schema/briefings.ts`, `packages/db/src/schema/index.ts`
  - [ ] 1.4 Generate and commit migration `0002_phase_2.sql`
    - Run `pnpm --filter @hamafx/db drizzle:generate`. If the auto-generated SQL diverges from the design's statements, hand-write the migration containing exactly the two `ALTER TABLE … ADD COLUMN` statements plus the `CREATE TABLE` and update the journal.
    - Verify against a fresh local Postgres + on Supabase preview that the migration applies cleanly and is idempotent on re-run.
    - _Requirements: 9.4, 13.2_
    - Files: `packages/db/drizzle/0002_phase_2.sql`, `packages/db/drizzle/meta/_journal.json`

- [ ] 2. T2 — `@hamafx/shared` schemas (5 new files + barrel exports)
  - Define every schema before any consumer imports it. Each schema goes in its own file following the existing per-tool convention; `tool-io.ts` declaration-merging makes `ToolOutput<'<name>'>` resolve to the right type.
  - [ ] 2.1 `search-knowledge.ts`
    - Add `SearchKnowledgeInputSchema`, `SearchKnowledgeItemSchema`, `SearchKnowledgeOutputSchema` per design §"Schema additions".
    - Wire into `tool-io.ts` so `ToolOutput<'search_knowledge'>` resolves to the inferred output type.
    - Re-export from `packages/shared/src/index.ts`.
    - _Requirements: 1.1, 1.7_
    - Files: `packages/shared/src/schemas/search-knowledge.ts`, `packages/shared/src/ai/tool-io.ts`, `packages/shared/src/index.ts`
  - [ ] 2.2 `analyze-technical.ts`
    - Add `AnalyzeTechnicalInputSchema`, `PerTimeframeReadingSchema`, `AnalyzeTechnicalOutputSchema`. Wire `tool-io.ts`. Re-export.
    - _Requirements: 2.1, 2.7_
    - Files: `packages/shared/src/schemas/analyze-technical.ts`, `packages/shared/src/ai/tool-io.ts`, `packages/shared/src/index.ts`
  - [ ] 2.3 `analyze-fundamental.ts`
    - Add `AnalyzeFundamentalInputSchema`, `AnalyzeFundamentalOutputSchema`. Wire `tool-io.ts`. Re-export.
    - _Requirements: 3.1_
    - Files: `packages/shared/src/schemas/analyze-fundamental.ts`, `packages/shared/src/ai/tool-io.ts`, `packages/shared/src/index.ts`
  - [ ] 2.4 `get-journal-stats.ts`
    - Add `GetJournalStatsInputSchema`, `StatBreakdownSchema`, `GetJournalStatsOutputSchema`. Wire `tool-io.ts`. Re-export.
    - _Requirements: 4.1, 4.5_
    - Files: `packages/shared/src/schemas/get-journal-stats.ts`, `packages/shared/src/ai/tool-io.ts`, `packages/shared/src/index.ts`
  - [ ] 2.5 `annotate-chart.ts`
    - Add `AnnotateChartKindSchema`, `AnnotateChartInputSchema`, `ChartMarkerSchema`, `ChartPriceLineSchema`, `AnnotateChartOutputSchema`. Wire `tool-io.ts`. Re-export.
    - **Important:** the chart consumer in `apps/web/src/components/chart/overlays.ts` should import these primitive types from `@hamafx/shared` (via aliased path) once the schemas land — refactor in T11.4.
    - _Requirements: 5.1, 5.5_
    - Files: `packages/shared/src/schemas/annotate-chart.ts`, `packages/shared/src/ai/tool-io.ts`, `packages/shared/src/index.ts`
  - [ ] 2.6 `briefings.ts` (briefing message envelope)
    - Add `BriefingKindSchema = z.union([z.literal('pre'), z.literal('post'), z.literal('weekly_review')])`.
    - Add `BriefingMessagePartSchema` describing the shape of the `parts` JSON written into `chat_messages` for a briefing message — at minimum `{ type: 'briefing', eventId: string | null, kind: BriefingKind, summary: string }`.
    - Re-export from barrel.
    - _Requirements: 9.2, 9.4, 11.1_
    - Files: `packages/shared/src/schemas/briefings.ts`, `packages/shared/src/index.ts`
  - [ ]* 2.7 Fixture-parse tests for every new schema
    - Positive case + at least one negative case per schema in `packages/shared/test/schemas.test.ts` following the Phase 1 pattern.
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 9.2_
    - Files: `packages/shared/test/schemas.test.ts`

- [ ] 3. T3 — `search_knowledge` tool + RAG SQL
  - Implements Requirement 1 end-to-end: tool, the SQL helper, and the bespoke chat part.
  - [ ] 3.1 SQL helper `runRagQuery`
    - Add `runRagQuery(args: { embedding: number[], limit: number, since?: number, symbol?: Symbol }): Promise<RagRow[]>` to `packages/ai/src/embeddings.ts` (or a new `packages/ai/src/rag.ts` if it grows).
    - Implementation per design §"SQL (`runRagQuery`)" — uses `<=>` cosine distance, joins to `news_articles`.
    - Add `countEmbeddings(): Promise<number>` to gate the empty-pipeline fast path.
    - _Requirements: 1.2, 1.3, 1.4_
    - Files: `packages/ai/src/rag.ts`
  - [ ] 3.2 Tool body `search-knowledge.ts`
    - Implement `searchKnowledgeTool` per design §1.
    - When `countEmbeddings() === 0`, return `{ items: [], model: defaultEmbeddingModel(), pipelinePending: true }` without calling `embedTexts`.
    - Otherwise embed the query (one embed call per invocation — Requirement 1.5), call `runRagQuery`, map rows to `SearchKnowledgeItem`.
    - Register in `packages/ai/src/tools/index.ts`.
    - _Requirements: 1.1, 1.2, 1.5_
    - Files: `packages/ai/src/tools/search-knowledge.ts`, `packages/ai/src/tools/index.ts`
  - [ ] 3.3 Bespoke chat part
    - Server component at `apps/web/src/components/chat/parts/search-knowledge.tsx`.
    - Mirror `get-news.tsx` layout; add a `{Math.round(similarity * 100)}% match` pill on each row's right edge.
    - Deep link to `/news?id=<id>`.
    - Add to `parts/registry.tsx`.
    - _Requirements: 1.6_
    - Files: `apps/web/src/components/chat/parts/search-knowledge.tsx`, `apps/web/src/components/chat/parts/registry.tsx`
  - [ ]* 3.4 Unit test for `search_knowledge`
    - Mock `countEmbeddings` and `embedTexts` and `runRagQuery`.
    - Assert: empty-pipeline fast path returns `pipelinePending: true` without an embed call. Populated path returns items with `similarity` in `[0, 1]`.
    - _Requirements: 1.2, 1.4, 1.5_
    - Files: `packages/ai/test/search-knowledge.test.ts`

- [ ] 4. T4 — `analyze_technical` tool
  - Implements Requirement 2.
  - [ ] 4.1 `projectReading()` + `deterministicSummary()` helpers
    - Pure functions in `packages/ai/src/tools/analyze-technical.ts` that collapse indicator/structure outputs to the typed `PerTimeframeReading` and template the summary string.
    - _Requirements: 2.1, 2.5, 2.6_
    - Files: `packages/ai/src/tools/analyze-technical.ts`
  - [ ] 4.2 Tool body
    - `readOneTimeframe()` orchestrator + `analyzeTechnicalTool` per design §2. Failover-tolerant — wrap the per-tf fetch in try/catch and drop failing tfs from `perTimeframe`, set `partial: true`.
    - Register in `tools/index.ts`.
    - _Requirements: 2.2, 2.3_
    - Files: `packages/ai/src/tools/analyze-technical.ts`, `packages/ai/src/tools/index.ts`
  - [ ] 4.3 Bespoke chat part
    - Server component at `apps/web/src/components/chat/parts/analyze-technical.tsx`.
    - Compact card per timeframe with `.tabular-nums`, `text-bull`/`text-bear` for direction; "view chart" link.
    - Add to `parts/registry.tsx`.
    - _Requirements: 2.4_
    - Files: `apps/web/src/components/chat/parts/analyze-technical.tsx`, `apps/web/src/components/chat/parts/registry.tsx`
  - [ ]* 4.4 Unit test for `analyze_technical`
    - Use a deterministic candle fixture; mock `getCandles`. Assert: full timeframes pass through; one fetch failure → that tf dropped + `partial: true`; summary string format matches the template.
    - _Requirements: 2.2, 2.3, 2.6_
    - Files: `packages/ai/test/analyze-technical.test.ts`

- [ ] 5. T5 — `analyze_fundamental` tool
  - Implements Requirement 3.
  - [ ] 5.1 Currency mapping + window math
    - Add `CURRENCIES_BY_SYMBOL` const (per design §3) and `eventsInWindow` query helper.
    - _Requirements: 3.2_
    - Files: `packages/ai/src/tools/analyze-fundamental.ts`
  - [ ] 5.2 Tool body
    - Implement `analyzeFundamentalTool` per design §3. Three queries: events, news, sentiment counts. Templated `summary`.
    - Set `pipelinePending: true` only when both `events` and `headlines` are empty.
    - Register in `tools/index.ts`.
    - _Requirements: 3.1, 3.4, 3.6_
    - Files: `packages/ai/src/tools/analyze-fundamental.ts`, `packages/ai/src/tools/index.ts`
  - [ ] 5.3 Bespoke chat part
    - Server component at `apps/web/src/components/chat/parts/analyze-fundamental.tsx`.
    - Event list + sentiment chip strip + deep link to `/calendar?symbol=<symbol>`.
    - Add to `parts/registry.tsx`.
    - _Requirements: 3.5_
    - Files: `apps/web/src/components/chat/parts/analyze-fundamental.tsx`, `apps/web/src/components/chat/parts/registry.tsx`
  - [ ]* 5.4 Unit test for `analyze_fundamental`
    - Mock the DB calls. Assert sentiment bucket counts match input headlines, `pipelinePending` true iff both event+headlines arrays empty.
    - _Requirements: 3.3, 3.4_
    - Files: `packages/ai/test/analyze-fundamental.test.ts`

- [ ] 6. T6 — `get_journal_stats` tool
  - Implements Requirement 4.
  - [ ] 6.1 Per-symbol and per-tag SQL helpers
    - `breakdownBySymbol(filters)` and `breakdownByTag(filters)` in `packages/ai/src/journal/persistence.ts` per design §4.
    - _Requirements: 4.2_
    - Files: `packages/ai/src/journal/persistence.ts`
  - [ ] 6.2 Tool body
    - Implement `getJournalStatsTool` calling `computeStats` + the two breakdown helpers. Empty filters → empty arrays + zero stats; never throw.
    - Register in `tools/index.ts`.
    - _Requirements: 4.1, 4.3_
    - Files: `packages/ai/src/tools/get-journal-stats.ts`, `packages/ai/src/tools/index.ts`
  - [ ] 6.3 Bespoke chat part
    - Server component at `apps/web/src/components/chat/parts/get-journal-stats.tsx`.
    - Global stats card + top-3 list per breakdown (linked to `/journal?symbol=<...>` / `/journal?tag=<...>`).
    - Add to `parts/registry.tsx`.
    - _Requirements: 4.4_
    - Files: `apps/web/src/components/chat/parts/get-journal-stats.tsx`, `apps/web/src/components/chat/parts/registry.tsx`
  - [ ]* 6.4 Unit test for `get_journal_stats`
    - Insert a small journal fixture. Assert `bySymbol` ordering by count, win-rate math, empty-filter behaviour.
    - _Requirements: 4.2, 4.3_
    - Files: `packages/ai/test/get-journal-stats.test.ts`

- [ ] 7. T7 — `annotate_chart` tool + chart URL state
  - Implements Requirement 5.
  - [ ] 7.1 Move overlay primitive types to `@hamafx/shared`
    - Re-export `MarkerPrimitive` and `PriceLinePrimitive` from `packages/shared/src/schemas/annotate-chart.ts` (already added in T2.5).
    - Refactor `apps/web/src/components/chart/overlays.ts` to import them from `@hamafx/shared`.
    - _Requirements: 5.1, 5.5_
    - Files: `apps/web/src/components/chart/overlays.ts`
  - [ ] 7.2 SMC compute helpers usable from the AI package
    - Confirm `@hamafx/indicators/smc/{swings,structure,fvg,order-blocks,liquidity}` already export pure functions; if not, add a re-export from the package barrel so `packages/ai` can call them via aliased import.
    - Add `computePdhPdl(candles)` and `computeAsianRange(candles)` to `@hamafx/indicators/smc/`.
    - _Requirements: 5.2_
    - Files: `packages/indicators/src/smc/pdh-pdl.ts`, `packages/indicators/src/smc/asian-range.ts`, `packages/indicators/src/index.ts`
  - [ ] 7.3 Tool body
    - Implement `annotateChartTool` per design §5. Compute requested kinds in parallel; collapse buckets to `markers` + `priceLines`. `countsByKind` accumulator for the summary header.
    - Register in `tools/index.ts`.
    - _Requirements: 5.1, 5.2_
    - Files: `packages/ai/src/tools/annotate-chart.ts`, `packages/ai/src/tools/index.ts`
  - [ ] 7.4 Bespoke chat part
    - Server component at `apps/web/src/components/chat/parts/annotate-chart.tsx`.
    - Header line shows counts per kind; primary CTA is a deep link to `/chart/<symbol>?tf=<tf>&overlays=<comma-list>`.
    - Add to `parts/registry.tsx`.
    - _Requirements: 5.3_
    - Files: `apps/web/src/components/chat/parts/annotate-chart.tsx`, `apps/web/src/components/chat/parts/registry.tsx`
  - [ ] 7.5 `?overlays=` URL state on the chart route
    - Wire `useQueryState('overlays', parseAsArrayOf(parseAsString))` into the chart page so overlays toggle on first paint without a refetch.
    - _Requirements: 5.4_
    - Files: `apps/web/src/app/(app)/chart/[symbol]/page.tsx`, `apps/web/src/app/(app)/chart/[symbol]/_components/*` (overlay-toggle, if present)
  - [ ]* 7.6 Unit test for `annotate_chart`
    - Hand-crafted candle fixture; assert at least one marker per requested kind when the kind is present in the fixture; counts match.
    - _Requirements: 5.2_
    - Files: `packages/ai/test/annotate-chart.test.ts`

- [ ] 8. Checkpoint — Phase 2 tools complete
  - Run `pnpm typecheck` and `pnpm test` and confirm all green. Run a manual chat session against local dev hitting each new tool to confirm the bespoke parts render. Stop and ask the user if any tool's UX is rough before moving to crons + telegram.

- [ ] 9. T8 — Snapshots cron + read API
  - Implements Requirement 6.
  - [ ] 9.1 `computeDailySnapshot` pure function
    - In `packages/ai/src/snapshots/compute.ts`. Inputs: candles + `asOf`. Outputs: the JSON described in Requirement 6.2.
    - _Requirements: 6.2_
    - Files: `packages/ai/src/snapshots/compute.ts`
  - [ ] 9.2 `upsertSnapshot` + `getLatestSnapshot`
    - In `packages/ai/src/snapshots/persistence.ts`. ON CONFLICT DO UPDATE on `(symbol, kind, asOf)`. `getLatestSnapshot` is a one-row select.
    - Re-export from `packages/ai/src/index.ts`.
    - _Requirements: 6.1, 6.5_
    - Files: `packages/ai/src/snapshots/persistence.ts`, `packages/ai/src/index.ts`
  - [ ] 9.3 Replace the cron stub
    - Replace `apps/web/src/app/api/cron/snapshots/route.ts` body per design §6.
    - _Requirements: 6.1, 6.3_
    - Files: `apps/web/src/app/api/cron/snapshots/route.ts`
  - [ ] 9.4 Wire into `analyze_technical`, chart UI, and system prompt
    - When `getLatestSnapshot('XAUUSD','daily')` returns a row, prefer those levels in `analyze_technical`'s `levels` block. Same for the chart-page fallback panel and the LIVE_SNAPSHOT block in the system prompt.
    - When the snapshot table is empty, callers SHALL fall back to on-demand computation silently.
    - _Requirements: 6.5, 6.6_
    - Files: `packages/ai/src/tools/analyze-technical.ts`, `packages/ai/src/prompt/system.ts`, `apps/web/src/app/(app)/chart/[symbol]/page.tsx`
  - [ ]* 9.5 Golden-test for `computeDailySnapshot`
    - Hand-rolled 24-bar 1H fixture for one UTC day. Pre-computed expected pivot/r1/s1/atr14 values.
    - _Requirements: 6.2_
    - Files: `packages/ai/test/snapshots-compute.test.ts`

- [ ] 10. T9 — Telegram alert delivery + admin tester
  - Implements Requirement 7.
  - [ ] 10.1 Implement `deliverTelegram` in `delivery.ts`
    - Per design §7. `markFired` ONLY after Resend-style 2xx ordering. MarkdownV2 escaping helper.
    - Replace the existing `'telegram delivery deferred to Phase 2'` stub.
    - _Requirements: 7.1, 7.3, 7.6_
    - Files: `packages/ai/src/alerts/delivery.ts`
  - [ ] 10.2 `/api/admin/test-telegram` route
    - Near-clone of the existing `/api/admin/test-alert-email` route. 401 on no-session; 503 with `{ missing: string[] }` on missing env; 502 on Telegram non-2xx; 200 with `{ id }` on success.
    - _Requirements: 7.4, 7.5_
    - Files: `apps/web/src/app/api/admin/test-telegram/route.ts`
  - [ ] 10.3 Settings UI button
    - `'use client'` `TestTelegramButton` near-clone of `TestEmailButton`. Mount under the Notifications section in `apps/web/src/app/(app)/settings/page.tsx`.
    - _Requirements: 7.4_
    - Files: `apps/web/src/app/(app)/settings/_components/test-telegram-button.tsx`, `apps/web/src/app/(app)/settings/page.tsx`
  - [ ]* 10.4 Unit test for telegram delivery + tester route
    - Mock `fetch`. 200 → `markFired` called once. 500 → `markFired` NOT called and error logged with status. 503 from the tester route lists missing names without leaking values.
    - _Requirements: 7.1, 7.3, 7.4_
    - Files: `packages/ai/test/alerts-telegram.test.ts`, `apps/web/src/app/api/admin/test-telegram/__tests__/route.test.ts`

- [ ] 11. T10 — Voice input in chat composer
  - Implements Requirement 8.
  - [ ] 11.1 `useVoiceInput` hook
    - In `apps/web/src/hooks/use-voice-input.ts`. Per design §8.
    - _Requirements: 8.2, 8.3, 8.5, 8.6_
    - Files: `apps/web/src/hooks/use-voice-input.ts`
  - [ ] 11.2 Microphone button + language dropdown in composer
    - Modify `apps/web/src/components/chat/composer.tsx` to render the mic button (44×44 tap target, focus ring, pulsing-red recording indicator) and a small language dropdown (Eng / Ar) defaulting from `navigator.language`.
    - Hide the button when `!supported` (no broken UI).
    - _Requirements: 8.1, 8.4, 8.5_
    - Files: `apps/web/src/components/chat/composer.tsx`

- [ ] 12. Checkpoint — Cron + Telegram + voice in
  - Run `pnpm typecheck` and `pnpm test`. Smoke-test `/api/admin/test-telegram` against the deploy with the env vars set. Verify voice input on mobile Chrome and iOS Safari per the manual checklist below. Stop and confirm UX before adding briefings.

- [ ] 13. T11 — Briefings cron + Briefings_Thread + idempotency
  - Implements Requirement 9.
  - [ ] 13.1 `Briefings_Thread` lookup helper
    - `getOrCreateBriefingsThread()` in `packages/ai/src/briefings/persistence.ts`. Selects the single row where `is_briefings = true`; creates one if absent (then sets the column).
    - _Requirements: 9.3_
    - Files: `packages/ai/src/briefings/persistence.ts`
  - [ ] 13.2 `briefings_emitted` upsert helpers
    - `wasEmitted(eventId, kind): Promise<boolean>` and `recordEmitted(eventId, kind, messageId): Promise<void>`.
    - _Requirements: 9.4_
    - Files: `packages/ai/src/briefings/persistence.ts`
  - [ ] 13.3 `emitPreEvent` + `emitPostEvent` generators
    - In `packages/ai/src/briefings/generate.ts`. Per design §"Briefings cron" — LLM-authored when budget allows, deterministic fallback otherwise. Both functions are idempotent via `wasEmitted`.
    - _Requirements: 9.1, 9.2, 9.5, 9.7_
    - Files: `packages/ai/src/briefings/generate.ts`
  - [ ] 13.4 `/api/cron/briefings` route
    - Window math: pre-event candidates = events with `date` ∈ [now+28m, now+32m]; post-event candidates = events with `date` ∈ [now-32m, now-28m] AND `actual IS NOT NULL`. Iterate, call `emitPreEvent` / `emitPostEvent`. Return `{ processed, emitted }`.
    - Validate `Authorization: Bearer ${CRON_SECRET}` via `withCronAuth`.
    - _Requirements: 9.1, 9.6_
    - Files: `apps/web/src/app/api/cron/briefings/route.ts`
  - [ ] 13.5 Sidebar pin for `Briefings_Thread`
    - Modify the chat thread list query to surface `is_briefings` and pin the briefings thread to the top of the list.
    - Render a small "📅 Briefings" badge next to its title.
    - _Requirements: 9.3_
    - Files: `apps/web/src/app/api/chat/threads/route.ts`, `apps/web/src/app/(app)/chat/page.tsx` (and any thread list component)
  - [ ]* 13.6 Idempotency test
    - Insert one event. Call `emitPreEvent(eventId)` twice. Assert exactly one row in `briefings_emitted` and one assistant message in `chat_messages`.
    - _Requirements: 9.4_
    - Files: `packages/ai/test/briefings.test.ts`

- [ ] 14. T12 — Auto-Journal parser
  - Implements Requirement 10.
  - [ ] 14.1 Parser
    - Pure function `parseJournalShortcut(text: string): { side, symbol, entry, stop, target } | null` in `packages/ai/src/journal/auto-parse.ts`.
    - Tolerant per Requirement 10.4 (long/short/buy/sell, SL/stop/stop loss, TP/target/take profit, comma/space separators, lowercase symbols).
    - _Requirements: 10.1, 10.4_
    - Files: `packages/ai/src/journal/auto-parse.ts`
  - [ ] 14.2 Wire into `/api/chat`
    - Before calling `runChat`, run the parser on the latest user message text. On success: call `createEntry()`, append a system message recapping the saved entry to the thread, then proceed to the LLM as normal.
    - Failure: untouched, normal LLM flow.
    - _Requirements: 10.2, 10.3, 10.5_
    - Files: `apps/web/src/app/api/chat/route.ts`
  - [ ]* 14.3 Property test for the parser
    - Use `fast-check` with arbitraries for side word, symbol, entry/stop/target prices. For any valid combination, assert `parseJournalShortcut(rendered).{side,symbol,entry,stop,target}` round-trips.
    - _Requirements: 10.1, 10.4_
    - Files: `packages/ai/test/auto-journal-parser.test.ts`

- [ ] 15. T13 — Weekly review cron
  - Implements Requirement 11.
  - [ ] 15.1 `emitWeeklyReview` generator
    - In `packages/ai/src/briefings/generate.ts`. Computes 7-day stats, top 3 win + top 3 loss entries, aggregates patterns. LLM-authored when budget allows; deterministic stats-only message otherwise. Empty journal → one-line message, no LLM call.
    - _Requirements: 11.1, 11.3, 11.4_
    - Files: `packages/ai/src/briefings/generate.ts`
  - [ ] 15.2 `/api/cron/weekly-review` route
    - Calls `emitWeeklyReview()`. `withCronAuth`. Returns `{ ok, messageId? }`.
    - _Requirements: 11.1, 11.5_
    - Files: `apps/web/src/app/api/cron/weekly-review/route.ts`

- [ ] 16. Checkpoint — Briefings + auto-journal + weekly review live
  - Run `pnpm typecheck` and `pnpm test`. Trigger `/api/cron/briefings` manually with `workflow_dispatch`. Inspect the resulting briefing message in `Briefings_Thread`. Stop and confirm tone/format before moving to data-layer fallbacks.

- [ ] 17. T14 — Finnhub candle fallback
  - Implements Requirement 12.
  - [ ] 17.1 Finnhub candle adapter
    - `packages/data/src/providers/finnhub/candles.ts` per design §10. Map `Timeframe` → Finnhub `resolution`. `synth4HFrom1H` aggregator.
    - Throw `ProviderError('finnhub', 'PROVIDER_UNAVAILABLE', ...)` on non-2xx.
    - _Requirements: 12.1, 12.4_
    - Files: `packages/data/src/providers/finnhub/candles.ts`
  - [ ] 17.2 Failover plan
    - Update `packages/data/src/failover.ts` so the candle plan is `[twelve-data, finnhub]` for 1m/5m/15m/1h/4h. Fall back on `PROVIDER_QUOTA_EXCEEDED`, `PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`.
    - _Requirements: 12.2_
    - Files: `packages/data/src/failover.ts`
  - [ ] 17.3 Cache-key isolation
    - Confirm `packages/data/src/cache/keys.ts` already prefixes by provider. If not, prefix it. (Bug if not: a Twelve Data hit could shadow a Finnhub-shaped row.)
    - _Requirements: 12.3_
    - Files: `packages/data/src/cache/keys.ts`
  - [ ]* 17.4 4H synth golden test
    - 16-bar 1H fixture → 4 expected 4H bars. Assert open/close/max/min math.
    - _Requirements: 12.5_
    - Files: `packages/data/test/finnhub-candles-map.test.ts`

- [ ] 18. T15 — FRED actuals backfill
  - Implements Requirement 13.
  - [ ] 18.1 FRED observation REST helper
    - `getFredObservation(seriesId, date)` in `packages/data/src/providers/fred/rest.ts`. Wraps `/fred/series/observations?series_id=...&observation_start=...&observation_end=...`. Returns `{ value: number } | null`.
    - _Requirements: 13.1_
    - Files: `packages/data/src/providers/fred/rest.ts`
  - [ ] 18.2 Calendar persistence helpers
    - `listFredEventsMissingActual({ until })` and `patchEventActual(id, value, filledAt)` in `packages/ai/src/calendar-persistence.ts`. Idempotent (`actuals_filled_at` only set when previously null).
    - _Requirements: 13.6_
    - Files: `packages/ai/src/calendar-persistence.ts`
  - [ ] 18.3 Cron route
    - `/api/cron/fred-actuals/route.ts` per design §11. `withCronAuth`. Loop, look up observation per event series id, patch when found.
    - _Requirements: 13.1, 13.3, 13.5_
    - Files: `apps/web/src/app/api/cron/fred-actuals/route.ts`
  - [ ]* 18.4 Test missing-observation behaviour
    - Mock the FRED REST helper to return `null` for one event and a value for another. Assert the no-observation event's `actual` stays null and the other gets patched once.
    - _Requirements: 13.5, 13.6_
    - Files: `packages/ai/test/fred-actuals.test.ts`

- [ ] 19. T16 — GitHub Actions cron workflows (4 new files)
  - Implements Requirement 6.4 + 9.6 + 11.2 + 13.4.
  - [ ] 19.1 Author the four workflows
    - `cron-snapshots.yml` (`5 0 * * *`)
    - `cron-briefings.yml` (`*/5 * * * *`)
    - `cron-weekly-review.yml` (`0 18 * * 0`)
    - `cron-fred-actuals.yml` (`30 1 * * *`)
    - All four use the existing template: `permissions: { contents: read }`, `concurrency.group: cron-<name>`, `cancel-in-progress: false`, `workflow_dispatch:`. `curl -fsS -X GET -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" "${{ secrets.PRODUCTION_URL }}/api/cron/<name>"`.
    - _Requirements: 6.4, 9.6, 11.2, 13.4_
    - Files: `.github/workflows/cron-snapshots.yml`, `.github/workflows/cron-briefings.yml`, `.github/workflows/cron-weekly-review.yml`, `.github/workflows/cron-fred-actuals.yml`

- [ ] 20. T17 — Documentation updates
  - Implements Requirement 14.
  - [ ] 20.1 `docs/10-roadmap.md` Phase 2 status
    - Move every shipped Phase 2 item from `[ ]` to `[x]`.
    - Update Phase 3 "Next" header.
    - _Requirements: 14.1_
    - Files: `docs/10-roadmap.md`
  - [ ] 20.2 `docs/09a-phase-0-deployed-state.md` Phase 2 subsection
    - List the new env vars (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).
    - List the new cron workflows + cadences.
    - List the migrations (`0002_phase_2.sql`).
    - Note Telegram delivery now active.
    - _Requirements: 14.2_
    - Files: `docs/09a-phase-0-deployed-state.md`
  - [ ] 20.3 `docs/04-features.md` flips
    - Mark `F-08`, `F-09`, `X-06`, etc. as shipped.
    - _Requirements: 14.3_
    - Files: `docs/04-features.md`
  - [ ] 20.4 `.kiro/steering/10-ai-tools.md` tools list
    - Add the five new tools (`search_knowledge`, `analyze_technical`, `analyze_fundamental`, `get_journal_stats`, `annotate_chart`) under "Tools".
    - _Requirements: 14.4_
    - Files: `.kiro/steering/10-ai-tools.md`

- [ ] 21. T18 — Acceptance run
  - Re-run the eval harness against production after Phase 2 deploys. The 10 prompts SHALL still pass with the new tools available. Note any model-quality regressions as follow-up issues (out of scope here unless the harness itself crashes).
  - [ ] 21.1 Execute against the deployed app
    - `pnpm --filter @hamafx/ai eval --base-url <production> --cookie <auth> --out docs/eval`.
    - Commit the new `docs/eval/<timestamp>.md`.
    - Check that at least one prompt invokes a Phase 2 composite tool (`analyze_technical` / `analyze_fundamental` / `search_knowledge`).
    - _Requirements: -_
    - Files: `docs/eval/<UTC-timestamp>.md`

- [ ] 22. Final checkpoint — Phase 2 done
  - All tests green; all docs updated; Phase 2 acceptance run committed; ask the user if any feature warrants a follow-up issue.

## Notes

- Tasks marked `*` are optional. Optional sub-tasks here are unit / property / integration tests; core implementation tasks are never optional.
- Property-based tests are limited to one universal property: the auto-journal parser round-trip.
- Each tool follows the same six-file change pattern (schema, tool, registry entry, part component, registry mapping, doc note) — that's the unit of review.
- T8, T12, T16 are explicit checkpoints where the agent SHALL stop and confirm UX with the user before continuing.
- `apps/web/src/app/(app)/chat/[threadId]/page.tsx` and friends already render whatever `parts/registry.tsx` knows about — adding a tool is six files, not a UI overhaul.
- The roadmap (`docs/10-roadmap.md`) and `09a-phase-0-deployed-state.md` are docs; updating them is part of the spec, not after.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6"] },
    { "id": 1, "tasks": ["1.4", "2.7"] },
    { "id": 2, "tasks": ["3.1", "3.2", "4.1", "5.1", "6.1", "7.1", "7.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "4.2", "4.3", "4.4", "5.2", "5.3", "5.4", "6.2", "6.3", "6.4", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 4, "tasks": ["8"] },
    { "id": 5, "tasks": ["9.1", "9.2", "9.5", "10.1", "10.2", "10.3", "10.4", "11.1", "11.2"] },
    { "id": 6, "tasks": ["9.3", "9.4"] },
    { "id": 7, "tasks": ["12"] },
    { "id": 8, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "14.1", "14.2", "14.3", "15.1", "15.2"] },
    { "id": 9, "tasks": ["16"] },
    { "id": 10, "tasks": ["17.1", "17.2", "17.3", "17.4", "18.1", "18.2", "18.3", "18.4"] },
    { "id": 11, "tasks": ["19.1"] },
    { "id": 12, "tasks": ["20.1", "20.2", "20.3", "20.4"] },
    { "id": 13, "tasks": ["21.1"] },
    { "id": 14, "tasks": ["22"] }
  ]
}
```
