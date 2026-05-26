# Audit 5.1 — Tool output schemas vs the 8 wired AI tools

Validates: Requirements 2.10 — _"The Zod schemas describing each tool's result
payload SHALL be defined in `packages/shared/src/schemas` before any
`Chat_Part_Renderer` consumes them."_

## Scope

Enumerate the 8 tool names from `@shared/ai/tool-names.ts` and confirm whether
each one has an **output schema** (a zod schema describing the full payload
returned by `tool.execute(...)`) defined in `packages/shared/src/schemas/`.

This is an **audit only**. No code changes in this subtask. Findings drive
task 5.2 (add the missing files).

## How `ToolOutput<T>` is wired today

- `packages/shared/src/ai/tool-names.ts` declares the readonly `TOOL_NAMES`
  tuple and the `ToolName` union.
- `packages/shared/src/ai/tool-io.ts` declares an empty `ToolIOMap` interface
  and derives `ToolInput<T>` / `ToolOutput<T>` from it via conditional types.
- Each tool file in `packages/ai/src/tools/<name>.ts` augments `ToolIOMap`
  via `declare module '@hamafx/shared' { interface ToolIOMap { ... } }`, with
  an inline TS interface for `Output` and `z.infer<typeof InputSchema>` for
  the input.

Implication: `ToolOutput<'get_price'>` already resolves to a **precise TS
type** today (it is **not** `unknown`). The gap is **runtime / shape**:
the output type is declared as a hand-written TS interface in the tool
file, not as a zod schema in `@shared/schemas/*`. That means:

- The chat-parts UI (Requirement 2) cannot `safeParse` a tool result before
  rendering — it has to trust the producer.
- The output shape is duplicated (TS interface in `packages/ai`, payload
  shape implicitly assumed by any future `Chat_Part_Renderer`) instead of
  being derived from one zod schema.

Per Requirement 2.10 every tool's result payload must have a zod schema in
`packages/shared/src/schemas/` before chat parts are written.

## Existing primitives in `packages/shared/src/schemas/`

| File           | Exports (relevant)                                                                       |
| -------------- | ---------------------------------------------------------------------------------------- |
| `tick.ts`      | `TickSchema`, `Tick`                                                                     |
| `candle.ts`    | `CandleSchema`, `Candle`                                                                 |
| `indicator.ts` | `IndicatorResultSchema`, `IndicatorKindSchema`, `IndicatorParamsSchema`                  |
| `structure.ts` | `StructureResultSchema`, swing/event/FVG/OB/liquidity sub-schemas, `StructureKindSchema` |
| `news.ts`      | `NewsArticleSchema`, `NewsSentimentSchema`                                               |
| `calendar.ts`  | `EconomicEventSchema`, `ImportanceSchema`, `EventCurrencySchema`                         |
| `alerts.ts`    | `AlertSchema`, `AlertRuleSchema`, `AlertChannelSchema`                                   |
| `journal.ts`   | `JournalEntrySchema`, `JournalStatsSchema`, `TradeSideSchema`, `TradeOutcomeSchema`      |
| `chat.ts`      | (chat thread / message — not relevant here)                                              |

Useful: every per-row primitive the tools return is already covered. The
gap is the **envelope** each tool wraps those rows in.

## Per-tool gap table

