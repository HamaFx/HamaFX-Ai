# Frontend Fixes, Improvements, Polish & Upgrades Plan

> **Scope:** `apps/web` (Next.js 15, React 19, Tailwind v4, lightweight-charts v5, motion, AI SDK v5).
> **Goal:** Eliminate bugs, close accessibility gaps, remove performance traps, and raise the entire
> surface from "good" to **premium, unique, and non-generic**. This document covers **bugs,
> improvements, polishing, and upgrades**. New features and net-new ideas live in
> `docs/FRONTEND_NEW_FEATURES_AND_IDEAS_PLAN.md`.

This plan is the result of a line-by-line audit of every frontend file (layout/shell, chat & AI,
charts & trading, settings/auth/onboarding, news/journal/calendar, UI kit, hooks, lib). Findings are
grouped by domain and tagged: **BUG**, **A11Y**, **PERF**, **POLISH**, **UPGRADE**. Each item lists
the file, the problem, and the fix.

---

## 0. How To Use This Plan

- **P0** = correctness / broken feature / security / a11y blocker → ship first.
- **P1** = high-impact polish, perf, consistency → ship in the design pass.
- **P2** = refinement / nice-to-have polish → ship opportunistically.
- Each section ends with a **checklist** you can copy into issues.
- Wherever a "design system" fix is mentioned, the rule is: **always use semantic tokens**
  (`bg-bg-elev-*`, `text-fg*`, `text-bull/bear/warn`, `border-divider`) — **never** raw Tailwind
  palette colors (`text-amber-500`, `bg-gray-900`, `text-emerald-500`). Raw palette usage is the #1
  source of "AI-slop" inconsistency in this codebase and must be purged.

---

## 1. CRITICAL BUGS (P0 — fix first)

These are broken or silently-failing behaviors. Several break entire features.

### 1.1 Chat / AI

- **BUG — Multi-agent streaming never shows a streaming state.**
  `components/chat/chat-screen.tsx`. `isStreaming` is partly derived from
  `multiAgentFetchRef.current !== null`. `multiAgentFetchRef` is a `useRef`, so mutating `.current`
  does **not** trigger a re-render. In multi-agent mode the Stop button, disabled composer, and
  "thinking" indicator never appear. **Fix:** drive multi-agent streaming from `useState` (or derive
  from `agentProgress !== null`), not a ref.

- **BUG — Multi-agent regenerate duplicates the user message.**
  `chat-screen.tsx` `handleRegenerate`. It slices messages to include the last user message, then
  `sendMultiAgentMessage` appends a **new** user message + assistant message → two identical user
  turns. **Fix:** slice to exclude the last user message before re-sending, or reuse the existing
  user message instead of appending a new one.

- **BUG — Stale `messages` closure in `sendMultiAgentMessage`.**
  `chat-screen.tsx`. The fetch body uses `messages` captured in the `useCallback` closure; rapid
  sequential sends post a stale array. **Fix:** read messages from a ref or from the `setMessages`
  functional updater.

- **BUG — Broken Tailwind class concatenation in `set-alert.tsx`.**
  `components/chat/parts/set-alert.tsx`. String concatenation is missing leading spaces, producing
  `font-mediumtext-brand` and `hover:underlinefocus-visible:outline-none` — both silently dropped.
  The alert link loses its brand color and focus styles. **Fix:** add the missing spaces (prefer a
  `cn()` array).

- **BUG — `get-portfolio-snapshot.tsx` uses array index as React key.**
  Reordering/insertions reuse the wrong DOM nodes. **Fix:** key by `pos.symbol` or a stable id.

### 1.2 Charts / Trading

- **BUG — Sub-panes (RSI/MACD/ATR) tear down and rebuild on every parent re-render.**
  `components/chart/use-sub-pane-chart.ts` depends on `mainChart` (a `ChartCanvasHandle` set via
  `useState`). When the orchestrator re-renders and creates a new handle, all sub-panes fully
  dispose + recreate their chart instances → flicker + refetch. **Fix:** stabilize the handle
  identity (ref or memoized handle) and depend on a stable id, not the handle object.

