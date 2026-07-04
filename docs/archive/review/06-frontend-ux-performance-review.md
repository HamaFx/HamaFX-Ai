# 06 — Frontend UX & Performance Review

**Type:** Implementation-ready handoff prompt (read-only audit → fixes for a follow-up agent)
**Scope audited:** `apps/web/src/app` (pages/routes), `apps/web/src/components`, styling/theming
(`globals.css`, `next.config.mjs`, Tailwind v4 tokens), PWA (`manifest.ts`, `scripts/generate-sw.mjs`,
`scripts/sw.template.js`, `components/providers/sw-register.tsx`), and `docs/06-frontend.md`.
**Stack:** Next.js 15 (App Router) · React 19 · Tailwind v4 · shadcn/ui-style primitives · vaul ·
`lightweight-charts` v5 · TanStack Query/Virtual · AI SDK v5.
**Audit date:** 2026-07-01 · **Auditor:** read-only static review (no code executed).

> Note on scope: the prompt referenced `docs/05-ui-ux.md`; that file does **not** exist. The relevant
> design doc is `docs/06-frontend.md` (audited). Several findings below are **doc/README-vs-code
> mismatches** — flagged explicitly so the implementer fixes code or docs, not both blindly.

---

## Part 1 — Context & Mission

You are implementing fixes from a read-only frontend UX/performance audit of the HamaFX-Ai web app —
a mobile-first, chat-driven PWA for forex/commodities with live charts, a trading journal, alerts,
news, calendar, and settings/usage views.

**The good news (do not "fix" these):** the codebase is mature and largely well-built.

- Loading states are broad: **20 `loading.tsx`** files across routes.
- Error boundaries exist at root (`app/error.tsx`, `app/global-error.tsx`), the authenticated group
  (`app/(app)/error.tsx`), and settings (`app/(app)/settings/error.tsx`), plus a dedicated class
  `ChartErrorBoundary` around the structure chart.
- The chart is created **once** on mount and data is pushed imperatively (correct instance-reuse
  pattern — no per-tick `createChart`).
- The service worker is **real**, not a scaffold: a `sw.template.js` is stamped by a `postbuild`
  step (`generate-sw.mjs`), registration is deferred to idle with an update-available toast, the
  cache is build-versioned, navigation is network-first with a 3s timeout, and the API bypass list
  is correct.
- Chat + journal lists are virtualized with TanStack Virtual; the composer is thoroughly labeled
  (`aria-label`, `aria-pressed`, `role="alert"`, live char count); a skip link + `<main tabIndex={-1}>`
  work; reduced-motion is respected; contrast tokens were deliberately tuned (`--color-fg-subtle`
  raised 60%→68% L).

**Your mission:** close the specific gaps in Part 3 without regressing the above. This is a targeted
remediation, not a rewrite. Highest-value fixes are the **broken offline precache (FE-13)**, the
**per-tick chart series churn (FE-09/FE-10)**, and the **silent news-fetch failure (FE-01)**.

---

## Part 2 — Ground Rules

1. **Do not fabricate.** Every finding below cites a file (and symbol/line). Verify before changing.
2. **Minimal, surgical diffs.** Preserve the existing architecture, naming, and license headers.
3. **Fix root causes, not symptoms.** E.g. FE-13 is a missing asset + atomic-`addAll` interaction —
   fix both the asset and the precache robustness.
4. **Resolve doc-vs-code mismatches deliberately** — decide which side is correct and update that one.
5. **No new heavy dependencies.** Prefer platform APIs and what's already installed.
6. **Verify each fix against Part 5** before marking done. Run `pnpm --filter @hamafx/web typecheck`
   and `lint` (both are enforced in `next.config.mjs`).

---

## Part 3 — Findings

Severity: **P1** = broken/silent-failure user impact · **P2** = degraded UX/perf or a11y conformance ·
**P3** = polish / claim-accuracy.

### A. Loading & error states

