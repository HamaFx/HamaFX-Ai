# Requirements Document — Phase 4: Polish & Reliability

## Introduction

Phase 4 is a **polish and reliability** pass. No new features — instead we fix every broken flow, ensure all pages render real data, upgrade indicator accuracy, and improve the chat UX. The user reported that News, Calendar, and Chart pages "show nothing" — root cause: GitHub Actions cron workflows have never successfully fired (account exhausted Actions minutes → `startup_failure` on every run), so the `news_articles` and `economic_events` tables are empty. The chart page works once client JS hydrates (API returns data), but may appear blank on slow connections before hydration.

This phase also audits every page for broken states, upgrades the SMC indicators for better accuracy, and polishes the chat experience.

## Glossary

- **Cron seeding** — the initial population of `news_articles` and `economic_events` tables that the News and Calendar pages depend on.
- **SSR hydration gap** — the period between server-rendered HTML arriving and client JS taking over; during this time, client-only content (charts, prices) shows loading states.
- **SMC** — Smart Money Concepts (swings, BOS/CHoCH, FVG, order blocks, liquidity sweeps).

## Requirements

### Requirement 1: Fix cron scheduling — data pipeline must actually run

**User Story:** As the single user, I want the news and calendar crons to fire reliably so the pages always have fresh data.

#### Acceptance Criteria

1. THE System SHALL NOT depend solely on GitHub Actions for cron scheduling. A fallback mechanism SHALL exist that works regardless of Actions minutes.
2. THE `vercel.json` SHALL include a `crons` array for the critical data-seeding endpoints (`/api/cron/news`, `/api/cron/calendar`, `/api/cron/alerts`, `/api/cron/snapshots`, `/api/cron/embedding-backfill`, `/api/cron/fred-actuals`). On Hobby plan these fire once/day — acceptable as a baseline.
3. THE GitHub Actions workflows SHALL remain as the primary high-frequency scheduler (every 5–15 min) for when Actions minutes are available.
4. THE News page SHALL show articles within 24 hours of a fresh deploy (Vercel daily cron fires).
5. THE Calendar page SHALL show events within 24 hours of a fresh deploy.
6. A one-time manual seed script SHALL be provided at `scripts/seed-crons.sh` that the user can run locally with their CRON_SECRET to immediately populate all tables.

### Requirement 2: Chart page — eliminate blank-screen perception

**User Story:** As the single user, I want the chart page to never appear blank — even before client JS hydrates.

#### Acceptance Criteria

1. THE chart page SHALL render a visible loading skeleton (animated pulse placeholder matching the chart dimensions) in the server-rendered HTML so the user sees immediate feedback.
2. THE `useCandles` hook SHALL show a clear error state when the data provider returns an error (quota exceeded, timeout, etc.) instead of silently rendering nothing.
3. THE chart component SHALL render a "No data" message with a retry button when candles array is empty after fetch completes.
4. THE price tag component SHALL show "—" with a subtle pulse animation while loading, not an empty space.

### Requirement 3: News page — improve empty state and add auto-refresh

**User Story:** As the single user, I want the news page to clearly communicate its state and auto-populate when possible.

#### Acceptance Criteria

1. THE News page empty state SHALL include a "Refresh now" button that calls `/api/cron/news` directly (since the user is already authenticated via the password cookie).
2. THE News page SHALL show a "Last updated: X minutes ago" timestamp based on the most recent article's `publishedAt`.
3. THE ArticleCard SHALL render sentiment as a colored chip (bull/bear/neutral) with the score.
4. THE News page SHALL support pull-to-refresh on mobile (or a visible refresh button in the header).

### Requirement 4: Calendar page — improve empty state and add auto-refresh

**User Story:** As the single user, I want the calendar page to clearly communicate its state and auto-populate when possible.

#### Acceptance Criteria

1. THE Calendar page empty state SHALL include a "Refresh now" button that calls `/api/cron/calendar` directly.
2. THE Calendar page SHALL show impact-level filtering (High / Medium / Low) via URL state.
3. THE EventCard SHALL visually distinguish past events (dimmed) from upcoming ones.
4. Events with `actual` values filled SHALL show actual vs forecast with a delta indicator (beat/miss).

### Requirement 5: Indicator accuracy upgrades

**User Story:** As the single user, I want the indicators to be more accurate and advanced so the AI gives better analysis.

#### Acceptance Criteria

1. THE RSI implementation SHALL use Wilder's smoothing correctly (already does — verify via test).
2. THE EMA implementation SHALL handle the first `period` bars correctly (SMA seed — already does — verify).
3. THE swing detection SHALL support an adaptive lookback mode where `k` scales with timeframe: `k=2` for 1m/5m, `k=3` for 15m/30m/1h, `k=5` for 4h/1d/1w.
4. THE order block detection SHALL add a **strength score** (0–1) based on: impulse magnitude relative to ATR, number of impulse bars, and whether the OB aligns with the prevailing trend.
5. THE FVG detection SHALL add a `percentFilled` field (0–1) tracking how much of the gap has been retraced by subsequent bars, enabling "partially mitigated" states.
6. THE liquidity sweep detection SHALL add a `magnitude` field (wick extension beyond the level as a multiple of ATR) so the AI can distinguish strong sweeps from noise.
7. ALL indicator upgrades SHALL be backward-compatible (new fields are additive; existing fields unchanged).

### Requirement 6: Chat UX polish

**User Story:** As the single user, I want the chat experience to feel polished and responsive.

#### Acceptance Criteria

1. THE chat composer SHALL auto-focus on page load (desktop) and after sending a message.
2. THE chat surface SHALL auto-scroll to the latest message when a new assistant message streams in.
3. THE message list SHALL show a typing indicator (three-dot pulse) while the assistant is generating.
4. THE error banner SHALL include a "Retry" button that re-sends the last user message.
5. THE thread title in the page header SHALL update in real-time after the LLM generates it (currently requires a page refresh).
6. THE quick-prompt chips ("Bias?", "Top-down", "Today's news") SHALL be visible below the composer when the thread is empty.

### Requirement 7: Global error handling and resilience

**User Story:** As the single user, I want the app to gracefully handle provider failures without showing blank pages.

#### Acceptance Criteria

1. WHEN a data provider returns `PROVIDER_QUOTA_EXCEEDED`, THE UI SHALL show a "Rate limited — retrying in Xs" message instead of a blank state.
2. WHEN the database connection fails, THE pages SHALL show a clear "Service temporarily unavailable" error instead of a Next.js error page.
3. THE `/api/market/*` routes SHALL return proper error JSON with `{ error: { code, message } }` shape on all failure paths (some currently throw unstructured errors).
4. THE chart's `useCandles` and `useStructure` hooks SHALL implement exponential backoff retry (3 attempts, 1s/2s/4s) before showing the error state.

### Requirement 8: Performance and accessibility audit

**User Story:** As the single user, I want the app to be fast and accessible.

#### Acceptance Criteria

1. ALL pages SHALL score ≥ 90 on Lighthouse Performance (mobile).
2. ALL pages SHALL score 100 on Lighthouse Accessibility.
3. THE chart page SHALL lazy-load the `lightweight-charts` library so it doesn't block initial paint.
4. THE news and calendar pages SHALL use streaming SSR (`loading.tsx`) so the shell renders instantly while data fetches.
5. Images in chat (vision input thumbnails) SHALL have proper `alt` text ("Attached chart image 1 of N").