- **BUG — Candle colors can leak `oklch` into the canvas paint pipeline.**
  `components/chart/chart-canvas.tsx` reads `--color-bull`/`--color-bear` from computed styles; the
  hex fallback only triggers when the variable is *empty*, not when it's `oklch(...)`. On browsers
  where `oklch` works in CSS but not in canvas, candles break. `chart-colors.ts` already documents
  the hex requirement. **Fix:** always use `SERIES_BULL_HEX` / `SERIES_BEAR_HEX` (or resolve
  oklch→hex at runtime).

- **BUG — Theme colors duplicated between `chart-canvas.tsx` and `chart-themes.ts`.**
  Initial chart creation hardcodes a `colors` map; theme *updates* use `THEME_PRESETS`. They can
  drift. **Fix:** import `getThemeColors` from `chart-themes.ts` and use it for initial creation too.

- **BUG — `PerformanceChart` leaks chart instances on data → empty transition.**
  `components/chart/performance-chart.tsx` early-returns before cleanup when `chartData` drops below
  2 items; `chartRef`/`seriesRef` are never cleared. **Fix:** run cleanup before the early return.

- **BUG — TradingView widget never destroyed on symbol/tf change.**
  `app/(app)/chart/[symbol]/_components/tradingview-widget.tsx` only calls `replaceChildren()`; the
  widget instance, its timers and global listeners leak across switches. **Fix:** keep the widget
  instance in a ref and call its `remove()` in cleanup.

- **BUG — `lightweight-charts` import promise never resets on failure.**
  `components/chart/use-lightweight-charts.ts` caches a module-level promise; a failed dynamic import
  poisons every future chart load even after the network recovers. **Fix:** `lcPromise = null` in the
  catch path.

- **BUG — Unsafe non-null assertion on `rootBounds` in alert swipe.**
  `app/(app)/alerts/_components/alert-list.tsx`: `entry.rootBounds!.x` throws when `rootBounds` is
  null (non-intersecting). **Fix:** guard for `entry.rootBounds === null`.

- **BUG — `ProChartView` reference close uses the live bar.**
  `app/(app)/chart/[symbol]/_components/pro-chart-view.tsx` uses the **last** candle as reference, so
  the price delta reads ~0 during an open bar. `chart-view.tsx` correctly uses the second-to-last
  candle. **Fix:** align `ProChartView` to use `candles.at(-2)`.

- **BUG — Chart error-boundary retry doesn't remount the chart.**
  `chart-view.tsx`: clearing `hasError` leaves a stale `instanceRef`. **Fix:** bump a `key` on retry
  to force a clean remount.

### 1.3 Settings / Auth / Onboarding

- **BUG (security) — API key persisted to `sessionStorage` in plaintext.**
  `components/onboarding/wizard.tsx` serializes the full wizard state (incl. `apiKey`) to
  `sessionStorage`. Any XSS on the origin can read it. **Fix:** never persist the API key; persist
  only non-sensitive wizard state.

- **BUG (security) — Missing CSRF token on test endpoints.**
  `settings/_components/test-email-button.tsx` and `test-telegram-button.tsx` POST without the
  `withCsrf()` helper used elsewhere. **Fix:** add CSRF headers.

- **BUG — Onboarding watchlist seeding error is swallowed inside the transaction.**
  `app/onboarding/actions.ts` wraps watchlist insert in try/catch but doesn't re-throw, so the
  transaction commits settings with **no symbols**. Symbols are also unvalidated against the catalog.
  **Fix:** re-throw to roll back (or seed defaults safely) and validate symbols against
  `symbolCatalog`.

- **BUG — Profile settings page has no auth redirect.**
  `app/(app)/settings/profile/page.tsx` renders `ProfileForm` with empty strings when unauthenticated
  instead of redirecting to `/login` (every other sub-page redirects). **Fix:** add the redirect.