**FE-01 (P1) — News fetch fails silently, renders "empty" instead of "error".**
`app/(app)/news/_components/news-view.tsx` uses `useInfiniteQuery` but destructures only
`{ data, fetchNextPage, hasNextPage, isFetchingNextPage }` — never `isError`/`error`. On a failed
`/api/news` request, `allArticles` falls back to `initialArticles` and the view shows the
`EmptyState` ("no news"), so an API/network failure is indistinguishable from "no results". This is
the one place that genuinely **fails silently** among the major views.

**FE-02 (P2) — No per-view `error.tsx`; render-time throws blow away the whole app region.**
Only `(app)/error.tsx` (group), `settings/error.tsx`, root, and global boundaries exist. `chat`,
`chart/[symbol]`, `journal`, `alerts`, `news`, `calendar`, `settings/usage`, `dashboard`, and
`signals` have **no scoped `error.tsx`**. Client views mostly handle *query* errors inline (good),
but an unhandled *render* throw in any of them escalates to the group boundary and replaces the
entire authenticated content area with the generic page rather than a scoped, recoverable error.

**FE-03 (P3) — Inline load-failure messages aren't announced to screen readers.**
`journal-view.tsx` (`Failed to load journal portfolio`) and `alert-list.tsx` (`Failed to load: …`)
render plain `<p className="text-bear">` with no `role="alert"`/`aria-live`. Calendar's failure uses
`EmptyState` (also not a live region). The root `error.tsx` correctly uses `role="alert"` — mirror
that.

### B. Mobile-first claims vs. reality

**FE-04 (P2) — `--touch-min: 44px` is defined but never used; 28 controls are 32–36px, one is 20px.**
`globals.css:208` declares `--touch-min: 44px`, but `grep` shows **zero** references to it anywhere
in `src/`. Interactive controls hardcode sub-44px sizes: composer send/attach/voice/stop are
`size-[36px]` (`components/chat/composer.tsx`), chart zoom controls `size-8` (32px)
(`components/chart/chart.tsx`), message hover-action pills 32px, and the composer image-remove button
is `size-5` (**20px**). The 20px target **fails WCAG 2.2 SC 2.5.8** (24×24 CSS px minimum); the 36px
targets pass 2.5.8 but violate the app's own mobile-first 44px standard and the AAA SC 2.5.5 (44px).
This is the core "mobile-first claim vs. reality" gap. (Note: safe-area insets, `viewport-fit=cover`,
`field-sizing` composer, and IntersectionObserver gating are all correctly implemented — the gap is
specifically tap-target sizing.)

### C. Accessibility

**FE-05 (P1, a11y) — Duplicate non-unique IDs across all tool-result cards.**
`components/chat/parts/tool-card.tsx` hardcodes `id="tool-card-content"` and
`aria-controls="tool-card-content"` on the disclosure button. Every tool card in a thread renders the
**same id** → invalid HTML (duplicate IDs) and `aria-controls` resolves ambiguously, breaking the
expand/collapse relationship for assistive tech. Fix with `useId()`.

**FE-06 (P2, a11y) — Streamed assistant responses aren't announced.**
`components/chat/message-list.tsx` gives the typing indicator `role="status"`, but the streaming
assistant *text* is not inside an `aria-live` region, so screen-reader users don't hear responses as
they stream. `chart-canvas.tsx` already models the right pattern (an `sr-only` `role="status"
aria-live="polite"` block) — mirror it for the live assistant message.

**FE-07 (P2, a11y) — Bottom-sheet dialogs may lack an accessible name; custom trap duplicates vaul's.**
`components/ui/drawer.tsx` implements a solid manual focus trap and focus restore, but `DrawerContent`
does not enforce a `DrawerTitle`/`aria-label`; vaul/Radix dialogs require a title for an accessible
name. Audit every `Drawer`/`DrawerContent` usage (nav drawer, overlay sheet, chart settings drawer,
command palette, confirm drawer) for a `DrawerTitle` (visually hidden if needed). Also note the manual
`window` keydown trap **duplicates** vaul's built-in trap/Escape handling — reconcile to avoid
double-handling.