| #   | Tool name              | Tool file                                       | Inline `Output` shape (today)                                                                                                                                                       | Schema in `@shared/schemas` for the **envelope**?                                                                                                     | Gap | Recommended new schema location                                                                 |
| --- | ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------- |
| 1   | `get_price`            | `packages/ai/src/tools/get-price.ts`            | `{ ticks: Tick[]; asOf: string }`                                                                                                                                                   | ❌ — only `TickSchema` exists                                                                                                                         | yes | `packages/shared/src/schemas/tool-outputs/get-price.ts`                                         |
| 2   | `get_candles`          | `packages/ai/src/tools/get-candles.ts`          | `{ symbol: string; tf: string; candles: Candle[] }`                                                                                                                                 | ❌ — only `CandleSchema` exists                                                                                                                       | yes | `packages/shared/src/schemas/tool-outputs/get-candles.ts`                                       |
| 3   | `get_indicators`       | `packages/ai/src/tools/get-indicators.ts`       | `{ symbol: string; tf: string; results: IndicatorResult[] }` (each `results[i].values` truncated to last 30 points)                                                                 | ❌ — only `IndicatorResultSchema` exists                                                                                                              | yes | `packages/shared/src/schemas/tool-outputs/get-indicators.ts`                                    |
| 4   | `get_market_structure` | `packages/ai/src/tools/get-market-structure.ts` | `{ symbol; tf; bars; swings?; events?; fvg?; orderBlocks?; liquidity?; summary: string }`                                                                                           | ❌ — `StructureResultSchema` covers most fields but not `summary` and the per-tool tail-trimmed envelope                                              | yes | `packages/shared/src/schemas/tool-outputs/get-market-structure.ts`                              |
| 5   | `get_news`             | `packages/ai/src/tools/get-news.ts`             | `{ items: NewsItem[]; pipelinePending: boolean }` where `NewsItem` is its **own** flat shape (id, title, summary, url, source, publisher, publishedAt, sentiment, sentimentScore)   | ❌ — `NewsArticleSchema` is similar but not identical (it has `symbols[]`, `topics[]` which the tool drops); the tool's `NewsItem` is a different DTO | yes | `packages/shared/src/schemas/tool-outputs/get-news.ts` (define `ToolNewsItemSchema` + envelope) |
| 6   | `get_calendar`         | `packages/ai/src/tools/get-calendar.ts`         | `{ items: CalendarItem[]; pipelinePending: boolean }` where `CalendarItem` mirrors most of `EconomicEvent` but loosens the `country` and `currency` types to plain `string \| null` | ❌ — `EconomicEventSchema` exists but the tool's `CalendarItem` is a slightly different DTO                                                           | yes | `packages/shared/src/schemas/tool-outputs/get-calendar.ts`                                      |
| 7   | `set_alert`            | `packages/ai/src/tools/set-alert.ts`            | `{ alertId: string; describes: string }`                                                                                                                                            | ❌ — no envelope schema; bears no resemblance to `AlertSchema` (this is the **acknowledgement** payload, not the alert row)                           | yes | `packages/shared/src/schemas/tool-outputs/set-alert.ts`                                         |
| 8   | `log_journal`          | `packages/ai/src/tools/log-journal.ts`          | `{ entryId: string; summary: string }`                                                                                                                                              | ❌ — no envelope schema; bears no resemblance to `JournalEntrySchema` (acknowledgement only)                                                          | yes | `packages/shared/src/schemas/tool-outputs/log-journal.ts`                                       |

**Result: 8 tools, 8 gaps.** None of the 8 tools currently has a zod
schema in `packages/shared/src/schemas/` describing its **output envelope**.
The per-row primitives (Tick, Candle, IndicatorResult, StructureResult)
are covered and should be reused inside the new envelope schemas where
applicable. `get_news`, `get_calendar`, `set_alert`, `log_journal` need
fully-bespoke envelope schemas because their payloads diverge from any
existing primitive.

## Notes on `ToolOutput<T>` shape (per-tool typing)

`ToolOutput<T>` already gives a precise per-tool type today (no `unknown`),
but it points at hand-written TS interfaces, not zod-derived types. The
fix in task 5.2 is:

1. Add a zod schema per tool under `packages/shared/src/schemas/tool-outputs/<tool>.ts`,
   exporting both `XxxOutputSchema` and `type XxxOutput = z.infer<...>`.
2. Re-augment `ToolIOMap` in the tool file so `output` resolves to the
   schema-inferred type instead of the local interface (and delete the
   local `interface Output {...}` block in favour of `z.infer<typeof
XxxOutputSchema>`).
3. The existing `ToolOutput<T>` helper in `@shared/ai/tool-io.ts` does **not
   need to change** — it already reads `ToolIOMap[T]['output']`, so once
   each tool augments with the zod-inferred type the chat-parts code can
   call `XxxOutputSchema.safeParse(part.result)` and get the same
   type-narrowed value.

## Re-export surface

`packages/shared/src/index.ts` (not read here) needs to re-export the new
schemas from `./schemas/tool-outputs/*` so consumers can `import {
GetPriceOutputSchema } from '@hamafx/shared'`. Confirm the export wiring
when implementing 5.2.

## Summary

- All 8 wired tools have a precise TS-level output type via the
  `ToolIOMap` augmentation, but **none** has a zod output-envelope schema
  in `packages/shared/src/schemas/`.
- The per-row primitives (`Tick`, `Candle`, `IndicatorResult`,
  `StructureResult`) already exist and should be reused.
- Task 5.2 adds 8 new files under `packages/shared/src/schemas/tool-outputs/`
  and updates each tool to derive its `Output` type from the new schema,
  then re-exports from the shared package barrel.
- No change is required to `tool-io.ts` or `tool-names.ts`.