- **BUG — Toasts fire on initial render.**
  `settings/agent/_components/disabled-tools-form.tsx` initializes `useActionState` with `{ ok: true }`
  → success toast fires before any user action. `settings/_components/profile-form.tsx` re-fires the
  success toast on every re-render after a save. **Fix:** initialize with `ok: false` and dedup via a
  `lastSeenAt` ref (the `SaveBar` pattern is the reference implementation).

- **BUG — `appearance-card.tsx` locale select shows the wrong value.**
  The `<select value={initialLocale}>` is bound to a prop, not state, so the user's selection isn't
  reflected until a full refresh. **Fix:** use local state synced to the server action result.

- **BUG — Shared `revoking` boolean disables all session rows.**
  `settings/_components/sessions-card.tsx`: one `useTransition` boolean disables every revoke button.
  **Fix:** track the specific session id being revoked.

- **BUG — No debounce on settings number inputs.**
  `settings/_components/noise-control-card.tsx` POSTs on every keystroke ("3", "30", "300"). The
  `saving` state is tracked but never rendered. **Fix:** debounce ~500ms and surface saving state.

- **BUG — Permanent success state in `change-password-card.tsx`.**
  After success the form is permanently replaced; you can't change the password again without a
  reload. **Fix:** auto-reset after a delay or add a "Change again" action.

- **BUG — Registration auto-sign-in may swallow `NEXT_REDIRECT`.**
  `app/(auth)/actions.ts` catches the Next redirect as an error and shows "failed to automatically
  sign in" even on success. **Fix:** detect and re-throw `NEXT_REDIRECT`.

- **BUG — `bulk-test-button.tsx` `JSON.parse(line)` has no try/catch** → a malformed stream chunk
  aborts the whole bulk test. **Fix:** wrap per-line parsing.

### 1.4 News / Journal / Calendar / Lib

- **BUG — Local `cn()` shadows the real one.**
  `app/(app)/journal/_components/journal-view.tsx` defines a local `cn()` without `tailwind-merge`, so
  conflicting Tailwind classes don't resolve. **Fix:** import `cn` from `@/lib/cn`.

- **BUG — Duplicated `relative()` time formatter with different rounding.**
  `journal/_components/entry-list.tsx` reimplements `formatRelative` using `Math.round` while
  `lib/format.ts` uses `Math.floor` → inconsistent timestamps on the same screen. **Fix:** use the
  shared util; pick one rounding rule.

- **BUG — Hardcoded symbol list in journal filters.**
  `entry-list.tsx` hardcodes `['ALL','XAUUSD','EURUSD','GBPUSD']`. **Fix:** derive from `SYMBOLS` in
  `@hamafx/shared`.

- **BUG — `ArticleCard` memo comparator is incomplete.**
  `components/news/article-card.tsx` compares only `id/title/saved`; sentiment, score, summary, and
  url changes don't re-render → stale cards after refresh. **Fix:** compare all render-affecting
  fields.

- **BUG — "Ask AI" link inside article card double-navigates.**
  It calls `stopPropagation()` but not `preventDefault()`, so it follows both the card's `href` and
  the chat link. **Fix:** `preventDefault()` on the inner link.

- **BUG — News "Showing X of Y" is misleading under filters.**
  `news-view.tsx` mixes a savedOnly-filtered numerator with an API-filtered denominator. **Fix:**
  compute both counts from the same filtered source.

- **BUG — Calendar beat/miss is semantically wrong for inverse indicators.**
  `components/calendar/event-card.tsx` always treats `actual > forecast` as bullish; for
  unemployment, inventories, etc. higher is bearish. **Fix:** add a per-indicator correlation
  direction and color accordingly.

- **BUG — `RemindButton` timeout not cleared on unmount.**
  `event-card.tsx` schedules a `setTimeout` notification with no cleanup. **Fix:** store the id and
  clear on unmount.

- **BUG — `usage-alerts.ts` re-alerts every run.**
  No "already alerted at threshold" flag → hourly spam at 50%. **Fix:** persist alerted thresholds.

