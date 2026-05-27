# Implementation Plan: Phase 4 — Polish & Reliability

## Overview

Phase 4 fixes broken data pipelines, eliminates blank-page states, upgrades indicator accuracy, and polishes the chat UX. No new features — pure reliability and quality-of-life improvements.

Hard rules from `00-project.md` still apply. All changes are backward-compatible.

Tasks marked with `*` are optional (tests/audits). Core implementation tasks are never optional.

## Tasks

- [x] 1. T1 — Fix cron scheduling (Requirement 1)
  - [x] 1.1 Add `crons` array to `apps/web/vercel.json`
    - Add all 9 cron endpoints with their ideal schedules. On Hobby these fire once/day max; the schedules are written for Pro so upgrading is seamless.
    - _Requirements: 1.1, 1.2_
    - Files: `apps/web/vercel.json`
  - [x] 1.2 Add admin-bypass to `withCronAuth`
    - Accept the session cookie (`hfx_auth`) as an alternative to `Authorization: Bearer` so the UI refresh buttons can trigger crons without exposing the CRON_SECRET to the client.
    - _Requirements: 1.1, 3.1, 4.1_
    - Files: `apps/web/src/lib/cron.ts`
  - [x] 1.3 Create `scripts/seed-crons.sh`
    - Bash script that curls all data-seeding cron endpoints with `CRON_SECRET`. Documented in README.
    - _Requirements: 1.6_
    - Files: `scripts/seed-crons.sh`
  - [x] 1.4 Update `vercel.json` function durations for new crons
    - Add `briefings`, `weekly-review`, `cot`, `fred-actuals` to the `functions` map with appropriate `maxDuration`.
    - _Requirements: 1.2_
    - Files: `apps/web/vercel.json`

- [x] 2. T2 — Chart page loading/error/empty states (Requirement 2)
  - [x] 2.1 Add `ChartSkeleton` component
    - Animated pulse placeholder matching chart aspect ratio. Renders during `isLoading`.
    - _Requirements: 2.1_
    - Files: `apps/web/src/app/(app)/chart/[symbol]/_components/chart-skeleton.tsx`
  - [x] 2.2 Add `ChartError` component
    - Shows error message + "Retry" button. Distinguishes quota errors from network errors.
    - _Requirements: 2.2, 7.1_
    - Files: `apps/web/src/app/(app)/chart/[symbol]/_components/chart-error.tsx`
  - [x] 2.3 Add `ChartEmpty` component
    - "No data available" message with retry. Shown when candles array is empty after successful fetch.
    - _Requirements: 2.3_
    - Files: `apps/web/src/app/(app)/chart/[symbol]/_components/chart-empty.tsx`
  - [x] 2.4 Wire states into `ChartView`
    - Add loading/error/empty branching before the `<Chart>` render.
    - _Requirements: 2.1, 2.2, 2.3_
    - Files: `apps/web/src/app/(app)/chart/[symbol]/_components/chart-view.tsx`
  - [x] 2.5 Fix `PriceTag` loading state
    - Show "—" with subtle pulse while price is loading instead of empty space.
    - _Requirements: 2.4_
    - Files: `apps/web/src/components/chart/price-tag.tsx`

- [x] 3. T3 — News page improvements (Requirement 3)
  - [x] 3.1 Add `RefreshButton` client island
    - Calls the cron endpoint via fetch (session-cookie auth), then `router.refresh()` to revalidate.
    - _Requirements: 3.1, 3.4_
    - Files: `apps/web/src/app/(app)/news/_components/refresh-button.tsx`
  - [x] 3.2 Add "Last updated" timestamp
    - Computed from the most recent article's `publishedAt`. Shown in the page header area.
    - _Requirements: 3.2_
    - Files: `apps/web/src/app/(app)/news/page.tsx`
  - [x] 3.3 Improve `ArticleCard` sentiment display
    - Render sentiment as a colored chip (text-bull/text-bear/text-fg-muted) with the numeric score.
    - _Requirements: 3.3_
    - Files: `apps/web/src/components/news/article-card.tsx`
  - [x] 3.4 Add `loading.tsx` for streaming SSR
    - Skeleton cards so the shell renders instantly while data fetches.
    - _Requirements: 8.4_
    - Files: `apps/web/src/app/(app)/news/loading.tsx`