**FE-08 (P3, a11y) — Verify small-text contrast on elevated glass surfaces.**
Contrast tokens are deliberately tuned, but many captions use `text-fg-subtle` (`oklch(68% 0 0)`) at
`text-caption` size over `bg-elev-2/3` and translucent `glass-*` surfaces. Confirm these meet WCAG
1.4.3 (4.5:1 for normal text) with a contrast tool at the actual composited backgrounds — glass blur
+ translucency makes the effective ratio lower than token-vs-`--color-bg` suggests.

### D. Chart performance (live 1.5s polling / high-frequency updates)

**FE-09 (P1, perf) — Full `setData()` on every live tick instead of `series.update()`.**
`chart-view.tsx` recomputes a new `candlesWithLive` array on every price tick (memo keyed on
`[candles, tick, tf, symbol]`), which flows to `ChartCanvas`'s `useEffect([candles])` →
`instance.setCandles()` → `candleSeries.setData(...)` over **~300 bars every tick**. The
lightweight-charts docs are explicit: use `ISeriesApi.update(bar)` for high-frequency updates;
`setData()` is a full reset (reprocesses the whole series, can reset the visible range) and is
**"explicitly not recommended for performance-critical updates."** Add an incremental path
(`update()` for the last/new bar) and reserve `setData()` for symbol/timeframe/history changes.

**FE-10 (P1, perf) — Every tick destroys and recreates ALL main-pane indicator series.**
`chart-canvas.tsx`'s `setIndicators` effect depends on `[indicatorResults, candles]`, and
`setIndicators()` does `removeSeries()` on every existing indicator handle then `addSeries()` +
`setData()` for each EMA/SMA/Bollinger/pivot line. Because `candles` changes every tick, the entire
on-chart indicator set is **torn down and rebuilt per tick** — the exact "recreating instead of
updating" anti-pattern the audit targets. The sub-panes (`use-sub-pane-chart.ts`) already do this
correctly (init series once, `updateData` on change); bring the main pane to parity: create indicator
series once per indicator-config change, then `setData`/`update` their data — do **not** key series
lifecycle on `candles`.

**FE-11 (P2, claim) — Polling cadence + "sub-second worker-fed updates" don't match code.**
`docs/06-frontend.md` and `README.md` claim **1.5s** price polling; actual `hooks/use-prices.ts`
uses `POLL_MS = 3_000` (3s) and the chart footer text says "Polling at 3s". Also the audit's
"sub-second worker-fed updates": an SSE hook (`hooks/use-price-stream.ts`) exists but the structure
chart consumes `usePrice` (polling), **not** the stream — the sub-second path is unwired. Decide the
intended cadence and align code + docs (and, if desired, wire the SSE stream into the chart with the
`update()` path from FE-09).

**FE-12 (P2, perf) — Virtualizer size estimate never matches tool messages → scroll jank.**
`message-list.tsx` `estimateSize` returns 500 when `p.type === 'tool-invocation'`, else 180. But
`message.tsx` dispatches tool parts via `part.type.startsWith('tool-')` (types are `tool-get_price`
etc.); **no part is ever `'tool-invocation'`**. So tool-heavy messages are always estimated at 180px,
mis-measuring row heights and causing scroll jumps/jank on tool-dense threads. Fix the predicate to
`p.type.startsWith('tool-')`.

### E. PWA correctness

**FE-13 (P1) — Offline precache silently fails entirely because `/favicon.ico` 404s.**
`scripts/generate-sw.mjs` `PRECACHE_URLS` includes `/favicon.ico` and `/manifest.webmanifest`, and
`sw.template.js` `install` does `cache.addAll(urls)`. **`addAll` is atomic** — if any single URL
fails, the whole operation rejects. The repo has **no favicon** (`app/favicon.ico`,
`public/favicon.ico`, or an app icon route all absent), so `/favicon.ico` returns 404 in production.
The install handler wraps `addAll` in `try/catch` and only `console.warn`s, so the failure is
**silent and total**: `/chat`, `/offline`, and the icons are **never precached**, and offline
navigation returns the 503 `"Offline"` text fallback instead of the app shell. The PWA looks wired
but offline mode is effectively broken. Fix by (a) adding a real favicon (or removing it from the
precache list) **and** (b) making precache resilient — precache per-URL with `Promise.allSettled`
(or `Cache.add` in a loop) so one missing asset can't wipe the whole shell.