- **BUG — `market-client.ts` `fetchWithTimeout` ignores already-aborted signals.**
  The abort listener is attached after timeout setup. **Fix:** check `init.signal?.aborted` first.

- **BUG — `query-provider.tsx` 4xx-skip never matches.**
  Retry logic checks `error instanceof Response`, but query fns throw `Error`. **Fix:** throw a typed
  error carrying `status` and check that.

### Checklist — Critical Bugs
- [ ] Multi-agent streaming state via `useState` (not ref)
- [ ] Fix multi-agent regenerate duplicate user turn + stale closure
- [ ] Fix `set-alert.tsx` class concatenation
- [ ] Stabilize `mainChart` handle (no sub-pane rebuilds)
- [ ] Force hex candle colors (no oklch in canvas)
- [ ] Unify chart theme source
- [ ] Fix `PerformanceChart` + TradingView widget leaks
- [ ] Reset `lcPromise` on failure
- [ ] Guard `rootBounds` in alert swipe
- [ ] `ProChartView` reference close = `at(-2)`
- [ ] Remove plaintext API key from `sessionStorage`
- [ ] Add CSRF to test buttons
- [ ] Fix onboarding transaction rollback + symbol validation
- [ ] Add profile-page auth redirect
- [ ] Fix initial-render + repeat toasts (dedup pattern)
- [ ] Fix appearance locale select state
- [ ] Per-session revoke state
- [ ] Debounce noise-control inputs
- [ ] Reset password-change success state
- [ ] Re-throw `NEXT_REDIRECT` on register
- [ ] Wrap bulk-test JSON parsing
- [ ] Remove shadowed `cn()`, dedupe `relative()`, derive symbol lists
- [ ] Complete `ArticleCard` memo; fix Ask-AI link; fix counts
- [ ] Correlation-aware calendar beat/miss
- [ ] Clear `RemindButton` timeout; dedupe usage alerts
- [ ] Fix `fetchWithTimeout` + query retry typing

---

## 2. ACCESSIBILITY (P0/P1)

The app has good primitives (skip link, `role` usage, `Switch.srLabel`, `Segmented` keyboard nav) but
many surfaces fall short of WCAG 2.2 AA.

### 2.1 Blockers (P0)
- **Streaming chat text is invisible to screen readers.** `components/chat/message.tsx` /
  `parts/text.tsx` render assistant content without an `aria-live` region. Wrap streamed assistant
  content in `aria-live="polite"` (announce on completion to avoid token spam).
- **Skip-to-content doesn't move focus.** `components/layout/skip-to-content.tsx` relies on the hash;
  Chrome/Safari won't focus `#main-content`. Add `onClick` → `el.focus()` + `scrollIntoView()`. Also
  add the skip link to auth + onboarding layouts (WCAG 2.4.1).
- **`global-error.tsx` has no `lang` and is unstyled.** Renders bare `<html><body>` with default
  serif on white → WCAG 3.1.1 fail + jarring. Add `lang="en"`, app background/typography, a friendly
  message, and a reset/home action.
- **Command palette lacks combobox/listbox semantics.** `components/layout/command-palette.tsx` has no
  `role="combobox"`/`aria-controls`/`role="listbox"`/`role="option"`/`aria-activedescendant`. Power
  users on AT can't operate it. Implement the APG combobox pattern.
- **Password visibility toggle is keyboard-unreachable.** `change-password-card.tsx` uses
  `tabIndex={-1}` and the password fields have no `<label>`s (placeholders only). Make it focusable
  with an `aria-label`, add real labels.

### 2.2 High-impact (P1)
- **Incorrect `role="tablist"` for page nav.** `settings/_components/settings-nav.tsx` (and journal
  tabs) use tab semantics for multi-page links → confuses AT. Use plain `<nav aria-label>`.
- **Radiogroups without arrow-key nav.** `news/_components/news-toolbar.tsx` and
  `calendar/_components/calendar-toolbar.tsx` declare `role="radiogroup"`/`role="radio"` but only
  support Tab. Either reuse the `Segmented` component (which implements roving tabindex) or add
  arrow-key handling.