- [x] 4. T4 — Calendar page improvements (Requirement 4)
  - [x] 4.1 Add `RefreshButton` to calendar empty state
    - Same pattern as news refresh button, pointing to `/api/cron/calendar`.
    - _Requirements: 4.1_
    - Files: `apps/web/src/app/(app)/calendar/page.tsx`
  - [x] 4.2 Add impact-level filter
    - URL state via `nuqs` for `?impact=high,medium,low`. Default: show all.
    - _Requirements: 4.2_
    - Files: `apps/web/src/app/(app)/calendar/page.tsx`, `apps/web/src/app/(app)/calendar/_components/impact-filter.tsx`
  - [x] 4.3 Dim past events
    - Events with `date < now` get `opacity-60` and a "Past" badge.
    - _Requirements: 4.3_
    - Files: `apps/web/src/components/calendar/event-card.tsx`
  - [x] 4.4 Show actual vs forecast delta
    - When `actual` is filled, show a beat/miss indicator (green up arrow / red down arrow).
    - _Requirements: 4.4_
    - Files: `apps/web/src/components/calendar/event-card.tsx`
  - [x] 4.5 Add `loading.tsx` for streaming SSR
    - _Requirements: 8.4_
    - Files: `apps/web/src/app/(app)/calendar/loading.tsx`

- [x] 5. T5 — Indicator accuracy upgrades (Requirement 5)
  - [x] 5.1 Adaptive swing lookback defaults
    - When no explicit `lookback` is passed, use tf-aware defaults: 2 for 1m/5m, 3 for 15m/30m/1h, 5 for 4h/1d/1w.
    - _Requirements: 5.3_
    - Files: `packages/indicators/src/smc/swings.ts`, `packages/ai/src/tools/annotate-chart.ts`
  - [x] 5.2 Order block strength score
    - Add `strength: number` (0–1) to `OrderBlock` based on impulse magnitude / ATR, bar count, trend alignment.
    - _Requirements: 5.4_
    - Files: `packages/indicators/src/smc/order-blocks.ts`, `packages/shared/src/schemas/structure.ts`
  - [x] 5.3 FVG percent filled
    - Add `percentFilled: number` (0–1) tracking deepest penetration into the gap zone.
    - _Requirements: 5.5_
    - Files: `packages/indicators/src/smc/fvg.ts`, `packages/shared/src/schemas/structure.ts`
  - [x] 5.4 Liquidity sweep magnitude
    - Add `magnitude: number` (wick extension / ATR14) to `LiquiditySweep`.
    - _Requirements: 5.6_
    - Files: `packages/indicators/src/smc/liquidity.ts`, `packages/shared/src/schemas/structure.ts`
  - [ ]* 5.5 Golden tests for new fields
    - Extend existing indicator tests with assertions on the new additive fields.
    - _Requirements: 5.1, 5.2, 5.7_
    - Files: `packages/indicators/test/`

- [x] 6. T6 — Chat UX polish (Requirement 6)
  - [x] 6.1 Auto-focus composer
    - `autoFocus` on textarea + re-focus after streaming completes.
    - _Requirements: 6.1_
    - Files: `apps/web/src/components/chat/composer.tsx`
  - [x] 6.2 Auto-scroll to latest message
    - `useEffect` watching messages length + status; scroll container to bottom.
    - _Requirements: 6.2_
    - Files: `apps/web/src/components/chat/chat-surface.tsx`
  - [x] 6.3 Typing indicator
    - Three-dot pulse animation when `status === 'submitted'` (before first token).
    - _Requirements: 6.3_
    - Files: `apps/web/src/components/chat/message-list.tsx` or `chat-surface.tsx`
  - [x] 6.4 Error retry button
    - "Retry" in the error banner that re-sends the last user message.
    - _Requirements: 6.4_
    - Files: `apps/web/src/components/chat/chat-surface.tsx`
  - [x] 6.5 Live thread title update
    - After streaming completes, re-fetch thread metadata and update the page header.
    - _Requirements: 6.5_
    - Files: `apps/web/src/app/(app)/chat/[threadId]/page.tsx`, `apps/web/src/components/chat/chat-surface.tsx`
  - [x] 6.6 Quick-prompt chips
    - Render below composer when thread has ≤1 message. Tapping sends the prompt.
    - _Requirements: 6.6_
    - Files: `apps/web/src/components/chat/quick-prompts.tsx`, `apps/web/src/components/chat/chat-surface.tsx`