**FE-14 (P3) — Manifest references screenshots that don't exist.**
`app/manifest.ts` lists `/screenshots/chat.png` and `/screenshots/dashboard.png`, but
`public/screenshots/` does not exist → 404s → the richer install UI (screenshots) is ignored by
browsers. Either add the screenshots or remove the `screenshots` array. (Not in the precache list, so
this does not break install — cosmetic only.)

### F. Bundle / performance basics

**FE-15 (P2) — CSP blocks the TradingView Pro chart script when enabled.**
`next.config.mjs` sets `script-src 'self' 'unsafe-eval' 'unsafe-inline'` — it does **not** whitelist
`https://s3.tradingview.com`. `tradingview-widget.tsx` loads `https://s3.tradingview.com/tv.js` via
`next/script`; under this CSP the external script is blocked, so with
`NEXT_PUBLIC_TRADINGVIEW_ENABLED=1` the Pro chart **always** falls to `FallbackMessage`. Add the
TradingView origin to `script-src` (and any origins the widget itself fetches) if the Pro chart is a
supported path. Separately, `'unsafe-eval' 'unsafe-inline'` broadly weaken XSS defense — track
tightening as a security follow-up (out of this review's core scope).

**FE-16 (P2) — Remote images bypass `next/image`; no `images` config.**
`next.config.mjs` has no `images` block, and `next/image` is used in exactly one file
(`(auth)/layout.tsx`). Journal screenshots are remote Supabase URLs rendered with raw `<img>`
(`journal/_components/entry-form.tsx`, `entry-list.tsx`) — candidates for `next/image` (with
`remotePatterns`) to get sizing, lazy-loading, and format optimization. (The composer preview uses
blob/object URLs and the 2FA QR is a data URL — those are legitimately raw `<img>`; leave them.)

**FE-17 (P3, claim) — News feed is not virtualized despite the README claim.**
`README.md` claims "virtualized feeds via TanStack Virtual", but `news-view.tsx` renders
`buckets.map(... items.map(...))` with infinite scroll, accumulating unbounded DOM nodes as the user
scrolls. Chat and journal *are* virtualized. Either virtualize the news list or soften the README
claim.

**FE-18 (P3, perf) — Heavy client-component footprint; measure before trimming.**
~**140 of 240** `.tsx` files are `'use client'` (~58%), and settings pages are `force-dynamic`. Some
render mostly static content that could be RSC to cut client JS (2026 CWV guidance favors RSC-first,
lean client components). This is a profiling-driven opportunity, not a blind refactor — measure with
`ANALYZE=true` (the bundle analyzer is already wired) and RUM first.

---

## Part 4 — Remediation Plan (ordered)

Work top-down; P1s first. Each task lists the file(s) and the intended change.

**Sprint 1 — P1 correctness (offline, charts, silent failure, a11y IDs)**

1. **FE-13 Offline precache**
   - Add a real favicon: `apps/web/src/app/favicon.ico` (or `icon.png`), OR remove `/favicon.ico`
     from `PRECACHE_URLS` in `scripts/generate-sw.mjs`.
   - Harden `sw.template.js` `install`: replace `cache.addAll(urls)` with a per-URL
     `Promise.allSettled(urls.map((u) => cache.add(u)))` so a single 404 can't discard the whole
     shell; keep the `waitUntil` + warn. Confirm `/chat` and `/offline` end up cached.
2. **FE-09 / FE-10 Chart tick path** (`chart-canvas.tsx`, `chart-view.tsx`)
   - Add an incremental candle update: expose `updateLastCandle(bar)` on the chart instance that calls
     `candleSeries.update(...)`; drive the live tick through it instead of rebuilding `candlesWithLive`
     + `setData`. Reserve `setCandles()`/`setData()` for symbol/timeframe/history changes.
   - Decouple indicator series lifecycle from `candles`: create/remove series only when the
     indicator **config** changes; update their data via `setData`/`update`. Mirror
     `use-sub-pane-chart.ts` (init once, update on change).
3. **FE-01 News error state** (`news-view.tsx`)
   - Destructure `isError`/`error` from `useInfiniteQuery`; render an explicit error state (with a
     retry) distinct from the empty state; don't mask failures behind `initialArticles`.
4. **FE-05 Tool-card IDs** (`parts/tool-card.tsx`)
   - Replace the hardcoded `id`/`aria-controls` with a `useId()`-derived unique id.

**Sprint 2 — P2 UX / a11y / perf**

5. **FE-04 Touch targets** — enforce `--touch-min` (44px) on primary controls (composer buttons,
   chart zoom, message actions); bump the 20px image-remove button to ≥24px (ideally 44px hit area
   via padding). Add a lint/util so new controls default to the token.
6. **FE-12 Virtualizer estimate** (`message-list.tsx`) — fix predicate to `p.type.startsWith('tool-')`.
7. **FE-06 Streaming aria-live** (`message-list.tsx`/`chat-screen.tsx`) — wrap the live assistant
   message in a polite `aria-live` region (mirror `chart-canvas.tsx`).
8. **FE-07 Drawer titles** — ensure every `DrawerContent` has a `DrawerTitle` (visually hidden if
   needed); reconcile the manual trap with vaul's built-in.
9. **FE-15 CSP** (`next.config.mjs`) — whitelist `https://s3.tradingview.com` in `script-src` if the
   Pro chart is supported; otherwise document that the Pro path is intentionally disabled.
10. **FE-16 Images** — add `images.remotePatterns` for the Supabase host; migrate journal remote
    `<img>` to `next/image`.
11. **FE-11 Polling/stream** — align 1.5s-vs-3s across code + docs; optionally wire `use-price-stream`
    (SSE) into the chart using the FE-09 `update()` path.

**Sprint 3 — P3 polish / claim accuracy**

12. **FE-02** add scoped `error.tsx` to the high-traffic views (chat, chart, journal) at minimum.
13. **FE-03** add `role="alert"` to inline load-failure messages.
14. **FE-08** verify small-text contrast on glass; adjust tokens/sizes if <4.5:1.
15. **FE-14** add or remove manifest screenshots.
16. **FE-17** virtualize the news list or soften the README claim.
17. **FE-18** profile with `ANALYZE=true` + RUM; convert clearly-static client components to RSC.

---

## Part 5 — Acceptance Criteria & Verification

- **FE-13:** After `pnpm --filter @hamafx/web build`, `public/sw.js` + `public/sw-precache.json` exist;
  in DevTools → Application → Cache Storage, `hamafx-shell-v<id>` contains `/chat` and `/offline`;
  toggling offline and reloading serves the cached shell (not the 503 text). No 404 in the precache
  set.
- **FE-09/FE-10:** With a chart open and indicators on, a live tick issues `series.update()` (not
  `setData` over 300 bars) and does **not** call `removeSeries`/`addSeries`; verify via a temporary
  counter/Performance panel that no indicator series churn occurs per tick and the visible range does
  not jump on ticks.
- **FE-01:** Force `/api/news` to 500 → the view shows a distinct error + retry, not "no news".
- **FE-05:** Multiple tool cards in one thread → no duplicate-id warnings; each disclosure's
  `aria-controls` resolves to its own panel (axe/Lighthouse a11y clean).
- **FE-04:** Primary interactive controls report ≥24×24 CSS px (target ≥44px); the image-remove button
  ≥24px. Verify with the axe "target size" rule.
- **FE-12:** Scroll a thread with several tool cards — no visible jump/reflow as rows measure.
- **FE-06:** VoiceOver/NVDA announces streamed assistant text.
- **FE-15:** With `NEXT_PUBLIC_TRADINGVIEW_ENABLED=1`, `tv.js` loads with no CSP violation in console
  and the Pro chart renders.
- **Global:** `pnpm --filter @hamafx/web typecheck` and `lint` pass (both enforced in build); no new
  console errors/warnings introduced.

---

## Part 6 — Research & References (2026)

**Next.js 15 / React 19 Core Web Vitals**
- Next.js Performance Optimization in 2026 — TTFB, CWV, profiling workflow (RSC-first, direct imports
  over barrels, reserve `next/dynamic`, PPR/streaming): https://wolf-tech.io/blog/nextjs-performance-optimization-in-2026-ttfb-core-web-vitals-and-the-profiling-workflow-that-finds-real-bottlenecks
- Core Web Vitals thresholds (LCP < 2.5s, INP < 200ms, CLS < 0.1): https://web.dev/articles/vitals
- Vercel Speed Insights (RUM before optimizing): https://vercel.com/docs/speed-insights
  → Supports FE-18 (measure first; convert static client components to RSC) and FE-16 (`next/image`).

**TradingView lightweight-charts — high-frequency updates**
- `ISeriesApi` — `update()` vs `setData()`: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ISeriesApi
- Getting started (prefer `update` for high-frequency; `setData` "not recommended for
  performance-critical updates"): https://tradingview.github.io/lightweight-charts/docs
- Realtime updates tutorial: https://tradingview.github.io/lightweight-charts/tutorials/demos/realtime-updates
- Issue #1990 — markers/series realignment when using `setData` per tick; prefer `update`:
  https://github.com/tradingview/lightweight-charts/issues/1990
  → Directly supports FE-09/FE-10.

**PWA best practices (mobile-first, data-dense)**
- MDN — Caching / service workers (precache in `install`, `waitUntil`, cache-first for static,
  network-first/SWR for dynamic; caches can be evicted → keep network fallback):
  https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching
  → `addAll` is atomic; a single failed request rejects the whole precache — supports FE-13's
  `allSettled`/per-URL hardening.

**Accessibility — WCAG 2.2 for data dashboards**
- SC 2.5.8 Target Size (Minimum) — 24×24 CSS px (or sufficient spacing):
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- SC 2.5.5 Target Size (Enhanced, AAA) — 44×44 CSS px.
- SC 1.4.3 Contrast (Minimum) — 4.5:1 normal text: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- SC 4.1.2 Name, Role, Value (unique IDs / accessible names): https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
  → Supports FE-04 (targets), FE-05 (IDs), FE-06/FE-07 (name/role/live), FE-08 (contrast).

---

## Part 7 — Risks, Assumptions & Out-of-Scope

**Assumptions**
- `/favicon.ico` returns 404 in production because no favicon asset or app icon route exists in the
  repo at audit time (verified by filesystem search). If a favicon is added elsewhere in the build
  pipeline, FE-13's asset half is moot — but the atomic-`addAll` hardening is still worth doing.
- Chart tick cadence findings assume the polling path (`usePrice`, 3s) is the live source in
  production; the SSE stream hook exists but is not wired to the chart.

**Risks when implementing**
- **Chart refactor (FE-09/FE-10)** touches the hottest render path — regression-test symbol switch,
  timeframe switch, indicator toggles, overlay toggles, theme changes, and offscreen
  pause/resume (IntersectionObserver) after moving to `update()`.
- **SW precache change (FE-13)** affects offline behavior for existing installs; bump the cache
  version and verify the update toast → reload flow still works.
- **CSP change (FE-15)** — add only the specific TradingView origin(s); do not broaden `script-src`
  to `https:`.

**Explicitly out of scope for this review**
- Backend/API route logic, auth, cron, worker, and DB layers (covered by other review docs).
- Deep security hardening of the CSP (`unsafe-eval`/`unsafe-inline`) beyond the TradingView unblock —
  track separately.
- Full manual screen-reader test matrix (NVDA/JAWS/VoiceOver/TalkBack) — this audit is static code
  review; a device/AT pass should follow the fixes.
- Non-frontend packages under `packages/*`.

---

*End of handoff. All findings are evidence-based against the repository state on the audit date; no
findings were inferred without a file reference.*