- **Mode/selection buttons missing state.** `settings/agent/_components/analysis-mode-form.tsx` and
  chart overlay toggles need `aria-pressed`/`role="radio"`+`aria-checked`. The chat mode menu needs
  `aria-selected` on the active item.
- **`aria-expanded` without `aria-controls`.** `chat/parts/plan.tsx`, `parts/citation-warning.tsx`,
  the chart settings drawer, and `tool-card.tsx` toggles need `aria-controls` pointing at the region.
- **Charts announce nothing.** `chart-canvas.tsx` has only `role="img" aria-label="SYMBOL chart"`;
  sub-panes have no a11y attributes. Add a visually-hidden live region with current price/trend, and
  label sub-panes.
- **Inputs lack `aria-describedby` for errors/hints/char-count.** `ui/input.tsx`, `chat/composer.tsx`,
  `noise-control-card.tsx`. Wire descriptions to inputs.
- **Nav trigger has no `aria-expanded`/`aria-controls`.** `components/layout/nav-trigger.tsx`. Also
  the label never changes between open/closed.
- **Error pages have no `role="alert"`.** `app/error.tsx`, `app/(app)/error.tsx`, `not-found.tsx`.
- **2FA QR has generic alt; no recovery codes.** `two-factor-setup.tsx`.
- **Stepper has no `aria-current`/labels; steps don't announce.** `onboarding/wizard.tsx`.
- **`stale-indicator.tsx` uses `aria-live="assertive"`** for a routine "updating" state → interrupts.
  Use `polite`.
- **Skeletons announce nothing.** Wrap loading regions with `role="status"`/`aria-label="Loading"`
  (or rely on a single live region) so AT users know content is loading.

### Checklist — Accessibility
- [ ] `aria-live` for streaming chat
- [ ] Skip-link focus + add to auth/onboarding
- [ ] Style + `lang` + message on `global-error`
- [ ] Combobox/listbox semantics in command palette
- [ ] Fix password toggle focus + real labels
- [ ] Replace wrong `role="tablist"` usages
- [ ] Arrow-key nav on toolbars (or reuse `Segmented`)
- [ ] `aria-pressed`/`aria-checked` on selection controls
- [ ] `aria-controls` on all expandable toggles
- [ ] Chart price/trend live region + sub-pane labels
- [ ] `aria-describedby` for input errors/hints
- [ ] Nav trigger `aria-expanded`/`aria-controls`
- [ ] `role="alert"` on error/404 pages
- [ ] 2FA alt text + recovery codes
- [ ] Onboarding stepper a11y
- [ ] `stale-indicator` → polite
- [ ] Loading regions announce status

---

## 3. PERFORMANCE (P1)

- **DB query on every app navigation.** `app/(app)/layout.tsx` queries onboarding status on every
  route render. Move to middleware or a session/cookie flag.
- **Sequential server queries that should be parallel.** `settings/page.tsx`, `settings/usage/page.tsx`,
  `onboarding/page.tsx` run independent awaits serially. Use `Promise.all`. `about-card.tsx` reads
  `.build-id` from disk on every render — read once at module scope. `system-status-card.tsx` does
  heavy DB work inline — cache it.
- **Heavy expensive backdrop-filter on a sticky element.** `glass-strong` =
  `backdrop-filter: blur(40px) saturate(200%)` and the TopBar repaints every scroll frame. Reduce to
  `blur(20px) saturate(150%)` or use a solid fallback on small/low-power devices.
- **`feTurbulence` noise on the login page.** `components/layout/ambient-background.tsx` vivid mode
  uses an SVG turbulence filter (known iOS-Safari compositing cost) — first impression jank. Replace
  with a pre-baked noise texture or canvas; also `useId()` the filter id to avoid duplicate-id bugs.
- **Markdown + Shiki re-parse on every stream tick.** `chat/parts/text.tsx` re-runs `ReactMarkdown`
  (+`remarkGfm`) and dynamic Shiki per token. Render plain text while streaming, upgrade to
  markdown/highlight on completion (or debounce).