- [x] 7. T7 — Error handling & resilience (Requirement 7)
  - [x] 7.1 Exponential backoff in `useCandles` and `useStructure`
    - Configure TanStack Query `retry: 3` with `retryDelay: (n) => Math.min(1000 * 2**n, 8000)`.
    - _Requirements: 7.4_
    - Files: `apps/web/src/hooks/use-candles.ts`, `apps/web/src/hooks/use-structure.ts`
  - [x] 7.2 Rate-limit UI message
    - When error contains "quota" or "throttle", show a countdown timer instead of generic error.
    - _Requirements: 7.1_
    - Files: `apps/web/src/app/(app)/chart/[symbol]/_components/chart-error.tsx`
  - [x] 7.3 Structured error responses in `/api/market/*`
    - Audit all market routes; ensure every error path returns `{ error: { code, message } }`.
    - _Requirements: 7.3_
    - Files: `apps/web/src/lib/api.ts`, `apps/web/src/app/api/market/*/route.ts`

- [x] 8. T8 — Performance & accessibility (Requirement 8)
  - [x] 8.1 Lazy-load `lightweight-charts`
    - Use `next/dynamic` with `ssr: false` for the chart component so it doesn't block initial paint.
    - _Requirements: 8.3_
    - Files: `apps/web/src/components/chart/chart.tsx`
  - [x] 8.2 Vision input alt text
    - Add proper `alt` text to image thumbnails in the composer: "Attached chart image N of M".
    - _Requirements: 8.5_
    - Files: `apps/web/src/components/chat/composer.tsx`
  - [ ]* 8.3 Lighthouse audit
    - Run Lighthouse on all main routes; fix any scores below threshold.
    - _Requirements: 8.1, 8.2_
    - Files: various

- [x] 9. Checkpoint — all pages render data
  - Run `pnpm typecheck && pnpm test`. Verify news/calendar/chart all show real data on production after cron seeding. Confirm chat UX improvements work end-to-end.

- [x] 10. T9 — Doc updates
  - [x] 10.1 Update `docs/10-roadmap.md`
    - Add Phase 4 section (Polish & Reliability) with checkboxes.
    - Files: `docs/10-roadmap.md`
  - [x] 10.2 Update `docs/09a-phase-0-deployed-state.md`
    - Note the `crons` array addition and seed script.
    - Files: `docs/09a-phase-0-deployed-state.md`

- [x] 11. T10 — Acceptance
  - [x] 11.1 Re-run eval harness
    - Confirm 10/10 still passes after all changes.
    - Files: `docs/eval/<timestamp>.md`
  - [x] 11.2 Visual smoke test
    - Open each page in a mobile viewport; confirm no blank states, all data renders.

- [x] 12. Final checkpoint — Phase 4 done

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "3.1", "3.4", "4.1", "4.5", "5.1", "5.2", "5.3", "5.4"] },
    { "id": 2, "tasks": ["2.4", "2.5", "3.2", "3.3", "4.2", "4.3", "4.4", "5.5", "6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "7.1", "7.2", "7.3", "8.1", "8.2"] },
    { "id": 3, "tasks": ["8.3", "9"] },
    { "id": 4, "tasks": ["10.1", "10.2"] },
    { "id": 5, "tasks": ["11.1", "11.2"] },
    { "id": 6, "tasks": ["12"] }
  ]
}
```

## Notes

- The biggest immediate impact is T1 (cron fix) — once that deploys and fires, News + Calendar populate automatically.
- Chart page already works (API returns data); T2 just adds proper loading/error UX.
- Indicator upgrades (T5) are additive — no breaking changes to existing tool outputs.
- Chat polish (T6) is purely client-side; no API changes needed.