- **Virtualizer estimate too small for tool cards.** `chat/message-list.tsx` `estimateSize: 180`
  while tool cards are 400–600px → big layout jumps and 10+ heavy off-screen renders at
  `overscan: 5`. Estimate per-content and tune overscan.
- **Message memo re-renders all tool cards during text streaming.** `chat/message.tsx`. Split text
  parts and tool parts into separately-memoized children so only text re-renders mid-stream.
- **Overlays/markers rebuilt every 1.5s live tick.** `chart-view.tsx` `buildOverlays` and the
  `setIndicators` effect depend on `candles` (new array each tick). Depend on `structure` /
  `indicatorResults` + a stable times key; gate `usePrice` on chart visibility.
- **Aggressive 1.5s price polling.** `hooks/use-prices.ts` → ~40 req/min/symbol (server caches at 3s).
  Move to SSE/WebSocket or raise to match cache; pause when tab hidden / chart off-screen.
- **N independent timers.** `news/live-timestamp.tsx`, `calendar/calendar-hero.tsx`,
  `calendar/event-card.tsx`, `ui/animated-number.tsx` each create their own interval/observer. Add a
  single shared `TimeProvider` (one `setInterval`) and one shared reduced-motion observer.
- **Context values not memoized.** `nav-drawer-context.tsx` and `news/bookmarks-context.tsx` create
  new objects each render → all consumers re-render. Memoize and split read/write contexts.
- **Lazy-load non-critical chrome.** `command-palette`, `install-nudge` via `next/dynamic`.
- **No route-level `loading.tsx` in several segments** → previous page lingers during nav. Add
  Suspense skeletons.

### Checklist — Performance
- [ ] Remove per-nav onboarding DB query
- [ ] Parallelize server queries; cache build-id + system status
- [ ] Cheapen `glass-strong`; mobile fallback
- [ ] Replace `feTurbulence`; `useId()` filter
- [ ] Defer markdown/Shiki during streaming
- [ ] Tune virtualizer estimate/overscan; split message memo
- [ ] Stop per-tick overlay/indicator rebuilds; gate `usePrice`
- [ ] Move prices to SSE/WS or raise interval; pause when hidden
- [ ] Shared `TimeProvider` + shared reduced-motion observer
- [ ] Memoize/split contexts
- [ ] Lazy-load palette + install nudge
- [ ] Add missing `loading.tsx` skeletons

---

## 4. DESIGN POLISH & CONSISTENCY (P1)

This is where "AI-slop" gets purged. The brand is a **pure-black OKLCH, glass, trading-terminal**
aesthetic — every surface must honor it.

### 4.1 Design-system consistency (purge raw palette colors)
- **Replace all raw Tailwind palette colors with semantic tokens** in:
  `chat/parts/agent-deliberation.tsx` (uses `emerald/blue/red/amber/purple-500`, `gray-50/900`,
  manual `dark:`), `get-social-sentiment.tsx`, `get-system-diagnostics.tsx` (`amber-500`),
  `settings/track-record/page.tsx`, `settings/portfolio/page.tsx` (`bg-surface`, `border-border`,
  `blue/yellow/red-*`), `offline/page.tsx` (`bg-muted`, `text-muted-foreground` shadcn defaults).
  These are the most visible inconsistencies in the app.
- **Fix `bg-muted/30` undefined color in `app/error.tsx`** (no such token → hover does nothing).
- **Unify border radius.** Tool cards mix `rounded-lg`/`rounded-xl`
  (`get-intermarket-resonance.tsx`, `get-system-diagnostics.tsx`); `agent-card.tsx` uses
  `rounded-full` where every other card is `rounded-lg`; calendar hero mixes `rounded-[28px]` +
  `rounded-lg`. Pick a scale and apply it everywhere.
- **Kill the `ring-1` chip pattern** flagged in the codebase's own steering notes
  (`calendar-hero.tsx` CountryChip) and standardize chips.
- **Replace `run-system-action.tsx` retro terminal** (`bg-black/90 text-green-400`, 9px font) with the
  app's glass surface + semantic tokens; bump font ≥12px.
- **Raise sub-12px text.** Multiple `text-[9px]` instances in `journal/_components/stats-summary.tsx`
  and `run-system-action.tsx`. Minimum `text-[10px]`/`text-caption`.

### 4.2 Motion & micro-interactions
- **Add page transitions.** `ViewTransitions` is wired but no `view-transition-name` is set on
  `<main>`; route changes are hard cuts. Add named transitions for a cross-fade/slide.
- **Animate appear/disappear** for: offline banner, chat error banner, scroll-to-bottom FAB,
  tool-card expand/collapse, chart sub-pane enter/exit (`AnimatePresence`), sentiment bars and
  calendar countdown.
- **Message entrance animation.** New chat messages pop in; add subtle `opacity/y` springs.
- **Streaming cursor.** Add a blinking caret/▍ at the end of streaming assistant text.
- **Tap feedback.** Nav trigger and key mobile buttons need `active:scale` + optional
  `navigator.vibrate(10)` (guarded).
- **Use the unused `--ease-organic`** curve for primary transitions instead of default easing.

### 4.3 Loading / empty / error states
- **Make skeletons match real layouts.** News/calendar skeletons omit `SentimentSummary`/
  `CalendarHero`; chart skeleton/empty/error use `aspect-[16/9]` while the chart is `h-[60svh]` →
  layout shift. Align them.
- **Brand the error/404/offline pages.** Add illustration/logo, on-brand copy, and **fix the
  `not-found.tsx` "bottom nav" copy** (there is no bottom nav) and its `/dashboard` link (route may
  not exist; app starts at `/chat`).
- **Don't leak raw `error.message`** to users in `app/error.tsx` (possible info disclosure). Map to
  friendly text; keep details for Sentry.
- **Infinite-scroll loading** in news should show 2–3 skeleton cards, not a text line.

### 4.4 Layout & width system
- **Fix the width mismatch.** TopBar is capped at `max-w-[400px]` while content is `max-w-2xl`
  (672px) → a tiny floating pill over wide content on desktop. Establish one responsive content
  width and align the TopBar to it. A trading app needs to use desktop width for charts/tables.
- **Settings need section grouping.** 13 flat cards → group under "Security", "Notifications",
  "AI & Agent", "Data", "About" using the under-used `SettingsSection`. Reorder so security
  (password, 2FA, sessions) is together. Add subtle row hover states.
- **Auth screens** `max-w-sm` float awkwardly on desktop; wrap in a subtle surface/card and balance
  the `justify-between` gap.

### 4.5 Theming
- **Decide on light mode.** `themeColor` and the appearance card imply light mode, but CSS is
  hard-dark and chart presets are all dark. Either implement a real light theme (tokens + chart
  preset) or remove the light affordances to avoid broken expectations. Add
  `<meta name="color-scheme">` and Firefox `scrollbar-width/color`.
- **Remove dead CSS** (`Inter Fallback` @font-face never used; triplicated `color-scheme: dark`).

### Checklist — Design Polish
- [ ] Purge raw palette colors → tokens (agent-deliberation, sentiment, diagnostics, track-record,
      portfolio, offline, error hover)
- [ ] Unify radius + chip patterns; restyle terminal card; raise tiny fonts
- [ ] Named view transitions; AnimatePresence for banners/FAB/cards/panes
- [ ] Message entrance + streaming cursor + tap feedback + organic easing
- [ ] Skeletons match layouts; brand error/404/offline; fix 404 copy/link; sanitize error text
- [ ] One responsive content width; align TopBar; use desktop width
- [ ] Group + reorder settings; row hover; surface auth forms
- [ ] Resolve light-mode story; add color-scheme meta; Firefox scrollbars; remove dead CSS

---

## 5. UX FLAWS & SMALL UPGRADES (P1/P2)

- **Multi-agent + image silently downgrades to single-agent** (`chat-screen.tsx`) with no notice.
  Tell the user image analysis runs single-agent, or support images in multi-agent.
- **Edit-non-last-message silently forks the thread** with no confirmation. Add a "this starts a new
  branch" hint/confirm.
- **Quick prompts don't show the active session** ("London open" with no "London session is live").
  Surface the current session label.
- **Thread search/select only appears past 5 threads** (arbitrary jump). Lower/soften the threshold.
- **Symbol picker is watchlist-only, no search.** Add typeahead (ties into the command palette).
- **No "Reset to defaults"** in chart settings drawer.
- **Two different chart-settings storage keys** (`hfx_chart_config` vs `hamafx-chart-settings`) →
  preferences don't carry between structure and TradingView views. Unify.
- **Alert form**: no inline validation, no `inputMode="decimal"`, no "send test alert".
- **Alert list swipe** has no visible affordance (add a grabber/hint).
- **Journal**: comma-separated tags should be chips w/ autocomplete; entry/stop/target validated on
  blur, not only submit; short-position profitable region is incomplete; SL→TP slider clamps hide
  "beyond stop/target" states; symbol filter list hardcoded (see §1.4).
- **Sessions**: no "current session" badge.
- **Telegram link**: no polling for confirmation (manual refresh); add deep link to the bot.
- **Models page**: no model comparison (price/capability/latency).
- **Register/reset**: no confirm-password field; reset has no auto-redirect after success.
- **News**: developer-facing copy ("Finnhub primary, Marketaux fallback") should be user-facing;
  search needs debounce (see §3).
- **Notifications card**: rows should deep-link to their settings; optimistic toggles need rollback on
  failure.
- **Symbols form**: prefer drag-to-reorder (`@dnd-kit` already in repo) over arrow buttons; don't poll
  prices while editing the watchlist.

### Checklist — UX
- [ ] Multi-agent image notice; fork-thread confirm; session label in prompts; soften thread-search
      threshold
- [ ] Symbol search; chart "reset defaults"; unify chart settings storage key
- [ ] Alert inline validation + decimal input + test alert + swipe affordance
- [ ] Journal tag chips + on-blur validation + short-position region + slider edge states
- [ ] Current-session badge; telegram polling + bot deep link; model comparison
- [ ] Confirm-password fields; reset auto-redirect
- [ ] User-facing news copy; notif deep links + rollback; drag-reorder symbols + stop price polling

---

## 6. SUGGESTED SEQUENCING

1. **Sprint 1 (P0):** Section 1 (critical bugs) + Section 2.1 (a11y blockers) + the two security
   fixes (sessionStorage key, CSRF).
2. **Sprint 2 (P1):** Section 3 (performance) + Section 2.2 (a11y high-impact).
3. **Sprint 3 (P1):** Section 4 (design polish & consistency) — this is the "premium look" pass.
4. **Sprint 4 (P1/P2):** Section 5 (UX flaws) + remaining P2 polish.

---

## 7. DESIGN PRINCIPLES TO ENFORCE (anti-"AI-slop")

Derived from premium trading/fintech references (TradingView, Coinbase Advanced modular widgets,
institutional terminals, AI-native chat-trading case studies) and the 2026 fintech design trend set:

- **One semantic token system, zero raw palette colors.** Every color goes through a token.
- **Real-time data hierarchy:** price/P&L high-contrast and top; secondary metrics subdued; tabular
  numerals everywhere numbers align.
- **Quiet confidence over decoration.** No purple/rainbow gradients, no generic glassy hero blobs as
  filler. Motion is functional (state changes, streaming, focus), never ornamental.
- **Trading-terminal density on desktop, focused single-column on mobile** — use the width.
- **Progressive disclosure** for advanced metrics (collapsible details), so power users get depth and
  newcomers aren't overwhelmed.
- **Trust signals** baked into AI output: model badge, timestamps, citations, risk disclaimers.
- **Consistency is the premium signal:** identical radius, spacing, chip, card, and motion language on
  every screen.
