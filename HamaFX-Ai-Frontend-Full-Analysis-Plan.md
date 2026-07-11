# HamaFX-Ai Frontend — Complete Analysis & Implementation Plan

> **Generated:** 2026-07-11  
> **Scope:** Full frontend analysis of all 396 frontend files across 8 system areas  
> **Purpose:** Detailed actionable plan for an implementation agent to fix all bugs, drifts, flaws, and apply improvements  
> **Project:** HamaFX-Ai — Next.js 15 PWA, React 19, Tailwind CSS v4, shadcn/ui, Vercel AI SDK v5

---

## Executive Summary

A comprehensive page-by-page, line-by-line analysis of the entire HamaFX-Ai frontend was conducted across 8 system areas by specialized analysis agents. **346+ findings** were identified spanning bugs, UX issues, security vulnerabilities, performance problems, design system drift, missing features, code quality issues, and polish opportunities.

### Finding Distribution

| Priority | Count | Description |
|----------|-------|-------------|
| 🔴 P0 — Critical | ~35 | User-visible bugs, security vulnerabilities, data loss, broken features |
| 🟠 P1 — High | ~55 | Functional bugs, significant UX issues, performance problems |
| 🟡 P2 — Medium | ~110 | UX improvements, design drift, moderate performance issues |
| 🔵 P3 — Low/Polish | ~146 | Code quality, consistency, minor polish, dead code |

### Systems Analyzed

| # | System | Files | Findings | Analysis File |
|---|--------|-------|----------|---------------|
| 1 | Auth, Onboarding & Root | 19 | ~40 | `auth-onboarding-root-analysis.md` |
| 2 | Chat System | 40+ | ~50 | `chat-system-analysis.md` |
| 3 | Dashboard & Widgets | 16 | ~50 | `dashboard-analysis.md` |
| 4 | Chart System | 30+ | ~40 | `chart-system-analysis.md` |
| 5 | News, Calendar, Signals, Alerts | 24 | ~48 | `news-calendar-signals-alerts-analysis.md` |
| 6 | Journal System | 13 | ~63 | `journal-system-analysis.md` |
| 7 | Settings System | ~45 | ~40 | `settings-system-analysis.md` |
| 8 | Admin, Layout, UI, Lib | 48 | ~62 | `admin-layout-ui-lib-analysis.md` |

---

## Cross-Cutting Issues (Affect Multiple Systems)

These are systemic issues found across multiple pages/components. Fix these FIRST as they resolve many individual findings simultaneously.

### CC-1 🔴 P0: "Icon" Prefix Artifacts in User-Facing Text (SYSTEM-WIDE)

**Affected files:** ~20+ files across settings, journal, news, calendar, signals, admin, layout, chart  
**Root cause:** A broken find-and-replace operation replaced icon component names (e.g., `IconSettings`, `IconSearch`, `IconDeviceFloppy`) with the literal string "Icon" prefixed to the next word in user-facing text strings.

**Examples:**
- `settings/page.tsx:43` → `title: 'IconSettings'`
- `telegram/page.tsx:32` → `title: 'Telegram IconRobot — IconSettings'`
- `usage-limits-form.tsx` → Save button reads "IconDeviceFloppy Changes"
- `disabled-tools-form.tsx` → Save button reads "IconDeviceFloppy Changes"
- `market-data-config.tsx` → Save button reads "IconDeviceFloppy Provider"
- `command-palette.tsx` → Group label shows "IconSettings", placeholder shows "IconSearch…"
- `symbol-picker.tsx` → Placeholder reads "IconSearch symbols…"
- Journal system → 6 instances of icon name leakage
- News/calendar/signals → 8 instances of "Icon" names in user-facing strings

**Fix:** Global search for `Icon[A-Z]` in string literals (not import statements or JSX component references). Replace each with the correct plain text. Examples:
- `'IconSettings'` → `'Settings'`
- `'IconDeviceFloppy Changes'` → `'Save Changes'`
- `'IconArrowRight a test message'` → `'Send a test message'`
- `'IconList all commands'` → `'List all commands'`
- `'IconSearch symbols…'` → `'Search symbols…'`
- `'IconRobot'` → `'Robot'` or `'Bot'`
- `'IconKey'` → `'Key'`
- `'IconLink'` → `'Link'`
- `'IconCheck'` → `'Check'`

**Implementation:** Run `grep -rn "Icon[A-Z][a-z]" --include='*.tsx' --include='*.ts' apps/web/src/` and manually review each hit. Only fix string literals, NOT import names or JSX component usage.

---

### CC-2 🔴 P0: Hardcoded `bg-black` / `text-black` Bypassing Design Tokens

**Affected files:** `error.tsx`, `not-found.tsx`, `global-error.tsx`, `top-bar.tsx`, `offline/page.tsx`, dashboard widgets, chat components  
**Issue:** Multiple components use `bg-black` or `text-black` instead of design token classes like `bg-bg-base` / `text-fg`. On dark themes or custom accent themes, these produce invisible elements (e.g., black "H" logo on black background).

**Fix:** Replace all `bg-black` → `bg-bg-base`, `text-black` → `text-fg`, `bg-white` → `bg-bg-elev-1` throughout the codebase. Run: `grep -rn 'bg-black\|text-black\|bg-white' --include='*.tsx' apps/web/src/`

---

### CC-3 🟠 P1: Missing CSRF Protection on Multiple Mutation Endpoints

**Affected files:** `onboarding/actions.ts`, `journal/import/route.ts`, various server actions  
**Issue:** Several mutation endpoints lack CSRF token verification. The project has a CSRF utility (`lib/csrf.ts`) but it's not consistently applied.

**Fix:** Audit all server actions and API routes that perform mutations. Add CSRF token verification using the existing `verifyCsrfToken()` utility. Ensure all forms include the CSRF token.

---

### CC-4 🟠 P1: Missing Error Boundaries on Multiple Routes

**Affected routes:** `/news`, `/alerts`, `/calendar`, `/settings/billing`, `/settings/api-keys`  
**Issue:** Several routes lack `error.tsx` files, meaning unhandled errors produce unstyled 500 pages.

**Fix:** Add `error.tsx` to each missing route, following the pattern from `signals/error.tsx` or `journal/error.tsx`.

---

### CC-5 🟠 P1: Native `window.confirm()` Used Despite Purpose-Built `ConfirmDrawer`

**Affected files:** `onboarding-reset-card.tsx`, `admin-onboarding-control.tsx`, possibly others  
**Issue:** The project has a `ConfirmDrawer` component but several places use native `confirm()` instead, creating inconsistent UX.

**Fix:** Replace all `window.confirm()` calls with the `ConfirmDrawer` component.

---

### CC-6 🟡 P2: Inconsistent Skeleton/Loading States

**Affected files:** Multiple `loading.tsx` files across all systems  
**Issue:** Many loading skeletons don't match their corresponding page layouts, causing visible layout shift. Skeleton column counts, heights, and structures differ from actual content.

**Fix:** Audit each `loading.tsx` and align its structure with the actual page layout. Ensure responsive breakpoints match.

---

### CC-7 🟡 P2: Duplicated Utility Functions Across Systems

**Affected files:** Multiple  
**Issue:** Functions like `formatCountdown`, `formatStamp`, `startOfDay`, `handleRadioKeyDown`, `refetchIntervalFor` are duplicated across 2-3 files each.

**Fix:** Extract to shared utilities in `lib/format.ts` or a new `lib/datetime.ts`, and import from there.

---

### CC-8 🟡 P2: `console.error` / `console.warn` / `console.log` in Production Code

**Affected files:** `error.tsx` (root), `signals/error.tsx`, `market-client.ts`, multiple components  
**Issue:** Console statements left in production code instead of using the structured `logger`.

**Fix:** Replace all `console.*` calls with the project's `logger` utility. Use `Sentry.captureException()` in error boundaries.

---

### CC-9 🔵 P3: Index-as-Key in Lists

**Affected files:** Chat tool parts (portfolio, sentiment), news article lists, signal lists  
**Issue:** Using array index as React key can cause rendering bugs when list items reorder.

**Fix:** Use stable unique identifiers (id, uid, or composite keys) for all list items.

---

### CC-10 🔵 P3: Duplicated SkeletonCard/ErrorCard Components in Chat Tool Parts

**Affected files:** All 30+ files in `components/chat/parts/`  
**Issue:** Each tool part defines its own `SkeletonCard` and `ErrorCard` component instead of sharing.

**Fix:** Extract to `components/chat/parts/_shared.tsx` and import.

---

## PHASE 1: Critical Fixes (P0)

> **Estimated effort:** 2-3 days  
> **Goal:** Fix all user-visible bugs, security vulnerabilities, and data loss issues

### 1.1 Fix "Icon" Prefix Artifacts (CC-1)

**Files to modify:**
- `apps/web/src/app/(app)/settings/page.tsx` — line 43: `'IconSettings'` → `'Settings'`
- `apps/web/src/app/(app)/settings/telegram/page.tsx` — lines 32, 35, 37, 51, 72
- `apps/web/src/app/(app)/settings/usage/_components/usage-limits-form.tsx` — save button text
- `apps/web/src/app/(app)/settings/agent/_components/disabled-tools-form.tsx` — save button text
- `apps/web/src/app/(app)/settings/api-keys/_components/market-data-config.tsx` — save button text
- `apps/web/src/components/layout/command-palette.tsx` — group label and placeholder
- `apps/web/src/components/chart/symbol-picker.tsx` — placeholder text
- `apps/web/src/app/(app)/journal/_components/entry-form.tsx` — 6 instances
- `apps/web/src/app/(app)/journal/_components/entry-list.tsx` — icon name leakage
- `apps/web/src/app/(app)/journal/_components/import-trades.tsx` — icon name leakage
- `apps/web/src/app/(app)/news/_components/news-toolbar.tsx` — icon names in strings
- `apps/web/src/app/(app)/calendar/_components/calendar-toolbar.tsx` — icon names
- `apps/web/src/app/(app)/signals/_components/signals-dashboard.tsx` — icon names
- `apps/web/src/app/(app)/alerts/_components/alert-form.tsx` — icon names
- `apps/web/src/app/(app)/alerts/_components/alert-list.tsx` — icon names
- `apps/web/src/app/(app)/admin/_components/admin-onboarding-control.tsx` — icon names
- `apps/web/src/app/(app)/admin/_components/admin-feature-flags.tsx` — icon names

**Action:** Search all `.tsx` and `.ts` files for string literals containing `Icon[A-Z]` patterns. Carefully distinguish between:
- ✅ Import statements: `import { IconSettings } from '@tabler/icons-react'` — DO NOT change
- ✅ JSX usage: `<IconSettings />` — DO NOT change
- ❌ String literals: `title: 'IconSettings'` — FIX to `'Settings'`
- ❌ Button text: `"IconDeviceFloppy Changes"` — FIX to `"Save Changes"`

---

### 1.2 Fix Hardcoded Colors (CC-2)

**Files to modify:**
- `apps/web/src/app/error.tsx` — `text-black` → `text-fg` (invisible "H" logo on dark)
- `apps/web/src/app/not-found.tsx` — `text-black` → `text-fg`
- `apps/web/src/app/global-error.tsx` — hardcoded colors, add fallback values
- `apps/web/src/components/layout/top-bar.tsx` — `bg-black` → `bg-bg-base`
- `apps/web/src/app/(app)/offline/page.tsx` — `bg-black` → `bg-bg-base`
- `apps/web/src/app/(app)/dashboard/_components/widgets/pnl-heatmap-widget.tsx` — hardcoded RGB
- `apps/web/src/components/chat/parts/agent-deliberation.tsx` — `bg-black` → `bg-bg-base`
- Any other file found via grep

---

### 1.3 Fix Chart Precision Race Condition

**File:** `apps/web/src/components/chart/chart-canvas.tsx` (~lines 80-90) + `chart.tsx` (~lines 55-60)  
**Issue:** `applyDecimals` is a no-op on initial load because `useImperativeHandle` creates the handle before the async `import('lightweight-charts')` resolves. EURUSD/GBPUSD show 2 decimals instead of 5.  
**Fix:** In `ChartCanvas`'s mount effect, after `instanceRef.current = instance`, call `instance.applyDecimals(priceDecimals(symbol))` directly. Or move the `applyDecimals` call into the async import callback.

---

### 1.4 Fix Chart Error Boundary Not Resetting on Symbol Change

**File:** `apps/web/src/app/(app)/chart/[symbol]/_components/chart-view.tsx` (~line 195)  
**Issue:** `ChartErrorBoundary` doesn't reset when symbol or timeframe changes. After an error on one symbol, switching to another still shows the error.  
**Fix:** Add a `key={symbol + timeframe}` prop to the `ChartErrorBoundary` or implement `componentDidUpdate` to reset state when the key changes.

---

### 1.5 Fix Chart `referenceClose` Ref Never Resets

**File:** `apps/web/src/app/(app)/chart/[symbol]/_components/chart-view.tsx`  
**Issue:** `referenceClose` ref is set when candles load but never reset on symbol change. PriceTag shows absurd deltas (e.g., 2370 → 1.08) when switching from XAUUSD to EURUSD.  
**Fix:** Reset `referenceClose.current = null` in a `useEffect([symbol])` before new candles load.

---

### 1.6 Fix Chart Full `setData` on Every Tick

**File:** `apps/web/src/components/chart/chart-canvas.tsx`  
**Issue:** Full `setData(300 candles)` is called on every 3-second tick instead of using `update()` for the latest candle. This causes massive CPU usage and visible flickering.  
**Fix:** On tick updates, use `series.update(lastCandle)` instead of `series.setData(allCandles)`. Only call `setData` on initial load and symbol/timeframe changes.

---

### 1.7 Fix Chart Indicator Series Rebuilt on Every Tick

**File:** `apps/web/src/components/chart/chart-canvas.tsx`  
**Issue:** Up to 12 indicator series are rebuilt on every tick.  
**Fix:** Separate indicator calculation from the tick update loop. Only recalculate indicators when candle data changes (new candle formed), not on every price tick.

---

### 1.8 Fix Chat SSE Error Handling

**File:** `apps/web/src/components/chat/chat-screen.tsx` — `sendMultiAgentMessage` function  
**Issue:** In the SSE parsing loop, the `catch` block around `JSON.parse` also catches `throw new Error(parsed.error)` on `parsed.type === 'error'` lines. Server-sent error events are silently swallowed.  
**Fix:** Separate JSON parse from error handling:
```tsx
let parsed;
try {
  parsed = JSON.parse(data);
} catch {
  continue; // skip non-JSON lines
}
if (parsed.type === 'error') {
  throw new Error(parsed.error);
}
```

---

### 1.9 Fix Chat Multi-Agent Race Condition

**File:** `apps/web/src/components/chat/chat-screen.tsx`  
**Issue:** Multi-agent `setMessages` race condition — concurrent agent responses can overwrite each other.  
**Fix:** Use functional state updates `setMessages(prev => ...)` and ensure each agent's messages are appended, not replaced.

---

### 1.10 Fix Settings `noiseConfig` Data Loss

**File:** `apps/web/src/app/(app)/settings/actions.ts` + `settings/page.tsx`  
**Issue:** `noiseConfig` is nested inside the `notificationPreferences` JSON field, but `updateNotificationPrefsAction` overwrites the entire field, destroying the noise config.  
**Fix:** In `updateNotificationPrefsAction`, merge the new preferences with existing ones instead of replacing:
```ts
const existing = await getNotificationPrefs(userId);
const merged = { ...existing, ...newPrefs, noiseConfig: existing.noiseConfig };
```

---

### 1.11 Fix 2FA Secret Stored Before Verification

**File:** `apps/web/src/app/(app)/settings/actions.ts` — `setupTwoFactorAction`  
**Issue:** The TOTP secret is persisted to the DB immediately when the user starts 2FA setup, before they verify with a token. If they abandon setup, the secret remains.  
**Fix:** Store the secret in a temporary session/cookie or return it to the client without persisting. Only persist to DB after `verifyTwoFactorAction` succeeds.

---

### 1.12 Fix Dashboard P&L Heatmap Totals

**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/pnl-heatmap-widget.tsx`  
**Issue:** Heatmap totals show all-time stats instead of the visible 2-month window, misleading users.  
**Fix:** Calculate totals from only the visible date range, not from all trades.

---

### 1.13 Fix Dashboard Open Risk R-Multiple Calculation

**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/open-positions-widget.tsx`  
**Issue:** R-multiple calculation is inverted (risk/reward instead of reward/risk).  
**Fix:** Swap the formula: `R = (currentPrice - entryPrice) / (entryPrice - stopLoss)` for longs, and inverse for shorts.

---

### 1.14 Fix Dashboard Trading Session Hours

**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/today-glance-widget.tsx`  
**Issue:** Trading session hours are incorrect — missing London/NY overlap, wrong weekend handling.  
**Fix:** Correct the session definitions:
- Sydney: 22:00–07:00 GMT
- Tokyo: 00:00–09:00 GMT
- London: 08:00–17:00 GMT
- New York: 13:00–22:00 GMT
- Handle weekend closure (Sat/Sun)

---

### 1.15 Fix Dashboard Stats Sparkline

**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/stats-widget.tsx`  
**Issue:** Sparkline shows first 10 trades, not last 10. Comment says "last 10" but code slices `[0:10]`.  
**Fix:** Change `trades.slice(0, 10)` to `trades.slice(-10)`.

---

### 1.16 Fix Journal R-Distribution Operator Precedence Bug

**File:** `apps/web/src/app/(app)/journal/_components/analytics/r-distribution.tsx:30`  
**Issue:** `isPositive` logic has operator precedence bug causing wrong colors on histogram bars.  
**Fix:** Add explicit parentheses to fix the precedence.

---

### 1.17 Fix Journal Hook Violation

**File:** `apps/web/src/app/(app)/journal/_components/entry-form.tsx`  
**Issue:** `useTagSuggestions()` is called inside JSX or a conditional, violating React hooks rules.  
**Fix:** Move the hook call to the top level of the component, unconditionally.

---

### 1.18 Fix Journal Missing CSRF on Import

**File:** `apps/web/src/app/(app)/journal/_components/import-trades.tsx` or `api/journal/import/route.ts`  
**Issue:** CSV import endpoint lacks CSRF verification.  
**Fix:** Add CSRF token verification to the import API route.

---

### 1.19 Fix Auth 2FA Flow — Disabled Inputs Not Submitted

**File:** `apps/web/src/app/(auth)/actions.ts` ~line 30-70  
**Issue:** When 2FA is enabled, disabled form inputs aren't included in the form submission, causing the 2FA verification to fail.  
**Fix:** Use `readOnly` instead of `disabled` for inputs that need to be submitted but not edited, or use hidden inputs.

---

### 1.20 Fix Auth `recordAuthEvent` Unreachable After `redirect()`

**File:** `apps/web/src/app/(auth)/actions.ts`  
**Issue:** `recordAuthEvent()` is called after `redirect()` which throws internally, making the event recording unreachable.  
**Fix:** Call `recordAuthEvent()` before `redirect()`, or use `redirect()` in a finally block.

---

### 1.21 Fix Admin Single-User Mode Grants Admin to ALL Users

**File:** `apps/web/src/lib/admin-auth.ts`  
**Issue:** When no admin exists in the system, single-user mode grants admin to ALL authenticated users.  
**Fix:** Only grant admin to the first user (by creation date or a specific flag), not all users.

---

### 1.22 Fix Cron Auth — Empty Secret Key Allows Forged HMAC

**File:** `apps/web/src/lib/cron.ts`  
**Issue:** `AUTH_COOKIE_SECRET ?? ''` fallback allows forged HMAC tokens with an empty key.  
**Fix:** Throw an error if `AUTH_COOKIE_SECRET` is not set, instead of falling back to empty string.

---

### 1.23 Fix Segmented Control Invisible Accent Indicator

**File:** `apps/web/src/components/ui/segmented.tsx`  
**Issue:** The `accent` variant's sliding indicator has no background color — it's completely invisible.  
**Fix:** Add the appropriate background color class (e.g., `bg-accent` or `bg-brand`) to the accent variant's indicator.

---

### 1.24 Fix Button Focus Rings Missing

**File:** `apps/web/src/components/ui/button.tsx`  
**Issue:** No focus ring on any button variant, failing accessibility requirements.  
**Fix:** Add `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent` to the base button classes.

---

## PHASE 2: High-Priority Fixes (P1)

> **Estimated effort:** 3-5 days  
> **Goal:** Fix functional bugs, significant UX issues, and performance problems

### 2.1 Auth & Onboarding

| # | File | Issue | Fix |
|---|------|-------|-----|
| 2.1.1 | `(auth)/actions.ts` | `forgotPasswordAction` and `resetPasswordAction` lack Sentry instrumentation | Wrap both in `Sentry.withServerActionInstrumentation()` |
| 2.1.2 | `(auth)/actions.ts` | Missing rate limiting on `resetPasswordAction` | Add rate limiting (e.g., max 3 attempts per email per hour) |
| 2.1.3 | `(auth)/forgot-password/page.tsx` | Double-panel nesting — redundant layout wrapper | Remove redundant layout nesting |
| 2.1.4 | `(auth)/login/page.tsx` | Missing password visibility toggle | Add show/hide password button |
| 2.1.5 | `(auth)/register/page.tsx` | Missing password visibility toggle | Add show/hide password button |
| 2.1.6 | `onboarding/page.tsx` | `tradingStyle` never persisted server-side | Send `tradingStyle` in the `saveProgress` fetch body |
| 2.1.7 | `onboarding/page.tsx` | Missing CSRF on progress-save fetch | Add CSRF token to the fetch headers |
| 2.1.8 | `onboarding/wizard.tsx` | Typo `tablibular-nums` instead of `tabular-nums` | Fix the CSS class name |
| 2.1.9 | `onboarding/wizard.tsx` | Non-existent `bg-bg-elev-1-elevated` class | Use correct token: `bg-bg-elev-1` |
| 2.1.10 | `app/layout.tsx` | Inconsistent post-login redirect (`/chat` vs `/dashboard`) | Standardize on one redirect target |
| 2.1.11 | `app/error.tsx` | Uses `console.error` instead of Sentry | Use `Sentry.captureException(error)` |
| 2.1.12 | `app/manifest.ts` | Color mismatch (`#000000` vs `#0A0A0A`) | Align manifest colors with globals.css |
| 2.1.13 | `app/debug/route.ts` | Leaks DB URL prefixes | Sanitize any URL output |
| 2.1.14 | `globals.css` | CSS variable circular reference (`--font-mono` referencing itself) | Rename the Next.js font variable to avoid self-reference |

### 2.2 Chat System

| # | File | Issue | Fix |
|---|------|-------|-----|
| 2.2.1 | `chat-screen.tsx` | Dead `.content` access on UIMessage in regenerate handler | Use correct UIMessage property access pattern for AI SDK v5 |
| 2.2.2 | `message-list.tsx` | Broken regex `/|.*|/` in virtualizer (should be `/\|.*\|/`) | Escape the pipe character in the regex |
| 2.2.3 | `chat-screen.tsx` | Auto-scroll fires on every stream token | Debounce or throttle scroll-to-bottom, only scroll when user is near bottom |
| 2.2.4 | `chat-screen.tsx` | `modelOverrideRef` not cleared on error | Reset `modelOverrideRef.current = null` in the error handler |
| 2.2.5 | `chat-screen.tsx` | `AbortController` not cleaned up on unmount | Add `useEffect` cleanup that calls `abortController.abort()` |
| 2.2.6 | `parts/plan.tsx` | Hardcoded ARIA IDs causing collisions | Use `useId()` hook for unique ARIA IDs |
| 2.2.7 | `parts/citation-warning.tsx` | Hardcoded ARIA IDs causing collisions | Use `useId()` hook for unique ARIA IDs |
| 2.2.8 | `parts/get-calendar.tsx` | Uses `<a>` instead of `<Link>` | Replace with Next.js `<Link>` for client-side navigation |
| 2.2.9 | `parts/share-snapshot.tsx` | Expiry text never updates after initial render | Add `setInterval` to re-render every 30s |
| 2.2.10 | `parts/registry.tsx` | Returns null on schema failure instead of fallback card | Return the `Fallback` component on schema failure |
| 2.2.11 | `chat-screen.tsx` | `handleRegenerate`/`handleEdit` dependency on `messages` causes unnecessary re-renders | Use `useCallback` with proper dependency arrays |
| 2.2.12 | `parts/share-snapshot.tsx` | Stale expiry text | Use ticking state to recompute expiry |
| 2.2.13 | `chat-screen.tsx` | Thread list search not debounced | Add debounce (300ms) to search input |

### 2.3 Dashboard & Widgets

| # | File | Issue | Fix |
|---|------|-------|-----|
| 2.3.1 | `page.tsx:39` | `listUpcomingEvents` missing `userId` parameter | Verify signature, add `userId` if needed |
| 2.3.2 | `page.tsx:48-54` | Silent error fallback hides data fetch failures | Pass `hasError` flag per widget, show error/retry state |
| 2.3.3 | `page.tsx:40` | `listEntries(userId, { limit: 200 })` over-fetches | Reduce to ~50 or create a dedicated dashboard API endpoint |
| 2.3.4 | `dashboard-canvas.tsx` | All widgets re-render on any layout change | Memoize widget components with `React.memo` |
| 2.3.5 | `watchlist-widget.tsx` | Re-renders on every 3s poll even when prices haven't changed | Compare previous and new prices, skip re-render if equal |
| 2.3.6 | `briefing-widget.tsx` | ReactMarkdown re-parses on every render | Memoize the markdown content with `useMemo` |
| 2.3.7 | `watchlist-widget.tsx` | No error state for API failures | Add error state with retry button |
| 2.3.8 | `pnl-heatmap-widget.tsx` | Heatmap touch targets are 32px (below 44px minimum) | Increase cell size to at least 44px |
| 2.3.9 | `dashboard-canvas.tsx` | AddWidgetMenu doesn't close on outside click or selection | Add outside-click handler and close on selection |
| 2.3.10 | `today-glance-widget.tsx` | `CellSession` doesn't use `useTime()` so session label won't update live | Use `useTime()` hook for live updates |

### 2.4 Chart System

| # | File | Issue | Fix |
|---|------|-------|-----|
| 2.4.1 | `chart-view.tsx` | `overlaySet` reads stale `candlesRef` — markers at wrong positions | Update `candlesRef` before processing overlays |
| 2.4.2 | `pro-chart-view.tsx` | Fetches 300 candles it never uses for the chart | Remove the unused fetch or use the data |
| 2.4.3 | `pro-chart-view.tsx` | Migration effect is dead code (writes config that's never read) | Remove the dead migration effect |
| 2.4.4 | `tradingview-widget.tsx` | Double-initializes when script loads | Add a guard to prevent double initialization |
| 2.4.5 | `use-sub-pane-chart.ts` | Sub-panes also do full `setData` on every tick | Use `update()` for tick changes |
| 2.4.6 | `loading.tsx` + `chart-skeleton.tsx` | Inconsistent skeleton heights cause layout shift (16/9 vs 60svh vs 70svh) | Standardize skeleton height |
| 2.4.7 | `use-price-stream.ts` | No max reconnection for SSE | Add max reconnection attempts with exponential backoff |

### 2.5 News, Calendar, Signals, Alerts

| # | File | Issue | Fix |
|---|------|-------|-----|
| 2.5.1 | `news/page.tsx:36` | No error handling on `listRecentArticles(120)` | Wrap in try/catch, add `news/error.tsx` |
| 2.5.2 | `news/page.tsx:34` | `force-dynamic` without ISR | Replace with `revalidate = 300` (5 min ISR) |
| 2.5.3 | `news/page.tsx` | No `error.tsx` for the news route | Add `news/error.tsx` |
| 2.5.4 | `news-view.tsx` | No list virtualization for 120+ articles | Use `@tanstack/react-virtual` for the article list |
| 2.5.5 | `calendar-view.tsx:52` | `showPast` not synced to URL | Use `nuqs` to sync `showPast` to URL state |
| 2.5.6 | `calendar-hero.tsx:142` | `startOfDay` uses local timezone | Use UTC or user's configured timezone |
| 2.5.7 | `signals-dashboard.tsx:22` | `stats.total === 0` race condition | Add null check and loading guard |
| 2.5.8 | `alert-list.tsx:261` | `AlertRow` IntersectionObserver effect has unstable deps | Stabilize deps with `useCallback` |
| 2.5.9 | `alert-list.tsx:174` | "New alert" button at bottom of page | Move to top or add a floating action button |
| 2.5.10 | `signals-dashboard.tsx:42` | `SignalCard` not memoized | Wrap in `React.memo` |
| 2.5.11 | `alert-list.tsx:100` | `filteredAlerts` not memoized | Wrap in `useMemo` |
| 2.5.12 | `calendar/_components/calendar-view.tsx` | Event reminder `setTimeout` not cleared on unmount | Add cleanup in `useEffect` return |
| 2.5.13 | `event-card.tsx:274` | `reminderSet` module-level Set never cleaned | Move to component state or ref, clean on unmount |

### 2.6 Journal System

| # | File | Issue | Fix |
|---|------|-------|-----|
| 2.6.1 | `entry-form.tsx` | `screenshotUrl` not sent to API — feature silently broken | Include `screenshotUrl` in the API submission body |
| 2.6.2 | `journal-view.tsx` | `ImportTrades` component never rendered — feature disconnected | Add `<ImportTrades />` to the journal view |
| 2.6.3 | `import-trades.tsx` | `closedAt` always null on import — data integrity issue | Parse and set `closedAt` from CSV data |
| 2.6.4 | `entry-list.tsx:398-404` | Short position profitable region shade is wrong (same formula as long) | Invert the shade calculation for short positions |
| 2.6.5 | `ai-review-panel.tsx` | AI review stale on entry change | Refetch review when entry changes |
| 2.6.6 | `entry-form.tsx` | Notes max length mismatch — server rejects valid client input | Align client and server validation limits |
| 2.6.7 | `entry-list.tsx:629-631` | Pip multiplier and contract size hardcoded for only XAUUSD and forex | Make configurable or support all symbols |
| 2.6.8 | `stats-summary.tsx:96` | Profit factor capped at 99.9 instead of Infinity | Use `Infinity` or display "∞" |
| 2.6.9 | `drawdown-chart.tsx:42` | Recovery factor uses `stats.totalR` not local cumulative | Calculate from local cumulative data |

### 2.7 Settings System

| # | File | Issue | Fix |
|---|------|-------|-----|
| 2.7.1 | `settings/actions.ts` | `exportDataAction` exports all user data without password/2FA verification | Require password or 2FA verification before export |
| 2.7.2 | `settings/actions.ts` | `changePasswordAction` missing `revalidatePath` call | Add `revalidatePath('/settings')` after password change |
| 2.7.3 | `settings/actions.ts` | `deleteAccountAction` doesn't sign out the user after deletion | Call `signOut()` after account deletion |
| 2.7.4 | `api-keys/page.tsx` | Returns `null` instead of redirecting unauthenticated users | Use `redirect('/login')` instead of returning null |
| 2.7.5 | `settings/actions.ts` | `exportDataAction` leaks `userId` in some exported records | Strip `userId` from all exported records |
| 2.7.6 | `settings/page.tsx` | No per-card error boundaries | Wrap each card in an error boundary |
| 2.7.7 | `settings/page.tsx` | `checkIsAdmin()` called sequentially instead of parallelized | Use `Promise.all` for parallel data fetching |
| 2.7.8 | `billing-plans.tsx` | Manual CSRF extraction | Use the shared CSRF utility |
| 2.7.9 | `subscription-status.tsx` | Local `cn` function instead of importing from `lib/cn.ts` | Import `cn` from `lib/cn.ts` |
| 2.7.10 | `onboarding-reset-card.tsx` | Native `confirm()` dialog | Use `ConfirmDrawer` component |
| 2.7.11 | `billing/` | No `billing/loading.tsx` | Add a loading skeleton |
| 2.7.12 | `preferences-card.tsx` | Dual localStorage+DB persistence drift | Single-source: use DB as source of truth |
| 2.7.13 | `signal-feedback.tsx` | No error feedback on submission failure | Add error toast/state |
| 2.7.14 | `telegram/page.tsx` | No auth check | Add session validation |
| 2.7.15 | `profile/page.tsx` | Weak auth check | Use proper `getServerSession()` |

### 2.8 Admin, Layout, UI, Lib

| # | File | Issue | Fix |
|---|------|-------|-----|
| 2.8.1 | `admin-auth.ts` | Duplicated admin check logic between `admin-auth.ts` and `admin-check.ts` | Consolidate into one module |
| 2.8.2 | `admin-onboarding-control.tsx` | Uses `window.confirm()` instead of `ConfirmDrawer` | Replace with `ConfirmDrawer` |
| 2.8.3 | `drawer.tsx` | Focus-trap effect only runs once on mount (broken on reopen) | Re-run effect on open state change |
| 2.8.4 | `middleware.ts` | CSRF check excludes `/api/cron` which accepts session cookies | Add CSRF check for cron routes or use header-based auth |
| 2.8.5 | `sw-register.tsx` | Service worker update toast uses `duration: Infinity` — never auto-dismisses | Set a reasonable duration (e.g., 10000ms) with a manual close button |
| 2.8.6 | `api.ts` | `x-user-id` header trust model | Validate the header against the session, don't trust it blindly |
| 2.8.7 | `admin-cron-table.tsx` | No error/retry state, re-fetches on every tab switch | Use React Query with proper caching |
| 2.8.8 | `admin-diagnostic-traces.tsx` | No error/retry state | Add error state and retry button |
| 2.8.9 | `admin-user-table.tsx` | No error/retry state | Add error state and retry button |
| 2.8.10 | `admin-feature-flags.tsx` | No error/retry state | Add error state and retry button |
| 2.8.11 | `admin-log-viewer.tsx` | No error/retry state | Add error state |
| 2.8.12 | `admin-tool-telemetry-table.tsx` | No error/retry state | Add error state |
| 2.8.13 | `button.tsx` | `md` size is `h-10` (40px) but documented as 48px | Fix the size or the documentation |
| 2.8.14 | `commands.ts` | Dead `commandSchema` / `validateCommand` | Remove dead code |
| 2.8.15 | `nowpayments.ts` | Sandbox API URL is default | Ensure production URL is used in production |
| 2.8.16 | `time-provider.tsx` | MutationObserver may be unnecessary | Review and simplify if not needed |
| 2.8.17 | `use-local-storage.ts` | Stale state when key changes | Add key to dependency array |
| 2.8.18 | `use-voice-input.ts` | `supported` flash on hydration | Add hydration check |

---

## PHASE 3: Medium-Priority Improvements (P2)

> **Estimated effort:** 5-7 days  
> **Goal:** UX improvements, design system consistency, moderate performance optimizations

### 3.1 Design System Drift Fixes

| # | Issue | Files | Fix |
|---|-------|-------|-----|
| 3.1.1 | Inconsistent gap tokens (`gap-4` vs `gap-6`) | All systems | Standardize on design token spacing |
| 3.1.2 | `space-y-*` vs `gap-*` inconsistency | Chat parts | Standardize on one approach |
| 3.1.3 | Shadow inconsistency | `run-system-action.tsx` | Use design token shadows |
| 3.1.4 | `text-info` token may not exist | Chat parts | Verify and create token or use existing |
| 3.1.5 | `text-xs` instead of `text-caption` token | Dashboard widgets | Use semantic typography tokens |
| 3.1.6 | Inconsistent widget chrome | Dashboard widgets | Standardize widget container styling |
| 3.1.7 | Hardcoded RGB colors | P&L heatmap widget | Use design token colors |
| 3.1.8 | Missing `lg` breakpoint in layout max-width | Dashboard | Add `lg:` breakpoint |
| 3.1.9 | Duplicated constants across 3 files | Chart system | Extract to shared constants file |
| 3.1.10 | Duplicated `refetchIntervalFor` in 3 hooks | Chart hooks | Extract to shared utility |
| 3.1.11 | Duplicated watchlist DB query | 2 page files | Extract to shared query function |
| 3.1.12 | Local `cn` function in subscription-status | Settings | Import from `lib/cn.ts` |
| 3.1.13 | Non-semantic HTML in journal | Journal system | Use semantic HTML elements |
| 3.1.14 | Custom modal vs project Dialog | Journal system | Use the project's Dialog/Drawer component |

### 3.2 Loading State Improvements

| # | File | Issue | Fix |
|---|------|-------|-----|
| 3.2.1 | `journal/loading.tsx` | `grid-cols-3` not responsive | Change to `grid-cols-2 sm:grid-cols-3` |
| 3.2.2 | `journal/loading.tsx` | Skeleton doesn't match actual layout | Add header and tab skeleton |
| 3.2.3 | `portfolio/loading.tsx` | Responsive skeleton grid issues | Fix breakpoints |
| 3.2.4 | `track-record/loading.tsx` | Responsive skeleton grid issues | Fix breakpoints |
| 3.2.5 | `chart/loading.tsx` + `chart-skeleton.tsx` | Inconsistent heights | Standardize to match actual chart height |
| 3.2.6 | Missing `billing/loading.tsx` | Settings billing | Add loading skeleton |
| 3.2.7 | All loading states | Audit all `loading.tsx` files for layout match | Align each with actual page layout |

### 3.3 Performance Optimizations

| # | File | Issue | Fix |
|---|------|-------|-----|
| 3.3.1 | `news-view.tsx` | No list virtualization for 120+ articles | Use `@tanstack/react-virtual` |
| 3.3.2 | `price-tag.tsx` | PriceTag polls off-screen | Use IntersectionObserver to pause polling when off-screen |
| 3.3.3 | `chart-settings-drawer.tsx` | `animate-pulse` on disabled indicators | Remove unnecessary animation |
| 3.3.4 | `chart-canvas.tsx` | `autoSize` + manual `resize()` conflict | Remove one or the other |
| 3.3.5 | Dashboard widgets | All widgets re-render on layout change | `React.memo` each widget |
| 3.3.6 | `briefing-widget.tsx` | ReactMarkdown re-parses on every render | `useMemo` the parsed content |
| 3.3.7 | `watchlist-widget.tsx` | Re-renders on every 3s poll | Compare prices, skip if unchanged |
| 3.3.8 | Admin tables | Re-fetch on every tab switch (no React Query) | Use React Query with caching |
| 3.3.9 | `time-provider.tsx` | MutationObserver may be unnecessary | Review and simplify |
| 3.3.10 | Chat tool parts | Duplicated SkeletonCard/ErrorCard | Extract to shared components |

### 3.4 UX Improvements

| # | File | Issue | Fix |
|---|------|-------|-----|
| 3.4.1 | `news/page.tsx` | `BookmarksProvider` wraps server components unnecessarily | Move to wrap only `<NewsView />` |
| 3.4.2 | `calendar-view.tsx` | `showPast` not synced to URL | Use `nuqs` for URL state |
| 3.4.3 | `alert-list.tsx` | "New alert" button at bottom | Move to top or add FAB |
| 3.4.4 | `signals-dashboard.tsx` | `SignalCard` not memoized | `React.memo` |
| 3.4.5 | `alert-list.tsx` | `filteredAlerts` not memoized | `useMemo` |
| 3.4.6 | `calendar-view.tsx` | `showPast` toggle not in URL | Sync to URL with `nuqs` |
| 3.4.7 | Dashboard | `AddWidgetMenu` doesn't close on outside click | Add outside-click handler |
| 3.4.8 | Dashboard | No reset confirmation for layout | Add `ConfirmDrawer` before reset |
| 3.4.9 | Dashboard | Obscure Unicode characters for span toggle | Use clear icons |
| 3.4.10 | Dashboard | No "today" indicator on heatmap | Add a visual indicator for today's date |
| 3.4.11 | Dashboard | Only 2-column max on wide screens | Add `lg:grid-cols-3` or more |
| 3.4.12 | `entry-form.tsx` | Notes max length mismatch | Align client/server validation |
| 3.4.13 | `ai-review-panel.tsx` | AI review stale on entry change | Refetch on entry change |
| 3.4.14 | `signal-feedback.tsx` | No error feedback | Add error toast |
| 3.4.15 | `preferences-card.tsx` | Dual persistence drift | Single-source (DB) |
| 3.4.16 | `ai-prefs-card.tsx` | Dual persistence drift | Single-source (DB) |
| 3.4.17 | `use-voice-input.ts` | `supported` flash on hydration | Add hydration check |
| 3.4.18 | `use-local-storage.ts` | Stale state when key changes | Add key to deps |
| 3.4.19 | `sw-register.tsx` | Update toast never auto-dismisses | Set reasonable duration |
| 3.4.20 | `drawer.tsx` | Focus-trap broken on reopen | Re-run effect on open state |

### 3.5 Accessibility Improvements

| # | File | Issue | Fix |
|---|------|-------|-----|
| 3.5.1 | `chart.tsx` | Zoom buttons lack `aria-label` | Add descriptive aria-labels |
| 3.5.2 | `button.tsx` | No focus ring on any variant | Add `focus-visible:ring-2` |
| 3.5.3 | `parts/plan.tsx` | Hardcoded ARIA IDs | Use `useId()` |
| 3.5.4 | `parts/citation-warning.tsx` | Hardcoded ARIA IDs | Use `useId()` |
| 3.5.5 | `pnl-heatmap-widget.tsx` | Touch targets 32px < 44px | Increase to 44px minimum |
| 3.5.6 | `skip-to-content.tsx` | Verify skip link works correctly | Test and fix if needed |
| 3.5.7 | All pages | Audit keyboard navigation | Ensure all interactive elements are keyboard accessible |

### 3.6 Security Improvements

| # | File | Issue | Fix |
|---|------|-------|-----|
| 3.6.1 | `settings/actions.ts` | `exportDataAction` no password verification | Require password/2FA |
| 3.6.2 | `settings/actions.ts` | `exportDataAction` leaks userId | Strip userId from all records |
| 3.6.3 | `api.ts` | `x-user-id` header trust model | Validate against session |
| 3.6.4 | `middleware.ts` | CSRF check excludes `/api/cron` | Add CSRF or header-based auth |
| 3.6.5 | `env.ts` | Dev secrets file gitignore verification | Ensure `.env*.local` is gitignored |
| 3.6.6 | `onboarding/page.tsx` | Missing CSRF on progress-save | Add CSRF token |
| 3.6.7 | `journal/import` | Missing CSRF | Add CSRF verification |
| 3.6.8 | `billing-plans.tsx` | Manual CSRF extraction | Use shared CSRF utility |

---

## PHASE 4: Polish & Code Quality (P3)

> **Estimated effort:** 3-4 days  
> **Goal:** Clean code, remove dead code, consistency, minor polish

### 4.1 Dead Code Removal

| # | File | Issue | Fix |
|---|------|-------|-----|
| 4.1.1 | `get-cot.tsx` | Dead code in CoT renderer | Remove unused code paths |
| 4.1.2 | `overlay-toggle.tsx` | Dead `OverlayToggle` component | Remove if unused |
| 4.1.3 | `chart-themes.ts` + `chart-types.ts` | Unreachable `light` theme preset | Remove or implement |
| 4.1.4 | `commands.ts` | Dead `commandSchema` / `validateCommand` | Remove |
| 4.1.5 | `live-timestamp.tsx` | `LiveTimestamp` component is dead code | Remove or use it |
| 4.1.6 | `pro-chart-view.tsx` | Migration effect is dead code | Remove |

### 4.2 Code Deduplication

| # | Issue | Files | Fix |
|---|-------|-------|-----|
| 4.2.1 | Duplicated `formatStamp` utility | Chat parts | Extract to `lib/format.ts` |
| 4.2.2 | Duplicated `formatCountdown` | Dashboard | Extract to `lib/format.ts` |
| 4.2.3 | Duplicated `startOfDay` | Calendar | Extract to `lib/datetime.ts` |
| 4.2.4 | Duplicated `handleRadioKeyDown` | Multiple | Extract to shared utility |
| 4.2.5 | Duplicated SkeletonCard/ErrorCard | All chat parts | Extract to `_shared.tsx` |
| 4.2.6 | Duplicated chart constants | 3 chart files | Extract to `chart-constants.ts` |
| 4.2.7 | Duplicated `refetchIntervalFor` | 3 hooks | Extract to shared hook utility |
| 4.2.8 | Duplicated admin check logic | `admin-auth.ts` + `admin-check.ts` | Consolidate |
| 4.2.9 | Duplicated watchlist DB query | 2 page files | Extract to shared query |
| 4.2.10 | Cross-feature imports | Calendar→news, signals→settings | Consider shared modules |

### 4.3 Console Statement Cleanup

| # | File | Issue | Fix |
|---|------|-------|-----|
| 4.3.1 | `app/error.tsx` | `console.error` | Use `Sentry.captureException()` |
| 4.3.2 | `signals/error.tsx:21` | `console.error` | Use `logger` |
| 4.3.3 | `market-client.ts` | `console.warn` | Use `logger` |
| 4.3.4 | Multiple settings files | Console statements | Use `logger` |
| 4.3.5 | All remaining `console.*` | Audit entire codebase | Replace with `logger` |

### 4.4 Index-as-Key Fixes

| # | File | Issue | Fix |
|---|------|-------|-----|
| 4.4.1 | Chat portfolio parts | Index as key | Use stable IDs |
| 4.4.2 | Chat sentiment parts | Index as key | Use stable IDs |
| 4.4.3 | News article lists | Index as key | Use article IDs |
| 4.4.4 | Signal lists | Index as key | Use signal IDs |

### 4.5 Metadata & SEO

| # | File | Issue | Fix |
|---|------|-------|-----|
| 4.5.1 | `journal/page.tsx:29` | Title is `'Journal'` — no app suffix | Change to `'Journal | HamaFX'` |
| 4.5.2 | All pages | Audit metadata titles for consistency | Standardize format: `'Page | HamaFX'` |
| 4.5.3 | `manifest.ts` | Color mismatch | Align with globals.css |

### 4.6 Miscellaneous Polish

| # | File | Issue | Fix |
|---|------|-------|-----|
| 4.6.1 | `storage.ts` | Mixed responsibilities | Split into focused modules |
| 4.6.2 | `commands.ts` | Import after exports | Move imports to top |
| 4.6.3 | `market-client.ts` | `console.warn` instead of logger | Use `logger` |
| 4.6.4 | `nowpayments.ts` | Sandbox API URL is default | Ensure prod URL in prod |
| 4.6.5 | `journal/page.tsx:27` | Misleading PageHeader description | Update description text |
| 4.6.6 | `dashboard-canvas.tsx` | Redundant `order` field in WidgetConfig | Remove if unnecessary |
| 4.6.7 | `dashboard-canvas.tsx` | Obscure Unicode characters for span toggle | Use clear icons |
| 4.6.8 | `dashboard` | Error digest not shown for support | Show digest in error message |
| 4.6.9 | `dashboard` | `reset()` may not work for server component errors | Test and fix |
| 4.6.10 | `alert-list.tsx:219` | `NodeJS.Timeout` in browser code | Use `ReturnType<typeof setTimeout>` |
| 4.6.11 | `news/_components/refresh-button.tsx` | Verify refresh logic | Test and fix if needed |
| 4.6.12 | `bookmarks-context.tsx` | Verify context value stability | Memoize context value |

---

## PHASE 5: Feature Completions & Missing Implementations

> **Estimated effort:** 3-5 days  
> **Goal:** Complete disconnected features and add missing functionality

### 5.1 Journal Import Trades Feature

**File:** `apps/web/src/app/(app)/journal/_components/journal-view.tsx`  
**Issue:** `ImportTrades` component exists but is never rendered in the journal view.  
**Fix:** Add `<ImportTrades />` to the journal view with appropriate placement (e.g., in a toolbar or as a modal trigger).

### 5.2 Journal Screenshot URL Feature

**File:** `apps/web/src/app/(app)/journal/_components/entry-form.tsx`  
**Issue:** `screenshotUrl` is captured but never sent to the API.  
**Fix:** Include `screenshotUrl` in the form submission body.

### 5.3 Onboarding Trading Style Persistence

**File:** `apps/web/src/app/onboarding/page.tsx`  
**Issue:** `tradingStyle` selection is never persisted server-side.  
**Fix:** Include `tradingStyle` in the `saveProgress` API call.

### 5.4 News Error Boundary

**File:** `apps/web/src/app/(app)/news/error.tsx` (new file)  
**Issue:** No error boundary for the news route.  
**Fix:** Create `error.tsx` following the signals/journal error pattern.

### 5.5 Billing Loading State

**File:** `apps/web/src/app/(app)/settings/billing/loading.tsx` (new file)  
**Issue:** No loading skeleton for billing page.  
**Fix:** Create loading skeleton matching billing page layout.

### 5.6 Dashboard Widget Error States

**File:** `apps/web/src/app/(app)/dashboard/_components/dashboard-canvas.tsx`  
**Issue:** All widget failures silently show empty state.  
**Fix:** Pass `hasError` flag per data source, show error/retry state in widgets.

### 5.7 Chart Light Theme

**File:** `apps/web/src/components/chart/chart-themes.ts` + `chart-types.ts`  
**Issue:** Light theme preset exists but is unreachable.  
**Fix:** Either implement the light theme toggle or remove the dead preset.

### 5.8 Admin React Query Integration

**File:** All admin table components  
**Issue:** Admin tables re-fetch on every tab switch without caching.  
**Fix:** Wrap admin data fetching in React Query with appropriate `staleTime`.

---

## Implementation Order & Dependencies

```
Phase 1 (P0 Critical) ──────────────────────────────────────────
  │
  ├─ 1.1  Fix "Icon" prefix artifacts (CC-1)          ← Do FIRST, global search
  ├─ 1.2  Fix hardcoded colors (CC-2)                  ← Do SECOND, global search
  ├─ 1.3-1.7  Chart system critical fixes              ← Independent, parallel
  ├─ 1.8-1.9  Chat system critical fixes               ← Independent, parallel
  ├─ 1.10-1.11 Settings critical fixes                 ← Independent, parallel
  ├─ 1.12-1.15 Dashboard critical fixes                ← Independent, parallel
  ├─ 1.16-1.18 Journal critical fixes                  ← Independent, parallel
  ├─ 1.19-1.20 Auth critical fixes                     ← Independent, parallel
  ├─ 1.21-1.22 Admin/Lib critical fixes                ← Independent, parallel
  └─ 1.23-1.24 UI component critical fixes             ← Independent, parallel
         │
         ▼
Phase 2 (P1 High) ─────────────────────────────────────────────
  │
  ├─ 2.1  Auth & Onboarding                            ← Sequential within group
  ├─ 2.2  Chat System                                  ← Sequential within group
  ├─ 2.3  Dashboard & Widgets                          ← Sequential within group
  ├─ 2.4  Chart System                                 ← Sequential within group
  ├─ 2.5  News/Calendar/Signals/Alerts                 ← Sequential within group
  ├─ 2.6  Journal System                               ← Sequential within group
  ├─ 2.7  Settings System                              ← Sequential within group
  └─ 2.8  Admin/Layout/UI/Lib                          ← Sequential within group
         │   (All groups can run in PARALLEL with each other)
         ▼
Phase 3 (P2 Medium) ───────────────────────────────────────────
  │
  ├─ 3.1  Design System Drift                          ← After P1 fixes
  ├─ 3.2  Loading State Improvements                   ← After P1 fixes
  ├─ 3.3  Performance Optimizations                    ← After P1 fixes
  ├─ 3.4  UX Improvements                              ← After P1 fixes
  ├─ 3.5  Accessibility Improvements                   ← After P1 fixes
  └─ 3.6  Security Improvements                        ← After P1 fixes
         │
         ▼
Phase 4 (P3 Polish) ───────────────────────────────────────────
  │
  ├─ 4.1  Dead Code Removal
  ├─ 4.2  Code Deduplication
  ├─ 4.3  Console Statement Cleanup
  ├─ 4.4  Index-as-Key Fixes
  ├─ 4.5  Metadata & SEO
  └─ 4.6  Miscellaneous Polish
         │
         ▼
Phase 5 (Feature Completions) ─────────────────────────────────
  ├─ 5.1-5.8  Missing features and implementations
```

---

## Testing Checklist

After each phase, verify:

- [ ] `pnpm typecheck` passes with no errors
- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm turbo run test -- --run` passes
- [ ] Manual smoke test of each affected page
- [ ] No new console errors in browser DevTools
- [ ] Dark mode renders correctly on all fixed pages
- [ ] Mobile responsive layout works (400px viewport)
- [ ] No hydration mismatches in SSR
- [ ] PWA manifest and service worker still function
- [ ] Auth flows work (login, register, 2FA, password reset)
- [ ] Chart renders correctly for XAUUSD, EURUSD, GBPUSD
- [ ] Chat streaming works with tool calls
- [ ] Settings save/load correctly
- [ ] Admin pages load and function

---

## Key Architecture Notes for Implementer

1. **Edge Runtime Constraints:** Middleware runs on Edge — no `postgres-js`, no `fs`, no Node APIs. `@hamafx/db` is Node-only.
2. **PGlite vs Postgres:** PGlite has no pgvector — vector tables use `real[]` fallback. Ensure fixes work without pgvector.
3. **Strict TypeScript:** `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are enabled. Be careful with optional properties.
4. **Auth:** NextAuth v5 with Credentials provider, JWT strategy. Strict per-user `userId` scoping on all data tables.
5. **Design Tokens:** Use semantic tokens from `globals.css` (`bg-bg-base`, `text-fg`, `bg-bg-elev-1`, etc.) — never hardcode colors.
6. **CSRF:** Use the existing `lib/csrf.ts` utilities for all mutation endpoints.
7. **Logger:** Use `lib/logger.ts` instead of `console.*` — never leave console statements in production code.
8. **Sentry:** Use `Sentry.captureException()` in error boundaries, not `console.error`.
9. **React 19:** Use `useId()` for unique ARIA IDs, not hardcoded strings.
10. **AI SDK v5:** UIMessage properties may differ from v4 — verify `.content` access patterns.

---

## Appendix: Detailed Analysis Files

The following detailed analysis files were generated by specialized analysis agents and contain the full line-by-line findings with file:line references:

1. **`auth-onboarding-root-analysis.md`** — 951 lines, 19 files analyzed
2. **`chat-system-analysis.md`** — 512 lines, 40+ files analyzed
3. **`dashboard-analysis.md`** — 707 lines, 16 files analyzed
4. **`chart-system-analysis.md`** — 634 lines, 30+ files analyzed
5. **`news-calendar-signals-alerts-analysis.md`** — 789 lines, 24 files analyzed
6. **`journal-system-analysis.md`** — 269 lines, 13 files analyzed
7. **`settings-system-analysis.md`** — 729 lines, 45 files analyzed
8. **`admin-layout-ui-lib-analysis.md`** — 1446 lines, 48 files analyzed

**Total: 396 frontend files analyzed, 346+ findings identified across 5,000+ lines of analysis.**

---

*End of Implementation Plan*


---

# APPENDIX: Full Detailed Analysis Reports

> The following sections contain the complete line-by-line analysis from each specialized agent.
> Use these for exact file:line references when implementing fixes.



---

## A. Auth, Onboarding & Root Files Analysis

# HamaFX-Ai — Auth, Onboarding & Root-Level Files Analysis

## Table of Contents
1. [Auth Pages](#auth-pages)
2. [Onboarding](#onboarding)
3. [Root Files](#root-files)
4. [Cross-Cutting Issues](#cross-cutting-issues)

---

## AUTH PAGES

### `(auth)/actions.ts`

#### BUG-1: `loginAction` return type inconsistency — `requires2FA` path returns `email` but initial state is `{ error: '' }`
**File:** `(auth)/actions.ts` ~line 30-70
**Severity:** Medium
**Details:** `useActionState(loginAction, { error: '' })` initializes state as `{ error: string }`. But the action can return `{ requires2FA: true, email: normalizedEmail }`, `{ success: true }`, or `{ error: string }`. The initial state doesn't include `requires2FA` or `success`, so TypeScript's inferred type from `useActionState` will be a union that doesn't match the initial value. The login page accesses `state.requires2FA` and `state.success` without type narrowing.
**Fix:** Explicitly type the initial state:
```ts
const [state, action, pending] = useActionState(loginAction, { error: '' } as { error: string; success?: boolean; requires2FA?: boolean; email?: string });
```
Or better, define a shared `AuthActionResult` type and use it for both the initial state and all return paths.

#### BUG-2: `forgotPasswordAction` and `resetPasswordAction` lack Sentry instrumentation
**File:** `(auth)/actions.ts` ~lines 155-230
**Severity:** Low-Medium
**Details:** `loginAction` and `registerAction` are wrapped in `Sentry.withServerActionInstrumentation()`, but `forgotPasswordAction` and `resetPasswordAction` are not. This means errors in the password reset flow won't be captured by Sentry's server action performance monitoring.
**Fix:** Wrap both functions in `Sentry.withServerActionInstrumentation()`.

#### BUG-3: `resetPasswordAction` doesn't invalidate all existing sessions after password reset
**File:** `(auth)/actions.ts` ~line 210-225
**Severity:** High (Security)
**Details:** The action increments `tokenVersion` (which likely invalidates existing session tokens), but it doesn't explicitly revoke all active sessions. If `tokenVersion` isn't checked on every request (e.g., if JWTs are used without DB lookup), stolen sessions remain valid after a password reset. The action also doesn't sign out the user from other devices.
**Fix:** After password reset, explicitly revoke all sessions for the user (e.g., delete from `sessions` table or call a `revokeAllSessions(userId)` function). Verify that middleware checks `tokenVersion` on every authenticated request.

#### BUG-4: `resetPasswordAction` doesn't rate limit
**File:** `(auth)/actions.ts` ~line 195
**Severity:** High (Security)
**Details:** `forgotPasswordAction` has rate limiting (`withRateLimit('forgot:${email}', 'forgot_password', 3)`), but `resetPasswordAction` has **no rate limiting at all**. An attacker who obtains a valid reset token can brute-force the password field, or more importantly, repeatedly hit the endpoint to enumerate valid tokens via timing differences.
**Fix:** Add rate limiting:
```ts
const rl = await withRateLimit(`reset:${clientIp}`, 'reset_password', 5);
if (!rl.allowed) return { error: 'Too many reset attempts. Please try again later.' };
```

#### BUG-5: `registerAction` auto-signs in but verification email is sent *before* `signIn`
**File:** `(auth)/actions.ts` ~lines 130-155
**Severity:** Low
**Details:** The verification token is created and logged/sent, then `signIn('credentials', { redirectTo: '/onboarding' })` is called. If `signIn` throws `NEXT_REDIRECT` (which it does on success), the `try/catch` around `signIn` catches it and re-throws — but the `return { success: true }` after `signIn` is unreachable code when redirect succeeds. This is not a bug per se, but the code flow is misleading. The `return { success: true }` after `signIn` will only execute if `signIn` resolves without redirecting (which shouldn't happen with `redirectTo`).
**Fix:** This is acceptable as a fallback, but add a comment clarifying that `signIn` with `redirectTo` throws `NEXT_REDIRECT` and the return is a fallback for non-redirect scenarios.

#### BUG-6: `registerAction` — email verification token created but no email actually sent
**File:** `(auth)/actions.ts` ~lines 135-150
**Severity:** Medium (Feature incomplete)
**Details:** The verification token is generated and stored, but in production, only a log message is produced (the `if (process.env.NODE_ENV !== 'production')` guard prevents even the log in prod). There's no call to `sendPasswordResetEmail`-equivalent for verification emails. The user is auto-signed in without email verification, making the verification token useless.
**Fix:** Implement `sendVerificationEmail()` similar to `sendPasswordResetEmail()`, and either gate the auto-signIn behind email verification or document that email verification is optional/decorative.

#### BUG-7: `loginAction` — `totpCode` read from `formData.get('totpCode')` bypasses Zod validation
**File:** `(auth)/actions.ts` ~line 55
**Severity:** Low
**Details:** The `loginSchema` doesn't include `totpCode`, so it's read directly from `formData.get('totpCode')`. This means no validation on the 2FA code format (length, numeric, etc.) before passing to `signIn`. An attacker could send arbitrary strings.
**Fix:** Add `totpCode` to the schema: `totpCode: z.string().optional().regex(/^[0-9]{6}$/, 'Invalid 2FA code')`.

#### BUG-8: `loginAction` — `recordAuthEvent` called after `signIn` success but `signIn` throws `NEXT_REDIRECT`
**File:** `(auth)/actions.ts` ~lines 57-60
**Severity:** Medium
**Details:** `await signIn(...)` with `redirectTo` throws a `NEXT_REDIRECT` error on success. The `recordAuthEvent('login_success')` on line 59 is **unreachable** when the redirect succeeds — the error is thrown before it executes. The `catch` block catches it, checks `errStr.includes('NEXT_REDIRECT')`, and re-throws. So `login_success` is never recorded for successful logins.
**Fix:** Move `recordAuthEvent('login_success')` before `signIn()`, or record it in the `catch` block when `NEXT_REDIRECT` is detected:
```ts
if (errStr.includes('NEXT_REDIRECT')) {
  recordAuthEvent('login_success');
  throw error;
}
```

#### BUG-9: `sendPasswordResetEmail` — XSS risk in reset URL HTML
**File:** `(auth)/actions.ts` ~line 175
**Severity:** Low (the URL is generated server-side, but still)
**Details:** The reset URL is interpolated directly into HTML: `<a href="${resetUrl}">${resetUrl}</a>`. If `baseUrl` or `resetToken` contained HTML characters, this would be an XSS vector. Since both are server-controlled, the risk is low, but it's bad practice.
**Fix:** HTML-escape the URL in the email template, or use a template library.

#### BUG-10: `forgotPasswordAction` — inconsistent `baseUrl` fallback
**File:** `(auth)/actions.ts` ~line 170 vs ~line 145
**Severity:** Low
**Details:** `forgotPasswordAction` uses `process.env.NEXT_PUBLIC_APP_URL || 'https://hamafx-ai.vercel.app'` as fallback, while `registerAction` uses `process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'`. The hardcoded production URL in the forgot-password path could send emails with the wrong URL in non-production environments.
**Fix:** Use a consistent fallback, ideally from a shared config constant.

#### BUG-11: `registerAction` — `confirmPassword` not validated server-side
**File:** `(auth)/actions.ts` ~line 95
**Severity:** Low
**Details:** The `registerSchema` validates `name`, `email`, `password` but not `confirmPassword`. The client checks `password === confirmPassword`, but a malicious actor can bypass client validation and submit mismatched passwords. The server only uses `password`, so this isn't a security issue, but it's a defense-in-depth gap.
**Fix:** Add `confirmPassword` to the schema and validate it matches `password` server-side, or document that it's intentionally client-only.

#### BUG-12: `resetPasswordAction` — `confirmPassword` not validated server-side
**File:** `(auth)/actions.ts` ~line 195
**Severity:** Low
**Same as BUG-11.** The server validates `password` strength but doesn't check `confirmPassword`.

#### BUG-13: Indentation inconsistency in `loginAction` and `registerAction`
**File:** `(auth)/actions.ts` ~lines 22-80, 85-155
**Severity:** Code Quality
**Details:** The code inside `Sentry.withServerActionInstrumentation()` is not indented relative to the callback. The closing `});` is at the same level as the function body. This makes the code harder to read and suggests the Sentry wrapper was added as an afterthought.
**Fix:** Properly indent the callback body.

---

### `(auth)/layout.tsx`

#### UX-1: Logo `alt` text is empty
**File:** `(auth)/layout.tsx` ~line 33
**Severity:** Low (Accessibility)
**Details:** `<Image src="/icons/icon-192.png" alt="" ... />` has empty alt text. While this is technically correct for decorative images, the logo is the primary brand identifier on the auth page. Screen readers won't announce "HamaFX-Ai" when navigating to the page.
**Fix:** Use `alt="HamaFX-Ai"` or add an `aria-label` to the header.

#### UX-2: `h1` contains nested spans with identical `text-fg` class
**File:** `(auth)/layout.tsx` ~line 40-42
**Severity:** Code Quality
**Details:** `<h1 className="text-fg text-2xl ...">Hama<span className="text-fg">FX</span><span className="text-fg-subtle font-normal">·Ai</span></h1>`. The outer `h1` and the inner `span` for "FX" both have `text-fg`, making the span's class redundant.
**Fix:** Remove `className="text-fg"` from the "FX" span.

#### UX-3: Auth layout has `force-dynamic` but no auth check
**File:** `(auth)/layout.tsx` ~line 18
**Severity:** Low
**Details:** The layout is `force-dynamic` (correct for auth pages), but it doesn't check if the user is already authenticated. If a logged-in user navigates to `/login` or `/register`, they see the auth form instead of being redirected to `/chat` or `/dashboard`.
**Fix:** Add a server-side auth check in the layout that redirects authenticated users:
```tsx
const session = await auth();
if (session?.user) redirect('/chat');
```

#### DESIGN-1: `surface-panel` utility used but `p-6` applied separately
**File:** `(auth)/layout.tsx` ~line 45
**Severity:** Code Quality
**Details:** `<div className="surface-panel p-6 flex flex-col gap-6">` — the `surface-panel` utility provides background and border, but padding is applied via Tailwind. This is fine, but inconsistent with other surfaces that might use `surface-panel` without explicit padding. Not a bug, just a note for consistency.

---

### `(auth)/login/layout.tsx`

#### DEAD-1: Completely redundant layout file
**File:** `(auth)/login/layout.tsx`
**Severity:** Code Quality
**Details:** This file is `export default function LoginLayout({ children }) { return children; }` with `export const dynamic = 'force-dynamic'`. It's a pass-through that adds nothing. The `force-dynamic` is already set by the parent `(auth)/layout.tsx`.
**Fix:** Delete this file. The parent layout already handles everything.

---

### `(auth)/login/page.tsx`

#### BUG-1: 2FA flow doesn't re-submit the email/password — only the TOTP code
**File:** `(auth)/login/page.tsx` ~lines 30-40, 55-65
**Severity:** High
**Details:** When `requires2FA` is set to `true`, the form reveals a TOTP input field. But the form uses `useActionState` with a single `<form action={action}>`. When the user submits the 2FA code, the form re-submits all fields (email, password, next, totpCode). However, the email and password fields are still present but `disabled={pending || success}`. **Disabled inputs are not submitted with the form.** So when the 2FA form is submitted, `email` and `password` are missing from the FormData, and the server action's `loginSchema.safeParse()` will fail with "Invalid email address" or "Password is required".
**Fix:** Don't disable the email/password fields — use `readOnly` instead of `disabled`, or use hidden inputs to carry forward the email/password values. Better yet, store the email/password in state and include them as hidden inputs when 2FA is required:
```tsx
{requires2FA && (
  <>
    <input type="hidden" name="email" value={emailValue} />
    <input type="hidden" name="password" value={passwordValue} />
  </>
)}
```
This requires tracking email/password in component state.

#### BUG-2: `success` state never triggers redirect
**File:** `(auth)/login/page.tsx` ~lines 25-29
**Severity:** High
**Details:** `useEffect` sets `setSuccess(true)` when `state.success` is true, but there's no `router.push()` or redirect. The button changes to "Welcome back" with a checkmark, but the user stays on the login page indefinitely. The `signIn` call in the server action uses `redirectTo: safeNext`, which throws `NEXT_REDIRECT` — but since this is a server action called via `useActionState`, the redirect happens at the server action level. If the redirect works, `state.success` would never be set (the page would navigate away). If the redirect doesn't work (e.g., the `NEXT_REDIRECT` is caught and re-thrown, but `useActionState` doesn't handle it), the user sees "Welcome back" but nothing happens.
**Fix:** Add a redirect in the `useEffect`:
```tsx
useEffect(() => {
  if (state.success) {
    setSuccess(true);
    router.push(next || '/chat');
  }
}, [state.success, router, next]);
```
Or verify that `signIn` with `redirectTo` in a server action properly triggers a client-side navigation via `useActionState`.

#### BUG-3: `NEXT_PUBLIC_BUILD_ID` hidden input serves no purpose
**File:** `(auth)/login/page.tsx` ~line 49
**Severity:** Code Quality
**Details:** `<input type="hidden" name="build" value={process.env.NEXT_PUBLIC_BUILD_ID ?? ''} />` — the `build` field is submitted with the form but `loginSchema` doesn't include it, and `loginAction` never reads it. It's dead data.
**Fix:** Remove this input, or if it's meant for cache-busting/version tracking, add it to the schema as optional and log it.

#### BUG-4: Dev login bypass uses `window.location.href` instead of `router.push`
**File:** `(auth)/login/page.tsx` ~lines 120-125
**Severity:** Low
**Details:** The "Skip login (dev only)" button uses `window.location.href = '/api/dev/login'` which causes a full page reload. This is fine for a dev-only feature, but inconsistent with Next.js navigation patterns.
**Fix:** Use `router.push('/api/dev/login')` if the dev login route supports client-side navigation, or keep as-is since it's dev-only.

#### UX-1: "Remember me" checkbox uses native `<input>` instead of design system component
**File:** `(auth)/login/page.tsx` ~line 78
**Severity:** Design System Drift
**Details:** `<input type="checkbox" name="rememberMe" value="true" defaultChecked className="rounded-sm border-border" />` uses a native HTML checkbox with minimal styling. The design system likely has a Checkbox component (shadcn/ui). The `rounded-sm` class is applied but native checkboxes don't respect border-radius reliably across browsers.
**Fix:** Use the shadcn/ui Checkbox component, or style a custom checkbox with the design system's tokens.

#### UX-2: No password visibility toggle on login form
**File:** `(auth)/login/page.tsx` ~line 62
**Severity:** UX
**Details:** The password field has no show/hide toggle. The register page also lacks this. The onboarding wizard's API key field has an eye toggle, showing the pattern exists in the codebase.
**Fix:** Add a password visibility toggle (eye icon) consistent with the onboarding wizard's API key field.

#### UX-3: No "Enter" key submit indication
**File:** `(auth)/login/page.tsx`
**Severity:** Low
**Details:** The form uses native `<form>` submission, so Enter key works. This is fine. No issue.

#### A11Y-1: Error message not associated with input via `aria-describedby`
**File:** `(auth)/login/page.tsx` ~line 86
**Severity:** Low (Accessibility)
**Details:** `<p id="login-error" role="alert" className="text-danger text-sm">{state.error}</p>` has `role="alert"` which announces it, but the email/password inputs don't have `aria-describedby="login-error"` or `aria-invalid="true"` when there's an error.
**Fix:** Add `aria-invalid={!!state.error}` and `aria-describedby="login-error"` to the form inputs when there's an error.

---

### `(auth)/register/page.tsx`

#### BUG-1: No `Suspense` wrapper needed but missing `useSearchParams` protection
**File:** `(auth)/register/page.tsx`
**Severity:** Low
**Details:** The register page doesn't use `useSearchParams` so no `Suspense` boundary is needed. This is fine. However, if a `next` param is ever added (like login), it would need `Suspense`.

#### BUG-2: Password strength checker missing "special character" requirement
**File:** `(auth)/register/page.tsx` ~lines 80-95
**Severity:** Low
**Details:** The client-side password strength indicator checks: min 8 chars, uppercase, lowercase, number. But the server-side `registerSchema` also only checks these 4 rules. No special character requirement. This is consistent, but for a trading platform, stronger password requirements might be warranted.
**Fix:** Consider adding a special character requirement to both client and server validation, or document that the current policy is intentional.

#### UX-1: No password visibility toggle (same as login)
**File:** `(auth)/register/page.tsx` ~line 65
**Severity:** UX
**Details:** Same as login page — no show/hide toggle on password fields.

#### UX-2: `confirmPassword` not sent to server, only used for client validation
**File:** `(auth)/register/page.tsx` ~line 100
**Severity:** Low
**Details:** The `confirmPassword` input has `name="confirmPassword"` so it's submitted with the form, but the server's `registerSchema` doesn't include it. The server ignores it. This is fine but slightly wasteful.

#### A11Y-1: Password strength indicators use color-only feedback
**File:** `(auth)/register/page.tsx` ~lines 80-95
**Severity:** Medium (Accessibility)
**Details:** The password requirements show ✓/✗ with `text-success`/`text-danger` colors. While the check/cross marks provide text-based feedback, the color coding alone won't be distinguishable for color-blind users. The ✓/✗ symbols help, but the text doesn't change to indicate pass/fail.
**Fix:** Add `aria-label` or visually-hidden text like "Met" / "Not met" next to each requirement.

#### PERF-1: Password validation regex runs on every keystroke
**File:** `(auth)/register/page.tsx` ~lines 80-95
**Severity:** Low
**Details:** `/[A-Z]/.test(password)`, `/[a-z]/.test(password)`, `/[0-9]/.test(password)` run on every render caused by `setPassword`. This is negligible overhead but could be memoized.
**Fix:** Wrap in `useMemo` if performance is a concern (unlikely for 3 regex tests).

---

### `(auth)/forgot-password/page.tsx`

#### BUG-1: Double panel — `surface-panel` applied in both layout and page
**File:** `(auth)/forgot-password/page.tsx` ~line 14
**Severity:** Design System Drift
**Details:** The `(auth)/layout.tsx` already wraps children in `<div className="surface-panel p-6 flex flex-col gap-6">`. The forgot-password page adds another `<div className="surface-panel p-6">` around the form. This creates a nested panel with double borders and double padding.
**Fix:** Remove the `surface-panel p-6` wrapper from the forgot-password page. The parent layout already provides this.

#### UX-1: No rate limit feedback countdown
**File:** `(auth)/forgot-password/page.tsx` ~line 35
**Severity:** Low
**Details:** When rate-limited, the user sees "Too many requests. Try again later." but no indication of when they can retry. No countdown timer or retry time.
**Fix:** Include retry time in the error message or add a countdown.

---

### `(auth)/reset-password/page.tsx`

#### BUG-1: `searchParams` type doesn't match Next.js 15 signature
**File:** `(auth)/reset-password/page.tsx` ~lines 4-9
**Severity:** Low
**Details:** The page receives `searchParams: Promise<{ token?: string }>` and awaits it. This is correct for Next.js 15. No issue.

#### UX-1: No loading state while page resolves
**File:** `(auth)/reset-password/page.tsx`
**Severity:** Low
**Details:** The page is a server component that awaits `searchParams`. Since it's `force-dynamic`, there's no loading.tsx for this route. The user sees a blank page until the server resolves.
**Fix:** Add a `loading.tsx` for the reset-password route, or wrap the form in a Suspense boundary.

---

### `(auth)/reset-password/reset-password-form.tsx`

#### BUG-1: Countdown redirect shows `countdown` value that could be `0` briefly
**File:** `(auth)/reset-password/reset-password-form.tsx` ~lines 20-30
**Severity:** Low
**Details:** The countdown starts at 3 and decrements. When `countdown === 1`, the timeout fires and calls `router.push('/login')`. But the display shows `Redirecting to sign in in {countdown}s…`. When `countdown` reaches 1, it shows "1s" then navigates. When `countdown` reaches 0, the effect returns early (`if (countdown === null || countdown <= 0) return`). The `countdown` never actually displays 0 because the navigation happens at 1. This is fine, but the edge case of `countdown === 0` is handled by the guard clause, not by the display.

#### BUG-2: `confirmPassword` not validated server-side
**File:** `(auth)/reset-password/reset-password-form.tsx` ~line 90
**Severity:** Low
**Same as auth actions BUG-12.** The `confirmPassword` field is submitted but ignored server-side.

#### UX-1: No password visibility toggle (same as other auth pages)
**File:** `(auth)/reset-password/reset-password-form.tsx` ~line 65
**Severity:** UX

#### UX-2: Password strength checker duplicated from register page
**File:** `(auth)/reset-password/reset-password-form.tsx` ~lines 75-90
**Severity:** Code Quality (DRY violation)
**Details:** The exact same password strength indicator UI (4 checks in a 2-col grid) is duplicated between register and reset-password. Any change to password requirements must be made in both places.
**Fix:** Extract a `<PasswordStrengthIndicator password={password} />` component and reuse it.

#### A11Y-1: Missing `aria-describedby` on error messages
**File:** `(auth)/reset-password/reset-password-form.tsx` ~line 110
**Severity:** Low
**Same pattern as login page.**

---

### `(auth)/forgot-password/layout.tsx` and `(auth)/reset-password/layout.tsx`

#### DEAD-2: Both are redundant pass-through layouts
**File:** `(auth)/forgot-password/layout.tsx`, `(auth)/reset-password/layout.tsx`
**Severity:** Code Quality
**Details:** Both files are identical pass-throughs: `export default function XLayout({ children }) { return children; }` with `export const dynamic = 'force-dynamic'`. The parent `(auth)/layout.tsx` already sets `force-dynamic`.
**Fix:** Delete both files.

---

## ONBOARDING

### `onboarding/actions.ts`

#### BUG-1: `completeOnboardingAction` doesn't save `tradingStyle` to the database
**File:** `onboarding/actions.ts` ~lines 80-120
**Severity:** High
**Details:** The wizard collects `tradingStyle` (scalper, day_trader, swing, position) and saves it to `localStorage` on the client, but the `OnboardingPayload` interface and the action don't include `tradingStyle`. The server action never persists it to the database. The user's trading style is lost on page refresh or device switch.
**Fix:** Add `tradingStyle` to `OnboardingPayload`, validate it, and save it to `userSettings` (or a preferences table).

#### BUG-2: `completeOnboardingAction` doesn't validate `timezone`
**File:** `onboarding/actions.ts` ~line 40
**Severity:** Medium
**Details:** `payload.timezone` is saved directly to the database without validation. An attacker could submit an arbitrary string as the timezone. While this won't cause a crash (it's stored as a string), it could cause issues downstream if the timezone is used for date formatting.
**Fix:** Validate timezone: `z.string().timezone()` or check against `Intl.supportedValuesOf('timeZone')`.

#### BUG-3: `completeOnboardingAction` doesn't validate `displayName`
**File:** `onboarding/actions.ts` ~line 70
**Severity:** Low
**Details:** `payload.displayName` is trimmed and sliced to 100 chars, but not validated for content (e.g., no minimum length check, no sanitization). The wizard validates `name.trim().length < 2` on the client, but this can be bypassed.
**Fix:** Validate server-side: `z.string().min(2).max(100)`.

#### BUG-4: `completeOnboardingAction` doesn't validate `defaultSymbol`
**File:** `onboarding/actions.ts` ~line 85
**Severity:** Low
**Details:** `payload.defaultSymbol` is saved without validation. It defaults to 'XAUUSD' if falsy, but if a non-empty invalid string is provided, it's saved as-is.
**Fix:** Validate with the same `symbolSchema` used for `symbols`.

#### BUG-5: `completeOnboardingAction` — `onboardingProgress` never saved
**File:** `onboarding/actions.ts`
**Severity:** Medium
**Details:** The wizard saves progress to `sessionStorage` and sends debounced POSTs to `/api/onboarding/save-progress`, but the `completeOnboardingAction` never reads or clears `onboardingProgress` from `userSettings`. The `onboarding/page.tsx` reads `settings?.onboardingProgress` and passes it to the wizard as `initialProgress`, but the progress is never updated server-side (the save-progress API endpoint is separate). If the save-progress endpoint fails, the user loses their place.
**Fix:** Ensure the `/api/onboarding/save-progress` endpoint properly persists progress to `userSettings.onboardingProgress`, and clear it in `completeOnboardingAction`.

#### BUG-6: Race condition — `completeOnboardingAction` can be called multiple times
**File:** `onboarding/actions.ts`
**Severity:** Low
**Details:** There's no idempotency check. If the user double-clicks "Finish Setup" or the action is retried, the action runs again. The transaction deletes and re-creates user symbols, which is idempotent, but the API key encryption and settings update could cause issues if called concurrently.
**Fix:** Add an idempotency check: if `onboardingCompleted` is already true, return early with `{ ok: true }`.

#### BUG-7: `completeOnboardingAction` uses `JSON.parse` on user input without size limit
**File:** `onboarding/actions.ts` ~line 33
**Severity:** Low (Security)
**Details:** `JSON.parse((formData.get('payload') as string) || '{}')` — if an attacker sends a very large JSON payload, it could cause memory issues. There's no size limit on the payload.
**Fix:** Add a size check: `const raw = formData.get('payload') as string; if (raw && raw.length > 10000) return { ok: false, error: 'Payload too large' };`

#### BUG-8: API key encryption/decryption happens inside the transaction
**File:** `onboarding/actions.ts` ~lines 75-80
**Severity:** Low (Performance)
**Details:** `decryptByok(existing?.aiApiKeys)` and `encryptByok(merged)` are called inside the transaction. These are potentially expensive crypto operations that hold the DB transaction open longer than necessary.
**Fix:** Move encryption/decryption outside the transaction if possible.

#### BUG-9: `onboardingProgress` type is `Record<string, unknown> | null` but wizard casts without validation
**File:** `onboarding/page.tsx` ~line 35, `wizard.tsx` ~line 50
**Severity:** Low
**Details:** The wizard's `initialProgress` prop is typed as `Record<string, unknown> | null`, but the `useEffect` that restores progress accesses `p.step`, `p.name`, etc. without runtime validation. If the stored progress is corrupted, the wizard could set invalid state.
**Fix:** Use Zod to validate the progress object before applying it.

---

### `onboarding/layout.tsx`

#### UX-1: `Toaster` from `@/components/ui/toaster` but wizard uses `sonner`'s `toast`
**File:** `onboarding/layout.tsx` ~line 20, `wizard.tsx` ~line 24
**Severity:** Medium
**Details:** The layout renders `<Toaster />` from `@/components/ui/toaster`, but the wizard imports `{ toast } from 'sonner'`. If `@/components/ui/toaster` is a wrapper around Sonner, this works. But if it's a different toast system (e.g., shadcn/ui's toast), the wizard's `toast.error()` calls won't display anything because the wrong Toaster is rendered.
**Fix:** Verify that `@/components/ui/toaster` renders Sonner's `<Toaster />`. If not, either use the correct toast function in the wizard or render Sonner's `<Toaster />` in the layout.

#### UX-2: No auth check in onboarding layout
**File:** `onboarding/layout.tsx`
**Severity:** Low
**Details:** The layout doesn't check authentication. The `onboarding/page.tsx` does check auth and redirects, but if a child route of `/onboarding` doesn't check auth, it could be accessed unauthenticated.
**Fix:** Add an auth check in the layout, or ensure all child routes check auth.

#### DESIGN-1: Missing `force-dynamic` export
**File:** `onboarding/layout.tsx`
**Severity:** Low
**Details:** The onboarding layout doesn't export `const dynamic = 'force-dynamic'`. Since `onboarding/page.tsx` uses `auth()` and DB queries, it should be dynamic. Next.js may auto-detect this, but being explicit is safer.
**Fix:** Add `export const dynamic = 'force-dynamic'`.

---

### `onboarding/page.tsx`

#### BUG-1: Redirects to `/chat` but root page redirects to `/dashboard`
**File:** `onboarding/page.tsx` ~line 22, `app/page.tsx` ~line 10
**Severity:** Medium
**Details:** `onboarding/page.tsx` redirects authenticated users who already completed onboarding to `/chat`. But `app/page.tsx` redirects authenticated users to `/dashboard`. This inconsistency means the post-login destination depends on which redirect path the user hits.
**Fix:** Standardize on a single post-auth redirect target (either `/chat` or `/dashboard`).

#### BUG-2: No error handling for DB query failures
**File:** `onboarding/page.tsx` ~lines 18-25
**Severity:** Medium
**Details:** The page queries `userSettings` and `symbolCatalog` without try/catch. If the DB is unreachable, the page throws an error that's caught by `error.tsx` but shows a generic "Something went wrong" message instead of a meaningful "We couldn't load your onboarding data" message.
**Fix:** Wrap DB queries in try/catch and show a retry UI on failure.

#### BUG-3: `buildCatalogForUser` and `symbolCatalog` query run in parallel but errors aren't handled individually
**File:** `onboarding/page.tsx` ~lines 27-33
**Severity:** Low
**Details:** `Promise.all([buildCatalogForUser(...), db.select()...])` — if either fails, the whole page fails. `buildCatalogForUser` might fail if the user has no API keys configured, which is expected during onboarding.
**Fix:** Use `Promise.allSettled` and handle partial failures gracefully (e.g., show providers list but with a warning if catalog fails).

---

### `onboarding/wizard.tsx`

#### BUG-1: `handleTestKey` uses `withCsrf` but `handleSubmit` doesn't
**File:** `wizard.tsx` ~lines 100-115, 120-145
**Severity:** Medium (Security)
**Details:** `handleTestKey` wraps the fetch call with `withCsrf()` for CSRF protection, but `handleSubmit` calls `completeOnboardingAction(fd)` which is a server action. Server actions have built-in CSRF protection in Next.js, so this is actually fine. However, the progress-saving fetch call (`fetch('/api/onboarding/save-progress', ...)`) at line ~85 also doesn't use `withCsrf`. If that API route doesn't have CSRF protection, it's vulnerable.
**Fix:** Add `withCsrf` to the save-progress fetch call, or ensure the API route has origin verification.

#### BUG-2: `handleSkip` doesn't validate `name` before submitting
**File:** `wizard.tsx` ~lines 150-165
**Severity:** Low
**Details:** `handleSkip` submits with `displayName: name`, but if the user is on step 1 and hasn't entered a name, it submits an empty string. The server action trims and slices but doesn't validate minimum length.
**Fix:** Validate name in `handleSkip` or default to a placeholder like "Trader".

#### BUG-3: Step 4 "Continue" button is disabled when no provider is selected, but "Skip" link calls `handleNext` which bypasses validation
**File:** `wizard.tsx` ~lines 230-240
**Severity:** Low
**Details:** The "Skip for now" button at the bottom of step 4 calls `setSelectedProvider(null); setApiKey(''); setTestState({ kind: 'idle' }); handleNext();`. But `handleNext` validates the current step — `validateStep(4)` returns `null` if `selectedProvider === null`, so this works. However, the state updates (`setSelectedProvider(null)`) are asynchronous, and `handleNext` reads `step` (not `selectedProvider`) to determine which validation to run. The `validateStep` function reads `selectedProvider` from closure, which may not have updated yet. This is a potential race condition.
**Fix:** Pass the step explicitly or use a callback to ensure state is updated before validation:
```tsx
onClick={() => {
  setSelectedProvider(null);
  setApiKey('');
  setTestState({ kind: 'idle' });
  // Move to step 5 directly, skipping validation for step 4
  setStep(5);
}}
```

#### BUG-4: `tradingStyle` saved to `localStorage` but not to server
**File:** `wizard.tsx` ~lines 120-130
**Severity:** High
**Details:** `handleSubmit` saves `tradingStyle` to `localStorage` via `hamafx:prefs`, but the payload sent to `completeOnboardingAction` doesn't include `tradingStyle`. On a different device or after clearing localStorage, the trading style preference is lost. See also `onboarding/actions.ts` BUG-1.
**Fix:** Include `tradingStyle` in the payload and persist it server-side.

#### BUG-5: `sessionStorage` save runs on every state change causing excessive writes
**File:** `wizard.tsx` ~lines 65-72
**Severity:** Low (Performance)
**Details:** The `useEffect` that saves to `sessionStorage` depends on `[step, name, timezone, defaultSymbol, selectedProvider, tradingStyle, selectedSymbols]` and runs on every change. Each keystroke in the name field triggers a `sessionStorage.setItem` call with a full JSON.stringify. This is not a significant performance issue but is wasteful.
**Fix:** Debounce the sessionStorage save, or only save on step changes.

#### BUG-6: Server-side progress save has no CSRF and no error handling
**File:** `wizard.tsx` ~lines 74-82
**Severity:** Medium (Security)
**Details:** `fetch('/api/onboarding/save-progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...}) })` — no CSRF token, no auth header (relies on cookies), and `.catch(() => {})` silently swallows all errors. If the endpoint is vulnerable to CSRF, an attacker could craft a malicious page that POSTs to this endpoint and corrupts the user's onboarding progress.
**Fix:** Add `withCsrf()` to this fetch call. Also, at minimum log the error instead of silently swallowing it.

#### BUG-7: `IconLoader2`, `IconRobot`, `IconUser` imported but `IconLoader2` only used in test state
**File:** `wizard.tsx` ~line 23
**Severity:** Code Quality
**Details:** All icons are used, but `IconLoader2` is only used in the test connection button. No dead code, but the import line is very long and could be split for readability.

#### BUG-8: `startTest` transition is never used to prevent re-entry
**File:** `wizard.tsx` ~line 42
**Severity:** Low
**Details:** `const [, startTest] = useTransition();` — the `isPending` from `useTransition` is discarded (`[, startTest]`). The test button uses `testState.kind === 'pending'` to show the loading state, but there's no guard against starting a new test while one is pending. The button's `disabled` prop checks `testState.kind === 'pending'`, so this is handled. But the `startTest` transition's pending state is unused, which is slightly confusing.
**Fix:** Use the transition's `isPending` for the button state, or remove the `useTransition` and use `testState` alone.

#### UX-1: No keyboard navigation for step navigation
**File:** `wizard.tsx`
**Severity:** Medium (Accessibility)
**Details:** The wizard uses buttons for "Continue" and "Back", which are keyboard accessible. However, there's no keyboard shortcut for next/back (e.g., Enter to continue on non-form-input steps). The symbol selection and trading style selection use `<button>` elements which are accessible.
**Fix:** Consider adding Enter key handling for step advancement on non-input steps.

#### UX-2: No progress bar or percentage indicator
**File:** `wizard.tsx` ~lines 170-185
**Severity:** Low
**Details:** The stepper shows numbered circles but no percentage or progress bar. For a 5-step wizard, a "Step 2 of 5" text or percentage bar would improve UX.
**Fix:** Add `aria-label="Step ${step} of 5"` to the stepper container, and optionally a visual progress bar.

#### UX-3: `Intl.supportedValuesOf('timeZone')` not supported in all browsers
**File:** `wizard.tsx` ~line 195
**Severity:** Low
**Details:** `Intl.supportedValuesOf('timeZone')` is relatively new (Chrome 99+, Firefox 93+, Safari 15.4+). In older browsers, this will throw or return undefined, causing the timezone dropdown to be empty.
**Fix:** Add a fallback:
```tsx
const timezones = typeof Intl.supportedValuesOf === 'function' 
  ? Intl.supportedValuesOf('timeZone') 
  : ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Singapore'];
```

#### UX-4: Sample chat preview has hardcoded data that could become stale
**File:** `wizard.tsx` ~lines 280-310
**Severity:** Low
**Details:** The sample chat shows XAUUSD at $2,650 with specific RSI/MACD values. These are hardcoded and could become misleading if gold prices change significantly.
**Fix:** Either make the sample clearly labeled as "example" (which it is, in the details/summary), or use a disclaimer like "Illustrative example — not live data."

#### UX-5: Typo in className — `tablibular-nums` instead of `tabular-nums`
**File:** `wizard.tsx` ~line 305
**Severity:** Medium (Bug)
**Details:** `<span className="tablibular-nums">$2,680</span>` — the class name is `tablibular-nums` instead of `tabular-nums`. This means the tabular numbers CSS feature won't be applied, and the number won't use monospaced digits.
**Fix:** Change to `tabular-nums`.

#### DESIGN-1: `bg-bg-elev-1-elevated` class doesn't exist in the design system
**File:** `wizard.tsx` ~line 180
**Severity:** Medium (Bug)
**Details:** The stepper connector uses `className={step > i ? 'bg-fg' : 'bg-bg-elev-1-elevated'}`. The class `bg-bg-elev-1-elevated` doesn't exist in the design tokens. The correct token is `bg-bg-elev-2` or `bg-bg-elev-3`. The connector will have no background color (transparent) for incomplete steps, making it invisible.
**Fix:** Change to `bg-bg-elev-2` or `bg-border`.

#### DESIGN-2: Wizard uses `rounded-sm` on buttons but design system sets `--radius-sm: 2px`
**File:** `wizard.tsx` throughout
**Severity:** Low
**Details:** The design system sets all radii to 2px. `rounded-sm` in Tailwind v4 maps to `--radius-sm` which is 2px. This is consistent. No issue.

---

## ROOT FILES

### `app/layout.tsx`

#### BUG-1: `adjustFontFallback: false` on JetBrains Mono
**File:** `app/layout.tsx` ~line 24
**Severity:** Low (Performance)
**Details:** `adjustFontFallback: false` disables the automatic fallback font metric adjustment. This can cause layout shift (CLS) when the font loads, as the fallback font (system monospace) has different metrics than JetBrains Mono. For a data-dense trading terminal, this could cause visible shifting.
**Fix:** Change to `adjustFontFallback: true` (the default) to reduce CLS.

#### BUG-2: `apple-touch-startup-image` uses same image for all device sizes
**File:** `app/layout.tsx` ~lines 40-70
**Severity:** Low
**Details:** All 6 different Apple device media queries point to the same image: `/icons/apple-splash-1179x2556.png`. An iPhone 14 Pro (393x852) and an iPad Pro 12.9" (1024x1366) get the same 1179x2556 image. This will look stretched/blurry on non-matching devices.
**Fix:** Generate device-specific splash images, or use a single SVG-based splash that scales better.

#### BUG-3: `themeColor` in viewport is `#0A0A0A` but manifest uses `#000000`
**File:** `app/layout.tsx` ~line 36, `manifest.ts` ~line 22
**Severity:** Low (Design Drift)
**Details:** `viewport.themeColor` is `#0A0A0A` (matching `--color-bg`), but `manifest.ts` sets `background_color` and `theme_color` to `#000000`. The manifest comment says "Pure black canvas — matches --color-bg = #000000" but `--color-bg` is actually `#0A0A0A`, not `#000000`. This is a factual error in the comment and a color mismatch between manifest and viewport.
**Fix:** Align both to `#0A0A0A` (the actual `--color-bg`), or update the comment to acknowledge the intentional difference.

#### BUG-4: `color-scheme: dark` set in both `<head>` meta and globals.css
**File:** `app/layout.tsx` ~line 39, `globals.css` ~line 120
**Severity:** Code Quality
**Details:** `<meta name="color-scheme" content="dark" />` in the layout and `color-scheme: dark` in `:root` in globals.css. Redundant but not harmful.
**Fix:** Keep one (the meta tag is more standard for PWA).

#### BUG-5: No `<html>` class for dark mode — relies on `color-scheme` only
**File:** `app/layout.tsx` ~line 38
**Severity:** Low
**Details:** The `<html>` element has `className={jetbrainsMono.variable}` but no `dark` class. The design system is dark-only (per globals.css comment), so this is fine — all colors are hardcoded dark values. But if a `dark:` variant is ever used in Tailwind, it won't work without a `dark` class or `prefers-color-scheme: dark` media query.
**Fix:** Add `dark` to the html className for future-proofing: `className={cn(jetbrainsMono.variable, 'dark')}`.

#### BUG-6: Missing `apple-touch-icon` link in `<head>`
**File:** `app/layout.tsx`
**Severity:** Low
**Details:** The `metadata.icons` object includes `apple: [{ url: '/icons/apple-touch-icon-180.png', ... }]`, which Next.js should render as `<link rel="apple-touch-icon">`. This is handled by Next.js metadata API. No issue, but worth verifying.

#### UX-1: No skip-to-main link rendered
**File:** `app/layout.tsx`, `globals.css` ~lines 100-110
**Severity:** Medium (Accessibility)
**Details:** `globals.css` defines `.skip-to-main` styles, but no skip link is rendered in `layout.tsx`. The CSS exists but is never used.
**Fix:** Add a skip link at the top of `<body>`:
```tsx
<a href="#main" className="skip-to-main">Skip to main content</a>
```
And add `id="main"` to the main content area.

#### PERF-1: `ViewTransitions` wrapper adds client-side JS
**File:** `app/layout.tsx` ~line 73
**Severity:** Low
**Details:** `next-view-transitions` adds client-side JavaScript for view transition support. This is fine for the app, but it increases the initial JS bundle. If view transitions aren't critical, consider lazy-loading.
**Fix:** No action needed if view transitions are desired. Just be aware of the bundle impact.

---

### `app/page.tsx`

#### BUG-1: Redirects to `/dashboard` but onboarding and auth redirect to `/chat`
**File:** `app/page.tsx` ~line 10
**Severity:** Medium
**Details:** `redirect('/dashboard')` for authenticated users, but `onboarding/page.tsx` redirects to `/chat` and `loginAction` redirects to `/chat`. The root page is the entry point, so after login, the user goes to `/chat` (via `loginAction`'s `safeNext`), but if they visit `/` directly while authenticated, they go to `/dashboard`. This creates a confusing experience where the same authenticated user sees different pages depending on their entry point.
**Fix:** Standardize on `/chat` as the post-auth landing page (or `/dashboard` — pick one).

---

### `app/error.tsx`

#### BUG-1: Logo "H" uses `text-black` on transparent background — invisible on dark theme
**File:** `app/error.tsx` ~line 35
**Severity:** Medium (Visual Bug)
**Details:** `<span className="text-black text-2xl font-bold">H</span>` inside a span with `background: 'none'`. On the dark theme (`bg-bg-elev-1` = `#141414`), a black "H" is nearly invisible.
**Fix:** Use `text-fg` instead of `text-black`, or give the container a visible background.

#### BUG-2: `console.error` instead of Sentry capture
**File:** `app/error.tsx` ~line 26
**Severity:** Medium
**Details:** The error boundary uses `console.error('[app] uncaught render error', error)` instead of `Sentry.captureException(error)`. The `global-error.tsx` correctly uses Sentry, but this error boundary doesn't. Errors caught here won't appear in Sentry.
**Fix:** Import and use `Sentry.captureException(error)`:
```tsx
import * as Sentry from '@sentry/nextjs';
useEffect(() => { Sentry.captureException(error); }, [error]);
```

#### BUG-3: "Go to chat" link might not work if error is in the chat route
**File:** `app/error.tsx` ~line 45
**Severity:** Low
**Details:** If the error occurred in `/chat`, clicking "Go to chat" will navigate to the same broken route. The `reset()` button is the correct recovery mechanism.
**Fix:** Consider using `router.push('/')` instead, or keep "Go to chat" but add a note that `reset()` is preferred.

#### UX-1: `role="alert"` on the entire content div
**File:** `app/error.tsx` ~line 32
**Severity:** Low (Accessibility)
**Details:** `<div className="flex flex-col gap-2 text-center items-center" role="alert">` — using `role="alert"` on a container with both heading and paragraph is acceptable, but screen readers will announce everything inside as an alert. Consider using `role="alert"` only on the error message, not the heading.

---

### `app/global-error.tsx`

#### BUG-1: Missing `suppressHydrationWarning` on `<html>`
**File:** `app/global-error.tsx` ~line 16
**Severity:** Low
**Details:** The root `layout.tsx` has `suppressHydrationWarning` on `<html>`, but `global-error.tsx` renders its own `<html>` without it. This could cause hydration warnings.
**Fix:** Add `suppressHydrationWarning` to the `<html>` tag.

#### BUG-2: Missing `lang="en"` consistency — actually present
**File:** `app/global-error.tsx` ~line 16
**Severity:** No issue
**Details:** `<html lang="en">` is present. Fine.

#### BUG-3: Missing font class on `<html>`
**File:** `app/global-error.tsx` ~line 16
**Severity:** Low
**Details:** The root layout applies `className={jetbrainsMono.variable}` to `<html>`. The global error page renders its own `<html>` without the font variable. The error page uses inline `fontFamily: 'ui-monospace, ...'` which is a reasonable fallback, but it won't use JetBrains Mono.
**Fix:** This is acceptable for a fallback error page. No action needed.

#### BUG-4: `var(--color-fg)` and `var(--color-bg)` may not be defined
**File:** `app/global-error.tsx` ~lines 25, 30
**Severity:** Medium
**Details:** The global error page uses `color: 'var(--color-fg)'` and `background: 'var(--color-bg)'`. These CSS variables are defined in `globals.css` under `@theme {}`. But `global-error.tsx` replaces the entire `<html>` and `<body>`, and `globals.css` is not imported in this file. If the error occurs before CSS loads, these variables will be undefined and the page will have default browser styling (black text on white background).
**Fix:** Use hardcoded color values as fallback:
```tsx
color: '#F0F0F0',
background: '#0A0A0A',
```
Or import `globals.css` in the global error page (though this may not work if the error is a CSS loading failure).

#### BUG-5: `var(--color-brand)` used for button background but may not be defined
**File:** `app/global-error.tsx` ~line 40
**Severity:** Medium
**Details:** Same as BUG-4. `background: 'var(--color-brand)'` will be undefined if CSS hasn't loaded. The button will have no background color.
**Fix:** Use `#F56E0F` as a hardcoded fallback.

---

### `app/not-found.tsx`

#### BUG-1: Same invisible "H" logo as error.tsx
**File:** `app/not-found.tsx` ~line 22
**Severity:** Medium (Visual Bug)
**Details:** `<span className="text-black text-2xl font-bold">H</span>` with `background: 'none'` on a dark background.
**Fix:** Use `text-fg` instead of `text-black`.

#### BUG-2: `role="alert"` on 404 content
**File:** `app/not-found.tsx` ~line 25
**Severity:** Low (Accessibility)
**Details:** A 404 page is informational, not an alert. `role="alert"` will cause screen readers to urgently announce the 404 message.
**Fix:** Remove `role="alert"` or change to `role="status"`.

#### UX-1: No search or navigation options besides "Go to chat"
**File:** `app/not-found.tsx`
**Severity:** Low
**Details:** The 404 page only offers "Go to chat". No search bar, no "Go back" button, no "Go to dashboard".
**Fix:** Add a "Go back" button using `router.back()` and/or a link to the dashboard.

---

### `app/globals.css`

#### BUG-1: `--font-sans` and `--font-mono` both reference `var(--font-mono)` creating a circular dependency
**File:** `globals.css` ~lines 85-86
**Severity:** Medium
**Details:** 
```css
--font-sans: var(--font-mono), ui-monospace, ...;
--font-mono: var(--font-mono), ui-monospace, ...;
```
Both `--font-sans` and `--font-mono` reference `var(--font-mono)`. But `--font-mono` references itself (`var(--font-mono)`), creating a circular reference. The `--font-mono` CSS variable is set by Next.js's `JetBrains_Mono` font loader as `--font-mono` (the `variable` option in the font config). So the CSS `--font-mono` in `@theme` is trying to reference the Next.js-injected `--font-mono`, but it's actually referencing itself. The Tailwind theme variable `--font-mono` overrides the Next.js variable.
**Fix:** Use a different variable name for the Next.js font:
```tsx
// layout.tsx
const jetbrainsMono = JetBrains_Mono({ variable: '--font-jbmono', ... });
```
```css
/* globals.css */
--font-sans: var(--font-jbmono), ui-monospace, ...;
--font-mono: var(--font-jbmono), ui-monospace, ...;
```

#### BUG-2: `--color-bg` is `#0A0A0A` but manifest says `#000000`
**File:** `globals.css` ~line 15, `manifest.ts` ~line 20-21
**Severity:** Low
**Details:** Already noted in layout.tsx BUG-3. The manifest comment incorrectly states `--color-bg = #000000`.

#### DESIGN-1: `--color-accent` aliased to `--color-brand` but marked "Do not use"
**File:** `globals.css` ~lines 30-31
**Severity:** Code Quality
**Details:** `--color-accent` and `--color-accent-glow` are kept for backward compatibility but shouldn't be used. This is fine as a migration strategy, but there's no mechanism to warn developers when they use it.
**Fix:** Consider adding a deprecation comment or using a CSS linter to flag usage.

#### DESIGN-2: `shimmer` animation uses a linear-gradient despite "no gradients" design principle
**File:** `globals.css` ~lines 155-165
**Severity:** Low (Design Drift)
**Details:** The design system comment says "No glassmorphism, no gradients, no glow shadows", but the `.shimmer` class uses `linear-gradient(90deg, ...)`. This is for a loading skeleton effect, which is a practical exception, but it technically violates the stated design principles.
**Fix:** Document this as an accepted exception, or use a solid color animation instead.

#### BUG-3: `scroll-fab` animation uses `animation-timeline: scroll(nearest block)` — limited browser support
**File:** `globals.css` ~lines 200-210
**Severity:** Low
**Details:** `animation-timeline: scroll(nearest block)` is a CSS scroll-driven animation feature with limited browser support (Chrome 115+, not in Firefox/Safari as of early 2025). The `scroll-fab` utility will not work in unsupported browsers.
**Fix:** Add a `@supports (animation-timeline: scroll())` guard and provide a JS fallback for unsupported browsers.

---

### `app/manifest.ts`

#### BUG-1: `background_color` and `theme_color` are `#000000` but actual bg is `#0A0A0A`
**File:** `manifest.ts` ~lines 20-21
**Severity:** Low
**Details:** Already noted. The comment says "matches --color-bg = #000000" but `--color-bg` is `#0A0A0A`.
**Fix:** Change to `#0A0A0A` and fix the comment.

#### BUG-2: `start_url: '/chat'` but root page redirects to `/dashboard`
**File:** `manifest.ts` ~line 18
**Severity:** Low
**Details:** PWA `start_url` is `/chat`, but `app/page.tsx` redirects authenticated users to `/dashboard`. When the PWA launches, it goes to `/chat` directly, bypassing the root redirect. This is actually fine (going straight to chat), but inconsistent with the root page's redirect logic.
**Fix:** Standardize on `/chat` as the primary destination (change `app/page.tsx` to redirect to `/chat`).

#### BUG-3: Missing `id` field in manifest
**File:** `manifest.ts`
**Severity:** Low
**Details:** The manifest doesn't include an `id` field. The `id` is used by browsers to uniquely identify the PWA. Without it, the browser uses the `start_url` as the ID, which can cause issues if the start URL changes.
**Fix:** Add `id: '/chat'` or `id: '/'` to the manifest.

#### BUG-4: Missing `display_override` field
**File:** `manifest.ts`
**Severity:** Low
**Details:** No `display_override` field. Modern PWAs can use `display_override: ['window-controls-overlay', 'standalone']` for better desktop integration.
**Fix:** Consider adding `display_override` for enhanced PWA support.

#### BUG-5: Screenshots reference files that may not exist
**File:** `manifest.ts` ~lines 25-34
**Severity:** Low
**Details:** Screenshots reference `/screenshots/chat.png` and `/screenshots/dashboard.png`. If these files don't exist in the `public/` directory, the PWA install prompt won't show screenshots.
**Fix:** Verify these files exist, or remove the screenshots if they don't.

#### BUG-6: No `maskable` icon padding consideration
**File:** `manifest.ts` ~lines 38-40
**Severity:** Low
**Details:** The manifest includes a maskable icon (`icon-maskable-512.png`), but there's no mention of safe zone padding. Maskable icons need a safe zone (80% of the canvas) to ensure the icon isn't cropped by different device masks.
**Fix:** Verify the maskable icon was designed with the 80% safe zone, or document the design requirement.

---

### `app/debug/route.ts`

#### BUG-1: Debug route exposes environment variable prefixes in development
**File:** `app/debug/route.ts` ~lines 15-25
**Severity:** Medium (Security)
**Details:** The route exposes `DATABASE_URL_prefix` (first 20 chars) and `DATABASE_URL_length`. Even in development, this could expose sensitive information if the route is accidentally accessible. The first 20 characters of a database URL typically include `postgresql://user:pass` or similar.
**Fix:** Remove the prefix exposure, or only show whether the variable is set (boolean) without any value information.

#### BUG-2: Debug route only checks `NODE_ENV === 'production'` but doesn't check for staging/preview
**File:** `app/debug/route.ts` ~line 12
**Severity:** Low
**Details:** The route returns 404 in production but is accessible in staging, preview, or any non-production environment. Vercel preview deployments run with `NODE_ENV === 'production'` but may have different environment variables. Actually, Vercel preview deployments do set `NODE_ENV=production`, so this check would block the route in previews. But if the environment is set up differently (e.g., `NODE_ENV=development` on a staging server), the route would be accessible.
**Fix:** Also check `VERCEL_ENV !== 'production'` or use a custom env variable like `DEBUG_ENABLED`.

#### BUG-3: Dynamic import of `@hamafx/db` inside route handler
**File:** `app/debug/route.ts` ~line 28
**Severity:** Low (Performance)
**Details:** `const { getDb } = await import('@hamafx/db')` uses dynamic import inside the route handler. This is fine for a debug route that should only be loaded when accessed, but it adds latency to the response.
**Fix:** No action needed for a debug-only route.

---

### `app/share/[id]/page.tsx`

#### BUG-1: `AUTH_COOKIE_SECRET` empty string fallback allows unauthenticated access
**File:** `app/share/[id]/page.tsx` ~line 45
**Severity:** High (Security)
**Details:** `const secret = process.env.AUTH_COOKIE_SECRET ?? ''` — if `AUTH_COOKIE_SECRET` is not set, `secret` is an empty string. Then `secret ? verifyShareToken(token, secret) : null` — if secret is empty, `payload` is `null`, and the code falls through to `notFound()`. This is actually safe (it denies access when the secret isn't set). But the issue is that the page will always 404 if the secret isn't configured, making the share feature silently broken.
**Fix:** Throw a configuration error during build/startup if `AUTH_COOKIE_SECRET` is not set, rather than silently breaking the share feature.

#### BUG-2: `notFound()` called for missing/invalid token but no user-friendly error message
**File:** `app/share/[id]/page.tsx` ~line 47
**Severity:** Low (UX)
**Details:** When the token is invalid or missing, `notFound()` is called, which renders the `not-found.tsx` page with "Page not found" — a confusing message for a user who clicked a share link. The user should see "This link is invalid or has expired."
**Fix:** Render a custom error state instead of calling `notFound()`:
```tsx
if (!payload || payload.id !== id) {
  return <ShareError message="This link is invalid or has expired." />;
}
```

#### BUG-3: `getActiveSnapshot` called without error handling
**File:** `app/share/[id]/page.tsx` ~line 50
**Severity:** Low
**Details:** `const snap = await getActiveSnapshot(id)` — if this throws (DB error), the error propagates to `error.tsx`. No targeted error handling.
**Fix:** Wrap in try/catch and show a meaningful error.

#### BUG-4: `ReactMarkdown` renders user-generated content without sanitization
**File:** `app/share/[id]/page.tsx` ~line 65
**Severity:** Medium (Security — XSS)
**Details:** `<ReactMarkdown remarkPlugins={[remarkGfm]}>{snap.body}</ReactMarkdown>` — ReactMarkdown is generally safe against XSS because it renders to React elements, not raw HTML. However, if `snap.body` contains markdown with raw HTML (e.g., `<script>alert('xss')</script>`), ReactMarkdown by default does NOT render raw HTML (it escapes it). This is safe unless `rehype-raw` is added. No `rehype-raw` is used here, so this is fine. But worth noting for future modifications.
**Fix:** No action needed currently. Add a comment noting that `rehype-raw` should never be added without sanitization.

#### BUG-5: SVG price line visualization has potential NaN issue
**File:** `app/share/[id]/page.tsx` ~lines 80-95
**Severity:** Low
**Details:** The SVG visualization calculates `y` as `((parseFloat(String(line.price)) - min) / range) * 100`. If `line.price` is not a valid number, `parseFloat` returns `NaN`, and the arithmetic produces `NaN`. The `y` attribute would be `NaN%`, which is invalid SVG. The code filters `prices` for `!isNaN(p)`, but `line.price` in the `map` could still be NaN if it wasn't in the filtered `prices` array.
**Fix:** Filter `lines` to only include those with valid prices before mapping:
```tsx
{lines.filter(l => !isNaN(parseFloat(String(l.price)))).slice(0, 20).map((line, i) => {
  const y = ((parseFloat(String(line.price)) - min) / range) * 100;
  ...
})}
```

#### BUG-6: `generateMetadata` doesn't verify token — title leaks snapshot existence
**File:** `app/share/[id]/page.tsx` ~lines 25-32
**Severity:** Low (Security)
**Details:** `generateMetadata` returns `{ title: 'Shared analysis · ${id.slice(0, 8)}' }` for valid UUIDs without verifying the token. An attacker can probe whether a snapshot ID exists by checking if the page title changes from "Not Found" to "Shared analysis · xxxxxxxx". The page body calls `notFound()` for invalid tokens, but the metadata is generated separately and doesn't check the token.
**Fix:** Verify the token in `generateMetadata` as well, or always return a generic title.

#### BUG-7: `expiry` display shows `Z` suffix but `toISOString().slice(0, 16)` strips timezone info
**File:** `app/share/[id]/page.tsx` ~line 55
**Severity:** Low (UX)
**Details:** `new Date(snap.expiresAt).toISOString().slice(0, 16).replace('T', ' ')` produces a string like `2026-07-12 14:30`. Then the footer renders `expires {expiry}Z`. The `Z` suffix implies UTC, but the display format `2026-07-12 14:30Z` is non-standard and confusing. Users won't know if this is their local time or UTC.
**Fix:** Use `toLocaleString()` or clearly label as UTC: `expires {expiry} UTC`.

#### BUG-8: `snap.overlay.markers` referenced in count but markers never rendered
**File:** `app/share/[id]/page.tsx` ~line 78
**Severity:** Low
**Details:** `{snap.overlay.markers.length}m / {snap.overlay.priceLines.length}l` shows marker count, but markers are never rendered in the UI. Only price lines are shown.
**Fix:** Either render markers or remove the count from the display.

#### PERF-1: `ReactMarkdown` and `remarkGfm` are heavy dependencies loaded for every share page
**File:** `app/share/[id]/page.tsx` ~lines 15-16
**Severity:** Low
**Details:** `react-markdown` and `remark-gfm` add to the bundle size. Since this is a public share page, it should be as lightweight as possible for fast loading.
**Fix:** Consider lazy-loading ReactMarkdown, or using a lighter markdown renderer for the share page.

---

### `app/share/[id]/opengraph-image.tsx`

#### BUG-1: `runtime = 'edge'` but parent page uses `runtime = 'nodejs'`
**File:** `app/share/[id]/opengraph-image.tsx` ~line 3, `page.tsx` ~line 17
**Severity:** Low
**Details:** The OG image uses `runtime = 'edge'` while the share page uses `runtime = 'nodejs'`. This is fine — Next.js allows different runtimes for different routes. But if `verifyShareToken` or other Node.js-only APIs are ever needed in the OG image, they won't work on edge.
**Fix:** No action needed currently. Be aware of runtime constraints if the OG image needs to access the database or use Node.js APIs.

#### BUG-2: OG image doesn't fetch actual snapshot data
**File:** `app/share/[id]/opengraph-image.tsx` ~line 10
**Severity:** Medium
**Details:** The OG image only shows `Shared analysis · {id.slice(0, 8)}` — it doesn't fetch the actual snapshot title or symbol. This means the OG preview on social media is generic and doesn't show what the analysis is about.
**Fix:** Fetch the snapshot data and display the title:
```tsx
export default async function OGImage({ params }) {
  const { id } = await params;
  const snap = await getActiveSnapshot(id);
  // Use snap.title in the image
}
```
Note: This requires the token to be passed, which isn't available in `params`. The OG image is generated without the `?t=` query param. Consider making the OG image public (without token) or using a different verification mechanism for OG images.

#### BUG-3: Uses `linear-gradient` for background despite "no gradients" design principle
**File:** `app/share/[id]/opengraph-image.tsx` ~line 18
**Severity:** Low (Design Drift)
**Details:** `background: 'linear-gradient(135deg, #0A0A0A 0%, #141414 100%)'` — the design system says "no gradients", but the OG image uses one. This is for an external-facing social media preview, so it's a minor exception.
**Fix:** Use a solid `#0A0A0A` background, or document this as an accepted exception.

---

## CROSS-CUTTING ISSUES

### 1. Inconsistent Post-Login Redirect Target
**Files:** `actions.ts` (loginAction → `/chat`), `app/page.tsx` (→ `/dashboard`), `onboarding/page.tsx` (→ `/chat`), `manifest.ts` (start_url → `/chat`)
**Severity:** Medium
**Fix:** Standardize on `/chat` everywhere. Update `app/page.tsx` to redirect to `/chat`.

### 2. Password Visibility Toggle Missing on All Auth Forms
**Files:** `login/page.tsx`, `register/page.tsx`, `reset-password/reset-password-form.tsx`
**Severity:** UX
**Fix:** Add show/hide password toggle to all password fields, consistent with the onboarding wizard's API key field pattern.

### 3. Password Strength Indicator Duplicated
**Files:** `register/page.tsx`, `reset-password/reset-password-form.tsx`
**Severity:** DRY violation
**Fix:** Extract to a shared `<PasswordStrengthIndicator>` component.

### 4. Redundant Layout Files
**Files:** `login/layout.tsx`, `forgot-password/layout.tsx`, `reset-password/layout.tsx`
**Severity:** Code Quality
**Fix:** Delete all three — the parent `(auth)/layout.tsx` handles everything.

### 5. No Auth Guard on Auth Layout
**File:** `(auth)/layout.tsx`
**Severity:** UX
**Fix:** Add auth check to redirect authenticated users away from auth pages.

### 6. `tradingStyle` Not Persisted Server-Side
**Files:** `wizard.tsx`, `onboarding/actions.ts`
**Severity:** High
**Fix:** Include `tradingStyle` in the onboarding payload and save to database.

### 7. Sentry Not Used in `error.tsx`
**File:** `app/error.tsx`
**Severity:** Medium
**Fix:** Use `Sentry.captureException(error)` instead of `console.error`.

### 8. CSS Variable Circular Reference
**File:** `globals.css`
**Severity:** Medium
**Fix:** Rename the Next.js font variable to avoid `--font-mono` self-reference.

### 9. Invisible "H" Logo on Dark Backgrounds
**Files:** `error.tsx`, `not-found.tsx`
**Severity:** Medium (Visual)
**Fix:** Change `text-black` to `text-fg`.

### 10. Global Error Page CSS Variables May Not Be Available
**File:** `global-error.tsx`
**Severity:** Medium
**Fix:** Use hardcoded color values as fallback.



---

## B. Chat System Analysis

# HamaFX-Ai Chat System — Deep Analysis Report

## Overview
Analyzed 40+ files across chat pages, components, subcomponents, and tool-part renderers. The chat system is a full-screen streaming AI chat with multi-agent committee support, 30+ bespoke tool renderers, virtualized message lists, and a premium composer with voice/image input.

---

## 1. BUGS

### 1.1 CRITICAL: `share-snapshot.tsx` — `formatExpiry` uses `Date.now()` in a server-rendered component path
**File:** `parts/share-snapshot.tsx:88-96`
**Issue:** `formatExpiry(ms)` calls `Date.now()` at render time. While the component is `'use client'`, if it ever gets server-rendered (SSR) or statically generated, the expiry text will differ between server and client, causing a hydration mismatch. Even in client-only rendering, the expiry text never updates after initial render — it shows "expires in 5m" forever even after 5 minutes pass.
**Fix:** Use a `useEffect` with `setInterval` to re-render every 30s, or compute the expiry string in a `useMemo` with a ticking state:
```tsx
const [, setTick] = useState(0);
useEffect(() => {
  const id = setInterval(() => setTick(t => t + 1), 30_000);
  return () => clearInterval(id);
}, []);
```

### 1.2 CRITICAL: `chat-screen.tsx` — Multi-agent SSE error handling swallows parse errors silently
**File:** `chat-screen.tsx` (spillover) — `sendMultiAgentMessage` function
**Issue:** In the SSE parsing loop, the `catch` block around `JSON.parse` has the comment `/* ignore parse errors for non-JSON lines */`. However, this catch also swallows the `throw new Error(parsed.error)` on the `parsed.type === 'error'` line — if `parsed.error` is set but `JSON.parse` of the *next* line fails, the error from the previous iteration is lost. More importantly, the `throw` inside the `try` will be caught by the same `catch` that's meant for parse errors, meaning **server-sent error events are silently swallowed**.
**Fix:** Separate the JSON parse from the error handling:
```tsx
let parsed;
try {
  parsed = JSON.parse(data);
} catch {
  continue; // skip non-JSON lines
}
if (parsed.type === 'error') {
  throw new Error(parsed.error); // now outside the try/catch
}
```

### 1.3 HIGH: `chat-screen.tsx` — `handleRegenerate` for multi-agent mode accesses `.content` which doesn't exist on UIMessage
**File:** `chat-screen.tsx` (spillover) — `handleRegenerate` function
**Issue:** The code does:
```tsx
(lastUser as unknown as { content?: string }).content
```
`UIMessage` in AI SDK v5 does not have a `content` property — it uses `parts`. The fallback `||` chain does eventually extract text from parts, but the `.content` access is dead code that could mask a future schema change. If the parts extraction also fails, it sends an empty string `''` as the regenerated prompt, which would produce an empty user message.
**Fix:** Remove the `.content` access entirely. Only use the parts extraction. Add a guard: `if (!text) return;` before sending.

### 1.4 HIGH: `chat-screen.tsx` — Race condition in multi-agent `setMessages` during streaming
**File:** `chat-screen.tsx` (spillover) — `sendMultiAgentMessage`
**Issue:** The function adds `userMsg` and `assistantMsg` to messages via `setMessages((prev) => [...prev, userMsg, assistantMsg])`, then sends `messagesRef.current` (which may not yet reflect the `setMessages` call since React batches state updates) in the fetch body: `messages: [...messagesRef.current, userMsg]`. This means the fetch body might include stale messages without the assistant placeholder, or duplicate the user message if `messagesRef` already has it.
**Fix:** Build the message array locally before calling `setMessages`:
```tsx
const newMessages = [...messagesRef.current, userMsg];
setMessages([...newMessages, assistantMsg]);
// use newMessages in the fetch body
```

### 1.5 HIGH: `message-list.tsx` — Virtualizer `estimateSize` accesses `msg.parts` without null check
**File:** `message-list.tsx:48-57`
**Issue:** The `estimateSize` callback does `msg.parts?.some(...)` which is safe, but then accesses `p.text.length` and `/|.*|/.test(p.text)` — if `p.text` is undefined (which can happen during streaming when parts are partially formed), this will throw.
**Fix:** Add a guard: `p.type === 'text' && typeof p.text === 'string' && p.text.length > 500`

### 1.6 MEDIUM: `chat-screen.tsx` — `bg-black` hardcoded instead of using design token
**File:** `chat-screen.tsx` (spillover) — root div className
**Issue:** The root container uses `bg-black` instead of `bg-bg` or a semantic token. This breaks dark/light theme consistency — in a light theme, the chat background would still be black.
**Fix:** Replace `bg-black` with `bg-bg` (or `bg-background` depending on the token system).

### 1.7 MEDIUM: `plan.tsx` — `aria-controls="plan-content"` is a hardcoded string, not unique
**File:** `parts/plan.tsx:60, 77`
**Issue:** The `aria-controls="plan-content"` references a hardcoded ID `plan-content`. If multiple plan parts are rendered simultaneously (e.g., in a multi-step conversation), they'll all share the same ID, which is invalid HTML and breaks screen reader navigation.
**Fix:** Use `useId()` to generate a unique ID:
```tsx
const contentId = useId();
// ...
aria-controls={contentId}
// ...
<m.div id={contentId} ...>
```

### 1.8 MEDIUM: `citation-warning.tsx` — Same hardcoded ID issue
**File:** `parts/citation-warning.tsx:57, 72`
**Issue:** `aria-controls="citation-warning-content"` and `id="citation-warning-content"` are hardcoded strings. Multiple citation warnings in the same thread will collide.
**Fix:** Same as 1.7 — use `useId()`.

### 1.9 MEDIUM: `get-correlation.tsx` — `uniqueSymbols` fallback mutates with `.push()` on a `const` array
**File:** `parts/get-correlation.tsx:42-44`
**Issue:** When `uniqueSymbols.length === 0`, the code does `uniqueSymbols.push('XAUUSD', 'EURUSD', 'GBPUSD')`. While `const` arrays are mutable in JS, this is a code smell — the fallback symbols are arbitrary and may not match the actual matrix data. If the matrix is genuinely empty, showing fake symbols is misleading.
**Fix:** Show an empty state message instead of fake symbols:
```tsx
if (uniqueSymbols.length === 0) {
  return <div className="...">No correlation data available.</div>;
}
```

### 1.10 MEDIUM: `get-portfolio-snapshot.tsx` — Uses array index as React key for positions
**File:** `parts/get-portfolio-snapshot.tsx:103`
**Issue:** `key={`position-${i}`}` uses the array index. If positions are reordered or removed during streaming, React may reuse the wrong DOM nodes, causing visual glitches.
**Fix:** Use `pos.symbol` or `pos.id` (if available) as the key.

### 1.11 MEDIUM: `get-social-sentiment.tsx` — Same index-as-key issue
**File:** `parts/get-social-sentiment.tsx:96`
**Issue:** `key={i}` for source list items.
**Fix:** Use `src.source` as the key.

### 1.12 LOW: `fallback.tsx` — Logic error in reason lookup
**File:** `parts/fallback.tsx:38`
**Issue:** `const reason = part.reason && REASON_LABEL[part.reason] ? part.reason : 'unknown';` — this checks if `REASON_LABEL[part.reason]` exists, but then on line 39: `const message = part.message ?? REASON_LABEL[reason] ?? 'Override unavailable';` — if `reason` was set to `'unknown'`, `REASON_LABEL['unknown']` is `'Override provider returned an error'`, which is correct. But if `part.reason` is a valid key like `'auth'`, the condition passes and `reason` stays `'auth'`, which is correct. The logic works but is convoluted and hard to follow.
**Fix:** Simplify:
```tsx
const reason = (part.reason && REASON_LABEL[part.reason]) ? part.reason : 'unknown';
```

### 1.13 LOW: `get-cot.tsx` — Dead code: `{i === 0 ? null : null}`
**File:** `parts/get-cot.tsx:83`
**Issue:** The expression `{i === 0 ? null : null}` always evaluates to `null` regardless of `i`. This is dead code that serves no purpose.
**Fix:** Remove the line entirely.

---

## 2. UX ISSUES

### 2.1 No keyboard shortcut for sending messages (Enter to send)
**File:** `composer.tsx` (spillover)
**Issue:** The comment mentions "Enter to send · Shift+Enter for new line" as a keyboard hint, but the actual keyboard handling is in the `onKeyDown` handler. The hint text appears on focus but the actual behavior needs verification — if the textarea is a standard `<textarea>`, Enter inserts a newline by default. The code needs an explicit `onKeyDown` handler that calls `e.preventDefault()` and submits on Enter (without Shift).
**Fix:** Ensure the `onKeyDown` handler is present and correctly handles Enter/Shift+Enter.

### 2.2 No "scroll to bottom" indicator showing unread message count
**File:** `chat-screen.tsx` (spillover) — scroll FAB
**Issue:** The scroll-to-bottom FAB shows "Latest" but doesn't indicate how many new messages the user has missed while scrolled up. This is a common UX pattern in chat apps.
**Fix:** Track the number of messages received while the user is scrolled up and display a badge on the FAB.

### 2.3 `thread-summary-header.tsx` — No way to re-summarize after dismissing
**File:** `_components/thread-summary-header.tsx`
**Issue:** When the user clicks the X dismiss button, `onDismiss` is called which sets `summary` to `null` in `chat-screen.tsx`. But there's no way to re-fetch the summary — the `useEffect` that fetches it checks `!summary`, so it would re-fetch, but only if `messages.length > 20` still holds. This actually works, but the user has no explicit "show summary" toggle.
**Fix:** Consider adding a "Show summary" button in the top bar that re-fetches the summary.

### 2.4 `message-list.tsx` — Typing indicator shows "Thinking…" but no animated dots
**File:** `message-list.tsx:73-78`
**Issue:** The typing indicator is a single pulsing bar + "Thinking…" text. Modern chat UIs use animated dots (three dots that bounce sequentially). The current implementation is minimal but functional.
**Fix:** Consider replacing with three animated dots for a more polished feel:
```tsx
<div className="flex gap-1">
  {[0, 1, 2].map(i => (
    <span key={i} className="size-1.5 rounded-full bg-fg-muted animate-bounce"
      style={{ animationDelay: `${i * 150}ms` }} />
  ))}
</div>
```

### 2.5 No message search within a thread
**Issue:** There's no way to search for specific text within a long conversation thread. The `chat-top-bar.tsx` has an `IconSearch` import but it's used for thread list search, not in-thread message search.
**Fix:** Add a search bar that filters/highlights messages within the current thread.

### 2.6 No message timestamps on individual messages
**File:** `message.tsx` (spillover)
**Issue:** The `MessageFooter` component shows timestamps only for assistant messages with metadata. User messages don't display timestamps at all. In a long conversation, it's impossible to tell when a user sent a particular message.
**Fix:** Show a subtle timestamp below each user message bubble.

### 2.7 `composer.tsx` — No paste-image support detection feedback
**File:** `composer.tsx` (spillover)
**Issue:** The composer supports image uploads via a button, but there's no indication whether paste-to-upload is supported. If a user pastes an image and nothing happens, they'll be confused.
**Fix:** Add a `paste` event handler on the textarea that detects image content and either auto-attaches or shows a toast: "Paste an image using the image button."

### 2.8 `quick-prompts.tsx` — Prompts don't adapt to user's trading history
**File:** `quick-prompts.tsx` (spillover)
**Issue:** Quick prompts are session-aware and symbol-aware, but they don't consider the user's recent trading activity. A user who frequently trades XAUUSD would benefit from personalized prompts.
**Fix:** This is a feature enhancement — consider adding a "recent" category based on the user's journal entries.

---

## 3. PERFORMANCE

### 3.1 HIGH: `message-list.tsx` — Virtualizer `estimateSize` is called on every render for all items
**File:** `message-list.tsx:44-57`
**Issue:** The `estimateSize` callback accesses `msg.parts?.some(...)` with regex tests (`/|.*|/.test(p.text)`) on every virtualizer measurement cycle. For large threads (200+ messages), this regex test runs on every message during every scroll event. The regex is also incorrect — `/|.*|/` is not a valid table detection regex; it should be `/\\|.*\\|/` (escaped pipes).
**Fix:** 
1. Fix the regex: `/\\|.*\\|/` instead of `/|.*|/`
2. Memoize the size estimates per message ID using a `Map` cache
3. Consider pre-computing sizes when messages change rather than on every scroll

### 3.2 HIGH: `chat-screen.tsx` — `auto-scroll` effect depends on entire `messages` array
**File:** `chat-screen.tsx` (spillover) — auto-scroll useEffect
**Issue:** The auto-scroll effect has `[messages, isStreaming]` as dependencies. Since `messages` is a new array reference on every stream token (the AI SDK updates messages immutably), this effect fires on every single token tick. Each fire calls `requestAnimationFrame` and potentially `el.scrollTo()`. During fast streaming, this causes excessive scroll calls.
**Fix:** Depend on `messages.length` instead of `messages`:
```tsx
}, [messages.length, isStreaming]);
```

### 3.3 MEDIUM: `chat-screen.tsx` — `handleRegenerate` has `messages` in dependency array causing re-creation
**File:** `chat-screen.tsx` (spillover)
**Issue:** `handleRegenerate` is wrapped in `useCallback` with `[regenerate, analysisMode, messages, setMessages, sendMultiAgentMessage]` as deps. Since `messages` changes on every token, this callback is recreated on every token, which means any child components receiving it as a prop will re-render.
**Fix:** Use `messagesRef.current` inside the callback instead of `messages` in the dependency array:
```tsx
}, [regenerate, analysisMode, setMessages, sendMultiAgentMessage]);
```

### 3.4 MEDIUM: `chat-screen.tsx` — `handleEdit` has same issue with `messages` in deps
**File:** `chat-screen.tsx` (spillover)
**Issue:** Same as 3.3 — `handleEdit` depends on `messages` causing unnecessary re-creation.
**Fix:** Use `messagesRef.current` inside the callback.

### 3.5 MEDIUM: `text.tsx` — `ReactMarkdown` re-parses on every render even when text hasn't changed
**File:** `parts/text.tsx` (spillover)
**Issue:** The `TextPart` component renders `ReactMarkdown` with `remarkGfm` on every render. While the parent `MemoizedTextPart` wraps it in `memo`, any parent re-render that passes a new `text` reference (e.g., during streaming when the text grows) will trigger a full markdown re-parse. For long assistant messages with complex markdown (tables, code blocks), this can be expensive.
**Fix:** Consider debouncing the markdown rendering during streaming, or only switching to full markdown when streaming completes (which the code already does — the streaming path uses plain text). The issue is only for the final render, which is acceptable.

### 3.6 LOW: `chat-top-bar.tsx` — Thread list search is not debounced
**File:** `chat-top-bar.tsx` (spillover)
**Issue:** The thread list search filters threads on every keystroke. For users with many threads, this could cause lag.
**Fix:** Add a `useDeferredValue` or debounce the search input.

### 3.7 LOW: `get-correlation.tsx` — `HeatStrip` renders one div per matrix cell
**File:** `parts/get-correlation.tsx:107-117`
**Issue:** For a 6-symbol correlation matrix, there are 15 cells, which is fine. But if the matrix grows, each cell creates a separate `<span>` element with a key. This is not a current issue but worth noting for scalability.

---

## 4. DESIGN SYSTEM DRIFT

### 4.1 `chat-screen.tsx` — `bg-black` instead of semantic token
**File:** `chat-screen.tsx` (spillover) — root div
**Issue:** Uses `bg-black` instead of `bg-bg` or `bg-background`. This is the most significant design system drift — the entire chat surface bypasses the theme system.
**Fix:** Replace with `bg-bg` (or the project's equivalent semantic token).

### 4.2 `run-system-action.tsx` — Uses `text-info` which may not exist in the token system
**File:** `parts/run-system-action.tsx:55`
**Issue:** The console log coloring uses `text-info` class: `if (line.startsWith('[resonance-sync]')) textClass = 'text-info';`. The rest of the chat system uses `text-fg`, `text-fg-muted`, `text-fg-subtle`, `text-bull`, `text-bear`, `text-warn`, `text-danger`, `text-success`. `text-info` appears to be a non-standard token.
**Fix:** Verify `text-info` exists in the design system. If not, replace with `text-fg` or `text-accent`.

### 4.3 `get-system-diagnostics.tsx` — Uses `round` instead of `rounded-sm`
**File:** `parts/get-system-diagnostics.tsx` (spillover)
**Issue:** The root div className includes `round` — likely a typo for `rounded-sm`. This would result in no border radius being applied.
**Fix:** Change `round` to `rounded-sm`.

### 4.4 Inconsistent border-radius: `rounded-sm` vs `rounded`
**Multiple files**
**Issue:** Most components use `rounded-sm` consistently, but some files (particularly `get-portfolio-snapshot.tsx`, `get-social-sentiment.tsx`) use `rounded-sm` while `run-system-action.tsx` uses `rounded-sm` in some places and the typo `round` in others. The design system should enforce one radius.
**Fix:** Audit all `rounded*` classes and ensure consistency.

### 4.5 `get-portfolio-snapshot.tsx` — Uses `space-y-4` instead of `gap-*`
**File:** `parts/get-portfolio-snapshot.tsx:60`
**Issue:** Uses `space-y-4` while the rest of the chat system uses `flex flex-col gap-*` for vertical spacing. `space-y-*` doesn't work correctly with conditional rendering (it adds margins to all children, even hidden ones).
**Fix:** Replace `space-y-4` with `flex flex-col gap-4`.

### 4.6 `get-social-sentiment.tsx` — Same `space-y-*` issue
**File:** `parts/get-social-sentiment.tsx:59`
**Issue:** Uses `space-y-4` and `space-y-2` instead of `gap-*`.
**Fix:** Replace with `flex flex-col gap-*`.

### 4.7 Inconsistent shadow usage
**File:** `parts/run-system-action.tsx:34`
**Issue:** Uses `shadow-lg` and `shadow-md` in the skeleton — no other chat component uses shadows. This creates visual inconsistency.
**Fix:** Remove shadow classes or add them consistently across all tool cards.

### 4.8 `get-portfolio-snapshot.tsx` — Uses `text-center` for empty state
**File:** `parts/get-portfolio-snapshot.tsx:54`
**Issue:** The empty state uses `text-center` while all other tool parts use left-aligned text for empty states (e.g., "No open trades in the journal." in `compute-position-health.tsx`).
**Fix:** Remove `text-center` for consistency.

---

## 5. MISSING FEATURES / INCOMPLETE IMPLEMENTATIONS

### 5.1 `chat-screen.tsx` — Multi-agent mode doesn't support image attachments
**File:** `chat-screen.tsx` (spillover) — Composer onSubmit
**Issue:** When `analysisMode !== 'single'` and images are attached, the code shows a toast saying "Image analysis runs in single-agent mode. Switching to single-agent for this turn." but then **doesn't actually switch the mode** — it falls through to the `sendMessage` call with files, but `analysisMode` is still not `'single'`, so the next turn will be multi-agent again. The toast is misleading.
**Fix:** Either actually switch `analysisMode` to `'single'` for this turn (and switch back after), or don't show the toast and just send in single mode silently.

### 5.2 `chat-screen.tsx` — No offline/reconnection handling
**File:** `chat-screen.tsx` (spillover)
**Issue:** There's no handling for network disconnection during streaming. If the connection drops mid-stream, the user sees the error banner but there's no automatic retry or reconnection logic.
**Fix:** Add a `navigator.onLine` check and auto-retry when connectivity returns.

### 5.3 `chat-screen.tsx` — No draft message persistence
**File:** `chat-screen.tsx` (spillover)
**Issue:** If the user types a message but doesn't send it, then navigates away, the draft is lost. There's no localStorage persistence of unsent drafts.
**Fix:** Save the composer text to localStorage keyed by threadId and restore on mount.

### 5.4 No message export/download for a thread
**File:** `chat-top-bar.tsx` (spillover)
**Issue:** The top bar imports `IconFileDownload` suggesting export functionality was planned, but it's only used in the thread list drawer for individual thread export. There's no "export current thread" action in the main top bar.
**Fix:** Add an "Export" option in the more menu (`IconDotsCircleHorizontal`) that downloads the current thread as Markdown or JSON.

### 5.5 `message-footer.tsx` — Citations don't show source quality/relevance
**File:** `_components/message-footer.tsx`
**Issue:** The citations section shows URLs and titles but no relevance score or date. For a trading AI, knowing the recency of a source is critical.
**Fix:** Add the publication date next to each citation source.

### 5.6 `regen-model-picker.tsx` — No search/filter for models
**File:** `_components/regen-model-picker.tsx` (spillover)
**Issue:** The model picker lists all available models without a search field. Users with many providers will have to scroll through a long list.
**Fix:** Add a search input at the top of the picker.

### 5.7 No voice message playback
**File:** `composer.tsx` (spillover)
**Issue:** The composer has voice input (mic button using `useVoiceInput`), but there's no way to play back voice messages. The voice input is for speech-to-text only, not for sending audio messages.
**Fix:** This may be by design (text-only chat), but if audio messages are desired, add playback support.

---

## 6. CODE QUALITY

### 6.1 `chat-top-bar.tsx` — Imports `NavTrigger` from `@/components/layout/nav-trigger` not from `./nav-trigger`
**File:** `chat-top-bar.tsx` (spillover) — line 28
**Issue:** The chat-specific `nav-trigger.tsx` exists at `components/chat/nav-trigger.tsx`, but `chat-top-bar.tsx` imports from `@/components/layout/nav-trigger` — a different file. This means the chat-specific `NavTrigger` component is potentially unused dead code, or there are two different `NavTrigger` components.
**Fix:** Verify which `NavTrigger` is actually intended. If the layout one is correct, the chat-specific one is dead code and should be removed. If the chat one is correct, fix the import path.

### 6.2 `get-cot.tsx` — Dead code: `{i === 0 ? null : null}`
**File:** `parts/get-cot.tsx:83`
**Issue:** Already noted in 1.13 — this is both a bug and dead code.
**Fix:** Remove.

### 6.3 `get-candles.tsx` — Unnecessary `_pipSizeAgrees` compile-time check
**File:** `parts/get-candles.tsx` (spillover) — end of file
**Issue:** The code includes:
```tsx
const _pipSizeAgrees: typeof sharedPipSize = pipSize;
void _pipSizeAgrees;
```
This is a compile-time type check that adds dead code to the bundle. While the comment explains it's a "compile-time guarantee," it's unnecessary complexity — the local `pipSize` function just delegates to `sharedPipSize` anyway.
**Fix:** Remove the local `pipSize` function entirely and use `sharedPipSize` directly.

### 6.4 `chat-screen.tsx` — `console.error` in error boundary but no error reporting service
**File:** `error.tsx:28`
**Issue:** The error boundary logs to `console.error` but doesn't report to any error tracking service (Sentry, etc.).
**Fix:** Add error reporting integration if available.

### 6.5 `registry.tsx` — `console.warn` on schema parse failure
**File:** `parts/registry.tsx` (spillover) — `renderBespoke` function
**Issue:** When a tool schema fails to parse, the code does `console.warn(...)` and returns `null`, rendering nothing. The user sees a blank space where the tool result should be. This is a silent failure from the user's perspective.
**Fix:** Render the fallback `ToolCard` instead of `null` when schema parsing fails, so the user at least sees raw data.

### 6.6 Duplicated `formatStamp` function
**Files:** `parts/get-news.tsx:118-126`, `parts/search-knowledge.tsx:93-101`
**Issue:** Both files contain identical `formatStamp` functions that format ISO strings as `YYYY-MM-DD HH:mmZ`. This is duplicated code.
**Fix:** Extract to a shared utility in `@/lib/format` or `@hamafx/shared`.

### 6.7 Duplicated `SkeletonCard` / `ErrorCard` patterns
**Files:** Nearly all tool part files
**Issue:** Every tool part file defines its own `SkeletonCard` and `ErrorCard` functions with nearly identical markup. This is massive code duplication.
**Fix:** Create shared `ToolSkeleton` and `ToolError` components in the parts directory and import them.

### 6.8 `chat-screen.tsx` — `confirmEl` indentation inconsistency
**File:** `chat-screen.tsx` (spillover)
**Issue:** The line `const [confirmEl, confirm] = useConfirm();` has inconsistent indentation — it's indented with 4 spaces while surrounding code uses 2 spaces. This suggests a manual edit without formatting.
**Fix:** Run prettier/format on the file.

### 6.9 `get-calendar.tsx` — Uses `<a>` instead of `<Link>` for navigation
**File:** `parts/get-calendar.tsx:78`
**Issue:** `CalendarRow` uses `<a href={...}>` instead of `next-view-transitions` `<Link>`. Other tool parts (get-news, search-knowledge, log-journal) use `<Link>` from `next-view-transitions`. This means calendar row clicks will do a full page navigation instead of a client-side transition.
**Fix:** Replace `<a>` with `<Link>` from `next-view-transitions`.

### 6.10 `get-portfolio-snapshot.tsx` and `get-social-sentiment.tsx` — Don't use `ToolPartProps` from registry
**Files:** `parts/get-portfolio-snapshot.tsx`, `parts/get-social-sentiment.tsx`, `parts/get-price.tsx`, `parts/get-news.tsx`, `parts/get-calendar.tsx`, `parts/get-market-structure.tsx`, `parts/log-journal.tsx`, `parts/set-alert.tsx`
**Issue:** These files define their own prop interfaces (`GetPricePartProps`, `GetNewsPartProps`, etc.) instead of using `ToolPartProps<'tool_name'>` from the registry. This creates inconsistency and means the registry's type safety doesn't fully apply to these components.
**Fix:** Refactor to use `ToolPartProps<'tool_name'>` for consistency.

---

## 7. RESPONSIVE DESIGN ISSUES

### 7.1 `chat-screen.tsx` — XL breakpoint layout may break on medium screens
**File:** `chat-screen.tsx` (spillover) — root div className
**Issue:** The root div uses `xl:grid xl:grid-cols-12` but the scroll area uses `xl:col-span-6`. This means on screens between `lg` and `xl`, the layout is `flex flex-col` (single column), but at `xl` it suddenly switches to a 12-column grid with the scroll area taking 6 columns. The remaining 6 columns are unaccounted for — there's no sidebar or panel filling them. This creates a half-empty screen at XL widths.
**Fix:** Either add a right panel (thread list, insights, etc.) to fill the remaining 6 columns, or use `xl:col-span-12` to make the scroll area full-width.

### 7.2 `get-correlation.tsx` — Correlation table may overflow on narrow screens
**File:** `parts/get-correlation.tsx:57`
**Issue:** The correlation table uses `overflow-x-auto scrollbar-hide` which hides the scrollbar. On mobile, users won't know the table is scrollable. The `scroll-shadows-x` class helps but may not be sufficient.
**Fix:** Add a visual indicator (e.g., a faded edge) or a "scroll horizontally" hint on mobile.

### 7.3 `thread-summary-header.tsx` — Insights list may overflow on narrow screens
**File:** `_components/thread-summary-header.tsx:56-70`
**Issue:** The insight rows use `flex items-baseline gap-2` with a symbol chip at the end. On very narrow screens, long insight text + symbol chip may overflow.
**Fix:** Add `min-w-0` and `truncate` to the text span, or allow wrapping.

### 7.4 `chat-top-bar.tsx` — Title truncation may cut off important info
**File:** `chat-top-bar.tsx` (spillover)
**Issue:** The thread title in the top bar is truncated with `truncate`, but on mobile screens with a pinned symbol chip, the available space is very limited. Long titles like "XAUUSD technical analysis with intermarket correlation" would be cut to just "XAUUSD…".
**Fix:** Consider showing only the first 3-4 words on mobile, or make the title scrollable.

### 7.5 `replay-setup.tsx` — Trade table with 5 columns may overflow on mobile
**File:** `parts/replay-setup.tsx:55-70`
**Issue:** The trade table uses `grid grid-cols-5` with fixed columns. On a 400px screen, each column gets ~80px, which is tight for entry/exit prices (5 decimal places).
**Fix:** Use `overflow-x-auto` wrapper or reduce to 3 columns on mobile (Side, R, Reason).

---

## 8. STATE MANAGEMENT ISSUES

### 8.1 `chat-screen.tsx` — `titleFetchedRef` grows unboundedly
**File:** `chat-screen.tsx` (spillover)
**Issue:** `titleFetchedRef` is `useRef<Record<string, boolean>>({})` and keys are added for each thread the user visits. In a long session with many thread switches, this object grows without cleanup.
**Fix:** This is a minor issue since it's just booleans, but for cleanliness, consider using a `Set` instead of an object, or clear entries when threads are deleted.

### 8.2 `chat-screen.tsx` — `modelOverrideRef` not cleared on error
**File:** `chat-screen.tsx` (spillover)
**Issue:** The effect that clears `modelOverrideRef.current` only runs when `status === 'ready' && !error`. If the stream errors, the override is never cleared, meaning the next regenerate will use the stale override.
**Fix:** Clear the override in both success and error cases:
```tsx
useEffect(() => {
  if (status === 'ready') {
    modelOverrideRef.current = null;
  }
}, [status]);
```

### 8.3 `chat-screen.tsx` — `agentProgress` state not cleared on unmount
**File:** `chat-screen.tsx` (spillover)
**Issue:** If the component unmounts during multi-agent streaming (e.g., user navigates away), `agentProgress` state is orphaned. The `AbortController` in `multiAgentFetchRef` is not aborted on unmount.
**Fix:** Add a cleanup effect:
```tsx
useEffect(() => {
  return () => {
    multiAgentFetchRef.current?.abort();
  };
}, []);
```

### 8.4 `chat-screen.tsx` — `summary` state persists across thread switches
**File:** `chat-screen.tsx` (spillover)
**Issue:** When the user switches threads (navigates to a different `/chat/[threadId]`), the `summary` state from the previous thread persists because `ChatScreen` doesn't reset state on `threadId` change. The component is re-mounted by Next.js (different route), but if it were reused (e.g., with shallow routing), the stale summary would show.
**Fix:** Reset `summary` when `threadId` changes:
```tsx
useEffect(() => { setSummary(null); }, [threadId]);
```

### 8.5 `regen-model-picker.tsx` — Module-level cache `moduleCache` is shared across all instances
**File:** `_components/regen-model-picker.tsx` (spillover)
**Issue:** `let moduleCache: CacheData | null = null;` is a module-level variable shared across all instances of `RegenModelPicker`. If two pickers are mounted simultaneously (unlikely but possible), they'll share the same cache. More importantly, the cache is never invalidated when the user changes their API keys.
**Fix:** Move the cache to a React context or use SWR/React Query for data fetching with proper cache invalidation.

### 8.6 `chat-screen.tsx` — `dismissedError` not reset on new thread
**File:** `chat-screen.tsx` (spillover)
**Issue:** Similar to 8.4 — `dismissedError` persists across thread switches if the component is reused.
**Fix:** Reset in the same `useEffect` as 8.4.

---

## 9. ACCESSIBILITY ISSUES

### 9.1 `message-list.tsx` — Virtualized list lacks `aria-rowcount` / `aria-rowindex`
**File:** `message-list.tsx:40-100`
**Issue:** The virtualized message list doesn't expose ARIA row count/index attributes. Screen readers can't announce "Message 5 of 20" context.
**Fix:** Add `role="list"` to the container and `aria-setsize`/`aria-posinset` to each message row.

### 9.2 `chat-screen.tsx` — Scroll FAB not keyboard accessible
**File:** `chat-screen.tsx` (spillover) — scroll FAB
**Issue:** The scroll-to-bottom FAB is a `<m.button>` which should be keyboard accessible, but it appears/disappears with `AnimatePresence`. When it's not visible, it's removed from the DOM, so keyboard users can't tab to it. There's no alternative keyboard shortcut to scroll to bottom.
**Fix:** Add a keyboard shortcut (e.g., `Cmd+Down` or `End` key) to scroll to bottom.

### 9.3 `agent-deliberation.tsx` — SVG visualizations lack alt text
**File:** `parts/agent-deliberation.tsx` (spillover)
**Issue:** The agent ring and fusion node visualizations are SVG-based but don't have `role="img"` or `aria-label` attributes. Screen readers will skip them entirely.
**Fix:** Add `role="img"` and `aria-label` to the SVG containers describing the current state.

### 9.4 `composer.tsx` — Char count not announced to screen readers
**File:** `composer.tsx` (spillover)
**Issue:** The character count indicator changes visually but doesn't use `aria-live` to announce changes to screen reader users.
**Fix:** Add `aria-live="polite"` to the char count element, but only announce when the tone changes (not every keystroke).

### 9.5 Several tool parts use emoji without alt text
**File:** `parts/set-alert.tsx:51` — 🔔 emoji
**Issue:** The bell emoji `🔔` has `aria-hidden` which is correct, but the adjacent text "Alert created" doesn't convey the same visual cue.
**Fix:** This is acceptable — the text label is sufficient for screen readers.

---

## 10. SECURITY CONSIDERATIONS

### 10.1 `chat-screen.tsx` — Multi-agent fetch doesn't include CSRF token in all cases
**File:** `chat-screen.tsx` (spillover) — `sendMultiAgentMessage`
**Issue:** The multi-agent fetch includes `X-CSRF-Token` header, but the `handleEdit` fork request uses `x-csrf-token` (lowercase). While HTTP headers are case-insensitive per spec, the inconsistency suggests the CSRF handling is ad-hoc rather than centralized.
**Fix:** Use a consistent CSRF header name across all fetch calls, ideally via a shared `fetchWithCsrf` utility.

### 10.2 `get-news.tsx` — `cleanNewsText` doesn't sanitize HTML
**File:** `parts/get-news.tsx:26-35`
**Issue:** The `cleanNewsText` function unescapes HTML entities (`&amp;` → `&`, etc.) but doesn't sanitize for XSS. If the news title contains `<script>` tags (after entity unescaping), they could be rendered. However, since React escapes text by default, this is not exploitable in practice — but it's still a code smell.
**Fix:** The current behavior is safe because React auto-escapes. No action needed, but document this.

---

## SUMMARY OF PRIORITY FIXES

### P0 (Critical — fix immediately)
1. **SSE error swallowing** in `chat-screen.tsx` multi-agent handler (1.2)
2. **`bg-black` hardcoded** instead of semantic token (1.6 / 4.1)
3. **Race condition** in multi-agent `setMessages` (1.4)
4. **`round` typo** in `get-system-diagnostics.tsx` (4.3)

### P1 (High — fix soon)
5. **`handleRegenerate` dead `.content` access** (1.3)
6. **Virtualizer regex bug** `/|.*|/` (3.1)
7. **Auto-scroll fires on every token** (3.2)
8. **`modelOverrideRef` not cleared on error** (8.2)
9. **AbortController not cleaned up on unmount** (8.3)
10. **Hardcoded ARIA IDs** in plan.tsx and citation-warning.tsx (1.7, 1.8)

### P2 (Medium — fix in next sprint)
11. **`handleRegenerate`/`handleEdit` dependency on `messages`** (3.3, 3.4)
12. **`registry.tsx` returns null on schema failure** — should show fallback (6.5)
13. **`get-calendar.tsx` uses `<a>` instead of `<Link>`** (6.9)
14. **Duplicated SkeletonCard/ErrorCard** across all tool parts (6.7)
15. **`share-snapshot.tsx` expiry never updates** (1.1)
16. **Index-as-key** in portfolio/sentiment (1.10, 1.11)

### P3 (Low — polish)
17. **Dead code** in `get-cot.tsx` (1.13)
18. **Duplicated `formatStamp`** (6.6)
19. **`space-y-*` vs `gap-*`** inconsistency (4.5, 4.6)
20. **Shadow inconsistency** in `run-system-action.tsx` (4.7)
21. **`text-info` token** may not exist (4.2)
22. **Thread list search not debounced** (3.6)



---

## C. Dashboard & Widgets Analysis

# Dashboard & Widgets — Deep Analysis

## Scope
All files under `apps/web/src/app/(app)/dashboard/` plus the `(app)` layout and error boundary.

---

## 1. `page.tsx` — Server Component / Data Fetching

### 1A. BUG: `listUpcomingEvents` missing `userId` parameter
**File:** `page.tsx:39`
```ts
listUpcomingEvents({ limit: 12 }),
```
Every other data call passes `userId` as the first argument (`listAlerts(userId, ...)`, `listEntries(userId, ...)`). `listUpcomingEvents` only receives an options object. If the function signature expects `userId` as the first parameter (like the others), this will either throw or return global events instead of user-scoped ones. **Fix:** Verify the `listUpcomingEvents` signature — if it's intentionally global (economic calendar), add a comment documenting why. If it should be user-scoped, add `userId`.

### 1B. UX: No per-widget error surfacing — silent fallback to empty
**File:** `page.tsx:48-54`
```ts
const unwrap = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
  r.status === 'fulfilled' ? r.value : fallback;
```
When a data source rejects, the widget silently shows an empty state (e.g. "No alerts set") instead of an error state. The user can't distinguish "no data" from "fetch failed." **Fix:** Pass a `hasError` flag per data source to the canvas, and have widgets show a retry/error state when their data source failed. At minimum, log rejected reasons server-side:
```ts
if (r.status === 'rejected') console.error('Dashboard data source failed:', r.reason);
```

### 1C. PERFORMANCE: `listEntries(userId, { limit: 200 })` over-fetches
**File:** `page.tsx:40`
Fetching 200 journal entries on every dashboard load is heavy. The stats widget only needs closed trades, the open-positions widget needs `outcome === 'open'` (typically <10), and the P&L heatmap needs closed trades for 2 months. **Fix:** Consider a dedicated dashboard API endpoint that returns pre-aggregated stats + paginated entries, or at least reduce the limit to ~50 and add server-side filtering.

### 1D. DESIGN: `force-dynamic` without caching strategy
**File:** `page.tsx:33`
```ts
export const dynamic = 'force-dynamic';
```
This disables all static optimization and caching. Every dashboard visit hits the DB for 5 queries. Consider `revalidate = 30` or per-query caching with `unstable_cache` for the non-user-scoped calls (events, news).

---

## 2. `loading.tsx` — Skeleton State

### 2A. UX: Skeleton doesn't match actual dashboard layout
**File:** `loading.tsx:24-31`
The loading skeleton shows a 2×2 grid of small stat cards + one tall card. The actual dashboard renders a customizable canvas with 10 widgets in a 1-col (mobile) / 2-col (desktop) grid. The mismatch causes a visible layout shift (CLS) on hydration. **Fix:** Mirror the default layout structure — render skeleton placeholders matching the default widget spans (full-width hero, half-width cards).

### 2B. UX: Missing `aria-busy` / `aria-live`
The skeleton has `role="status"` on individual `Skeleton` elements but the container lacks `aria-busy="true"` or `aria-live="polite"` to announce the loading state to screen readers.

---

## 3. `dashboard-canvas.tsx` — Core Canvas Component

### 3A. BUG: `safeLayout` recomputes on every `layout` change causing infinite update risk
**File:** `dashboard-canvas.tsx:~80-95`
```ts
const safeLayout = useMemo(() => {
  if (!hydrated) return DEFAULT_LAYOUT;
  // ... prunes and adds missing widgets ...
  return [...pruned, ...additions];
}, [hydrated, layout]);
```
`safeLayout` derives from `layout` (from `useLocalStorage`). When `persistLayout` calls `setLayout`, `layout` changes, `safeLayout` recomputes, and if the pruning/addition logic produces a different array reference (even with same content), it could trigger another persist. Currently it's stable because the pruning is idempotent, but the `Math.random()` in additions means if there are missing widgets, every render generates new IDs. **Fix:** Use deterministic IDs for additions (e.g., `w-${type}`) instead of `Math.random()`.

### 3B. BUG: `renderWidget` type signature is wrong
**File:** `dashboard-canvas.tsx:~230`
```ts
function renderWidget(
  type: WidgetType,
  data: Omit<DashboardCanvasProps, never>,
)
```
`Omit<DashboardCanvasProps, never>` is a no-op — it omits nothing. This should just be `DashboardCanvasProps`. The `Omit` with `never` is dead/misleading code.

### 3C. PERFORMANCE: All widgets re-render on any layout change
**File:** `dashboard-canvas.tsx:~170-185`
`SortableWidget` receives `{...props}` (all dashboard data). When `editMode` toggles or any layout change occurs, every `SortableWidget` re-renders because `props` is a new object reference each render. **Fix:** Memoize `SortableWidget` with `React.memo` and pass only the specific data slice each widget needs (via `renderWidget`), not the entire props spread.

### 3D. PERFORMANCE: `renderWidget` creates new array references on every call
**File:** `dashboard-canvas.tsx:~240-250`
```ts
case 'today-glance':
  return (
    <TodayGlanceWidget
      events={[...events]}    // new array every render
      entries={[...entries]}   // new array every render
      ...
    />
  );
```
Spreading `events` and `entries` into new arrays on every render defeats `useMemo` inside child widgets (e.g., `StatsWidget`'s `useMemo` depends on `entries` reference). **Fix:** Pass the original `readonly` arrays directly — the widget prop types already accept `readonly` arrays.

### 3E. UX: Drag-and-drop not accessible on mobile
**File:** `dashboard-canvas.tsx:~120-125`
`PointerSensor` with `activationConstraint: { distance: 4 }` works for mouse/touch, but `KeyboardSensor` only works when the drag handle is focused. The drag handle button has `aria-label` but no visible focus ring. **Fix:** Add `focus-visible:ring-2 focus-visible:ring-border` to the drag handle button.

### 3F. UX: `AddWidgetMenu` uses `<details>`/`<summary>` — no click-outside-to-close
**File:** `dashboard-canvas.tsx:~280-310`
The native `<details>` element stays open when clicking elsewhere on the page. Users must click the summary again to close it. **Fix:** Add a `useEffect` with a document click listener, or use a proper Popover/Dialog primitive.

### 3G. BUG: `AddWidgetMenu` doesn't close after selecting a widget
After clicking a widget type in the menu, the `<details>` element remains open. The user sees the widget added but the menu is still showing. **Fix:** Close the details element after `onAdd` by controlling the `open` attribute.

### 3H. UX: No "reset to default" confirmation
**File:** `dashboard-canvas.tsx:~150`
```ts
<Button variant="ghost" size="sm" onClick={resetLayout}>
  Reset
</Button>
```
Resetting the layout is destructive — the user's custom arrangement is lost instantly with no confirmation. **Fix:** Add a simple `window.confirm('Reset dashboard to default layout?')` or an inline undo toast.

### 3I. DESIGN: Span toggle uses obscure Unicode characters
**File:** `dashboard-canvas.tsx:~200`
```ts
{widget.span === 1 ? '⓪' : 'ⓡ'}
```
These characters (`⓪` U+2922, `ⓡ` U+2921) are "n-ary times" / "n-ary circled times" — they're not widely recognized as "expand/collapse" controls. **Fix:** Use `IconArrowsHorizontal` / `IconArrowsVertical` from Tabler, or text labels like "1×" / "2×".

### 3J. BUG: `hidden` widgets calculation runs on every render
**File:** `dashboard-canvas.tsx:~160`
```ts
const hidden = ALL_WIDGETS.filter(
  (t) => !safeLayout.some((w) => w.type === t),
);
```
This is not memoized and runs on every render. It's a small array (10 items) so the perf impact is minimal, but it should be `useMemo` for consistency.

### 3K. UX: No drag handle visible in non-edit mode
In edit mode, the drag handle appears above the widget. But the widget body itself doesn't indicate it's draggable. Consider adding a subtle hover state or grip icon overlay on the widget card in edit mode.

### 3L. MISSING: No "layout export/import" feature
The layout is persisted to localStorage only. If a user clears their browser data or switches devices, their custom layout is lost. Consider syncing to user settings (server-side).

---

## 4. `widget-types.ts` — Type Definitions

### 4A. DESIGN: `order` field is redundant
**File:** `widget-types.ts:~30`
The `order` field is re-stamped on every change in `persistLayout`:
```ts
const reStamped = next.map((w, i) => ({ ...w, order: i }));
```
Since the array position already determines order, the `order` field is always equal to the array index. It's dead data that adds complexity. **Fix:** Remove `order` from `WidgetConfig` and rely on array position.

### 4B. MISSING: No widget visibility flag
There's no `visible: boolean` or `hidden: boolean` field. Removing a widget deletes it from the array entirely. This means if a user accidentally removes a widget, they must know to re-add it from the "Add widget" menu. Consider a `hidden` flag instead of deletion.

---

## 5. `alerts-widget.tsx`

### 5A. BUG: `summariseRule` doesn't handle all cases exhaustively
**File:** `alerts-widget.tsx:~30-37`
```ts
function summariseRule(alert: Alert): string {
  const r = alert.rule;
  switch (r.type) {
    case 'priceCross': return `${r.direction} ${r.level}`;
    case 'candleClose': return `${r.direction} ${r.level} (close)`;
    case 'indicatorCross': return `${r.direction} ${r.level} (${r.indicator})`;
  }
}
```
TypeScript's exhaustiveness check works here, but if a new rule type is added to `Alert` without updating this function, it will return `undefined` at runtime (no default case). **Fix:** Add a default return: `default: return r.type;`

### 5B. UX: No loading state
The widget has no loading skeleton — it jumps from empty to populated. Since data comes from server props, this is less critical, but during client-side navigation (SPA transitions), the widget shows stale data until the new props arrive.

### 5C. DESIGN: Alert count shows `rows.length` not `alerts.length`
**File:** `alerts-widget.tsx:~42`
```ts
{rows.length > 0 ? (
  <span className="text-fg-subtle text-caption tabular-nums">
    {rows.length}
  </span>
) : null}
```
This shows the count of *displayed* alerts (max 5), not total alerts. If the user has 20 alerts, the badge says "5". **Fix:** Show `alerts.length` for the total count, or show "5+" when truncated.

---

## 6. `briefing-widget.tsx`

### 6A. PERFORMANCE: `ReactMarkdown` re-renders on every parent render
**File:** `briefing-widget.tsx:~80`
```tsx
<ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.body}</ReactMarkdown>
```
`ReactMarkdown` is expensive. The `remarkPlugins` array `[remarkGfm]` is recreated on every render, and the markdown is re-parsed each time. **Fix:** Wrap in `useMemo`:
```ts
const rendered = useMemo(() => 
  <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.body}</ReactMarkdown>, 
  [briefing.body]
);
```

### 6B. UX: `briefingNudge` extraction is fragile
**File:** `dashboard-canvas.tsx:~235`
```ts
const briefingNudge = briefing?.body?.split('. ')[0] ?? null;
```
Splitting on `. ` to get the "first sentence" is fragile — it breaks on abbreviations ("e.g. ", "i.e. "), decimal numbers ("3. 5%"), and URLs. **Fix:** Use a proper sentence boundary or just use `briefing.summary` which is already provided.

### 6C. DESIGN: `md-prose` class — no prose styling defined
**File:** `briefing-widget.tsx:~78`
```tsx
<div className="md-prose text-fg-muted text-body-sm flex flex-col gap-2 leading-[1.4]">
```
The `md-prose` class is referenced but there's no evidence it's defined in the design system. If it's not in `globals.css`, markdown elements (h1, ul, code) will be unstyled. **Fix:** Verify `md-prose` exists in globals.css or add minimal prose styles.

### 6D. UX: No max-height / scroll for long briefings
A long briefing body will expand the widget vertically without limit, pushing other widgets down. **Fix:** Add `max-h-[300px] overflow-y-auto` to the markdown container.

---

## 7. `calendar-widget.tsx`

### 7A. BUG: Comment says "IconFilter to upcoming high/medium importance" but doesn't filter by importance
**File:** `calendar-widget.tsx:~30-33`
```ts
// IconFilter to upcoming high/medium importance, sort ascending, cap.
const upcoming = events
  .filter((e) => e.date > now)
  .sort((a, b) => a.date - b.date)
  .slice(0, limit);
```
The comment says it filters to "high/medium importance" but the code only filters by date. Low-importance events will appear. **Fix:** Either add `.filter((e) => e.importance === 'high' || e.importance === 'medium')` or fix the comment.

### 7B. BUG: `formatCountdown` duplicated between `calendar-widget.tsx` and `today-glance-widget.tsx`
**File:** `calendar-widget.tsx:~85-95` and `today-glance-widget.tsx:~60-70`
Both files define `formatCountdown(ms: number): string` with nearly identical logic but slightly different output (today-glance includes days+hours, calendar only days). **Fix:** Extract to a shared utility in `@/lib/format`.

### 7C. UX: `e.currency ?? e.country` may render `undefined`
**File:** `calendar-widget.tsx:~65`
```ts
{e.currency ?? e.country}
```
If both `currency` and `country` are `undefined`/`null`, this renders nothing — an empty badge. **Fix:** Add a fallback: `{e.currency ?? e.country ?? '—'}`.

### 7D. PERFORMANCE: `events` array is filtered/sorted on every `now` tick
**File:** `calendar-widget.tsx:~30-33`
The `useTime()` hook updates `now` every 30s, causing the filter+sort to re-run. With 12 events this is negligible, but the computation isn't memoized. **Fix:** Wrap in `useMemo` with `[events, now]` deps.

---

## 8. `equity-curve-widget.tsx`

### 8A. PERFORMANCE: `[...entries]` creates new array reference
**File:** `equity-curve-widget.tsx:~28`
```tsx
<PerformanceChart entries={[...entries]} height={200} />
```
Spreading `entries` creates a new array on every render, causing `PerformanceChart`'s `useMemo` (which depends on `entries`) to recompute every time. **Fix:** Pass `entries` directly — `PerformanceChart` accepts `JournalEntry[]` and the `readonly` constraint is only on the widget prop.

### 8B. UX: No empty state
The widget delegates to `PerformanceChart` which has its own empty state ("Close at least two trades..."). However, the empty state uses `surface-panel` class which may conflict with the widget's own `bg-bg-elev-1` chrome, creating a double-card effect. **Fix:** Check if `surface-panel` adds a background/border that duplicates the widget wrapper.

### 8C. DESIGN: Hardcoded `height={200}`
The chart height is fixed at 200px. On mobile this may be too tall relative to the viewport, and on desktop too short for a full-width widget. **Fix:** Use responsive height or `min-h-[200px]`.

---

## 9. `news-pulse-widget.tsx`

### 9A. BUG: `bottom.id !== top?.id` check is insufficient when `top` is null
**File:** `news-pulse-widget.tsx:~80`
```ts
{bottom && bottom.id !== top?.id ? (
```
If `top` is `null` but `bottom` exists (all articles have null `sentimentScore` except one negative), `top?.id` is `undefined`, and `bottom.id !== undefined` is true — so it renders the bottom headline. But `top` being null means the "most positive" section is skipped, which is correct. However, if there's only one article with a sentiment score, `top` and `bottom` are the same object, and `bottom.id !== top?.id` correctly prevents duplicate display. This is actually fine. No bug.

### 9B. UX: `counts.none` is never displayed
**File:** `news-pulse-widget.tsx:~22-28`
```ts
const counts = { positive: 0, negative: 0, neutral: 0, none: 0 };
```
Articles with no sentiment (`sentiment === undefined` or any other value) are counted in `none`, but `none` is never shown in the UI — not in the bar, not in the legend. **Fix:** Either show `none` in the legend, or remove the `none` counter.

### 9C. PERFORMANCE: `ranked` array sorted on every render
**File:** `news-pulse-widget.tsx:~30-32`
```ts
const ranked = [...articles]
  .filter((a) => a.sentimentScore !== null)
  .sort((a, b) => (b.sentimentScore ?? 0) - (a.sentimentScore ?? 0));
```
Not memoized. With 30 articles this is fine, but for consistency it should be `useMemo`.

### 9D. ACCESSIBILITY: Sentiment bar `role="img"` lacks text alternative for color-blind users
The bar uses green/gray/red to convey sentiment distribution. Color-blind users can't distinguish them. The `aria-label` provides counts but not the visual meaning. **Fix:** Add text labels or patterns (stripes) to the bar segments.

---

## 10. `open-positions-widget.tsx`

### 10A. UX: R-multiple not shown despite comment claiming it
**File:** `open-positions-widget.tsx:~7`
```
// ...and the current R-multiple (when computable).
```
The comment says the widget shows "the current R-multiple" but the rendered output only shows symbol, entry, stop, and relative time. No R-multiple calculation is present. **Fix:** Either implement R-multiple display (like `CellOpenRisk` in today-glance does) or update the comment.

### 10B. UX: No target price shown
The comment mentions "target" but only entry and stop are displayed. **Fix:** Add target to the secondary line, or remove the mention from the comment.

### 10C. PERFORMANCE: `entries.filter(...).slice(...)` not memoized
**File:** `open-positions-widget.tsx:~27`
```ts
const open = entries.filter((e) => e.outcome === 'open').slice(0, limit);
```
Runs on every render. **Fix:** `useMemo` with `[entries, limit]` deps.

---

## 11. `pnl-heatmap-widget.tsx`

### 11A. BUG: `totals` computes across ALL entries, not just visible months
**File:** `pnl-heatmap-widget.tsx:~105-112`
```ts
const totals = useMemo(() => {
  let r = 0;
  let count = 0;
  for (const [, b] of bucketsByKey) {
    r += b.totalR;
    count += b.count;
  }
  return { r, count };
}, [bucketsByKey]);
```
`bucketsByKey` contains ALL closed entries (up to 200), not just the 2 months displayed. The header shows "X trades · YR" but this is the total across all time, not the visible 2-month window. This is misleading. **Fix:** Filter `bucketsByKey` to only the months currently displayed:
```ts
const visibleKeys = new Set(months.flatMap(m => m.weeks.flat().filter(Boolean).map(c => c!.key)));
```

### 11B. BUG: `new Date(selectedDay.key)` parses as UTC midnight
**File:** `pnl-heatmap-widget.tsx:~155`
```ts
{new Date(selectedDay.key).toLocaleDateString(...)}
```
`selectedDay.key` is `"YYYY-MM-DD"` which `new Date()` parses as UTC midnight. In timezones behind UTC (e.g. US), this shows the previous day. **Fix:** Parse as local date: `new Date(selectedDay.key + 'T00:00:00')`.

### 11C. UX: No forward navigation limit
**File:** `pnl-heatmap-widget.tsx:~115-120`
The "Next month" button has no limit — users can navigate arbitrarily far into the future where there's no data. **Fix:** Disable the next button when the displayed month is the current month or later.

### 11D. PERFORMANCE: `bucketsByKey` recomputes on every entries change
The `useMemo` depends on `[entries]` which is a new array reference every render (due to spreading in `renderWidget`). See issue 3D. **Fix:** Don't spread entries in `renderWidget`.

### 11E. UX: Heatmap cells are `size-8` (32px) — too small for touch
**File:** `pnl-heatmap-widget.tsx:~140`
```ts
className={cn('flex size-8 items-center justify-center rounded-sm ...')}
```
32px is below the 44px minimum touch target for mobile. **Fix:** Use `size-10` (40px) or add padding to increase the touch area.

### 11F. DESIGN: Hardcoded RGB colors instead of design tokens
**File:** `pnl-heatmap-widget.tsx:~38-42`
```ts
backgroundColor: totalR > 0 ? `rgba(16, 185, 129, ${alpha})` : `rgba(239, 68, 68, ${alpha})`,
```
These hardcoded RGB values (`16, 185, 129` = bull green, `239, 68, 68` = bear red) bypass the design token system. If the theme changes these colors, the heatmap won't follow. Same issue in `Legend()` at lines 175-185. **Fix:** Use CSS variables: `rgba(var(--color-bull-rgb), ${alpha})` or pre-compute from tokens.

### 11G. UX: `DrawerClose` text is not a button
**File:** `pnl-heatmap-widget.tsx:~170`
```tsx
<DrawerClose className="text-fg-muted hover:text-fg text-body-sm w-full text-center">
  Close
</DrawerClose>
```
This renders as a div, not a button. It may lack proper keyboard accessibility. **Fix:** Ensure `DrawerClose` renders a `<button>` internally (verify the Drawer component implementation).

### 11H. MISSING: No "today" indicator
The heatmap doesn't highlight the current day. Users have to find today manually. **Fix:** Add a ring/border to today's cell.

---

## 12. `stats-widget.tsx`

### 12A. BUG: Sparkline uses first 10 closed trades, not last 10
**File:** `stats-widget.tsx:~30-31`
```ts
// Last 10 closed trades (oldest → newest) for the cumulative sparkline.
const sparkSource = closed.slice(0, 10).reverse();
```
The comment says "last 10" but `slice(0, 10)` takes the FIRST 10 entries. If entries are sorted newest-first (common in journal APIs), this shows the 10 oldest trades. If sorted oldest-first, it shows the first 10, not the most recent 10. **Fix:** Verify entry sort order and use `closed.slice(-10)` if newest-first, or `closed.slice(0, 10)` if already oldest-first — but the comment and code must agree.

### 12B. UX: Win rate tone logic is wrong for 0% win rate
**File:** `stats-widget.tsx:~38`
```ts
tone: winRate >= 50 ? 'bull' : winRate > 0 ? 'muted' : 'bear',
```
When `closed.length === 0`, `winRate = 0`, so tone is `'bear'`. But showing "—" in bear/red color implies failure when there's simply no data. **Fix:** When `closed.length === 0`, use tone `'muted'`:
```ts
tone: closed.length === 0 ? 'muted' : winRate >= 50 ? 'bull' : winRate > 0 ? 'muted' : 'bear',
```

### 12C. PERFORMANCE: `useMemo` depends on `entries` which changes reference every render
Same issue as 3D/11D. The spread in `renderWidget` creates new array references.

### 12D. UX: No "no data" empty state
When `entries` is empty, all 4 stat cards show "—" / "0" / "0.00R" with no explanation. **Fix:** Show an `EmptyState` when `entries.length === 0`.

---

## 13. `today-glance-widget.tsx`

### 13A. BUG: `CellSession` uses `new Date()` instead of `useTime()`
**File:** `today-glance-widget.tsx:~75`
```ts
function CellSession() {
  const session = getSession(new Date());
```
Every other time-dependent cell uses `useTime()` for synchronized updates, but `CellSession` creates a `new Date()` on render. Since there's no interval or `useTime`, the session label won't update when the session changes (e.g. from "London" to "New York") unless the component re-renders for another reason. **Fix:** Use `const { now } = useTime(); const session = getSession(new Date(now));`

### 13B. BUG: `getSession` session hours are incorrect
**File:** `today-glance-widget.tsx:~90-97`
```ts
if (hour >= 0 && hour < 8) return 'Asian';
if (hour >= 8 && hour < 13) return 'London';
if (hour >= 13 && hour < 21) return 'New York';
return 'Closed';
```
Actual FX session times (UTC):
- Asian: 00:00–09:00 (Tokyo opens 00:00)
- London: 08:00–17:00 (London opens 08:00)
- New York: 13:00–22:00 (NY opens 13:00)
- The overlap 08:00–09:00 is Asian+London, and 13:00–17:00 is London+NY.

The current code has London ending at 13:00 (when NY opens), missing the London/NY overlap. And NY ends at 21:00, but Sydney opens at 22:00, so 21:00–22:00 is truly "Closed". The Asian session ending at 08:00 misses the Asian/London overlap. **Fix:** Adjust to:
```ts
if (hour >= 0 && hour < 8) return 'Asian';
if (hour >= 8 && hour < 13) return 'London';
if (hour >= 13 && hour < 17) return 'London/NY';  // overlap
if (hour >= 17 && hour < 22) return 'New York';
return 'Closed';
```
Or at minimum, extend London to 17:00.

### 13C. BUG: Weekend check doesn't account for Sunday evening NY session
**File:** `today-glance-widget.tsx:~92`
```ts
if (day === 0 || day === 6) return 'Weekend';
```
Forex market opens Sunday 17:00 ET (22:00 UTC) — so Sunday evening is actually trading time. **Fix:** Check if it's Sunday after 22:00 UTC:
```ts
if (day === 6) return 'Weekend'; // Saturday
if (day === 0 && hour < 22) return 'Weekend'; // Sunday before NY open
```

### 13D. UX: `CellOpenRisk` R calculation is inverted
**File:** `today-glance-widget.tsx:~110-118`
```ts
totalR += Math.abs(e.entry - e.stop) / Math.abs(e.entry - e.target);
```
R-multiple is typically defined as `(target - entry) / (entry - stop)` — i.e., the reward-to-risk ratio. The formula here divides risk by reward, giving the inverse. A trade with 1:3 risk:reward would show 0.33R instead of 3R. **Fix:** `totalR += Math.abs(e.entry - e.target) / Math.abs(e.entry - e.stop);` — or clarify what "R at risk" means in this context.

### 13E. UX: `briefingNudge` can be an empty string
**File:** `dashboard-canvas.tsx:~235`
```ts
const briefingNudge = briefing?.body?.split('. ')[0] ?? null;
```
If `briefing.body` starts with ". " (e.g. ". Hello"), `split('. ')[0]` returns `""`. The `??` operator only catches `null`/`undefined`, not empty strings. So `briefingNudge` would be `""` which renders as an empty paragraph. **Fix:** Use `|| null` instead of `?? null`, or check `briefingNudge.trim()`.

### 13F. DESIGN: `text-xs` used instead of `text-caption` token
**File:** `today-glance-widget.tsx:~57, ~107`
```tsx
<span className="text-fg-muted text-xs">No high-impact events today</span>
<span className="text-fg-muted text-xs">No open positions</span>
```
`text-xs` is a raw Tailwind class while the rest of the dashboard uses the `text-caption` design token. **Fix:** Replace `text-xs` with `text-caption`.

---

## 14. `watchlist-widget.tsx`

### 14A. BUG: Redundant `DEFAULT_WATCHLIST` assignment
**File:** `watchlist-widget.tsx:~38-40`
```ts
export function WatchlistWidget({
  symbols = DEFAULT_WATCHLIST,
}: WatchlistWidgetProps) {
  const list: Symbol[] = symbols ?? DEFAULT_WATCHLIST;
```
`symbols` already defaults to `DEFAULT_WATCHLIST` in the destructure, so `symbols ?? DEFAULT_WATCHLIST` is always `symbols`. The `??` is dead code. **Fix:** Remove the redundant line: `const list = symbols;`

### 14B. PERFORMANCE: `useEffect` pushes to buffer on every data tick, causing re-render
**File:** `watchlist-widget.tsx:~45-55`
```ts
useEffect(() => {
  if (!data) return;
  let changed = false;
  for (const t of data) {
    const buf = buffersRef.current.get(t.symbol) ?? [];
    buf.push(t.mid);
    if (buf.length > BUFFER_SIZE) buf.shift();
    buffersRef.current.set(t.symbol, buf);
    changed = true;
  }
  if (changed) bumpVersion();
}, [data]);
```
Every 3s poll returns new `data` (even if prices haven't changed), triggering `bumpVersion()` and re-rendering all rows. The `changed` flag is always `true` if `data` exists — it's set inside the loop unconditionally. **Fix:** Only set `changed = true` if the mid price actually differs from the last buffer entry:
```ts
const lastVal = buf[buf.length - 1];
if (lastVal !== t.mid) {
  buf.push(t.mid);
  if (buf.length > BUFFER_SIZE) buf.shift();
  buffersRef.current.set(t.symbol, buf);
  changed = true;
}
```

### 14C. PERFORMANCE: `WatchRow` not memoized — re-renders all rows on every tick
**File:** `watchlist-widget.tsx:~80-105`
`WatchRow` is a plain function component. When `tickVersion` bumps, the parent re-renders, and all `WatchRow` instances re-render even if their specific tick didn't change. **Fix:** Wrap `WatchRow` in `React.memo`.

### 14D. UX: No error state for price fetch failures
**File:** `watchlist-widget.tsx:~65`
```ts
const tickQuery = usePrices(list);
const data = tickQuery.data;
const isLoading = tickQuery.isLoading;
```
`tickQuery.error` and `tickQuery.isError` are never checked. If the price API fails, the widget shows the loading skeleton forever (since `isLoading` becomes false but `data` is undefined). **Fix:** Check `tickQuery.isError` and show an error/retry state.

### 14E. UX: No empty state when `data` is empty array
If the API returns `[]` (no prices available), the widget renders an empty `<ul>` with no message. **Fix:** Show "No prices available" when `data?.length === 0 && !isLoading`.

### 14F. ACCESSIBILITY: Loading skeleton rows lack `aria-label`
**File:** `watchlist-widget.tsx:~67-74`
The loading skeleton rows are plain `<div>`s with pulse animation but no `aria-label` or `role="status"`. Screen readers won't announce the loading state.

### 14G. BUG: `tickVersion` pattern is fragile
**File:** `watchlist-widget.tsx:~43-44`
```ts
const [tickVersion, bumpVersion] = useReducer((x: number) => x + 1, 0);
```
`tickVersion` is passed to `WatchRow` and `void tickVersion` is used to "force" re-render. This is an anti-pattern — React doesn't guarantee re-render just because a prop changes if the component is memoized. The `void` expression discards the value. **Fix:** Use proper state for buffer snapshots, or use `useSyncExternalStore`.

---

## 15. `(app)/layout.tsx` — App Shell

### 15A. BUG: `bg-black` hardcoded instead of design token
**File:** `layout.tsx:~50`
```tsx
<div className="bg-black text-fg relative min-h-svh">
```
`bg-black` is a raw Tailwind color, not a design token. The rest of the app uses `bg-bg-elev-1`, `bg-bg-elev-2`, etc. If the theme changes the base background, this won't follow. **Fix:** Use `bg-bg-base` or equivalent design token.

### 15B. UX: `max-w-2xl` on mobile, `xl:max-w-7xl` on desktop — missing `lg` breakpoint
**File:** `layout.tsx:~53`
```tsx
className="mx-auto w-full max-w-2xl px-4 pt-4 xl:max-w-7xl xl:px-6 ..."
```
Between `max-w-2xl` (672px) and `xl:max-w-7xl` (1280px), there's a gap. On tablets (768px–1023px), the content is constrained to 672px, wasting screen space. The `lg` breakpoint (1024px) is skipped entirely. **Fix:** Add `lg:max-w-5xl` or `lg:max-w-6xl` for intermediate screens.

### 15C. SECURITY: `AUTH_MODE === 'legacy'` bypasses all auth
**File:** `layout.tsx:~35`
```ts
if (process.env.AUTH_MODE !== 'legacy') {
  // ... auth checks ...
}
```
When `AUTH_MODE` is `'legacy'`, the entire auth block is skipped — no session check, no onboarding redirect, no admin check. This is a potential security issue if accidentally deployed with `AUTH_MODE=legacy`. **Fix:** Add a runtime warning or restrict legacy mode to development:
```ts
if (process.env.AUTH_MODE === 'legacy' && process.env.NODE_ENV === 'production') {
  throw new Error('AUTH_MODE=legacy is not allowed in production');
}
```

### 15D. UX: `userName`/`userEmail`/`userId` spread conditionally
**File:** `layout.tsx:~60-62`
```tsx
<NavDrawer {...(userName !== undefined ? { userName } : {})} ... />
```
This conditional spread is correct but hard to read. If `userName` is an empty string (falsy but defined), it's still passed. This is fine functionally but could be simplified.

---

## 16. `(app)/error.tsx` — Error Boundary

### 16A. UX: No error digest display for support
**File:** `error.tsx:~30`
```ts
interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}
```
The `digest` field is available but never shown. Users can't reference an error ID when contacting support. **Fix:** Show the digest in a `<details>` element:
```tsx
{error.digest && (
  <p className="text-fg-subtle text-caption">Error ID: {error.digest}</p>
)}
```

### 16B. UX: `reset()` may not work if error is in server component
**File:** `error.tsx:~33`
`reset()` re-renders the error boundary's children, but if the error originated in a server component (like `page.tsx`'s data fetching), `reset()` won't re-run the server code — it needs a full route refresh. **Fix:** Add `router.refresh()` alongside `reset()`:
```ts
import { useRouter } from 'next/navigation';
const router = useRouter();
// ...
onClick={() => { reset(); router.refresh(); }}
```

### 16C. DESIGN: Error card lacks max-width constraint
The error card will stretch to the full width of the `main` container. On wide desktop screens, the error message spans too wide. **Fix:** Add `max-w-md mx-auto` to center and constrain.

---

## 17. Cross-Cutting Issues

### 17A. PERFORMANCE: No React Query for server-fetched data
The dashboard page fetches all data server-side and passes as props. But there's no client-side refetch mechanism. When the user navigates away and back (SPA), the data is stale. The `watchlist` widget uses React Query (`usePrices`) but the rest of the dashboard doesn't. **Fix:** Consider wrapping the dashboard data in React Query with `initialData` from server props for client-side refetching.

### 17B. DESIGN: Inconsistent widget chrome
Some widgets wrap themselves in `<section className="border-border bg-bg-elev-1 ... rounded-sm border p-4">` (alerts, calendar, watchlist, etc.), while others don't (today-glance renders bare cells, stats renders a bare grid, briefing renders its own wrapper). The `SortableWidget` wrapper doesn't provide consistent chrome — it just wraps in a `<div>`. This means:
- `today-glance` cells have their own borders but no outer card
- `stats` cards have their own borders (via `StatCard`) but no outer card
- `briefing` has its own card but with `p-2` instead of `p-4`
- Other widgets have consistent `p-4` cards

**Fix:** Standardize — either the `SortableWidget` wrapper provides the card chrome, or all widgets do it themselves consistently.

### 17C. MISSING: No widget-level loading states
When the dashboard transitions (e.g. after `reset()` or navigation), all widgets flash empty simultaneously. There's no per-widget loading skeleton. The only loading state is the route-level `loading.tsx`.

### 17D. MISSING: No widget refresh/reload action
Users can't refresh individual widget data. The entire page must be reloaded. **Fix:** Add a refresh icon per widget in edit mode.

### 17E. ACCESSIBILITY: No `aria-label` on the main dashboard heading
**File:** `dashboard-canvas.tsx:~145`
```tsx
<h1 className="text-fg text-xl font-bold tracking-tight">Dashboard</h1>
```
This is fine for sighted users, but the page lacks a skip link target specific to the dashboard content. The layout's `SkipToContent` links to `#main-content` which is the entire main area.

### 17F. RESPONSIVE: Dashboard grid is only 1 or 2 columns
**File:** `dashboard-canvas.tsx:~170`
```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
```
On ultra-wide screens (1920px+), 2 columns is too few — widgets are very wide. The layout supports `xl:max-w-7xl` (1280px) but the grid doesn't scale beyond 2 columns. **Fix:** Add `xl:grid-cols-3` or `2xl:grid-cols-3` for wider screens, and adjust span logic accordingly.

### 17G. BUG: `useLocalStorage` hydration race
**File:** `use-local-storage.ts:~25-35`
The hook sets `hydrated = true` in the `finally` block, but `setStoredValue` and `setHydrated` are called in the same effect — React 18 batches them, but if the component reads `storedValue` between the two state updates (e.g. in a derived `useMemo`), it may use the initial value with `hydrated = true`. The `safeLayout` in `dashboard-canvas.tsx` checks `if (!hydrated) return DEFAULT_LAYOUT` which mitigates this, but the window is still technically there.

### 17H. MISSING: No keyboard shortcut for customize mode
There's no keyboard shortcut to toggle edit/customize mode. Consider adding `Cmd+E` or similar.

### 17I. CODE QUALITY: Unused import `Symbol` in `dashboard-canvas.tsx`
**File:** `dashboard-canvas.tsx:~30`
```ts
import type {
  Alert,
  EconomicEvent,
  JournalEntry,
  NewsArticle,
  Symbol,
} from '@hamafx/shared';
```
`Symbol` is imported but only used in the `renderWidget` function for the `defaultSymbol` cast. It's technically used, but the import of `Symbol` alongside the others is misleading since it's not part of `DashboardCanvasProps`.

### 17J. MISSING: No analytics/telemetry for widget usage
There's no tracking of which widgets users add/remove/reorder. This data would be valuable for product decisions about default layout.

---

## Summary: Priority Ranking

### Critical Bugs (should fix immediately)
1. **11A** — P&L heatmap totals show all-time, not visible months (misleading data)
2. **13D** — Open risk R-multiple calculation is inverted
3. **13B/13C** — Trading session hours and weekend check are incorrect
4. **12A** — Stats sparkline shows first 10 trades, not last 10
5. **14B** — Watchlist re-renders on every poll even when prices don't change
6. **13A** — `CellSession` doesn't use `useTime()`, session won't update live

### High-Priority UX Issues
7. **3C/3D** — All widgets re-render on any layout change (perf)
8. **1B** — Silent error fallback hides failures from users
9. **6A** — ReactMarkdown re-parses on every render
10. **14D** — Watchlist has no error state for API failures
11. **11E** — Heatmap cells too small for touch (32px < 44px)
12. **3F/3G** — AddWidgetMenu doesn't close on outside click or selection

### Medium-Priority Design/Code Quality
13. **17B** — Inconsistent widget chrome
14. **11F** — Hardcoded RGB colors bypass design tokens
15. **15A** — `bg-black` bypasses design tokens
16. **15B** — Missing `lg` breakpoint in layout max-width
17. **7B** — Duplicated `formatCountdown` function
18. **4A** — Redundant `order` field in WidgetConfig
19. **13F** — `text-xs` instead of `text-caption` token
20. **10A** — Comment claims R-multiple display but code doesn't implement it

### Low-Priority Polish
21. **16A** — Error digest not shown for support
22. **16B** — `reset()` may not work for server component errors
23. **3I** — Obscure Unicode characters for span toggle
24. **3H** — No reset confirmation
25. **11H** — No "today" indicator on heatmap
26. **17F** — Only 2-column max on wide screens



---

## D. Chart System Analysis

# HamaFX-Ai Chart System — Deep Analysis

## Executive Summary

The chart system is a well-architected split of ~30 files covering two chart modes (TradingView widget + custom lightweight-charts SMC structure chart), with real-time price polling, SMC overlays, and indicator sub-panes. The architecture is sound, but there are **several significant bugs** (race conditions, stale refs, precision not applied on initial load), **major performance issues** (full `setData` on every live tick, indicator series rebuilt on every tick), and **design system drift** (inconsistent skeletons, duplicated constants, dead code).

---

## 1. BUGS

### 1.1 🔴 CRITICAL: `applyDecimals` is a no-op on initial chart load
**File:** `chart-canvas.tsx` (lines ~80-90) + `chart.tsx` (lines ~55-60)

The `Chart` orchestrator calls `mainChart.applyDecimals(priceDecimals(symbol))` in a `useEffect([mainChart, symbol])`. But `useImperativeHandle` in `ChartCanvas` has `[]` deps — the handle is created during render, **before** the async `import('lightweight-charts')` resolves and sets `instanceRef.current`. So on first load:

1. `useImperativeHandle` creates handle → `setMainChart(handle)` fires
2. `chart.tsx` effect runs → calls `mainChart.applyDecimals()` → `instanceRef.current` is still `null` → **no-op**
3. Async import resolves → instance created with default `precision: 2`
4. Effect doesn't re-run (same `mainChart` reference, same `symbol`)

**Result:** XAUUSD shows 2 decimals instead of 2 (OK by accident), but EURUSD/GBPUSD show 2 instead of 5. The chart displays wrong price precision until the user switches symbols.

**Fix:** In `ChartCanvas`'s mount effect, after `instanceRef.current = instance`, add:
```ts
instance.applyDecimals(priceDecimals(symbol));
```
Or move the `applyDecimals` call into the async callback.

### 1.2 🔴 CRITICAL: `ChartErrorBoundary` doesn't reset on symbol/tf change
**File:** `chart-view.tsx` (line ~195)

```tsx
<ChartErrorBoundary key={chartKey} onRetry={() => setChartKey(k => k + 1)}>
```

The `key` only changes when the user clicks retry. If a chart error occurs for XAUUSD and the user navigates to EURUSD via `SymbolPicker`, the error boundary stays in its error state — the new symbol's chart never renders.

**Fix:**
```tsx
<ChartErrorBoundary key={`${symbol}-${tf}-${chartKey}`} onRetry={() => setChartKey(k => k + 1)}>
```

### 1.3 🔴 CRITICAL: `referenceClose` ref never resets on symbol/tf change
**File:** `chart-view.tsx` (lines ~155-161)

```tsx
const closeRef = useRef<number | null>(null);
const referenceClose = useMemo(() => {
  if (!candles || candles.length === 0) return null;
  if (closeRef.current === null) {
    closeRef.current = candles[candles.length - 1]?.c ?? null;
  }
  return closeRef.current;
}, [candles]);
```

When the user switches from XAUUSD (price ~2370) to EURUSD (price ~1.08), `closeRef.current` is still `2370`. The `PriceTag` delta will show a massive -2368.92 change. The ref is never reset.

**Fix:** Reset the ref when symbol or tf changes:
```tsx
useEffect(() => { closeRef.current = null; }, [symbol, tf]);
```

### 1.4 🟠 HIGH: `overlaySet` uses stale `candlesRef.current` after refetch
**File:** `chart-view.tsx` (lines ~170-176)

```tsx
const overlaySet = useMemo(() => {
  const current = candlesRef.current;
  if (!structure || !current) return null;
  const times = current.map((c) => c.t);
  return buildOverlays(structure, times, PALETTE, toggleRecord);
}, [structure, toggleRecord]);
```

The memo depends on `[structure, toggleRecord]` but reads `candlesRef.current`. If candles refetch (shifting the window) but structure doesn't change, the overlay markers use the new candle times with old structure indices — markers may appear at wrong positions. Conversely, if structure refetches, `candlesRef.current` may already have new candles from a separate refetch, causing index misalignment.

**Fix:** Include `candles` in the dependency array, or better, have the structure API return timestamps instead of indices.

### 1.5 🟠 HIGH: `pro-chart-view.tsx` fetches candles but never uses them for the chart
**File:** `pro-chart-view.tsx` (line ~62)

```tsx
const { candles, isLoading, isFetching } = useChartData(symbol, tf, [], 300);
```

The TradingView widget loads its own data from TradingView's servers. The `useChartData` call fetches 300 candles from the HamaFX API solely to compute `referenceClose` — but `referenceClose` is passed to `PriceTag` which already polls live prices. This is a wasteful API call that adds latency and server load for no chart benefit.

**Fix:** Remove the `useChartData` call. Use `usePrice` for the reference price, or pass `null` to `PriceTag`.

### 1.6 🟠 HIGH: `pro-chart-view.tsx` migration writes to `setConfig` but never reads `config`
**File:** `pro-chart-view.tsx` (line ~50)

```tsx
const [, setConfig] = useLocalStorage<ChartConfig>('hfx_chart_config', {...});
```

The migration effect reads old settings and calls `setConfig` to merge them, but `config` is never destructured — the migrated settings are never applied to anything. The TradingView widget hardcodes `tvTheme = 'dark'` regardless. The migration is dead code that gives a false impression of settings persistence.

**Fix:** Either read `config` and apply `config.settings.theme` to `tvTheme`, or remove the migration effect entirely.

### 1.7 🟡 MEDIUM: `tradingview-widget.tsx` — `scriptLoaded`/`loadFailed` in effect deps cause re-initialization
**File:** `tradingview-widget.tsx` (line ~93)

```tsx
useEffect(() => {
  // ...
}, [containerId, symbol, tf, scriptLoaded, loadFailed, theme]);
```

When the script loads, `scriptLoaded` flips to `true`, re-triggering the effect. The effect checks `if (scriptLoaded) { ... initWidget(tvNew) }` — but if `window.TradingView` was already available on the first run (line ~73: `if (tv) { initWidget(tv); return; }`), the second run creates a **second widget** in the same container. The cleanup function runs between effect executions, destroying the first widget, but there's a brief flash.

**Fix:** Use a ref to track whether the widget has already been initialized for the current `symbol+tf` combination, and skip re-initialization.

### 1.8 🟡 MEDIUM: `use-sub-pane-chart.ts` — `mainChart` identity change causes unnecessary chart rebuild
**File:** `use-sub-pane-chart.ts` (lines ~50-55)

```tsx
if (mainChart === mainChartRef.current && chartRef.current) {
  return;
}
```

This guard prevents rebuild when `mainChart` is the same reference. But `mainChart` is set via `setMainChart(handle)` in `ChartCanvas`'s `useImperativeHandle` with `[]` deps — the handle is stable. However, if `ChartCanvas` unmounts and remounts (e.g., due to `chartKey` change in `ChartErrorBoundary`), a new handle is created, triggering all sub-panes to rebuild. This is correct behavior but causes a visible flash.

### 1.9 🟡 MEDIUM: `use-price-stream.ts` — `symbols` array reference causes unnecessary reconnection
**File:** `use-price-stream.ts` (line ~40)

```tsx
useEffect(() => {
  // ...
  return () => { closed = true; clearTimeout(reconnectRef.current); esRef.current?.close(); };
}, [symbols]);
```

If the parent component doesn't memoize the `symbols` array, every render creates a new array reference, causing the EventSource to disconnect and reconnect. This is a common React pitfall.

**Fix:** Use a memoized key:
```tsx
const key = useMemo(() => [...symbols].sort().join(','), [symbols]);
useEffect(() => { /* use key */ }, [key]);
```

### 1.10 🟡 MEDIUM: `use-structure.ts` — `kindsKey` sorts but `fetchStructure` passes unsorted kinds
**File:** `use-structure.ts` (lines ~37-38)

```tsx
const kindsKey = opts.kinds ? [...opts.kinds].sort().join(',') : 'all';
// ...
fetchStructure(symbol, tf, { ...(opts.kinds ? { kinds: opts.kinds } : {}) })
```

The cache key sorts the kinds, but the actual API call passes the unsorted `opts.kinds`. If the API treats `['fvg', 'swings']` and `['swings', 'fvg']` differently, the cache may return stale results. More importantly, two calls with the same kinds in different order share a cache entry but may receive different API responses.

**Fix:** Pass the sorted array to `fetchStructure`:
```tsx
...(opts.kinds ? { kinds: [...opts.kinds].sort() } : {})
```

### 1.11 🟡 MEDIUM: `performance-chart.tsx` — chart not destroyed when `chartData` changes from ≥2 to <2 items
**File:** `performance-chart.tsx` (lines ~55-58)

The creation effect has `if (chartData.length === 0) return;` but the early return in the component body (`if (chartData.length < 2) return <div>...`) happens AFTER the hooks. If `chartData` goes from 3 items to 1 item (user deletes a trade), the component returns the empty state div, but the chart instance from the previous render is never destroyed — the `useEffect` cleanup runs, but the chart container ref is now detached. The chart's `autoSize: true` may cause errors trying to resize a detached canvas.

**Fix:** The effect cleanup does call `chartRef.current.remove()`, so this should be OK. But the effect's guard `if (chartData.length === 0) return;` should be `if (chartData.length < 2) return;` to match the render guard.

### 1.12 🟡 MEDIUM: `setData` with duplicate timestamps will crash lightweight-charts
**File:** `chart-canvas.tsx` `setCandles` method

If the live tick in `chart-view.tsx` creates a new candle with `barTime === lastCandle.t` (same timestamp as an existing candle from a concurrent refetch), `setData` will receive two entries with the same `time` value. Lightweight-charts throws `Cannot update last bar with duplicate time` or similar.

**Fix:** Deduplicate by timestamp before calling `setData`, or use `update()` for the last bar.

---

## 2. PERFORMANCE

### 2.1 🔴 CRITICAL: Full `setData` on every live tick instead of `update()`
**File:** `chart-canvas.tsx` (line ~108) + `chart-view.tsx` `candlesWithLive`

Every 3-second price tick creates a new `candlesWithLive` array (new reference), triggering:
```tsx
useEffect(() => {
  instanceRef.current?.setCandles(candles || []);
}, [candles]);
```
Which calls `candleSeries.setData(...)` with all 300 candles — a full O(n) replace + full chart redraw.

**Fix:** Use `candleSeries.update()` for the last bar when only the last candle changed:
```ts
setCandles(candles: Candle[]) {
  // Detect if only the last bar changed
  if (currentCandles.length === candles.length && 
      currentCandles.length > 0 &&
      currentCandles[0].t === candles[0].t) {
    candleSeries.update({
      time: Math.floor(candles[candles.length-1].t / 1000),
      open: candles[candles.length-1].o,
      high: candles[candles.length-1].h,
      low: candles[candles.length-1].l,
      close: candles[candles.length-1].c,
    });
  } else {
    candleSeries.setData(candles.map(...));
  }
  currentCandles = candles;
}
```

### 2.2 🔴 CRITICAL: Indicator series rebuilt on every live tick
**File:** `chart-canvas.tsx` (line ~120)

```tsx
useEffect(() => {
  instanceRef.current?.setIndicators(indicatorResults ?? null);
}, [indicatorResults, candles]);
```

`candles` is in the deps, so every live tick triggers `setIndicators`, which:
1. Removes all existing indicator series (`chart.removeSeries(s)`)
2. Creates new series for each indicator
3. Calls `setData` on each

For EMA + Bollinger + Pivots, that's ~12 series removed and recreated every 3 seconds. This causes visible flickering and high CPU usage.

**Fix:** Remove `candles` from the deps. Indicator results are fetched together with candles in `useChartData` — when `indicatorResults` changes, that's the right time to update. The `candles` dependency was likely added to sync the time axis, but `setIndicators` already uses `currentCandles` (which is updated in `setCandles`).

### 2.3 🟠 HIGH: Sub-pane charts also do full `setData` on every tick
**File:** `use-sub-pane-chart.ts` (line ~96)

```tsx
useEffect(() => {
  if (!isReady || !lc || !chartRef.current || !seriesRef.current || !result) return;
  updateData(seriesRef.current, result, candles, lc);
}, [isReady, lc, result, candles, updateData]);
```

Same issue as the main chart — `candles` in deps means every live tick triggers `updateData` which calls `series.setData(...)` with all values.

### 2.4 🟠 HIGH: `useChartData` prefetches adjacent timeframes on every render
**File:** `use-chart-data.ts` (lines ~100-120)

```tsx
useEffect(() => {
  // ...
  for (const adjTf of adjacent) {
    void queryClient.prefetchQuery({...});
  }
}, [symbol, tf, count, indicators, enabled, indicatorsKey, queryClient]);
```

`indicators` is an array in the deps. If the parent doesn't memoize it (and `chart-view.tsx` does memoize via `useMemo`), this re-runs on every render. Even with memoization, the `indicatorsKey` changes when any indicator toggle changes, re-triggering all adjacent prefetches.

### 2.5 🟡 MEDIUM: `price-tag.tsx` always polls even when off-screen
**File:** `price-tag.tsx` (line ~39)

```tsx
const { tick, isLoading, isError } = usePrice(symbol);
```

No `enabled` option is passed. `PriceTag` polls every 3s even when the chart is off-screen. In `chart-view.tsx`, the `usePrice` call for live ticks is gated by `visible`, but the `PriceTag` component makes its own ungated `usePrice` call.

**Fix:** Pass `enabled` prop to `PriceTag` and forward to `usePrice`.

### 2.6 🟡 MEDIUM: `Pivots` indicator creates 7 separate line series
**File:** `chart-canvas.tsx` `setIndicators` method

Each pivot level (PP, R1-R3, S1-S3) creates a separate `LineSeries` with `setData`. That's 7 series + 7 `setData` calls. Consider using price lines instead of full series for pivot levels — they're horizontal lines that don't need per-bar data.

---

## 3. UX ISSUES

### 3.1 🟠 HIGH: Inconsistent skeleton heights cause layout shift
**Files:** `loading.tsx` vs `chart-skeleton.tsx`

- `loading.tsx` (Next.js loading state): `Skeleton className="aspect-[16/9] w-full md:aspect-[21/9]"`
- `chart-skeleton.tsx` (in-component skeleton): `h-[60svh] w-full`
- `pro-chart-view.tsx` TradingView widget: `height: '70svh'`

Three different heights for the same chart area. When navigating from the loading state to the actual chart, the content jumps.

**Fix:** Standardize on one height. Use `h-[60svh]` everywhere, or use `aspect-[16/9]` everywhere.

### 3.2 🟠 HIGH: `symbol-picker.tsx` placeholder text says "IconSearch symbols…"
**File:** `symbol-picker.tsx` (line ~52)

```tsx
placeholder="IconSearch symbols…"
```

This is clearly a bug — "IconSearch" is the icon component name that leaked into the placeholder text. Should be "Search symbols…".

### 3.3 🟡 MEDIUM: No symbol/tf change resets `ChartErrorBoundary`
As noted in bug 1.2, switching symbols after an error doesn't clear the error state. The user sees "Failed to load chart" for EURUSD even though XAUUSD was the one that failed.

### 3.4 🟡 MEDIUM: `chart-error.tsx` (segment boundary) doesn't show error details
**File:** `chart/error.tsx`

The error boundary shows a generic "Something went wrong" message. The `error.digest` is available but not shown. The `error.message` is not displayed. For debugging, users can't tell what went wrong.

### 3.5 🟡 MEDIUM: `chart-settings-drawer.tsx` — `animate-pulse` on indicator dots always active
**File:** `chart-settings-drawer.tsx` (multiple lines)

Several indicator color dots have `animate-pulse` class:
```tsx
<div className="size-2.5 rounded-sm bg-warn shadow-md animate-pulse" />
```

This applies to Bollinger Bands, Pivot Points, RSI, MACD, and ATR dots. The pulsing animation runs continuously, even when the indicator is disabled. This is visually distracting and misleading — it suggests something is actively loading.

**Fix:** Only apply `animate-pulse` when the indicator is enabled and data is loading.

### 3.6 🟡 MEDIUM: No `light` theme option in settings drawer
**File:** `chart-settings-drawer.tsx` (line ~60)

The themes array only includes `black`, `slate`, `navy`, `classic`. But `THEME_PRESETS` in `chart-themes.ts` includes a `light` theme. The `ChartSettings['theme']` type also doesn't include `'light'`. Either add it to the UI or remove the dead preset.

### 3.7 🟡 MEDIUM: Zoom controls lack `aria-label`
**File:** `chart.tsx` (lines ~80-95)

Zoom buttons have `title` attributes but no `aria-label`:
```tsx
<button onClick={() => mainChart?.zoomIn()} title="Zoom In" type="button">
```

`title` is not reliably announced by screen readers. Add `aria-label="Zoom in"` etc.

### 3.8 🟡 MEDIUM: `OverlayToggle` component is dead code
**File:** `overlay-toggle.tsx`

The `OverlayToggle` component (the segmented control version) is exported but never used. The `OverlaySheet` (bottom drawer version) is used instead. The `clear` function from `useOverlayToggles` is also never called.

### 3.9 🟡 MEDIUM: `structure/loading.tsx` uses different skeleton pattern
**File:** `structure/loading.tsx`

Uses `SkeletonCard` with `lines` prop, while `chart/[symbol]/loading.tsx` uses `Skeleton` with aspect ratio. Inconsistent loading patterns within the same chart feature.

---

## 4. DESIGN SYSTEM DRIFT

### 4.1 Duplicated default constants
**Files:** `chart-view.tsx`, `pro-chart-view.tsx`, `chart-settings-drawer.tsx`

`DEFAULT_INDICATORS` and `DEFAULT_SETTINGS` are defined identically in all three files. Any change to defaults must be made in three places.

**Fix:** Export from `chart-settings-drawer.tsx` and import in the other two.

### 4.2 Duplicated `refetchIntervalFor` function
**Files:** `use-candles.ts`, `use-chart-data.ts`, `use-structure.ts`

The same `refetchIntervalFor(tf)` function is defined in three hook files with identical logic.

**Fix:** Extract to `@hamafx/shared` or a shared utility.

### 4.3 Duplicated watchlist fetching logic
**Files:** `chart/[symbol]/page.tsx`, `chart/[symbol]/structure/page.tsx`

Both server components have identical DB query logic for fetching user symbols:
```tsx
const list = await db.select({ symbol: schema.userSymbols.symbol })
  .from(schema.userSymbols)
  .where(eq(schema.userSymbols.userId, session.user.id))
  .orderBy(asc(schema.userSymbols.displayOrder));
```

**Fix:** Extract to a shared server utility `getUserWatchlist(session)`.

### 4.4 Inconsistent font family fallbacks
**Files:** `use-chart-theme.ts`, `chart-canvas.tsx`, `performance-chart.tsx`

- `use-chart-theme.ts`: `'Inter, system-ui, sans-serif'`
- `chart-canvas.tsx`: `'system-ui, sans-serif'`
- `performance-chart.tsx`: `'Geist Sans, system-ui, sans-serif'`

Three different font fallback chains for the same chart system.

### 4.5 Hardcoded fallback watchlist
**Files:** `page.tsx`, `structure/page.tsx`

```tsx
const watchlist = userSymbolsList.length > 0 ? userSymbolsList : ['XAUUSD', 'EURUSD', 'GBPUSD'];
```

The fallback is hardcoded in two places. Should come from a shared constant.

### 4.6 `PALETTE` in `chart-view.tsx` duplicates `chart-colors.ts`
**File:** `chart-view.tsx` (line ~73)

```tsx
const PALETTE: OverlayPalette = {
  bull: '#22C55E', bear: '#EF4444', warn: '#F59E0B', muted: '#808080',
};
```

These hex values duplicate `SERIES_BULL_HEX`, `SERIES_BEAR_HEX`, etc. from `chart-colors.ts`.

---

## 5. CHART LIFECYCLE ISSUES

### 5.1 🟠 HIGH: `autoSize: true` + manual `resize()` conflict
**File:** `chart-canvas.tsx` (lines ~85-87)

```tsx
const chart = createChartFn(container, {
  // ...
  autoSize: true,
});
// Then immediately:
instance.resize(el.clientWidth, el.clientHeight);
```

`autoSize: true` makes lightweight-charts use a ResizeObserver to auto-resize. The manual `resize()` call is redundant and may conflict with the observer's initial sizing. If the observer hasn't fired yet, the manual call sets the size, then the observer fires and sets it again.

**Fix:** Remove the manual `resize()` call when `autoSize: true` is set. Or remove `autoSize` and manage resizing manually.

### 5.2 🟡 MEDIUM: `useImperativeHandle` with `[]` deps — handle never updates
**File:** `chart-canvas.tsx` (line ~125)

```tsx
useImperativeHandle(handleRef, (): ChartCanvasHandle => ({...}), []);
```

The handle is created once. All methods use `instanceRef.current?.` so they always read the current instance. This is actually correct for the method implementations, but the handle is created before the instance exists (see bug 1.1).

### 5.3 🟡 MEDIUM: `use-lightweight-charts.ts` — module-level promise not thread-safe
**File:** `use-lightweight-charts.ts` (line ~6)

```tsx
let lcPromise: Promise<typeof LightweightCharts> | null = null;
```

If two components mount simultaneously and both call `useLightweightCharts()`, the first sets `lcPromise`, the second sees it's set and awaits the same promise. This is actually correct — the pattern deduplicates. But if the import fails, `lcPromise` is reset to `null`, and a concurrent caller may have already passed the `if (!lcPromise)` check and created a second promise.

### 5.4 🟡 MEDIUM: `tradingview-widget.tsx` — `Script` component always rendered
**File:** `tradingview-widget.tsx` (line ~104)

```tsx
<Script src="https://s3.tradingview.com/tv.js" ... />
{loadFailed ? <FallbackMessage /> : <div id={containerId} ... />}
```

The `<Script>` tag is always rendered, even after `loadFailed` is true. Next.js will keep trying to load the script. Should be conditionally rendered or the `onError` should prevent re-loading.

---

## 6. REAL-TIME DATA STREAMING ISSUES

### 6.1 🟠 HIGH: `candlesWithLive` creates new array on every tick
**File:** `chart-view.tsx` (lines ~120-150)

Every 3-second tick creates a new `candlesWithLive` array via `[...candles.slice(0, -1), updatedLast]` or `[...candles, newCandle]`. This triggers:
1. `Chart` component re-render
2. `ChartCanvas` candle effect → full `setData`
3. `ChartCanvas` indicator effect → full indicator rebuild (bug 2.2)
4. All sub-pane data effects → full `setData` (bug 2.3)

One tick causes ~15+ API calls to lightweight-charts for a 300-candle chart.

### 6.2 🟡 MEDIUM: Live tick guard rejects legitimate ticks during market gaps
**File:** `chart-view.tsx` (line ~137)

```tsx
if (barTime > lastCandle.t + tfMs * 2) return candles;
```

This rejects ticks more than 2 timeframes ahead. But on weekends or market closures, the last candle could be from Friday and the tick is from Sunday/Monday — the gap is legitimate. The tick is rejected, and the chart doesn't update until the next full refetch.

### 6.3 🟡 MEDIUM: `use-price-stream.ts` — no max reconnection attempts
**File:** `use-price-stream.ts` (line ~33)

```tsx
es.onerror = () => {
  es.close();
  if (!closed) {
    setState((prev) => ({ ...prev, connected: false, error: 'Connection lost' }));
    reconnectRef.current = setTimeout(connect, 3_000);
  }
};
```

If the server is down, this reconnects every 3 seconds forever. Should have a max retry count with exponential backoff.

### 6.4 🟡 MEDIUM: `use-prices.ts` — `usePrice` returns full query object + `tick`
**File:** `use-prices.ts` (line ~37)

```tsx
export function usePrice(symbol: Symbol, options?) {
  const q = usePrices([symbol], options);
  const tick = q.data?.find((t) => t.symbol === symbol);
  return { ...q, tick };
}
```

Spreading `q` includes `data` (the full `Tick[]` array) in the returned object. Consumers may accidentally use `data` instead of `tick`, or the extra property causes unnecessary re-renders if the object is used in a deps array.

---

## 7. CODE QUALITY

### 7.1 `eslint-disable @typescript-eslint/no-explicit-any` at file level
**Files:** `chart-view.tsx`, `chart-canvas.tsx`, `performance-chart.tsx`

File-level `any` disables hide potential type errors. The `any` usage is mostly in the `createMainChart` function for lightweight-charts API compatibility. Should use proper types or scoped disables.

### 7.2 `use-candles.ts` is potentially dead code
**File:** `use-candles.ts`

The chart system uses `use-chart-data.ts` (unified fetch). `use-candles.ts` provides the same functionality but without indicator support. If no other part of the app uses it, it's dead code.

### 7.3 `ChartSettings['theme']` doesn't include `'light'`
**File:** `chart-types.ts`

```tsx
export interface ChartSettings {
  theme: 'slate' | 'navy' | 'black' | 'classic';
```

But `THEME_PRESETS` has a `light` entry. The type and the data are out of sync.

### 7.4 `MainChartInstance.getChartApi()` returns `unknown`
**File:** `chart-types.ts`

```tsx
getChartApi(): unknown;
```

Consumers cast it to `IChartApi` — loses type safety. Should return `IChartApi | null`.

### 7.5 `getIndicatorColor` doesn't check `kind === 'sma'` explicitly
**File:** `chart-canvas.tsx` (line ~45)

```tsx
function getIndicatorColor(kind: string, period: number): string {
  if (kind === 'ema') { ... }
  if (period === 50) return '#10b981';
  if (period === 100) return '#ec4899';
  return '#f43f5e';
}
```

For `kind === 'sma'`, it falls through to the period checks. But for `kind === 'ema'` with period 50, it returns the EMA-specific color. For `kind === 'sma'` with period 50, it returns `#10b981` (same as what EMA 50 would return if the EMA check didn't catch it). The logic works but is fragile — if someone adds SMA 20, it would get `#f43f5e` (the default) instead of a distinct color.

### 7.6 `use-structure.ts` uses `enabled: opts.enabled !== false` instead of `?? true`
**File:** `use-structure.ts` (line ~43)

All other hooks use `opts.enabled ?? true`. This hook uses `opts.enabled !== false`. The behavior is the same for `undefined` and `true`, but `opts.enabled === 0` would be treated as `true` here (since `0 !== false`) and `false` by the other hooks (since `0 ?? true` is `0` which is falsy). Inconsistent pattern.

---

## 8. RESPONSIVE DESIGN

### 8.1 🟡 MEDIUM: TradingView widget uses fixed `70svh` height
**File:** `tradingview-widget.tsx` (line ~116)

```tsx
style={{ height: '70svh' }}
```

On a very short landscape phone, `70svh` may be too tall. On a tall tablet, it may be too short. Consider using `min(70svh, 600px)` or a responsive class.

### 8.2 🟡 MEDIUM: Chart header controls overflow on narrow screens
**File:** `chart-view.tsx` (header section)

The header has `flex-wrap` but on a 360px screen, the row with `TimeframePicker`, `StaleIndicator`, `PinToChat`, `OverlaySheet`, `ChartSettingsDrawer`, and the TradingView/Structure toggle may wrap awkwardly. The `TimeframePicker` has `overflow-x-auto` but the controls row doesn't.

### 8.3 🟡 MEDIUM: Sub-pane heights are fixed pixels
**File:** `chart.tsx`

```tsx
className="... h-[120px] ..."  // RSI
className="... h-[140px] ..."  // MACD
className="... h-[120px] ..."  // ATR
```

Fixed pixel heights don't adapt to screen size. On a small phone, 120px + 140px + 120px = 380px of sub-panes plus 60svh main chart may overflow. Consider using `svh` units or `min-h` with flexible heights.

---

## 9. MISSING FEATURES / INCOMPLETE IMPLEMENTATIONS

### 9.1 FVG and Order Block zone rectangles
**File:** `overlays.ts` (line ~21 comment)

> FVG and OB ZONES are deferred to a follow-up PR — proper rectangle rendering needs lightweight-charts custom primitives

Currently, FVGs and OBs are rendered as markers + price lines at the midpoint. This is a significant UX gap — users can't see the actual zone boundaries. The comment says "100+ lines of canvas-painting code" is needed.

### 9.2 No crosshair sync from sub-panes to main chart
**File:** `use-sub-pane-chart.ts` (line ~130)

Crosshair sync is one-way: main chart → sub-panes. Moving the crosshair on a sub-pane doesn't update the main chart or other sub-panes.

### 9.3 No `light` theme support in the UI
**File:** `chart-settings-drawer.tsx`

The `light` theme preset exists in `chart-themes.ts` but is not offered in the settings drawer and not in the `ChartSettings['theme']` type.

### 9.4 No chart screenshot/export feature
The `PinToChat` feature creates a chat thread but doesn't attach a chart screenshot. Users would need to manually screenshot.

### 9.5 No drawing tools
The custom chart has zoom controls but no drawing tools (trendlines, fibonacci, etc.). The TradingView widget has these built-in but the structure chart doesn't.

---

## 10. SUMMARY OF PRIORITIZED FIXES

| Priority | Issue | File | Effort |
|----------|-------|------|--------|
| 🔴 P0 | `applyDecimals` no-op on initial load | chart-canvas.tsx | Small |
| 🔴 P0 | ErrorBoundary doesn't reset on symbol change | chart-view.tsx | Trivial |
| 🔴 P0 | `referenceClose` ref never resets | chart-view.tsx | Trivial |
| 🔴 P0 | Full `setData` on every tick (use `update()`) | chart-canvas.tsx | Medium |
| 🔴 P0 | Indicator series rebuilt on every tick | chart-canvas.tsx | Trivial |
| 🟠 P1 | `overlaySet` uses stale candle ref | chart-view.tsx | Small |
| 🟠 P1 | ProChartView fetches unused candles | pro-chart-view.tsx | Trivial |
| 🟠 P1 | ProChartView migration is dead code | pro-chart-view.tsx | Trivial |
| 🟠 P1 | TV widget double-init on scriptLoaded | tradingview-widget.tsx | Medium |
| 🟠 P1 | Sub-panes full setData on every tick | use-sub-pane-chart.ts | Medium |
| 🟠 P1 | Inconsistent skeleton heights | loading.tsx + chart-skeleton.tsx | Trivial |
| 🟠 P1 | "IconSearch" placeholder bug | symbol-picker.tsx | Trivial |
| 🟡 P2 | PriceTag always polls off-screen | price-tag.tsx | Trivial |
| 🟡 P2 | `animate-pulse` on disabled indicators | chart-settings-drawer.tsx | Trivial |
| 🟡 P2 | Duplicated constants across 3 files | multiple | Small |
| 🟡 P2 | Duplicated `refetchIntervalFor` | 3 hook files | Small |
| 🟡 P2 | Duplicated watchlist DB query | 2 page files | Small |
| 🟡 P2 | `autoSize` + manual `resize()` conflict | chart-canvas.tsx | Trivial |
| 🟡 P2 | No max reconnection for price stream | use-price-stream.ts | Small |
| 🟡 P2 | Zoom buttons lack `aria-label` | chart.tsx | Trivial |
| 🟡 P2 | Dead `OverlayToggle` component | overlay-toggle.tsx | Trivial |
| 🟡 P2 | `light` theme preset is unreachable | chart-themes.ts + chart-types.ts | Small |



---

## E. News, Calendar, Signals & Alerts Analysis

# Deep Analysis: News, Calendar, Signals & Alerts Pages

## Summary

Analyzed 24 files across 4 feature areas. Found **48 issues** total: 12 bugs, 15 UX issues, 8 performance concerns, 5 design system drifts, 4 missing features, and 4 code quality issues.

---

## 1. NEWS

### 1.1 `news/page.tsx`

**BUG: No error handling on `listRecentArticles(120)`** (line 36)
The server component calls `await listRecentArticles(120)` with no try/catch. If the data source is down, the entire page throws a 500 with no user-friendly error boundary (no `error.tsx` exists for the news route).
**Fix:** Wrap in try/catch, render an `<EmptyState>` with a retry action on failure, or add a `news/error.tsx` boundary.

**BUG: `force-dynamic` without ISR** (line 34)
`export const dynamic = 'force-dynamic'` means every page visit hits the data source. For a news page that refreshes every few minutes, this is unnecessarily expensive. The comment says "headlines populate automatically every few minutes" — ISR with `revalidate = 300` would be more appropriate.
**Fix:** Replace with `export const revalidate = 300;` (5 min ISR) and keep `dynamic = 'force-dynamic'` only if real-time is critical.

**MISSING: No `error.tsx` for the news route**
Signals has an `error.tsx`, but news does not. An unhandled fetch failure produces an unstyled 500.
**Fix:** Add `apps/web/src/app/(app)/news/error.tsx` mirroring the signals error pattern.

**UX: `BookmarksProvider` wraps the entire page including server-rendered `SentimentSummary`** (line 42)
`BookmarksProvider` is a client context, but `SentimentSummary` is a server component that doesn't use bookmarks. Wrapping it forces it into the client boundary unnecessarily.
**Fix:** Move `<BookmarksProvider>` to wrap only `<NewsView />`.

---

### 1.2 `news/loading.tsx`

**UX: Skeleton doesn't match the actual page layout** (lines 18-24)
The loading skeleton renders a `Skeleton h-8 w-48` for the header, but the real page uses `<PageHeader>` which includes both title and description. The skeleton is missing the description placeholder, creating a layout shift on hydration.
**Fix:** Add a `Skeleton h-4 w-64` below the title skeleton to match `PageHeader`'s description.

**DESIGN DRIFT: Skeleton uses `rounded-sm` but the actual SentimentSummary uses `rounded-sm`** — this is correct, but the skeleton's inner skeleton bars use `rounded-sm` while the real component's bar uses no explicit rounding (just `overflow-hidden rounded-sm` on the container). Minor mismatch.

---

### 1.3 `news/_components/news-toolbar.tsx`

**BUG: Placeholder text contains literal "IconSearch"** (line 93)
```tsx
placeholder="IconSearch headlines…"
```
This is clearly a leftover from a find-and-replace where `Icon` icon names were substituted into text. The user sees "IconSearch headlines…" in the search box.
**Fix:** Change to `placeholder="Search headlines…"`.

**BUG: `handleRadioKeyDown` uses `document.activeElement` instead of the event target** (line 53)
```tsx
const currentIdx = radios.findIndex(r => r === document.activeElement);
```
`document.activeElement` can be unreliable during synthetic events. Should use `e.currentTarget` to scope the query and then find the focused element within that scope. In practice this works because the keydown handler is on the radiogroup container, but it's fragile if focus moves outside the container before the event fires.
**Fix:** Use `e.currentTarget.contains(document.activeElement)` guard or track focus index in state.

**UX: Symbol chips don't show counts** (lines 131-140)
Sentiment chips show labels but no article counts. Users can't tell how many articles each symbol filter will show before clicking.
**Fix:** Pass counts into `SymbolChip` and display as a badge.

**A11Y: Radiogroup keyboard navigation doesn't support Home/End** (lines 50-65)
WAI-ARIA radiogroup pattern recommends Home/End to jump to first/last radio.
**Fix:** Add `Home` → first radio, `End` → last radio handling.

---

### 1.4 `news/_components/news-view.tsx`

**BUG: `useInfiniteQuery` initial data condition may cause stale data** (lines 94-99)
```tsx
...((sentiment === 'all' && symbol === 'all' && !query) ? {
  initialData: { ... }
} : {}),
```
When the user has a URL query param (e.g. `?sentiment=positive`), `initialData` is not provided, so React Query fetches from `/api/news` even though `initialArticles` already contains all 120 articles. The client-side fetch duplicates work the server already did.
**Fix:** Always provide `initialData` for the first page, then let subsequent pages fetch from the API. Or filter `initialArticles` client-side for the active filter instead of refetching.

**BUG: `bucketByTime` uses `Date.now()` at memoization time, not at render time** (line 276)
```tsx
const now = Date.now();
```
The `buckets` memo (line 156) depends on `filtered` but `bucketByTime` internally calls `Date.now()`. The memo won't recompute when time passes, so articles won't move between buckets (e.g., "Last hour" → "Today") without a re-render trigger.
**Fix:** Pass `now` as a parameter from a time provider or include a time-based dependency in the memo.

**BUG: `formatRelative(lastRefreshed)` uses `Date.now()`-based timestamp but `lastRefreshed` is set to `Date.now()` at mount** (line 65)
On first render, `lastRefreshed = Date.now()`, so the refresh button shows "Updated just now" even though the data might be stale from ISR/cache. This is misleading.
**Fix:** Initialize `lastRefreshed` from the article data's most recent `publishedAt` timestamp.

**PERF: `allArticles` memo dependency on `initialArticles` causes unnecessary recompute** (lines 102-105)
```tsx
const allArticles = useMemo(() => {
  if (!data) return initialArticles;
  return data.pages.flatMap((page) => page.items);
}, [data, initialArticles]);
```
When `data` is present, `initialArticles` is irrelevant but still in the dep array. If the parent re-renders with a new `initialArticles` reference (e.g., after `router.refresh()`), this memo recomputes unnecessarily.
**Fix:** Remove `initialArticles` from deps when `data` is present, or use `data ?? initialArticles` without memo.

**PERF: No list virtualization for 120+ articles** (lines 241-247)
All articles render as `<ArticleCard>` in a flat list. With 120 articles, this creates 120+ DOM subtrees. On mobile, this can cause jank.
**Fix:** Use `react-window` or `@tanstack/react-virtual` for virtualized rendering.

**UX: `savedOnly` toggle uses `IconBookmark` for both states** (line 202)
```tsx
{savedOnly ? <IconBookmark className="size-3.5" /> : <IconBookmark className="size-3.5" />}
```
Both branches render the same icon. The saved state should show a filled bookmark.
**Fix:** Use `className={cn('size-3.5', savedOnly && 'fill-current')}` for the active state.

**BUG: Empty state description contains literal "IconDeviceFloppy"** (line 226)
```tsx
description={savedOnly ? 'IconDeviceFloppy articles by tapping the bookmark icon...' : ...}
```
Another find-and-replace artifact. Users see "IconDeviceFloppy articles by tapping..."
**Fix:** Change to "Save articles by tapping the bookmark icon..."

**PERF: IntersectionObserver effect re-creates on every `isFetchingNextPage` change** (lines 159-172)
The effect depends on `[fetchNextPage, hasNextPage, isFetchingNextPage]`. When `isFetchingNextPage` flips to `true` during a fetch, the observer is torn down and recreated.
**Fix:** Use a ref to track `isFetchingNextPage` and keep the observer stable.

**BUG: `useQueryState` type assertion is unsafe** (lines 62-63)
```tsx
const [sentiment, setSentiment] = useQueryState('sentiment', { defaultValue: 'all' }) as [SentimentFilter, (val: SentimentFilter) => void];
```
`useQueryState` returns `string | null`, not `SentimentFilter`. The cast hides the fact that the URL could contain an invalid sentiment value (e.g., `?sentiment=foo`). The filter logic downstream assumes the value is always valid.
**Fix:** Validate the URL value against the `SentimentFilter` union and fall back to `'all'` on invalid values.

---

### 1.5 `news/_components/refresh-button.tsx`

**BUG: Dual loading state (`refreshing` + `pending`) is redundant** (lines 27-28)
```tsx
const [pending, startTransition] = useTransition();
const [refreshing, setRefreshing] = useState(false);
```
`useTransition` already tracks pending state. The separate `refreshing` state is set to `true` at the start and `false` in `finally`, but `startTransition` already provides this. The `isLoading = refreshing || pending` combination means the button can show loading even after the transition completes if there's a race.
**Fix:** Remove `refreshing` state and use `pending` alone, or remove `useTransition` and use only `refreshing`.

**UX: No debounce/guard on rapid clicks** (line 32)
Multiple rapid clicks fire multiple fetch requests to the cron endpoint.
**Fix:** Disable the button during `isLoading` (already done via `loading` prop, but the `onClick` still fires).

---

### 1.6 `news/_components/sentiment-summary.tsx`

**UX: Sentiment bar segment order doesn't match legend order** (lines 82-110 vs 113-120)
The bar renders positive → neutral → none → negative, but the legend lists Bullish → Bearish → Neutral → Untagged. The visual order doesn't match the reading order.
**Fix:** Reorder bar segments to match legend: positive → negative → neutral → none.

**A11Y: Sentiment bar has no text alternative** (lines 82-110)
The stacked bar is `aria-hidden="true"` but the `<ul>` below it doesn't reference it. Screen readers get the counts but not the visual proportion.
**Fix:** Add an `aria-label` on the bar container summarizing the split, or add visually-hidden text describing the percentages.

---

### 1.7 `components/news/article-card.tsx`

**BUG: `article.sentimentScore` may be undefined (not null) when sentiment is set** (line 141)
```tsx
{article.sentiment && article.sentimentScore !== null ? (
```
If `sentimentScore` is `undefined` (not `null`), `undefined !== null` is `true`, and `article.sentimentScore.toFixed(2)` will throw.
**Fix:** Use `article.sentimentScore != null` (loose equality) or check `typeof article.sentimentScore === 'number'`.

**BUG: `cleanNewsText` doesn't handle all HTML entities** (lines 53-65)
The function handles common entities but misses numeric entities like `&#8217;` (right single quote), `&#8230;` (ellipsis), and named entities like `&mdash;`, `&ndash;`, `&hellip;`.
**Fix:** Use a proper HTML entity decoder or the DOM API: `new DOMParser().parseFromString(raw, 'text/html').body.textContent`.

**PERF: `ArticleCard` wrapper creates a new `toggle` function on every render** (line 231)
```tsx
const { has, toggle } = useBookmarks();
```
`toggle` is `useCallback`-memoized in the context, but `has` is called inline: `const saved = has(article.id)`. This is fine, but the wrapper component itself isn't memoized, so every parent re-render creates a new `<ArticleCardInner>` element. The `memo` on `ArticleCardInner` helps, but the wrapper still re-renders.
**Fix:** Wrap `ArticleCard` in `React.memo` as well.

**UX: `aria-label` contains literal "IconBookmark"** (line 196)
```tsx
aria-label={saved ? 'Remove bookmark' : 'IconBookmark article'}
```
Another find-and-replace artifact. Screen readers announce "IconBookmark article."
**Fix:** Change to `aria-label={saved ? 'Remove bookmark' : 'Bookmark article'}`.

**A11Y: Card has nested interactive elements** (lines 123-168, 179-216)
The entire card body is an `<a>` tag, and inside the overlay there are additional `<a>` and `<button>` elements. While `stopPropagation` is used, nested interactive elements inside an `<a>` are invalid HTML per the spec.
**Fix:** Restructure so the card isn't a single `<a>` — use a `<div>` with a stretched link overlay pattern instead.

---

### 1.8 `components/news/bookmarks-context.tsx`

**BUG: `useLocalStorage` cross-tab sync not visible in this file** (line 22)
The `use-bookmarks.tsx` comment says "Cross-tab sync via the `storage` event" but `bookmarks-context.tsx` uses `useLocalStorage` without any visible `storage` event listener. The sync depends entirely on `useLocalStorage`'s implementation. If it doesn't listen for `storage` events, cross-tab sync doesn't work.
**Fix:** Verify `useLocalStorage` implements `window.addEventListener('storage', ...)` or add it here.

**PERF: `toggleBookmark` creates a new Set on every toggle** (lines 30-37)
```tsx
setBookmarkIds((prev) => {
  const next = new Set(prev);
  ...
  return [...next];
});
```
This is O(n) per toggle. For small bookmark lists this is fine, but the pattern creates a new array reference every time, causing all consumers to re-render.
**Fix:** This is acceptable for small lists. Consider a Map for large sets.

---

### 1.9 `components/news/live-timestamp.tsx`

**MISSING: Component is imported nowhere in the analyzed files**
`LiveTimestamp` uses `useTime().formatRelative` but `news-view.tsx` and `article-card.tsx` both import `formatRelative` from `@/lib/format` directly instead. This component appears to be dead code.
**Fix:** Either use `LiveTimestamp` in `ArticleCard` and `NewsView`, or remove it.

---

### 1.10 `components/news/use-bookmarks.tsx`

**CODE QUALITY: `useBookmarks` returns `list` as the raw array** (line 10)
```tsx
list: bookmarks,
```
Consumers that use `list` (e.g., `news-view.tsx` line 66: `const { count: savedCount, list: savedIds } = useBookmarks()`) get the raw array, which changes reference on every bookmark toggle. This causes downstream `useMemo` deps to invalidate.
**Fix:** Return a memoized Set or stable reference.

---

## 2. CALENDAR

### 2.1 `calendar/page.tsx`

**BUG: `metadata.title` is "IconCalendar" instead of "Calendar"** (line 30)
```tsx
export const metadata: Metadata = { title: 'IconCalendar' };
```
Another find-and-replace artifact. The browser tab title shows "IconCalendar".
**Fix:** Change to `{ title: 'Calendar' }`.

**BUG: `CalendarHero` is dynamically imported but `CalendarView` is not** (lines 26-28)
```tsx
const CalendarHero = nextDynamic(() => import('./_components/calendar-hero').then((m) => m.CalendarHero));
import { CalendarView } from './_components/calendar-view';
```
`CalendarHero` is a client component using `useTime()`, but so is `CalendarView`. The dynamic import of `CalendarHero` but static import of `CalendarView` is inconsistent. The dynamic import adds a loading boundary for `CalendarHero` but not `CalendarView`, creating uneven UX.
**Fix:** Either dynamically import both or statically import both.

**BUG: `RefreshButton` imported from `../news/_components/refresh-button`** (line 29)
Cross-feature import creates a coupling between calendar and news. If news is refactored, calendar breaks.
**Fix:** Extract `RefreshButton` to a shared component at `@/components/ui/refresh-button.tsx`.

**MISSING: No error handling on `listUpcomingEvents()`** (line 32)
Same as news — no try/catch, no `calendar/error.tsx`.
**Fix:** Add error boundary or try/catch with fallback UI.

---

### 2.2 `calendar/loading.tsx`

**UX: Skeleton doesn't include toolbar placeholder**
The real page renders `<CalendarToolbar>` with filter chips, but the loading skeleton jumps straight from the hero placeholder to event cards. This causes a layout shift when the toolbar appears.
**Fix:** Add a skeleton row for the toolbar (two rows of small skeleton chips).

---

### 2.3 `calendar/_components/calendar-hero.tsx`

**BUG: `events` prop is optional with default `[]` but page always passes events** (line 29)
```tsx
export function CalendarHero({ events = [] }: CalendarHeroProps) {
```
The page always passes `events` (either from `listUpcomingEvents()` or the empty state branch). The default is dead code. More importantly, the `?` in `CalendarHeroProps` (`events?: readonly EconomicEvent[]`) is misleading.
**Fix:** Make `events` required in the props interface.

**BUG: `startOfDay` uses local timezone** (line 142)
```tsx
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
```
`setHours(0,0,0,0)` uses the browser's local timezone. For a forex calendar, events are typically in EST/UTC. "Today's events" may be incorrect for users in different timezones.
**Fix:** Use UTC-based day calculation or the user's configured timezone.

**BUG: Duplicate `Countdown` component** (lines 97-120)
`CalendarHero` defines its own `Countdown` component, and `event-card.tsx` also defines a `Countdown` component (lines 246-258). They have slightly different styling (the hero version has `text-warn` for <1h, the card version uses `imminent` prop).
**Fix:** Extract a shared `Countdown` component.

**BUG: Duplicate `startOfDay` function** (line 142)
Same function exists in `calendar-view.tsx` (line 224), `news-view.tsx` (line 307), and here. Four copies of the same utility.
**Fix:** Extract to `@/lib/datetime` or similar shared utility.

**PERF: Multiple `.filter()` passes over `events`** (lines 34-41)
```tsx
const upcoming = events.filter(...);
const counts = { high: upcoming.filter(...).length, medium: upcoming.filter(...).length, low: upcoming.filter(...).length };
```
Three separate filter passes over `upcoming`. For small lists this is fine, but it's O(3n).
**Fix:** Single `reduce` pass to compute all counts.

---

### 2.4 `calendar/_components/calendar-toolbar.tsx`

**BUG: `handleRadioKeyDown` is duplicated from `news-toolbar.tsx`** (lines 19-33)
Exact same function copy-pasted.
**Fix:** Extract to a shared `@/lib/a11y` utility.

**DESIGN DRIFT: Importance filter active style differs from news sentiment filter** (lines 66-70)
Both use `bg-fg text-black` for active, but importance uses `text-xs` while sentiment uses `text-xs` — consistent. However, the glyph for "All" is `·` in calendar but `·` in news. The "High" glyph is `▲` (calendar) vs `▲` (news for Bullish). Consistent but the mapping is implicit, not documented.

**MISSING: No XAU/GBP currency filter option** (lines 42-47)
```tsx
const CURRENCIES = [
  { value: 'all', label: 'All' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
];
```
The page description mentions "XAU / EUR / GBP / USD" but XAU is not a currency filter option. Events tagged with XAU currency can't be filtered.
**Fix:** Add `{ value: 'XAU', label: 'XAU' }` to the CURRENCIES array.

---

### 2.5 `calendar/_components/calendar-view.tsx`

**BUG: `useQueryState` type assertions are unsafe** (lines 50-51)
Same issue as news-view.tsx — URL values are cast to `ImportanceFilter` / `CurrencyFilter` without validation.
**Fix:** Validate URL params and fall back to `'all'`.

**BUG: `isLoading` from `useQuery` with `initialData` is always `false`** (line 55-63, 102)
```tsx
const { data: events = initialEvents, isLoading, isError, error, refetch } = useQuery<EconomicEvent[]>({
  ...
  initialData: initialEvents,
});
```
When `initialData` is provided, `isLoading` is `false` on first render. The loading skeleton (lines 102-109) will never show. This is actually correct behavior (we have initial data), but the `isLoading` check is dead code.
**Fix:** Remove the `isLoading` branch or use `isFetching` for background refetch loading states.

**BUG: `Date.now()` called in render for past-event opacity** (line 174)
```tsx
className={e.date < Date.now() ? 'opacity-60' : ''}
```
`Date.now()` is called during render but isn't in any dependency array. The opacity won't update when an event transitions from future to past without a re-render.
**Fix:** Use `useTime()` hook for consistent time tracking.

**BUG: `bucket()` function uses `Date.now()` internally** (line 194)
Same issue as `news-view.tsx`'s `bucketByTime` — the bucketing won't update as time passes.
**Fix:** Pass `now` as a parameter.

**PERF: Auto-refresh calls `refetch()` every 5 minutes but doesn't use `startTransition`** (lines 66-72)
```tsx
useEffect(() => {
  const id = setInterval(() => {
    refetch();
    setLastRefreshed(Date.now());
  }, AUTO_REFRESH_MS);
  return () => clearInterval(id);
}, [refetch]);
```
`refetch()` triggers a state update outside of a transition, which can cause jank if the response is large.
**Fix:** Wrap in `startTransition`.

**BUG: `manualRefresh` toast says "IconCalendar refreshed"** (line 79)
```tsx
toast.success('IconCalendar refreshed');
```
Another find-and-replace artifact. Users see "IconCalendar refreshed" toast.
**Fix:** Change to `toast.success('Calendar refreshed')`.

**MISSING: `showPast` state is not synced to URL** (line 52)
```tsx
const [showPast, setShowPast] = useState(false);
```
Unlike `importance` and `currency` which use `useQueryState`, `showPast` is local state. Refreshing the page resets it.
**Fix:** Use `useQueryState('past', { defaultValue: 'false' })`.

---

### 2.6 `components/calendar/event-card.tsx`

**BUG: `reminderSet` is a module-level `Set` that never gets cleaned up** (line 274)
```tsx
const reminderSet = new Set<string>();
```
Armed reminders are added to this Set but never removed. If the user navigates away and back, the Set persists (module scope), and the "Remind me" button shows "Reminded" even though the `setTimeout` was cleared on unmount.
**Fix:** Use a ref or context that's scoped to the component tree, or clear entries on unmount.

**BUG: `setTimeout` reminder is not cleared on unmount** (lines 306-316)
The `window.setTimeout` fires even if the component unmounts (the `catch` block handles errors, but the notification still fires if the tab is still open). More importantly, if the user navigates away and the component unmounts, the timeout still runs.
**Fix:** Store the timeout ID in a ref and clear it on unmount.

**BUG: `beatMiss` doesn't handle negative forecasts correctly** (lines 235-243)
```tsx
const isSignificant = event.forecast !== 0
  ? Math.abs(delta) / Math.abs(event.forecast) > 0.01
  : Math.abs(delta) > 0.01;
```
For forecasts near zero (e.g., forecast = 0.001), the significance threshold is extremely sensitive. A delta of 0.001 would be 100% of forecast and flagged as significant.
**Fix:** Use an absolute minimum threshold: `Math.max(Math.abs(delta) / Math.abs(event.forecast), Math.abs(delta)) > 0.01`.

**A11Y: `timeLabel` uses `toLocaleString(undefined, ...)`** (lines 260-267)
`undefined` locale uses the browser default, which may not match the user's configured timezone preference. For a trading app, timezone consistency is important.
**Fix:** Use the user's timezone from settings or UTC.

**UX: "Remind me" button says "Reminded" after arming** (line 333)
```tsx
{armed ? 'Reminded' : 'Remind me'}
```
"Reminded" implies the reminder has already fired. Should be "Reminder set" or "Armed".
**Fix:** Change to `{armed ? 'Reminder set' : 'Remind me'}`.

---

## 3. SIGNALS

### 3.1 `signals/page.tsx`

**BUG: `revalidate = 60` but page uses `auth()` which requires dynamic rendering** (lines 8, 17)
```tsx
export const revalidate = 60;
...
const session = await auth();
```
`auth()` reads cookies, which opts the page into dynamic rendering. `revalidate = 60` is ignored when the page is dynamic. The page is effectively `force-dynamic` but with a misleading `revalidate` export.
**Fix:** Remove `revalidate` or use `export const dynamic = 'force-dynamic'` for clarity.

**MISSING: No loading state between auth check and data fetch** (lines 17-24)
The page awaits both `auth()` and the data fetches in parallel, but if `auth()` is slow, the user sees the `loading.tsx` skeleton. This is fine, but the `Promise.all` means a slow `listSignals` blocks `computeSignalStats` and vice versa.
**Fix:** This is actually correct (parallel fetch). No change needed.

**UX: No empty state for auth redirect** (line 18)
If `!session?.user?.id`, the page redirects to `/login` with no user feedback. The redirect is instant but may confuse users who expected to see signals.
**Fix:** This is standard Next.js pattern. Acceptable.

**MISSING: No copyright header**
Unlike all other files, `signals/page.tsx` has no Apache 2.0 copyright header.
**Fix:** Add the standard copyright header.

---

### 3.2 `signals/loading.tsx`

**UX: Skeleton gap doesn't match actual page** (line 19)
Loading uses `gap-4` but the actual page uses `gap-6` (line 28 of `page.tsx`). This causes a subtle layout shift.
**Fix:** Change `gap-4` to `gap-6` in the loading skeleton.

---

### 3.3 `signals/error.tsx`

**CODE QUALITY: `console.error` in production** (line 21)
```tsx
console.error('Signals page error:', error);
```
This logs to the browser console in production. Should use a proper error reporting service.
**Fix:** Replace with an error reporting call (e.g., Sentry) or guard with `process.env.NODE_ENV === 'development'`.

**UX: Error button uses inline styles instead of Button component** (lines 34-41)
```tsx
<button className="bg-fg text-black hover:bg-fg-muted inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold transition-colors">
```
This duplicates the `Button` component's styles manually instead of using `<Button>`.
**Fix:** Use `<Button onClick={reset} variant="default">` for consistency.

---

### 3.4 `signals/_components/signals-dashboard.tsx`

**BUG: `stats.total === 0` check doesn't account for `signals.length > 0`** (line 22)
```tsx
if (stats.total === 0) {
  return <EmptyState ... />;
}
```
If `stats.total` is 0 but `signals` has items (race condition between `listSignals` and `computeSignalStats`), the user sees "No signals yet" even though signals exist.
**Fix:** Check `signals.length === 0 && stats.total === 0` or just `signals.length === 0`.

**BUG: `signal.metadata` cast is unsafe** (line 52)
```tsx
const metadata = signal.metadata as Record<string, unknown> | null;
const reasoning = metadata?.reasoning as string | undefined;
```
If `metadata` is a JSON string instead of an object, the cast produces garbage. If `reasoning` is a number or object, it's cast to `string` without validation.
**Fix:** Use `typeof metadata === 'object'` guard and `typeof reasoning === 'string'` check.

**PERF: `SignalCard` not memoized** (line 42)
Each `SignalCard` re-renders when any state in the parent changes (e.g., expanding one card re-renders all cards).
**Fix:** Wrap `SignalCard` in `React.memo`.

**PERF: `statusStyles` object recreated on every render** (lines 40-47)
```tsx
const statusStyles: Record<string, string> = { ... };
```
This object is recreated on every `SignalCard` render.
**Fix:** Move to module scope as a constant.

**UX: `SignalFeedback` component imported from settings track-record** (line 12)
```tsx
import { SignalFeedback } from '@/app/(app)/settings/track-record/_components/signal-feedback';
```
Cross-feature import from settings into signals. This creates a coupling dependency.
**Fix:** Extract `SignalFeedback` to a shared component.

**UX: No pagination or "load more" for signals** (line 31)
The page fetches `limit: 50` signals and renders all of them. If a user has 50+ signals, they can't see older ones.
**Fix:** Add pagination or infinite scroll like the news page.

**A11Y: Expand/collapse button has no `aria-controls`** (lines 66-73)
```tsx
<button onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-label="Toggle reasoning">
```
Missing `aria-controls` pointing to the reasoning panel's ID.
**Fix:** Add `id` to the reasoning div and `aria-controls` to the button.

**DESIGN DRIFT: `gap-6` in signals vs `gap-4` in news/calendar** (line 29)
Signals uses `gap-6` for the main layout, while news and calendar use `gap-4`. Inconsistent vertical rhythm.
**Fix:** Standardize to `gap-4` or `gap-6` across all feature pages.

**DESIGN DRIFT: Stat cards use `p-4` but signal cards use `p-3`** (lines 82, 45)
Different padding tokens for cards in the same view.
**Fix:** Standardize card padding.

---

## 4. ALERTS

### 4.1 `alerts/page.tsx`

**BUG: No `dynamic` or `revalidate` export** (line 24)
The page is a server component but has no caching directive. It defaults to static rendering, but since `AlertList` is a client component that fetches from `/api/alerts`, this is fine. However, the page has no metadata beyond title.
**Fix:** Add `export const dynamic = 'force-dynamic'` for explicitness, or leave as-is since the client handles data.

**MISSING: No `error.tsx` for the alerts route**
Like news, there's no error boundary. If the page throws, users get an unstyled 500.
**Fix:** Add `alerts/error.tsx`.

---

### 4.2 `alerts/loading.tsx`

**UX: Skeleton doesn't match actual page layout**
The real page has a `PageHeader` (title + description) then `AlertList` (filter bar + alert rows). The skeleton has a title skeleton and cards but no filter bar placeholder.
**Fix:** Add a skeleton for the filter `Segmented` control.

---

### 4.3 `alerts/_components/alert-form.tsx`

**BUG: `alertSchema` uses deprecated Zod API** (line 45)
```tsx
z.number({ invalid_type_error: 'Level must be a number' })
```
`invalid_type_error` was deprecated in Zod 3.x in favor of `error` function or `message` param. May break on Zod 4.
**Fix:** Use `z.number({ message: 'Level must be a number' })` or the `error` callback pattern.

**BUG: `buildRule` returns `unknown` type** (line 488)
```tsx
function buildRule(...): unknown | null {
```
The return type is `unknown | null` which is just `unknown`. The function constructs typed objects but the return type discards the type information.
**Fix:** Use a proper union type or `z.infer<typeof alertSchema>['rule'] | null`.

**BUG: `PreviewCallout` doesn't abort stale fetch requests** (lines 523-554)
The debounce timer is cleared on input change, but if a fetch is already in-flight when the timer is cleared, the fetch continues and its response may overwrite a newer state.
**Fix:** Use an `AbortController` to cancel in-flight requests.

**BUG: `note` maxLength mismatch** (lines 397, 65)
```tsx
maxLength={280}  // Input attribute
...
z.string().max(1000, 'Note must be under 1000 characters')  // Schema
```
The HTML input limits to 280 characters but the schema allows 1000. The validation will never trigger because the input prevents typing more than 280.
**Fix:** Align both to the same value (either 280 or 1000).

**BUG: `snoozeHours` validation doesn't check `NaN`** (lines 123, 185)
```tsx
const parsedSnooze = snoozeHours ? Number(snoozeHours) : 0;
```
If `snoozeHours` is a non-numeric string like "abc", `Number("abc")` returns `NaN`. The schema `z.number().min(0).max(168)` will catch this, but the error message will be confusing.
**Fix:** Add `Number.isFinite(parsedSnooze)` check before schema validation.

**UX: `touched` Set is recreated on every `touch()` call** (line 92)
```tsx
const touch = (field: string) => setTouched((prev) => new Set(prev).add(field));
```
`new Set(prev).add(field)` mutates the new Set (which is fine), but the function is recreated on every render. This causes child components that receive `touch` to re-render.
**Fix:** Wrap `touch` in `useCallback`.

**UX: Form doesn't reset `type`, `symbol`, `tf`, `direction` after submit** (lines 232-233)
```tsx
setLevel('');
setNote('');
```
Only `level` and `note` are cleared. The form keeps the rule type, symbol, timeframe, and direction. This is intentional (users often create multiple alerts for the same symbol), but `snoozeHours` and `channels` are also not reset.
**Fix:** Document this as intentional or reset all fields.

**PERF: `fieldErrors` memo includes `touched` Set in deps** (line 117)
```tsx
}, [level, indicator, channels, note, touched, type]);
```
`touched` is a Set, which is recreated on every `touch()` call. The memo correctly recomputes, but the Set reference comparison means the memo always invalidates when any field is touched.
**Fix:** This is correct behavior. No change needed.

**A11Y: Indicator pills have no `aria-pressed` or `role`** (lines 288-301)
The indicator selection buttons don't communicate their selection state to screen readers.
**Fix:** Add `aria-pressed={indicator === ind}` to each pill button.

**A11Y: Delivery method checkboxes lack `aria-describedby` for error** (lines 358-383)
When `fieldErrors.channels` is set, the error `<p>` isn't associated with the checkboxes via `aria-describedby`.
**Fix:** Add `aria-describedby="channels-error"` and `id="channels-error"` to the error paragraph.

---

### 4.4 `alerts/_components/alert-list.tsx`

**BUG: `AlertRow` IntersectionObserver swipe gesture is fragile** (lines 202-261)
The swipe-to-reveal pattern uses `IntersectionObserver` with `root: track` and threshold `[0.3, 0.95]`. This has several issues:
1. **`entry.boundingClientRect.x` comparison** (line 235): Using `x` position to determine swipe direction is unreliable on RTL layouts or when the track is transformed.
2. **No user gesture check**: The observer fires on any scroll, including programmatic `scrollTo` calls. The `isTriggered` flag mitigates this but can get out of sync.
3. **`onToggle`/`onDelete` in effect deps** (line 261): These are new function references on every parent render, causing the effect to tear down and recreate the observer on every render.
**Fix:** Use a touch gesture library (e.g., `react-swipeable`) or stabilize `onToggle`/`onDelete` with `useCallback` in the parent.

**BUG: `toggle` mutation sends `firedAt: active ? null : undefined`** (line 67)
```tsx
body: JSON.stringify({ active, firedAt: active ? null : undefined }),
```
When `active` is `true` (re-arming), it sends `firedAt: null`. When `active` is `false` (pausing), it sends `firedAt: undefined`. `JSON.stringify` omits `undefined` values, so pausing doesn't send `firedAt` at all. This is probably intentional but the ternary is confusing.
**Fix:** Simplify to `body: JSON.stringify({ active })` if the server handles `firedAt` independently, or comment the intent.

**BUG: `StatusIcon` logic is incorrect for fired alerts** (line 196)
```tsx
const StatusIcon = alert.active ? IconBell : alert.firedAt ? IconBellRinging : IconBellOff;
```
If an alert is `active: true` AND has `firedAt` set (re-armed after firing), it shows `IconBell`. If `active: false` AND `firedAt` is set, it shows `IconBellRinging`. But a fired-and-paused alert should show `IconBellOff`, not `IconBellRinging`. The logic should be:
```tsx
const StatusIcon = alert.active ? IconBell : alert.firedAt ? IconBellOff : IconBellOff;
```
Or better:
```tsx
const StatusIcon = alert.active ? IconBell : IconBellOff;
```
**Fix:** Rethink the icon logic. `IconBellRinging` should be used for recently-fired alerts, not paused ones.

**BUG: `filteredAlerts` filter logic for "past" is inconsistent** (lines 100-104)
```tsx
if (filter === 'active') return a.active && !a.firedAt;
if (filter === 'past') return !!a.firedAt || !a.active;
```
"Active" filter shows alerts that are active AND not fired. "Past" filter shows alerts that are fired OR not active. But an alert that is `active: false` and never fired (manually paused) shows under "past" — that's a paused alert, not a past one.
**Fix:** Use three states: active, paused, past (fired). Or rename "past" to "inactive".

**PERF: `filteredAlerts` is not memoized** (line 100)
```tsx
const filteredAlerts = data?.alerts.filter((a) => { ... });
```
The filter runs on every render, not just when `data` or `filter` changes.
**Fix:** Wrap in `useMemo` with `[data, filter]` deps.

**UX: Fixed width `w-[200px]` on filter container** (line 109)
```tsx
<div className="w-[200px]">
```
Fixed pixel width doesn't adapt to different screen sizes. On very narrow screens (320px), 200px may be too wide for the filter + the stale indicator.
**Fix:** Use `flex-1` or `max-w-[200px]` with `min-w-0`.

**UX: "New alert" button at the bottom** (lines 174-181)
The "New alert" button is below the alert list, requiring users to scroll past all alerts to create a new one. On mobile with many alerts, this is poor UX.
**Fix:** Move the "New alert" button to the top toolbar, next to the filter.

**A11Y: Swipe action has no keyboard equivalent** (lines 202-261)
The swipe-to-toggle/delete pattern is mouse/touch only. Keyboard users can only use the explicit toggle/delete buttons (lines 348-368), which is good, but the swipe actions aren't discoverable.
**Fix:** Add a visual hint or tooltip explaining the swipe gesture.

**DESIGN DRIFT: Alert rows use `rounded-sm` but also `hover:shadow-lg`** (line 264)
```tsx
className="relative overflow-hidden rounded-sm border border-border bg-bg-elev-1 transition-all duration-200 hover:shadow-lg"
```
`shadow-lg` is a large shadow for a small card. Other cards in the app (news, calendar) don't use shadows on hover — they use `hover:bg-bg-elev-2`.
**Fix:** Replace `hover:shadow-lg` with `hover:bg-bg-elev-2` for consistency.

**CODE QUALITY: `NodeJS.Timeout` type in browser code** (line 219)
```tsx
let timer: NodeJS.Timeout;
```
`NodeJS.Timeout` is a Node.js type. In the browser, `setTimeout` returns `number`. This may cause type errors in strict browser TS configs.
**Fix:** Use `ReturnType<typeof setTimeout>` instead.

---

## 5. Cross-Cutting Issues

### 5.1 Find-and-Replace Artifacts (CRITICAL)

Multiple files contain literal icon names in user-facing strings, indicating a botched find-and-replace of icon references:

| File | Line | Text | Should Be |
|------|------|------|-----------|
| `news-toolbar.tsx` | 93 | `placeholder="IconSearch headlines…"` | `"Search headlines…"` |
| `news-view.tsx` | 226 | `'IconDeviceFloppy articles by tapping...'` | `'Save articles by tapping...'` |
| `article-card.tsx` | 196 | `aria-label='IconBookmark article'` | `'Bookmark article'` |
| `calendar/page.tsx` | 30 | `title: 'IconCalendar'` | `title: 'Calendar'` |
| `calendar-view.tsx` | 79 | `toast.success('IconCalendar refreshed')` | `'Calendar refreshed'` |
| `event-card.tsx` | 19 | `// IconCalendar event card` | `// Calendar event card` |

### 5.2 Duplicated Utilities

- `handleRadioKeyDown`: copied in `news-toolbar.tsx` and `calendar-toolbar.tsx`
- `startOfDay`: copied in `news-view.tsx`, `calendar-view.tsx`, `calendar-hero.tsx`
- `Countdown`: duplicated in `calendar-hero.tsx` and `event-card.tsx`
- `formatRelative` import: imported from `@/lib/format` in multiple files while `LiveTimestamp` component exists but is unused

### 5.3 Inconsistent Data Fetching Patterns

| Feature | Fetch Pattern | URL State | Auto-refresh |
|---------|--------------|-----------|---------------|
| News | `useInfiniteQuery` | `nuqs` (q, sentiment, symbol) | 5 min `router.refresh()` |
| Calendar | `useQuery` | `nuqs` (importance, currency) | 5 min `refetch()` |
| Signals | Server fetch | None | None (ISR 60s, but dynamic) |
| Alerts | `useQuery` | None (local state) | None (staleTime 10s) |

No consistent pattern across features. News uses infinite query, calendar uses regular query, signals uses server fetch, alerts uses client query with staleTime.

### 5.4 Missing Error Boundaries

| Route | Has `error.tsx` | Has `loading.tsx` |
|-------|----------------|-------------------|
| News | ❌ | ✅ |
| Calendar | ❌ | ✅ |
| Signals | ✅ | ✅ |
| Alerts | ❌ | ✅ |

### 5.5 Time Handling Inconsistency

- `news-view.tsx` uses `Date.now()` directly
- `calendar-hero.tsx` and `event-card.tsx` use `useTime()` from time provider
- `calendar-view.tsx` uses `Date.now()` directly
- `live-timestamp.tsx` uses `useTime().formatRelative`
- `article-card.tsx` uses `formatRelative` from `@/lib/format`

The `useTime()` provider exists but is used inconsistently. Components using `Date.now()` won't update their time-based UIs (countdowns, relative times) without a re-render trigger.

### 5.6 Type Safety with `useQueryState`

Both `news-view.tsx` and `calendar-view.tsx` use unsafe type assertions on `useQueryState` return values. URL params are strings, but they're cast to union types without validation. A malformed URL (e.g., `?sentiment=foo`) will pass the cast and potentially cause runtime errors in filter logic.

---

## 6. Priority Summary

### Critical (User-Visible Bugs)
1. **"IconSearch headlines…" placeholder** — news-toolbar.tsx:93
2. **"IconDeviceFloppy articles…" empty state** — news-view.tsx:226
3. **"IconBookmark article" aria-label** — article-card.tsx:196
4. **"IconCalendar" page title** — calendar/page.tsx:30
5. **"IconCalendar refreshed" toast** — calendar-view.tsx:79
6. **`article.sentimentScore` undefined crash** — article-card.tsx:141
7. **Note maxLength mismatch (280 vs 1000)** — alert-form.tsx:397/65
8. **`StatusIcon` logic wrong for fired alerts** — alert-list.tsx:196

### High (Functional Issues)
9. **No error boundaries for news/calendar/alerts** — missing error.tsx
10. **`bucketByTime`/`bucket` use `Date.now()` without re-render trigger** — news-view.tsx, calendar-view.tsx
11. **`useQueryState` unsafe type assertions** — news-view.tsx:62-63, calendar-view.tsx:50-51
12. **`PreviewCallout` doesn't abort stale fetches** — alert-form.tsx:523
13. **`reminderSet` module-level Set never cleaned** — event-card.tsx:274
14. **`setTimeout` reminder not cleared on unmount** — event-card.tsx:306
15. **`stats.total === 0` race condition** — signals-dashboard.tsx:22

### Medium (UX/Performance)
16. **No list virtualization for 120+ news articles** — news-view.tsx
17. **`AlertRow` IntersectionObserver effect unstable deps** — alert-list.tsx:261
18. **`SignalCard` not memoized** — signals-dashboard.tsx:42
19. **`filteredAlerts` not memoized** — alert-list.tsx:100
20. **"New alert" button at bottom of page** — alert-list.tsx:174
21. **`showPast` not synced to URL** — calendar-view.tsx:52
22. **`startOfDay` uses local timezone** — calendar-hero.tsx:142

### Low (Polish/Consistency)
23. **Duplicated utilities across features** — handleRadioKeyDown, startOfDay, Countdown
24. **`LiveTimestamp` component is dead code** — live-timestamp.tsx
25. **Inconsistent gap tokens (gap-4 vs gap-6)** — across all features
26. **`console.error` in production** — signals/error.tsx:21
27. **Cross-feature imports** — calendar imports from news, signals from settings
28. **`NodeJS.Timeout` in browser code** — alert-list.tsx:219



---

## F. Journal System Analysis

# Journal System — Deep Analysis Report

## Overview

The journal system is a trading journal with entry logging, live PnL tracking, analytics breakdowns, AI trade reviews, and CSV import. The architecture is sound overall, but there are **critical bugs** (icon names rendered as UI text, broken R-distribution logic, hook violations), **data integrity issues** (client-side timestamps, missing CSRF, schema mismatches), and **design system drift** (custom modal vs. project Dialog, hardcoded values, non-semantic HTML).

**Severity scale:** 🔴 Critical · 🟠 Major · 🟡 Minor · 🔵 Polish

---

## 1. `page.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 1.1 | 🔵 | 29 | `metadata` title is `'Journal'` — no app name suffix. Other pages may use `'Journal \| HamaFX'` for consistent browser tabs. | Check other page metadata patterns and align. |
| 1.2 | 🟡 | 27 | `PageHeader` description says "Win-rate + R-multiple stats compute on close" — but the system also computes live unrealized R on open trades (entry-list). Description is misleading. | Update to "Track trades with live PnL, R-multiple analytics, and AI reviews." |

---

## 2. `loading.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 2.1 | 🟠 | 24 | `grid grid-cols-3` is not responsive — 3 stat skeleton columns on a 400px mobile panel is too cramped (~120px each). The actual `StatsSummary` uses `grid-cols-2 sm:grid-cols-4 lg:grid-cols-2`. | Change to `grid grid-cols-2 sm:grid-cols-3` to match the real layout. |
| 2.2 | 🟡 | 24 | Skeleton cards don't match the actual journal layout — no header skeleton, no tab skeleton, no chart skeleton. The loading state looks nothing like the loaded state. | Add a header skeleton and tab bar skeleton to reduce layout shift. |

---

## 3. `error.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 3.1 | 🟡 | 37 | `console.error` only — no integration with an error reporting service (Sentry, etc.). If the project has error reporting elsewhere, this boundary is silently swallowing crashes. | Check if project has a `reportError` utility and use it. |
| 3.2 | 🟡 | 43 | `error.digest` is available (Next.js generates it) but not displayed. Users can't reference the digest when reporting issues. | Show digest in a `<details>` or `<code>` block: `Error ID: {error.digest}`. |
| 3.3 | 🔵 | 39 | Error text says "Something went wrong while loading the journal" — generic. Could include the error message for developer/debug builds. | Consider showing `error.message` in a collapsible section. |

---

## 4. `journal-view.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 4.1 | 🔴 | 25 | `IconActivity` is imported but **never used** — dead import. Tree-shaking may remove it, but it's code noise and a lint failure. | Remove `IconActivity` from the import. |
| 4.2 | 🟠 | 160 | `data.entries.find((e) => e.outcome !== 'open')` finds the **first** closed entry in array order, not the **latest** closed entry. The AI review panel always shows the same (oldest) trade, not the most recently closed one. | Sort by `closedAt` descending first: `data.entries.filter(e => e.outcome !== 'open').sort((a,b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))[0]` |
| 4.3 | 🟠 | — | `ImportTrades` component exists in the `_components` folder but is **never imported or rendered** in `journal-view.tsx`. The import feature is completely disconnected from the UI. | Import and render `<ImportTrades onImported={refresh} />` in the header controls next to the "Log Trade" button. |
| 4.4 | 🟡 | 150 | `data.entries` passed to `StatsSummary` without null-check — `data` could be `undefined` if the query is in error state. The ternary at line 148 checks `data?.stats` but then passes `data.entries` (not `data?.entries`). | Use `data?.entries ?? []` for the entries prop. |
| 4.5 | 🟡 | 163 | Same issue: `data.entries` passed to `DrawdownChart` without optional chaining. Inside the `data?.stats &&` guard so `data` is likely defined, but TypeScript doesn't narrow `data` from `data?.stats` truthiness. | Use `data?.entries ?? []` or destructure with defaults. |
| 4.6 | 🟡 | 88 | `StaleIndicator` shows `isFetching && !isLoading` — correct, but there's no `refetchOnWindowFocus` or `refetchOnMount` configured on the query. Background refresh only happens on manual `refresh()` or component remount. | Add `refetchOnWindowFocus: true` to the query options. |
| 4.7 | 🔵 | 100 | "Log Trade" button uses raw `bg-fg text-black` instead of the `Button` component with `variant="primary"`. Inconsistent with the rest of the app. | Replace with `<Button variant="primary" size="sm" onClick={() => setOpen(true)}>`. |
| 4.8 | 🔵 | 92 | Refresh button is a raw `<button>` with manual styling instead of using the `Button` component. | Replace with `<Button variant="ghost" size="icon">`. |

---

## 5. `entry-form.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 5.1 | 🔴 | 333 | **Button label is the literal string `'IconDeviceFloppy entry'`** — the icon component name leaked into user-facing text. Users see "IconDeviceFloppy entry" instead of "Save entry". | Change to `{busy ? 'Saving…' : 'Save entry'}`. |
| 5.2 | 🔴 | 198 | **Toast error message is `'IconDeviceFloppy failed'`** — same icon name leak. Users see "IconDeviceFloppy failed" on error. | Change to `'Save failed'`. |
| 5.3 | 🔴 | 44 | Zod validation message: `'IconTarget must be positive'` — icon name in validation error. | Change to `'Target must be positive'`. |
| 5.4 | 🔴 | 94 | `validateTarget` returns `'IconTarget must be positive'` — same leak. | Change to `'Target must be positive'`. |
| 5.5 | 🔴 | 115 | Screenshot upload error: `throw new Error('IconUpload HTTP ${res.status}')` — icon name in error. | Change to `'Upload failed (HTTP ${res.status})'`. |
| 5.6 | 🔴 | 320 | **`useTagSuggestions()` is called inline in JSX props**: `suggestions={useTagSuggestions()}`. This is a **React hooks violation** — hooks must not be called inside JSX attribute expressions. It works by accident because it's always called in the same order, but it breaks the Rules of Hooks and will fail lint rules. | Call at top of component: `const tagSuggestions = useTagSuggestions();` then pass `suggestions={tagSuggestions}`. |
| 5.7 | 🟠 | 46 | Client-side `notes` max length is 5000 chars, but the **API schema** (`route.ts` line 56) limits to `max(2000)`. The form allows input the server will reject. | Change to `max(2000)` or update the API to accept 5000. |
| 5.8 | 🟠 | 172 | `openedAt: Date.now()` — the trade open time is set on the **client**. If the user's clock is wrong, the timestamp is wrong. The server should set this. | Send `openedAt` from client but have the API default to `Date.now()` server-side if not provided, or validate it's within a reasonable window. |
| 5.9 | 🟠 | 139 | `screenshotUrl` is included in the `parsed` object for validation but is **not included** in the `JSON.stringify` body sent to the API (line 169-179). The screenshot is uploaded but never saved with the entry. | Add `screenshotUrl: data.screenshotUrl` to the POST body. Also add it to the `entrySchema` (currently missing from the Zod schema at line 39-48). |
| 5.10 | 🟡 | 329 | `disabled={busy || !entry}` — only checks if `entry` field is non-empty. Doesn't check `fieldErrors` for active validation errors. User can submit with invalid stop/target values if they haven't blurred those fields. | Consider `disabled={busy || !entry || Object.values(fieldErrors).some(Boolean)}`. |
| 5.11 | 🟡 | 257 | `Field` for "Size in lots" doesn't pass `onBlur` for validation — no validation on size field at all. Negative or zero size could be submitted. | Add `onBlur` validation for size (positive number). |
| 5.12 | 🔵 | 355 | `Field` component generates `id` from label via `label.toLowerCase().replace(/[^a-z]/g, '-')` — "Stop (optional)" becomes `stop--optional`, "Entry" becomes `entry`. The `htmlFor`/`id` pairing works but IDs aren't unique if two fields have the same label. | Use `useId()` or include a prefix. |

---

## 6. `entry-list.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 6.1 | 🔴 | 682 | **Close button text is the literal string `'DeviceFloppy'`** — icon component name rendered as the button label. Users see "DeviceFloppy" instead of "Save" or "Close Trade". | Change to `'Close Trade'` or `'Save'`. |
| 6.2 | 🟠 | 449 | Each entry renders as `<li>` but the parent container (line 274) is a `<div>`, not `<ul>` or `<ol>`. This is **invalid HTML** — `<li>` must be a child of `<ul>`, `<ol>`, or `<menu>`. Screen readers may not announce list semantics correctly. | Change the parent `<div>` at line 274 to `<ul>`, or change `<li>` to `<div>` with `role="listitem"`. |
| 6.3 | 🟠 | 67-76 | `timeLabels` `useMemo` calls `relative(e.openedAt)` which uses `Date.now()`. The memo depends on `[entries]` but `Date.now()` changes constantly — the labels are **frozen at the time entries change** and become stale. "Just now" will say "just now" forever until entries refetch. | Either compute relative time on each render (cheap), or use a timer to periodically recompute, or accept the staleness and document it. |
| 6.4 | 🟠 | 384-388 | `remove()` function has **no catch block** — if `fetchCsrf` throws (network error, 500, etc.), the promise rejection is unhandled. The `finally` block sets `busy=false` but the user gets no error feedback. | Wrap in try/catch with `toast.error('Delete failed')` or `setError`. |
| 6.5 | 🟠 | 363 | `close()` throws `new Error('HTTP ${res.status}')` but doesn't parse the response body for a structured error message like `entry-form.tsx` does. The user sees "HTTP 400" instead of "Exit price must be positive". | Parse `res.json()` for `error.message` before throwing. |
| 6.6 | 🟠 | 398 | `pipMultiplier` is hardcoded: `entry.symbol === 'XAUUSD' ? 10 : 10000`. This assumes all non-gold symbols are JPY-free forex pairs. If `GBPJPY` or `XAGUSD` is added, pip calculations will be wrong. | Use a symbol-to-pip-multiplier map, or derive from the symbol's price precision. |
| 6.7 | 🟠 | 404 | `contractSize` is hardcoded: `entry.symbol === 'XAUUSD' ? 100 : 100000`. Same issue — silver (1000 oz), indices, crypto would all be wrong. | Use a symbol metadata table for contract sizes. |
| 6.8 | 🟡 | 629-631 | **Profitable region shade for short positions is wrong.** Both long and short use the same formula `Math.max(sliderPosition - entryPct, 0)`. For shorts, the profitable region is **below** the entry price (sliderPosition < entryPct), so the width should be `Math.max(entryPct - sliderPosition, 0)`. | Add a conditional: `entry.side === 'long' ? Math.max(sliderPosition - entryPct, 0) : Math.max(entryPct - sliderPosition, 0)`. |
| 6.9 | 🟡 | 132-133 | `activeCount` and `closedCount` are computed on every render with `.filter()` — not memoized. For large entry lists this is wasteful. | Wrap in `useMemo` with `[entries]` dependency, or compute from `tabEntries` length. |
| 6.10 | 🟡 | 151 | `animate-ping` on `bg-fg` when tab is active — the ping animation is a pulsing ring, but `bg-fg` is a solid dot. The ping effect is invisible because there's no contrasting ring color. | Use `bg-bull animate-ping` for the active indicator dot. |
| 6.11 | 🟡 | 277 | `maxHeight: '750px'` — fixed pixel height for the virtual list. On short screens (mobile landscape), this may be too tall and cause double scroll. On large desktop, it wastes space. | Use `max-h-[60vh]` or `max-h-[calc(100vh-300px)]` for responsive height. |
| 6.12 | 🔵 | 180-186 | Search input is a raw `<input>` with manual styling instead of the project's `Input` component. Inconsistent with the rest of the app. | Replace with `<Input>` component. |
| 6.13 | 🔵 | 140-173 | Tab buttons are custom-styled instead of using the `Segmented` component that `journal-view.tsx` uses for the same purpose. Two different tab implementations in the same feature. | Refactor to use `Segmented`. |

---

## 7. `import-trades.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 7.1 | 🟠 | 1 | **No license header** — every other file in the journal system has the Apache 2.0 header. This file is missing it. | Add the standard license header. |
| 7.2 | 🔴 | 89 | **No CSRF token on the import POST.** All other mutations (`entry-form`, `entry-list` close/delete) use `fetchCsrf()`. This endpoint is vulnerable to CSRF attacks. | Replace `fetch('/api/journal/import', ...)` with `fetchCsrf('/api/journal/import', ...)`. |
| 7.3 | 🟠 | 38 | Hardcoded symbol list `['XAUUSD', 'EURUSD', 'GBPUSD']` — not imported from `SYMBOLS` in `@hamafx/shared`. If symbols are added/removed in the shared package, the import filter won't update. | Import `SYMBOLS` from `@hamafx/shared` and use `SYMBOLS.includes(symbol)`. |
| 7.4 | 🟠 | 51 | `closedAt` is **always `null`** — even when `exit` price is provided. The import creates closed trades (with exit prices) but never sets `closedAt`, so the trade has an exit but no close timestamp. The API import route (line 55) also doesn't compute `closedAt` from exit. | If `exit` is provided, set `closedAt` to `openedAt + estimated hold time` or require a close date column. At minimum, set `closedAt: Date.now()` if exit is present. |
| 7.5 | 🟠 | 33 | CSV parser uses `line.split(',')` — **no quoted field handling**. A notes field containing a comma (e.g., `"bought at support, scaled out"`) will break the parser into extra columns. | Use a proper CSV parser (e.g., `papaparse`) or at minimum handle quoted fields with a regex. |
| 7.6 | 🟡 | 34 | Header row detection is `if (cols.length < 4) continue` — if the header row has 8 columns, it passes this check and gets parsed as a trade (with `symbol='SYMBOL'`, `side='long'`, `entry=NaN`). | Skip the first line if it contains non-numeric values in the entry column, or detect header by checking if `cols[2]` is a number. |
| 7.7 | 🟡 | 42 | Side detection: `cols[1]!.toLowerCase() === 'sell' ? 'short' : 'long'` — anything that isn't 'sell' becomes 'long'. If the CSV has `'buy'`, `'b'`, or `'B'`, it works by accident. But `'s'` (abbreviation for sell) would be treated as 'long'. | Check for both 'sell' and 'short' → 'short', 'buy' and 'long' → 'long', else skip row. |
| 7.8 | 🟡 | 6 | `accept=".csv,.xlsx,.html"` — **only CSV parsing is implemented**. If a user selects an `.xlsx` or `.html` file, `parseCSV` will fail silently (no valid trades found). | Either remove `.xlsx,.html` from accept, or implement parsing for those formats. |
| 7.9 | 🟡 | 89-107 | The modal is a **custom overlay** (`fixed inset-0 z-50`) instead of using the project's `Dialog` or `Drawer` component. No focus trap, no Escape-to-close, no scroll lock. | Replace with the project's `Dialog` component for consistency and accessibility. |
| 7.10 | 🟡 | 52 | `notes` is always `null` — the CSV format description says columns are `symbol, side, entry, date, exit, stop, target, size` — no notes column. But `ParsedTrade` has a `notes` field that's never populated. | Either add a notes column to the CSV format or remove the field from `ParsedTrade`. |
| 7.11 | 🔵 | 89 | Import button uses `IconDownload` — but "Import" is an upload action. `IconUpload` is used inside the modal but the trigger button uses download icon. Confusing. | Use `IconUpload` for the trigger button. |

---

## 8. `stats-summary.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 8.1 | 🟠 | 49-54 | `closedSpark` takes `entries.filter(...).slice(0, 20)` — this takes the **first 20** entries in array order (likely newest first from the API), not the **last 20 closed** chronologically. The `.reverse()` at line 53 reverses them, but the selection is still "first 20 in array order" not "20 most recent closed." If the API returns oldest-first, the sparkline shows the oldest 20 trades, not the latest. | Sort by `openedAt` or `closedAt` descending before slicing: `.sort((a,b) => b.closedAt - a.closedAt).slice(0, 20)`. |
| 8.2 | 🟠 | 131 | `distribution` uses `entries.length` (all entries including open) as the denominator, but counts `win`, `loss`, `be`, `open` separately. This means the percentages include open trades in the total — a user with 5 wins, 3 losses, 2 open sees 50% win rate instead of 62.5%. The distribution bar also shows open trades as a segment, which may be intentional but is misleading in a "win rate" context. | Either exclude open trades from the denominator, or clearly label it as "all trades" not "win rate." |
| 8.3 | 🟡 | 83-84 | `e.rMultiple!` uses non-null assertion — the `closedTrades` filter at line 41-43 checks `e.rMultiple !== null && e.rMultiple !== undefined`, so this is technically safe. But the `!` assertion is fragile if the filter logic changes. | Use a type guard: `filter((e): e is JournalEntry & { rMultiple: number } => e.rMultiple !== null && e.rMultiple !== undefined && e.outcome !== 'open')`. |
| 8.4 | 🟡 | 96 | `profitFactor` returns `99.9` when `grossLoss === 0` and `grossProfit > 0` — this is an arbitrary cap. A profit factor of Infinity is mathematically correct (no losses). `99.9` understates the metric. | Return `Infinity` and display as `∞` in the UI, or use a configurable cap with a comment. |
| 8.5 | 🟡 | 332 | Uses `stats.longestWinStreak` but the `JournalStats` schema has **both** `longestWinStreak` (Phase B) and `maxWinStreak` (Phase 2). The `StreakDisplay` component uses `stats.maxWinStreak`. These may have different values or one may be undefined. The two fields likely represent the same concept but were added in different phases. | Consolidate to one field name. Check which the server actually computes and use that consistently. |
| 8.6 | 🟡 | 157 | `winTone` logic: `stats.winRate >= 0.5 ? 'bull' : stats.winRate > 0 ? 'muted' : 'bear'` — when `winRate === 0` (no wins at all), tone is `'bear'`. But if there are 0 trades, `winRate` is likely 0, and showing 'bear' tone for "no trades" is misleading. | Add a check: if `stats.count === 0`, use `'muted'`. |
| 8.7 | 🔵 | 100-118 | `maxDrawdown` is computed locally in `StatsSummary` but also exists as `stats.maxDrawdown` from the server. The local computation may differ from the server's. Redundant computation. | Use `stats.maxDrawdown` if available, fall back to local computation. |
| 8.8 | 🔵 | 24 | Import has double spaces: `IconActivity,  IconCalculator,  IconTarget` — minor formatting drift. | Clean up import spacing. |

---

## 9. `ai-review-panel.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 9.1 | 🟠 | 85 | `review` state persists when the `entry` prop changes. If the parent passes a different entry (e.g., user selects a different trade), the old review text is still displayed. There's no `useEffect` to clear state when `entry.id` changes. | Add `useEffect(() => { setReview(null); setModelId(null); setError(null); }, [entry.id])`. |
| 9.2 | 🟡 | 68 | TypeScript narrowing: `body` is typed as `{ error?: { message: string } } | TradeReviewResponse`. The check `'error' in body && body.error?.message` works at runtime but TypeScript may not narrow correctly in all versions. The `body as TradeReviewResponse` cast at line 78 is unsafe if the union wasn't properly narrowed. | Use a type guard function: `function isErrorResponse(body: unknown): body is { error: { message: string } }`. |
| 9.3 | 🟡 | — | No caching of the review. If the user generates a review, switches tabs, and comes back, the review is lost and must be regenerated (costing API tokens). | Cache the review in the query cache or local state keyed by `entry.id`. |
| 9.4 | 🔵 | 85 | The `review` is stored as a string but the API returns rich metadata (`inputTokens`, `outputTokens`, `costUsd`, `latencyMs`). Only `modelId` is displayed. The cost/latency data is discarded. | Consider showing cost/latency in a collapsible details section. |

---

## 10. `analytics/breakdown-table.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 10.1 | 🟠 | 68 | Sort headers have `onClick` but **no keyboard handler** (`onKeyDown`). Users navigating with keyboard can't sort. Violates WCAG 2.1 criterion 2.1.1. | Add `onKeyDown` handler for Enter/Space, or use `<button>` inside `<th>`. |
| 10.2 | 🟡 | 80 | `role="table"` is set on a `<div>` that wraps an actual `<table>` element. This creates conflicting ARIA — the browser already exposes `<table>` with table semantics. Adding `role="table"` on the wrapper is redundant and may confuse screen readers. | Remove `role="table"` from the wrapper div, or remove the `<table>` and use divs with ARIA roles consistently. |
| 10.3 | 🟡 | — | **No empty state.** When `data` is empty (no trades for this breakdown), the table renders with headers but an empty body. No "No data" message. | Add an empty row: `{rows.length === 0 && <tr><td colSpan={5} className="text-center text-fg-muted py-4">No data</td></tr>}`. |
| 10.4 | 🔵 | 62 | Sort direction toggle: `prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc'` — clicking a new column always starts as 'desc'. Standard UX is to start 'desc' for numeric, 'asc' for text. Minor. | Consider default direction per column type. |

---

## 11. `analytics/drawdown-chart.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 11.1 | 🟠 | 42 | `recoveryFactor = stats.totalR / maxDD` — this uses the **final** totalR, not the cumulative R at the point of recovery. The recovery factor should be `cumulativeR_at_end / maxDD`, which is only the same if totalR equals the final cumulative. If the server's `totalR` differs from the locally computed cumulative (e.g., different set of trades), this is wrong. | Compute `recoveryFactor` from the local `cumulative` value: `const finalCumulative = curve[curve.length - 1] ?? 0; const recovery = maxDD === 0 ? 0 : finalCumulative / maxDD;` |
| 11.2 | 🟠 | 62 | `areaPath = '${linePath} L 100 100 L 0 100 Z'` — this fills the area from the equity curve down to the bottom of the chart (y=100). But the drawdown shade should be the area **between the peak line and the equity curve**, not the entire area below the curve. The `clipPath` at line 66-68 attempts to clip to the peak path, but clipping to a stroke path (not a filled area) doesn't produce the intended visual. | Create a proper drawdown area path: for each point, create a path from peak down to curve, forming vertical slivers. Or use a mask. |
| 11.3 | 🟡 | 52 | `Math.min(...curve, 0)` and `Math.max(...curve, 1)` use spread operator — if `curve` has thousands of points, this can cause a **stack overflow** (V8 has ~65536 argument limit). | Use `curve.reduce((min, v) => Math.min(min, v), 0)` instead. |
| 11.4 | 🔵 | 58 | `width = curve.length - 1` — if `curve.length === 1`, width is 0, causing division by zero in `i / width`. The guard at line 48 checks `curve.length < 2` so this is safe, but the variable naming is confusing (`width` is actually "last index"). | Rename to `lastIdx` for clarity. |

---

## 12. `analytics/r-distribution.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 12.1 | 🔴 | 30 | **The `isPositive` logic is completely broken.** The expression is:
```ts
const isPositive = d.bucket.startsWith('(') || d.bucket.startsWith('[') && d.bucket !== '[0,0]' && d.bucket !== '[-3,-2)' && d.bucket !== '[-2,-1)' && d.bucket !== '[-1,0)';
```
Due to **operator precedence**, `&&` binds tighter than `||`, so this evaluates as:
```ts
d.bucket.startsWith('(') || (d.bucket.startsWith('[') && d.bucket !== '[0,0]' && ...)
```
This means **any bucket starting with `(` is always positive**, and buckets starting with `[` are only positive if they don't match the negative exclusions. But positive buckets like `[1,2)` start with `[` and would pass the exclusion checks — while `[0,1)` also starts with `[` and isn't excluded, so it's positive (correct by accident). However, `[-3,-2)` starts with `[` and IS excluded (correct). The logic is fragile, unreadable, and depends on exact bucket string format. | Replace with a simple numeric check: parse the bucket label to extract the lower bound, and check if it's >= 0. Or better: have the server include an `isPositive` flag in the distribution data. |
| 12.2 | 🟡 | 38 | `grid-cols-8` is hardcoded — if the server returns fewer or more buckets, the label grid won't align with the bars. | Use `grid` with `style={{ gridTemplateColumns: 'repeat(${data.length}, 1fr)' }}` or just use flex. |
| 12.3 | 🟡 | 22 | `total` is computed but only used for display. If `total === 0`, the empty state shows. But `total` counts all buckets including negative ones — it's the total number of closed trades, which is correct. No bug, but the variable name `total` is ambiguous (total trades vs total R). | Rename to `totalTrades` for clarity. |

---

## 13. `analytics/streak-display.tsx`

| # | Severity | Line | Issue | Fix |
|---|----------|------|-------|-----|
| 13.1 | 🟡 | 18 | `currentLabel` is `'W'` or `'L'` appended directly to count: `'{current.count}{currentLabel}'` renders as `3W` or `2L` with no separator. This is compact but could be misread. | Add a space: `'{current.count} {currentLabel}'` or use different formatting. |
| 13.2 | 🟡 | 12-13 | `maxWin` and `maxLoss` fall back to `0` — but `0` is ambiguous. It could mean "no streaks" or "a streak of 0 length." If the server returns `undefined`, showing `0` is misleading. | Show `'—'` when `undefined`, and `0` only when the server explicitly returns 0. |
| 13.3 | 🔵 | 22 | "Best Win" and "Worst Loss" labels — "Worst Loss" could be phrased as "Longest Loss" for consistency with "Best Win" (which is really "Longest Win"). | Rename to "Longest Win" / "Longest Loss" for clarity. |

---

## Cross-Cutting Issues

### A. Icon Name Leakage (🔴 Critical)

**6 instances** of Tabler icon component names appearing as user-facing text:
- `entry-form.tsx:333` — `'IconDeviceFloppy entry'` as button label
- `entry-form.tsx:198` — `'IconDeviceFloppy failed'` as toast message
- `entry-form.tsx:44,94` — `'IconTarget must be positive'` as validation message
- `entry-form.tsx:115` — `'IconUpload HTTP ${res.status}'` as error message
- `entry-list.tsx:682` — `'DeviceFloppy'` as button label

**Root cause:** Likely a find-and-replace that substituted icon names (e.g., `<IconDeviceFloppy />`) into string literals, or an AI code generation artifact that confused component names with display text.

**Fix:** Audit all string literals in the journal system for `Icon` prefix and replace with proper human text.

### B. Schema Mismatches

| Field | Client | Server | Impact |
|-------|--------|--------|--------|
| `notes` max length | 5000 chars | 2000 chars | Server rejects long notes |
| `screenshotUrl` | Not in `entrySchema` | In `CreateSchema` | Screenshot never saved |
| `longestWinStreak` vs `maxWinStreak` | Both exist in schema | Server may compute one | `StatsSummary` uses `longestWinStreak`, `StreakDisplay` uses `maxWinStreak` — inconsistent |
| `closedAt` on import | Always `null` | Not computed from exit | Imported closed trades have no close timestamp |

### C. Missing CSRF Protection

- `import-trades.tsx` uses raw `fetch()` for POST — no CSRF token
- All other mutations (`entry-form.tsx`, `entry-list.tsx`) correctly use `fetchCsrf()`
- The import endpoint is vulnerable to cross-site request forgery

### D. Design System Drift

| Component | Issue |
|-----------|-------|
| `import-trades.tsx` modal | Custom `fixed inset-0` overlay instead of project `Dialog`/`Drawer` |
| `entry-list.tsx` tabs | Custom tab buttons instead of `Segmented` component |
| `entry-list.tsx` search | Raw `<input>` instead of `Input` component |
| `journal-view.tsx:100` | Raw `<button>` instead of `Button` component |
| `entry-list.tsx:180-186` | Raw `<input>` with manual styling |
| `import-trades.tsx:89` | `IconDownload` for an upload action |

### E. Performance Concerns

1. **`entry-list.tsx` virtualization** — Good use of `useVirtualizer`, but `estimateSize: () => 120` is a rough estimate. Rows with notes, tags, screenshots, or the close form will be much taller. `measureElement` handles dynamic sizing, but the initial estimate causes layout jumps.

2. **`entry-list.tsx` price polling** — `usePrices(activeSymbols)` polls every 1.5s (per comment line 89). For many active trades, this creates unnecessary network load. Consider WebSocket or longer interval.

3. **`stats-summary.tsx`** — Multiple `useMemo` chains (`closedSpark` → `cumR` → `winRateSpark` → `tradesSpark` → `avgRSpark`) all depend on `entries`. Any change to entries recomputes everything. This is correct but could be expensive for large datasets.

4. **`drawdown-chart.tsx:52`** — `Math.min(...curve, 0)` spread operator can stack overflow on large arrays.

### F. Accessibility Issues

1. **`breakdown-table.tsx:68`** — Sortable headers have no keyboard handler
2. **`entry-list.tsx:449`** — `<li>` without `<ul>`/`<ol>` parent
3. **`import-trades.tsx:89`** — Custom modal with no focus trap, no Escape handling, no scroll lock
4. **`entry-list.tsx:180-186`** — Search input has no `aria-label`
5. **`r-distribution.tsx:38`** — Bucket labels in grid may overflow on narrow screens with no truncation

### G. Analytics Calculation Correctness

1. **`stats-summary.tsx:49-54`** — Sparkline shows first 20 in array order, not last 20 chronologically
2. **`stats-summary.tsx:131`** — Distribution includes open trades in denominator
3. **`drawdown-chart.tsx:42`** — Recovery factor uses `stats.totalR` not local cumulative
4. **`entry-list.tsx:629-631`** — Short position profitable region shade is wrong (same formula as long)
5. **`r-distribution.tsx:30`** — `isPositive` logic has operator precedence bug
6. **`stats-summary.tsx:96`** — Profit factor capped at 99.9 instead of Infinity
7. **`entry-list.tsx:398-404`** — Pip multiplier and contract size hardcoded for only XAUUSD and forex

---

## Priority Fix Order

1. **🔴 Icon name leakage** (6 instances) — Immediate user-facing embarrassment
2. **🔴 Missing CSRF on import** — Security vulnerability
3. **🔴 R-distribution `isPositive` bug** — Wrong colors on histogram
4. **🔴 Hook violation in entry-form** — `useTagSuggestions()` in JSX
5. **🟠 `screenshotUrl` not sent to API** — Feature silently broken
6. **🟠 `ImportTrades` never rendered** — Feature disconnected
7. **🟠 `closedAt` always null on import** — Data integrity
8. **🟠 Short position shade calculation** — Visual bug
9. **🟠 AI review stale on entry change** — UX bug
10. **🟠 Notes max length mismatch** — Server rejects valid client input



---

## G. Settings System Analysis

# HamaFX-Ai Settings System — Deep Analysis

## Executive Summary

The settings system is a well-structured Next.js 15 App Router implementation with ~45 files covering 11 sub-pages and 24 shared components. The architecture follows good patterns (server components for data fetching, client components for interactivity, server actions for mutations). However, there are **several bugs, security concerns, UX gaps, and design system inconsistencies** that need attention.

---

## 1. BUGS

### 1.1 🔴 CRITICAL: `page.tsx` metadata title contains literal "Icon" prefix artifacts

**File:** `settings/page.tsx:43`
```ts
export const metadata: Metadata = { title: 'IconSettings' };
```
**Also in:** `settings/telegram/page.tsx:32`, `settings/telegram/page.tsx:35`, `settings/telegram/page.tsx:37`, `settings/billing/page.tsx:24`

Multiple metadata titles and UI strings contain `Icon` prefixed to words like "Settings", "Robot", "Key", "ArrowRight", "List", "DeviceFloppy", "Check". This appears to be a broken find-and-replace that replaced icon component names with the literal string "Icon" in user-facing text.

**Examples found across files:**
- `page.tsx:43` → `title: 'IconSettings'`
- `telegram/page.tsx:32` → `title: 'Telegram IconRobot — IconSettings'`
- `telegram/page.tsx:35` → `title="Telegram IconRobot"`
- `telegram/page.tsx:37` → `description="IconLink your Telegram..."`
- `telegram/page.tsx:51` → `"IconArrowRight a test message..."`
- `telegram/page.tsx:72` → `"IconList all commands"`
- `usage-limits-form.tsx` → `IconDeviceFloppy Changes` (save button text)
- `disabled-tools-form.tsx` → `IconDeviceFloppy Changes` (save button text)
- `market-data-config.tsx` → `IconDeviceFloppy Provider` (save button text)
- `save-bar.tsx` → `IconDeviceFloppy Keys` and `IconDeviceFloppy failed:`
- `test-email-button.tsx` → `IconArrowRight test email`
- `test-telegram-button.tsx` → `IconArrowRight test Telegram`
- `agent-model-override-form.tsx` → `IconDeviceFloppy overrides`
- `analysis-mode-form.tsx` → `IconDeviceFloppy changes`
- `billing-plans.tsx` → `IconCheck the errors below` (in toast)

**Fix:** Search and replace all `Icon[A-Z][a-z]+` patterns in string literals (not JSX component references) with the correct plain text. E.g., `'IconSettings'` → `'Settings'`, `'IconDeviceFloppy Changes'` → `'Save Changes'`, `'IconArrowRight a test message'` → `'Send a test message'`.

### 1.2 🔴 BUG: `page.tsx` — Indentation error / stray whitespace in Promise.all

**File:** `settings/page.tsx:57`
```ts
      const [[userRow], [settings], list] = await Promise.all([
```
This line has 6 spaces of indentation instead of 2, breaking the visual flow. While not a runtime error, it suggests a merge artifact. The `const` is inside the function body but indented as if inside a block.

**Fix:** Re-indent to 2 spaces.

### 1.3 🟠 BUG: `page.tsx` — `noiseConfig` extracted from `notificationPrefs` but `notificationPrefs` is typed as `Record<string, Record<string, boolean>>`

**File:** `settings/page.tsx:75-77`
```ts
const noiseConfig = settings?.notificationPrefs && typeof settings.notificationPrefs === 'object'
  ? (settings.notificationPrefs as Record<string, unknown>).noiseConfig as NoiseConfig | undefined
  : undefined;
```
The `notificationPrefs` variable (line 54) is typed as `Record<string, Record<string, boolean>> | null`, but then `noiseConfig` is extracted from it by casting to `Record<string, unknown>`. This means `notificationPrefs` is actually a mixed bag containing both the prefs matrix AND `noiseConfig`. When `updateNotificationPrefsAction` saves the prefs matrix (overwriting the entire field), it will **destroy the `noiseConfig`** that was nested inside.

**Fix:** Either store `noiseConfig` in a separate DB column, or have `updateNotificationPrefsAction` merge the new prefs with the existing `noiseConfig` rather than overwriting the entire field.

### 1.4 🟠 BUG: `actions.ts` — `exportKeysAction` creates a second `getDb()` instance after already getting one

**File:** `settings/actions.ts` (~line 310-320, exportKeysAction)
```ts
const db = getDb();  // First call for 2FA check
// ... later in try block:
const db = getDb();  // Second call — redundant
```
The `getDb()` is called twice in the same function. While likely returning the same singleton, it's redundant and confusing.

**Fix:** Remove the second `const db = getDb()` inside the `try` block.

### 1.5 🟠 BUG: `actions.ts` — `changePasswordAction` doesn't call `revalidatePath`

**File:** `settings/actions.ts` (~end of file)
```ts
export async function changePasswordAction(...) {
  // ... updates password, increments tokenVersion ...
  // FEAT-03: Audit log
  // ...
  return { ok: true };
  // ❌ Missing revalidatePath('/settings')
}
```
After changing the password and incrementing `tokenVersion`, the settings page won't re-render with fresh data. Other actions like `updateProfileAction`, `updateAiPrefsAction`, etc. all call `revalidatePath`.

**Fix:** Add `revalidatePath('/settings')` before `return { ok: true }`.

### 1.6 🟠 BUG: `actions.ts` — `deleteAccountAction` doesn't invalidate sessions or sign out

**File:** `settings/actions.ts` (~line 380)
```ts
await db.delete(schema.users)
  .where(eq(schema.users.id, session.user.id));
return { ok: true as const };
```
After deleting the user account, the current session is still active. The user's JWT/cookie remains valid until it expires or is refreshed. The user should be signed out immediately.

**Fix:** After deletion, call `signOut()` or at minimum increment `tokenVersion` (though the row is deleted, so this is moot — but the session cookie should be cleared).

### 1.7 🟡 BUG: `api-keys/page.tsx` — Returns `null` instead of redirecting on auth failure

**File:** `settings/api-keys/page.tsx:55`
```ts
if (!session?.user?.id) return null;
```
All other settings pages use `redirect('/login')` for unauthenticated users. This page returns `null`, rendering a blank page. This is inconsistent and confusing — the user sees an empty settings area instead of being redirected to login.

**Fix:** Change to `redirect('/login')` for consistency.

### 1.8 🟡 BUG: `profile/page.tsx` — Checks `if (!session)` instead of `if (!session?.user?.id)`

**File:** `settings/profile/page.tsx:29`
```ts
const session = await auth();
if (!session) redirect('/login');
```
This checks only that a session exists, not that it has a user ID. If the session is malformed (has no user), the page will proceed and pass `undefined` to `ProfileForm`.

**Fix:** Change to `if (!session?.user?.id) redirect('/login')`.

### 1.9 🟡 BUG: `billing-plans.tsx` — CSRF token read from cookie directly, inconsistent with rest of app

**File:** `settings/billing/_components/billing-plans.tsx:55-58`
```ts
function getCsrfToken(): string {
  const match = document.cookie.match(/hfx_csrf=([^;]+)/);
  return match?.[1] ?? '';
}
```
Every other component uses `withCsrf()` or `fetchCsrf()` or `getCsrfToken()` from `@/lib/csrf`. This component reimplements CSRF token extraction manually, which is fragile and could break if the cookie name changes.

**Fix:** Import and use `getCsrfToken` from `@/lib/csrf` or use `withCsrf()`.

### 1.10 🟡 BUG: `billing-plans.tsx` — CSRF token passed in lowercase header, inconsistent

**File:** `settings/billing/_components/billing-plans.tsx:43`
```ts
headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
```
The header is `'x-csrf-token'` (lowercase), while other components use `'X-CSRF-Token'` (mixed case). While HTTP headers are case-insensitive, this is inconsistent.

### 1.11 🟡 BUG: `subscription-status.tsx` — Missing `cn` import, uses local `cn` function

**File:** `settings/billing/_components/subscription-status.tsx:73-75`
```ts
function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
```
The component defines its own `cn` utility instead of importing from `@/lib/cn`. This is a local reimplementation that may behave differently (doesn't handle objects, arrays, etc.).

**Fix:** `import { cn } from '@/lib/cn'` and remove the local function.

### 1.12 🟡 BUG: `onboarding-reset-card.tsx` — Uses native `confirm()` instead of `useConfirm` drawer

**File:** `settings/_components/onboarding-reset-card.tsx:29`
```ts
if (!confirm('Reset onboarding? You will need to go through the wizard again.')) return;
```
All other destructive actions in the settings system use the `useConfirm` drawer (`LogoutButton`, `SessionsCard`, `DataCard`, `AIPrefsCard`). This one uses the browser's native `confirm()` dialog, which is visually inconsistent and blocked by some browsers.

**Fix:** Use `const [confirmEl, confirm] = useConfirm()` and render `{confirmEl}`.

### 1.13 🟡 BUG: `signal-feedback.tsx` — No error feedback to user on failed submission

**File:** `settings/track-record/_components/signal-feedback.tsx:43`
```ts
} catch (err) {
  console.warn('[signal-feedback] failed', err);
}
```
When the feedback submission fails, the error is only logged to console. The user gets no visual feedback that their thumbs up/down wasn't saved. Additionally, the `feedback` state is NOT reverted, so the UI shows the new state even though the server didn't save it.

**Fix:** Revert `setFeedback(initialFeedback)` on error and show a toast.

### 1.14 🟡 BUG: `noise-control-card.tsx` — No persistence mechanism visible

The `NoiseControlCard` component manages `config` state and has an `update()` function, but from the visible code there's no server action call or API fetch to persist changes. The config changes appear to only live in local state and would be lost on page refresh.

**Fix:** Wire up a server action or API call to persist `noiseConfig` to the `notificationPreferences` field (or a dedicated field).

---

## 2. SECURITY

### 2.1 🔴 HIGH: `actions.ts` — `setupTwoFactorAction` stores encrypted secret before user verifies

**File:** `settings/actions.ts` (~setupTwoFactorAction)
```ts
const secret = generateSecret();
// ...
await db.update(schema.users)
  .set({ twoFactorSecret: encryptSecret(secret) })
  .where(eq(schema.users.id, session.user.id));
```
The TOTP secret is stored in the database immediately when the user starts setup, before they verify with a token. If a user starts setup but never completes it, the secret remains in the DB. While `twoFactorEnabled` is still `false`, this is a minor issue, but it means:
1. A stale secret lingers if setup is abandoned
2. If `verifyTwoFactorAction` is later called with the old secret, it could enable 2FA with a secret the user may no longer have in their authenticator app

**Fix:** Store the secret in a temporary location (e.g., session or a `twoFactorPendingSecret` column) and only persist to `twoFactorSecret` after successful verification.

### 2.2 🟠 MEDIUM: `actions.ts` — `changePasswordAction` doesn't invalidate other sessions

**File:** `settings/actions.ts` (~changePasswordAction)
```ts
await db.update(schema.users)
  .set({ hashedPassword, tokenVersion: sql`${schema.users.tokenVersion} + 1` })
  .where(eq(schema.users.id, session.user.id));
```
The `tokenVersion` is incremented (which invalidates JWTs), but active session records in `userSessions` are NOT deleted. If the auth system checks session records separately from JWT validation, old sessions may remain active.

**Fix:** Also delete `userSessions` records (like `signOutEverywhereAction` does) or ensure the auth middleware checks `tokenVersion` on every request.

### 2.3 🟠 MEDIUM: `actions.ts` — `exportDataAction` exports sensitive data without password verification

**File:** `settings/actions.ts` (~exportDataAction)
```ts
export async function exportDataAction(): Promise<ActionResult<string>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }
  // ... immediately exports all user data including settings, threads, messages, etc.
}
```
Unlike `exportKeysAction` which requires password + 2FA verification, `exportDataAction` only checks the session. This exports ALL user data (profile, settings, chat threads, messages, journal entries, alerts, audit logs, etc.) with no additional verification. If someone has access to an active session, they can download everything.

**Fix:** Require password verification (and 2FA if enabled) before exporting data, similar to `exportKeysAction`.

### 2.4 🟡 LOW: `actions.ts` — `updateApiKeysAction` doesn't rate-limit the network test calls

**File:** `settings/actions.ts` (~updateApiKeysAction)
The action has no `withRateLimit` call. While the individual `testProviderKey` calls are outbound API tests, a malicious user could spam this action to make many outbound API calls through the server, potentially hitting rate limits on the provider APIs or using server resources.

**Fix:** Add `withRateLimit(session.user.id, 'settings_update_api_keys', 10)`.

### 2.5 🟡 LOW: `data-card.tsx` — `deleteAccountAction` called from client without confirming 2FA requirement

**File:** `settings/_components/data-card.tsx`
The delete account UI has a TOTP code field, but if the user has 2FA enabled and leaves it blank, the server action returns an error. The client doesn't know whether 2FA is enabled, so the TOTP field is always shown with "(if enabled)" — but the user might not realize it's mandatory.

**Fix:** Pass `twoFactorEnabled` as a prop to `DataCard` and conditionally show the TOTP field with a "required" indicator.

---

## 3. UX ISSUES

### 3.1 🟠 `page.tsx` — No error boundary for individual card failures

The main settings page renders ~15 components. If any one throws (e.g., `SystemStatusCard` fails to query DB), the entire page crashes and shows the `error.tsx` fallback. Individual card failures should be caught and show inline error states.

**Fix:** Wrap each card in an error boundary or use React Suspense with error handling per card.

### 3.2 🟠 `change-password-card.tsx` — Success state permanently hides the form

**File:** `settings/_components/change-password-card.tsx:54-58`
```tsx
{done ? (
  <div>...Password changed successfully...</div>
) : (
  <form>...</form>
)}
```
After changing the password, the form is replaced with a success message. There's no way to change the password again without refreshing the page. The `useEffect` cleanup sets `done` to false on unmount, but the component doesn't unmount/remount on its own.

**Fix:** Add a "Change password again" button that sets `done` to false.

### 3.3 🟠 `two-factor-setup.tsx` — No way to cancel setup mid-flow

Once the user clicks "Set up 2FA", they see the QR code and verify step. There's no "Cancel" button to abort the setup. If they close the browser or navigate away, the secret remains in the DB (see security issue 2.1).

**Fix:** Add a "Cancel" button that clears the local state and optionally calls a server action to clear the pending secret.

### 3.4 🟡 `appearance-card.tsx` — Theme/locale changes don't show loading state

**File:** `settings/_components/appearance-card.tsx:35-42`
```ts
const handleThemeChange = useCallback((value: string) => {
  setTheme(value as Theme);
  updateUIPrefsAction({ theme: value });
}, []);
```
The theme and locale changes fire server actions without any loading indicator or error handling. If the server action fails, the UI shows the new theme but the server has the old value. On next page load, the theme reverts.

**Fix:** Add error handling with toast notifications and optimistic update reversion.

### 3.5 🟡 `preferences-card.tsx` — `syncToDb` fires server action on every change without debounce

**File:** `settings/_components/preferences-card.tsx:72-77`
```ts
function syncToDb<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  update(key, value);
  const payload: Record<string, unknown> = {};
  payload[key] = value;
  updateUIPrefsAction(payload as Parameters<typeof updateUIPrefsAction>[0]);
}
```
Every toggle/change immediately fires a server action. For the `Segmented` component (default symbol, time format), rapid clicks could fire multiple actions. No error handling or rollback.

**Fix:** Add error handling. Consider debouncing for rapid changes.

### 3.6 🟡 `notification-prefs-card.tsx` — Optimistic update with rollback but no loading indicator

**File:** `settings/_components/notification-prefs-card.tsx:55-64`
```ts
const toggle = useCallback((event: EventType, channel: Channel, value: boolean) => {
  const prev = prefsRef.current;
  const next: PrefsMatrix = { ...prev, [event]: { ...prev[event], [channel]: value } };
  setPrefs(next);
  updateNotificationPrefsAction(next).then((result) => {
    if (!result.ok) {
      setPrefs(prev);
      toast.error('Failed to update notification preference');
    }
  });
}, []);
```
Good pattern (optimistic update with rollback), but the switch doesn't show a loading state while the action is pending. If the server is slow, the user might toggle again and create a race condition.

**Fix:** Track pending state per toggle and disable the switch while saving.

### 3.7 🟡 `telegram/page.tsx` — No auth check

**File:** `settings/telegram/page.tsx`
```ts
export default function TelegramSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader ... />
      <TelegramLinkCard />
      // ...
    </div>
  );
}
```
This page has no `auth()` check or redirect. While the layout or middleware might handle auth, every other settings sub-page explicitly checks. If middleware fails, this page would render for unauthenticated users.

**Fix:** Add `const session = await auth(); if (!session?.user?.id) redirect('/login');` at the top.

### 3.8 🟡 `billing/page.tsx` — Uses `JSON.parse(JSON.stringify())` to serialize Date objects

**File:** `settings/billing/page.tsx:47-52`
```ts
<SubscriptionStatus
  subscription={subscription ? JSON.parse(JSON.stringify(subscription)) : null}
  currentPlan={currentPlan ? JSON.parse(JSON.stringify(currentPlan)) : null}
/>
<BillingPlans
  plans={JSON.parse(JSON.stringify(allPlans))}
  ...
/>
<PaymentHistory payments={JSON.parse(JSON.stringify(payments))} />
```
This is a workaround for passing Date objects from server to client components. It works but is inefficient and loses type information. Dates become strings, which the client components then need to parse.

**Fix:** Use `superJSON` or explicitly convert dates to ISO strings before passing to client components.

### 3.9 🟡 `symbols-form.tsx` — Large component with inline reorder logic, no error boundaries for drag-and-drop

The `symbols-form.tsx` is a very large component (~600+ lines) handling search, pagination, drag-and-drop reordering, bulk selection, import/export, and live prices. This is a lot of responsibility for one component. If the price hook fails or DnD throws, the entire form breaks.

**Fix:** Extract sub-components (SymbolSearchPanel, SymbolSortableList, SymbolBulkActions) and add error boundaries.

---

## 4. PERFORMANCE

### 4.1 🟠 `page.tsx` — `checkIsAdmin()` called sequentially after `Promise.all`

**File:** `settings/page.tsx:78`
```ts
const isAdmin = await checkIsAdmin();
```
The admin check is awaited after the main `Promise.all` completes. It could be included in the `Promise.all` to parallelize.

**Fix:** Add `checkIsAdmin()` to the `Promise.all` array.

### 4.2 🟡 `agent-card.tsx` — Calls `buildToolCatalogue()` on every settings page render

**File:** `settings/_components/agent-card.tsx:18`
```ts
const entries = await buildToolCatalogue().catch(() => []);
```
This is a server component that runs on every render of the main settings page. If `buildToolCatalogue` involves DB queries for telemetry, this adds latency to every settings page load.

**Fix:** Consider caching the result or lazy-loading the agent card.

### 4.3 🟡 `system-status-card.tsx` — Uses `cache()` but still queries DB on first render

**File:** `settings/_components/system-status-card.tsx:34`
```ts
const buildStatuses = cache(async (userId: string): Promise<BuildStatusResult> => {
```
The `cache()` from React is per-render, not persistent. The DB queries (push subscriptions, stuck jobs, recent errors) run on every settings page visit.

### 4.4 🟡 `notifications-card.tsx` and `system-status-card.tsx` — Duplicate push subscription count queries

Both `NotificationsCard` and `SystemStatusCard` call `listPushSubscriptions(userId)` independently. On the main settings page, this means the same query runs twice.

**Fix:** Fetch once in `page.tsx` and pass the count as a prop to both components.

---

## 5. DESIGN SYSTEM DRIFT

### 5.1 🟠 Inconsistent border radius

- Most cards use `rounded-sm`
- `data-card.tsx` uses `rounded-sm` ✓
- `about-card.tsx` uses `rounded-sm` ✓
- `billing-plans.tsx` uses `rounded-sm` ✓
- `change-password-card.tsx` uses `surface-panel` class (different from other cards)
- `noise-control-card.tsx` uses raw `border` without `rounded-sm` on inner inputs

**Fix:** Standardize all card containers to use the same border-radius utility.

### 5.2 🟡 Inconsistent button text patterns

- `profile-form.tsx`: "Save Profile"
- `usage-limits-form.tsx`: "IconDeviceFloppy Changes" (broken)
- `disabled-tools-form.tsx`: "IconDeviceFloppy Changes" (broken)
- `market-data-config.tsx`: "IconDeviceFloppy Provider" (broken)
- `save-bar.tsx`: "IconDeviceFloppy Keys" (broken)
- `change-password-card.tsx`: "Change password"
- `sessions-card.tsx`: "Sign out everywhere"

No consistent verb pattern (Save vs. Change vs. Update).

### 5.3 🟡 Inconsistent section heading sizes

- `settings-section.tsx`: `text-sm font-semibold`
- `about-card.tsx`: `text-base font-semibold`
- `notifications-card.tsx`: `text-base font-semibold`
- `preferences-card.tsx`: `text-base font-semibold`
- `noise-control-card.tsx`: (not visible in truncated section)
- `change-password-card.tsx`: `text-sm font-semibold`

Some use `text-sm`, others `text-base` for the same visual hierarchy level.

**Fix:** Standardize section headings to one size.

### 5.4 🟡 `agent/page.tsx` — Uses `<main>` tag while other settings pages don't

**File:** `settings/agent/page.tsx:62`
```tsx
return (
  <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-4">
```
All other settings sub-pages render content inside a plain `<div>`. The agent page uses `<main>` with its own max-width and padding, which conflicts with the layout's `flex-1 min-w-0` container.

**Fix:** Use `<div className="flex flex-col gap-6">` for consistency, matching other sub-pages.

### 5.5 🟡 Inconsistent icon usage for section headers

Some sections use icon components (`IconKey`, `IconBell`, `IconRobot`, etc.) in `SettingsSection`, while others (`about-card`, `notifications-card`, `preferences-card`) embed icons directly in their own headers. The visual treatment differs.

---

## 6. MISSING FEATURES / INCOMPLETE IMPLEMENTATIONS

### 6.1 🟠 No `error.tsx` for sub-pages

Only the root `settings/error.tsx` exists. Sub-pages (`profile`, `portfolio`, `symbols`, `telegram`, `track-record`, `usage`, `agent`, `api-keys`, `billing`, `models`) have no error boundaries. An error in any sub-page will bubble up to the root error boundary, showing a generic "Something went wrong" with no sub-page context.

**Fix:** Add `error.tsx` to each sub-page directory, or at minimum to the most complex ones (`api-keys`, `billing`, `portfolio`).

### 6.2 🟡 No `not-found.tsx` for settings

If a user navigates to `/settings/nonexistent`, there's no custom 404 page for the settings section.

### 6.3 🟡 `billing/page.tsx` — No loading.tsx

There's no `billing/loading.tsx` file. The billing page does 3 DB queries (plans, subscriptions, payments) with `revalidate = 0` (no caching), so it will always be slow on first load. Users see a blank page or the layout's default loading.

**Fix:** Add `billing/loading.tsx` with skeleton cards matching the billing layout.

### 6.4 🟡 `models/page.tsx` — No loading.tsx

Wait — `models/loading.tsx` does exist. Disregard.

### 6.5 🟡 No keyboard navigation for `settings-nav.tsx` on mobile

**File:** `settings/_components/settings-nav.tsx:41`
```tsx
<nav ... className="flex flex-row md:flex-col gap-1 overflow-x-auto snap-x pb-2 md:pb-0">
```
On mobile, the nav is a horizontal scrollable list. There's no visual indicator that it scrolls, and `snap-x` without `scroll-px` may not work as expected.

---

## 7. CODE QUALITY

### 7.1 🟡 `actions.ts` — `SaveKeysResult` type is a union that includes incompatible shapes

**File:** `settings/actions.ts:33-37`
```ts
export type SaveKeysResult =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { ok: true; data: { savedCount: number; clearedCount: number; at: number } }
  | { ok: false; error: string };
```
This type mixes `{ status: ... }` and `{ ok: ... }` discriminants. The `save-bar.tsx` consumer has to check `'ok' in state` and `'status' in state` separately, which is error-prone.

**Fix:** Unify to a single discriminant, e.g., all use `ok: boolean`.

### 7.2 🟡 `actions.ts` — `exportDataAction` exports `userId` in some records

**File:** `settings/actions.ts` (~exportDataAction)
```ts
const data = {
  // ...
  threads: threads.map((t) => ({ ...t, userId: undefined })),
  messages: messages.map((m) => ({ ...m, userId: undefined })),
  // ...
  journalEntries,  // ❌ userId NOT stripped
  alerts,          // ❌ userId NOT stripped
  symbols,         // ❌ userId NOT stripped
  pushSubscriptions, // ❌ userId NOT stripped
  // ...
};
```
`userId` is stripped from `threads` and `messages` but NOT from `journalEntries`, `alerts`, `symbols`, `pushSubscriptions`, `memories`, `sharedSnapshots`, `telemetry`, `spend`, `briefings`, and `auditLogs`. This leaks the user's ID in the exported data.

**Fix:** Strip `userId` from all exported records, or don't strip any (since the user already knows their own ID).

### 7.3 🟡 `data-card.tsx` — Imports `signOut` from `next-auth/react` but may not need it

**File:** `settings/_components/data-card.tsx:12`
```ts
import { signOut } from 'next-auth/react';
```
The `signOut` is used after account deletion, which is correct, but the import is at the top level. If `next-auth/react` isn't configured, this could cause issues.

### 7.4 🟡 `bulk-test-button.tsx` — `summary` variable shadowed in inner scope

**File:** `settings/api-keys/_components/bulk-test-button.tsx:73`
```ts
} else if (parsed.type === 'done') {
  const summary = parsed.summary as BulkTestSummary;  // shadows outer `summary` state
  setSummary(summary);
```
The local `const summary` shadows the `useState` `summary` variable. While it works because `setSummary` is called with the local value, it's confusing.

**Fix:** Rename the local variable, e.g., `const doneSummary = parsed.summary as BulkTestSummary;`

### 7.5 🟡 Multiple files — `console.warn`/`console.error` left in production code

Found in:
- `signal-feedback.tsx:43` — `console.warn('[signal-feedback] failed', err)`
- `api-keys-landing-banner.tsx:39` — `console.warn('[settings] localStorage unavailable...')`
- `api-keys-landing-banner.tsx:49` — `console.warn('[settings] failed to persist...')`
- `notifications-card.tsx:34` — `console.error('[settings] failed to list push subscriptions')`
- `usage/page.tsx:30` — `console.warn('[settings] MAX_DAILY_USD not configured')`
- `data-card.tsx:~40` — `console.error('[settings] failed to parse bookmarks...')`
- `bulk-test-button.tsx:61` — `console.error('Failed to parse streaming line:', line)`

**Fix:** Route through a proper logger or remove if not needed in production.

### 7.6 🟡 `about-card.tsx` — Uses `readFileSync` in a server component

**File:** `settings/_components/about-card.tsx:21-28`
```ts
import { readFileSync } from 'node:fs';
// ...
function getBuildId(): string | null {
  if (_buildId === undefined) {
    try {
      const file = path.join(process.cwd(), '.build-id');
      const text = readFileSync(file, 'utf-8');
      _buildId = text.trim() || null;
    } catch {
      _buildId = null;
    }
  }
  return _buildId;
}
```
This is a synchronous file read in a server component. While it's cached in a module-level variable, the first call blocks the event loop. On serverless deployments, `.build-id` may not exist.

**Fix:** Use `import 'server-only'` and consider reading the build ID at build time via an environment variable instead.

---

## 8. RESPONSIVE DESIGN

### 8.1 🟡 `portfolio/loading.tsx` — Fixed 3-column grid on mobile

**File:** `settings/portfolio/loading.tsx:12`
```tsx
<div className="grid grid-cols-3 gap-3">
```
The skeleton uses a fixed 3-column grid, but the actual portfolio page likely uses responsive columns. On a 400px screen, 3 columns of skeleton cards will be very narrow.

**Fix:** Use `grid-cols-1 sm:grid-cols-3` to match the actual page layout.

### 8.2 🟡 `track-record/loading.tsx` — Fixed 2-column grid on mobile

**File:** `settings/track-record/loading.tsx:14`
```tsx
<div className="grid grid-cols-2 gap-3">
```
Same issue — fixed 2 columns on mobile. Should be `grid-cols-1 sm:grid-cols-2`.

### 8.3 🟡 `notification-prefs-card.tsx` — Table may overflow on mobile

**File:** `settings/_components/notification-prefs-card.tsx:93`
```tsx
<div className="overflow-x-auto">
  <table className="w-full text-sm">
```
The notification preferences table has 4 columns (event type + 3 channels). On narrow screens, this will require horizontal scrolling. The `overflow-x-auto` handles it, but the table could be redesigned as stacked cards on mobile.

### 8.4 🟡 `settings-nav.tsx` — Horizontal scroll nav has no scroll indicator

On mobile, the settings nav is a horizontal scrolling list with `overflow-x-auto`. There's no visual indicator (fade, scrollbar styling, or arrow) showing there are more items to scroll to.

---

## 9. FORM VALIDATION & SUBMISSION

### 9.1 🟠 `change-password-card.tsx` — Client-side validation doesn't match server-side

**File:** `settings/_components/change-password-card.tsx:80`
The client shows validation indicators for: min 8 chars, uppercase, lowercase, number. The server (`changePasswordAction`) validates the same. However, the client doesn't prevent submission when validation fails — the `required` and `minLength={8}` attributes only check emptiness and length, not character requirements.

**Fix:** Disable the submit button until all validation criteria are met, or add explicit form validation before submission.

### 9.2 🟡 `profile-form.tsx` — No client-side validation for name length

**File:** `settings/_components/profile-form.tsx:38-44`
```tsx
<Input 
  id="display-name"
  name="name" 
  defaultValue={initialName} 
  placeholder="Your name"
  required
/>
```
The server validates `name.length` between 1 and 80 characters, but the client only has `required`. A user could enter 100+ characters and get a server error.

**Fix:** Add `maxLength={80}` and `minLength={1}` to the input.

### 9.3 🟡 `usage-limits-form.tsx` — No validation for monthly budget limit

**File:** `settings/usage/_components/usage-limits-form.tsx`
The monthly budget limit input accepts any integer. The server parses it with `parseInt` but doesn't validate it's positive or within a reasonable range. A user could enter a negative number or an extremely large value.

**Fix:** Add `min="0"` and a reasonable `max` to the input, and validate server-side.

---

## 10. STATE SYNC & PERSISTION

### 10.1 🔴 `page.tsx` ↔ `notification-prefs-card.tsx` — `noiseConfig` stored inside `notificationPrefs` field

As noted in bug 1.3, the `noiseConfig` is extracted from within the `notificationPreferences` JSON field. When `updateNotificationPrefsAction` saves the prefs matrix, it overwrites the entire `notificationPreferences` field, destroying the `noiseConfig`. This is a data loss bug.

**Fix:** Store `noiseConfig` in a separate field, or merge instead of overwrite in `updateNotificationPrefsAction`.

### 10.2 🟠 `preferences-card.tsx` — Dual persistence (localStorage + DB) can drift

**File:** `settings/_components/preferences-card.tsx:34-46`
```ts
const [prefs, setPrefs, hydrated] = useLocalStorage<Prefs>(STORAGE_KEY, DEFAULTS);

useEffect(() => {
  if (hydrated && initialPrefs) {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const merged: Prefs = { ... };
      setPrefs(merged);
    }
  }
}, [hydrated, initialPrefs, setPrefs]);
```
Preferences are stored in BOTH localStorage and the DB (via `updateUIPrefsAction`). If the user clears localStorage or uses a different device, the DB value is used to seed localStorage. But if localStorage already has data, the DB value is ignored. This means changes made on device A won't appear on device B until device B clears its localStorage.

**Fix:** Always merge DB values over localStorage defaults, or use only DB persistence.

### 10.3 🟡 `appearance-card.tsx` — Theme applied immediately via DOM but persisted async

**File:** `settings/_components/appearance-card.tsx:22-27`
```ts
function applyTheme(theme: Theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    document.documentElement.dataset.theme = theme;
  }
}
```
The theme is applied to the DOM immediately (good UX), but the server action to persist it is fire-and-forget. If the action fails, the theme reverts on next page load with no error shown.

### 10.4 🟡 `ai-prefs-card.tsx` — Uses `useLocalStorage` AND server action for custom instructions

**File:** `settings/_components/ai-prefs-card.tsx`
The AI preferences (custom instructions) are stored in both localStorage (`AI_PREFS_STORAGE_KEY`) and the DB (via `updateAiPrefsAction`). Same dual-persistence drift issue as `preferences-card.tsx`.

---

## Summary of Priority Fixes

| Priority | Issue | File(s) |
|----------|-------|---------|
| 🔴 P0 | "Icon" prefix artifacts in UI text | ~15 files |
| 🔴 P0 | `noiseConfig` destroyed by `updateNotificationPrefsAction` | `page.tsx`, `actions.ts` |
| 🔴 P0 | 2FA secret stored before verification | `actions.ts` |
| 🟠 P1 | `exportDataAction` no password verification | `actions.ts` |
| 🟠 P1 | `changePasswordAction` missing `revalidatePath` | `actions.ts` |
| 🟠 P1 | `deleteAccountAction` doesn't sign out | `actions.ts` |
| 🟠 P1 | `api-keys/page.tsx` returns null instead of redirect | `api-keys/page.tsx` |
| 🟠 P1 | `exportDataAction` leaks userId in some records | `actions.ts` |
| 🟠 P1 | No error boundaries for individual cards | `page.tsx` |
| 🟠 P1 | `checkIsAdmin()` not parallelized | `page.tsx` |
| 🟡 P2 | `billing-plans.tsx` manual CSRF extraction | `billing-plans.tsx` |
| 🟡 P2 | `subscription-status.tsx` local `cn` function | `subscription-status.tsx` |
| 🟡 P2 | `onboarding-reset-card.tsx` native `confirm()` | `onboarding-reset-card.tsx` |
| 🟡 P2 | No `billing/loading.tsx` | `billing/` |
| 🟡 P2 | Dual persistence drift (localStorage + DB) | `preferences-card.tsx`, `ai-prefs-card.tsx` |
| 🟡 P2 | `signal-feedback.tsx` no error feedback | `signal-feedback.tsx` |
| 🟡 P2 | `telegram/page.tsx` no auth check | `telegram/page.tsx` |
| 🟡 P2 | `profile/page.tsx` weak auth check | `profile/page.tsx` |
| 🟡 P2 | Console statements in production | Multiple files |
| 🟡 P2 | Responsive skeleton grids | `portfolio/loading.tsx`, `track-record/loading.tsx` |



---

## H. Admin, Layout, UI, Providers, Hooks & Lib Analysis

# HamaFX-Ai — Admin / Layout / UI / Providers / Hooks / Lib Analysis

**Scope:** Admin pages, Offline pages, Layout/Navigation, UI component library, Providers, Hooks, Lib utilities, Middleware
**Files analyzed:** 48 files across 8 categories

---

## Table of Contents

1. [Admin Pages](#1-admin-pages)
2. [Offline Pages](#2-offline-pages)
3. [Layout / Navigation](#3-layout--navigation)
4. [UI Component Library](#4-ui-component-library)
5. [Providers](#5-providers)
6. [Hooks](#6-hooks)
7. [Lib Utilities](#7-lib-utilities)
8. [Middleware](#8-middleware)
9. [Cross-Cutting Issues](#9-cross-cutting-issues)
10. [Priority Summary](#10-priority-summary)

---

## 1. Admin Pages

### 1.1 `admin/layout.tsx` — Security: No Admin Audit Logging

**File:** `apps/web/src/app/(app)/admin/layout.tsx`

**Finding:** The admin layout calls `checkIsAdmin()` and redirects to `/chat` on failure, but there's no audit log of admin access attempts. Unlike `withAdminAuth()` in `admin-auth.ts` which logs `log.info('admin route accessed')`, the layout gate is silent.

**Severity:** Medium (Security)

**Fix:** Add logging to `checkIsAdmin()` or wrap the layout's admin check with a log call:
```ts
import { createScopedLoggerWithContext } from '@/lib/logger';
const log = createScopedLoggerWithContext({ component: 'admin-layout' });
if (!isAdmin) {
  log.warn('admin layout access denied');
  redirect('/chat');
}
log.info('admin layout accessed');
```

### 1.2 `admin/layout.tsx` — UX: Redirect to `/chat` Instead of `/login`

**File:** `apps/web/src/app/(app)/admin/layout.tsx:24`

**Finding:** Non-admin users are redirected to `/chat`, not shown a "403 Forbidden" page. This is confusing — a user who accidentally navigates to `/admin` sees the chat page with no explanation. The nav drawer shows the Admin link only for admins, but a direct URL navigation gives no feedback.

**Severity:** Low (UX)

**Fix:** Either redirect to a 403 page or show an inline "Access denied" message instead of a silent redirect.

### 1.3 `admin/page.tsx` — Performance: All Tab Components Mount Simultaneously

**File:** `apps/web/src/app/(app)/admin/page.tsx:50-52`

**Finding:** The admin page uses `useState` for tab switching and renders only the active component. However, each tab component (cron table, telemetry, traces, users, etc.) fetches data on mount via `useEffect`. When switching tabs, the previous component unmounts and the new one mounts fresh — re-fetching every time. There's no caching.

**Severity:** Medium (Performance)

**Fix:** Wrap tab components in React Query hooks (the QueryClient is already available) so data persists across tab switches. Alternatively, keep all components mounted with `hidden` class toggling.

### 1.4 `admin/page.tsx` — Accessibility: Tab Navigation Not ARIA-Compliant

**File:** `apps/web/src/app/(app)/admin/page.tsx:40-55`

**Finding:** The admin tabs use `<nav>` + `<ul>` + `<button aria-pressed>`, but they don't use `role="tablist"` / `role="tab"` / `role="tabpanel"`. Keyboard arrow navigation between tabs is missing — users must Tab through each one. The `<section aria-live="polite">` is good for announcing content changes.

**Severity:** Low (Accessibility)

**Fix:** Either use the `Segmented` component (which already has proper ARIA roles) or add `role="tablist"` to the `<ul>`, `role="tab"` + `aria-selected` to buttons, `role="tabpanel"` to the section, and implement arrow-key navigation.

### 1.5 `admin-cron-table.tsx` — Bug: No Error State UI

**File:** `apps/web/src/app/(app)/admin/_components/admin-cron-table.tsx:42-48`

**Finding:** When the fetch fails, a toast is shown but the component renders an empty table (since `runs` stays `[]`). The user sees "No cron runs found" which is misleading — it looks like there's no data when actually the request failed.

**Severity:** Medium (UX)

**Fix:** Add an `error` state and render a retry button when the fetch fails, similar to the pattern in `admin-log-viewer.tsx`.

### 1.6 `admin-cron-table.tsx` — Missing: No `finishedAt` Column

**File:** `apps/web/src/app/(app)/admin/_components/admin-cron-table.tsx:26-31`

**Finding:** The `CronRun` interface has `finishedAt: string | null` but the table only shows `startedAt`. Duration (finishedAt - startedAt) would be valuable for debugging slow cron jobs.

**Severity:** Low (Feature gap)

### 1.7 `admin-diagnostic-traces.tsx` — Same Error State Issue as 1.5

**File:** `apps/web/src/app/(app)/admin/_components/admin-diagnostic-traces.tsx:42-48`

**Finding:** Identical pattern to cron table — fetch failure shows "No traces found" instead of an error state with retry.

**Severity:** Medium (UX)

### 1.8 `admin-feature-flags.tsx` — Bug: Optimistic Update Without Rollback

**File:** `apps/web/src/app/(app)/admin/_components/admin-feature-flags.tsx:38-46`

**Finding:** The `toggle` function updates local state only after the fetch succeeds (`setFeatures((prev) => ({ ...prev, [key]: next }))`). This is correct (not optimistic), but the `Switch` component visually flips immediately on click since `onCheckedChange` fires before the async toggle completes. The user sees the switch flip, then it stays flipped even if the request is in flight. If the request fails, the switch is in the wrong visual state until the next re-render.

Actually, looking more carefully: the `Switch` is controlled (`checked={value}`), so it won't flip until `setFeatures` runs. This is correct. However, there's no loading/disabled state on the Switch during the request, so rapid toggling could cause race conditions.

**Severity:** Low (Race condition)

**Fix:** Add a `toggling` state that disables the Switch during the request:
```tsx
const [togglingKey, setTogglingKey] = useState<string | null>(null);
// In toggle: setTogglingKey(key); ... finally: setTogglingKey(null);
// On Switch: disabled={togglingKey === key}
```

### 1.9 `admin-log-viewer.tsx` — Bug: `process.env.NODE_ENV` Check in Client Component

**File:** `apps/web/src/app/(app)/admin/_components/admin-log-viewer.tsx:39-42`

**Finding:** `process.env.NODE_ENV` is used in a client component. While Next.js does inline `NODE_ENV` at build time, this check means the "Connect" button is permanently disabled in production builds. The error message says "Log streaming is only available in development" but the button is still rendered — confusing UX in production.

**Severity:** Low (UX)

**Fix:** Either don't render the connect button at all in production, or gate the entire component behind a feature flag / admin setting.

### 1.10 `admin-log-viewer.tsx` — Bug: Log Lines Use Array Index as Key

**File:** `apps/web/src/app/(app)/admin/_components/admin-log-viewer.tsx:77`

**Finding:** `lines.map((line, i) => <pre key={i}>...)` uses array index as key. Since lines are prepended/shifted (the `next.shift()` at line 56), React's reconciliation may render incorrect content during updates.

**Severity:** Low (React anti-pattern)

**Fix:** Use a monotonic counter or `crypto.randomUUID()` as key when adding lines.

### 1.11 `admin-log-viewer.tsx` — Missing: No Auto-Scroll to Bottom

**File:** `apps/web/src/app/(app)/admin/_components/admin-log-viewer.tsx:68-79`

**Finding:** New log lines are appended to the end of the list, but the container doesn't auto-scroll to show them. Users must manually scroll down to see new logs.

**Severity:** Low (UX)

**Fix:** Add a `useRef` on the scroll container and `scrollIntoView({ behavior: 'smooth' })` on new lines.

### 1.12 `admin-onboarding-control.tsx` — Bug: Uses `window.confirm()` Instead of `ConfirmDrawer`

**File:** `apps/web/src/app/(app)/admin/_components/admin-onboarding-control.tsx:59`

**Finding:** `confirm('Reset onboarding?...')` uses the native browser confirm dialog. The codebase has a purpose-built `ConfirmDrawer` component (`components/ui/confirm-drawer.tsx`) with a `useConfirm()` hook specifically designed to replace `window.confirm()`. This is inconsistent with the design system.

**Severity:** Medium (Design system drift)

**Fix:** Replace with `useConfirm()`:
```tsx
const [confirmEl, confirm] = useConfirm();
// In handleReset:
const ok = await confirm({ title: 'Reset onboarding?', tone: 'danger', confirmLabel: 'Reset' });
if (!ok) return;
// Render {confirmEl} in the component JSX
```

### 1.13 `admin-onboarding-control.tsx` — Code Quality: Indentation Error

**File:** `apps/web/src/app/(app)/admin/_components/admin-onboarding-control.tsx:51`

**Finding:** `setStatus(data);    } catch {` — the `} catch {` is on the same line as `setStatus(data);` with extra spaces. This is a formatting error that suggests the file wasn't run through Prettier.

**Severity:** Trivial (Code quality)

### 1.14 `admin-tool-telemetry-table.tsx` — Same Error State Issue as 1.5

**File:** `apps/web/src/app/(app)/admin/_components/admin-tool-telemetry-table.tsx:42-48`

**Finding:** Same pattern — fetch failure shows "No telemetry found" instead of an error/retry state.

**Severity:** Medium (UX)

### 1.15 `admin-user-table.tsx` — Same Error State Issue + Missing Pagination

**File:** `apps/web/src/app/(app)/admin/_components/admin-user-table.tsx:42-48, 57`

**Finding:** Same error state issue. Additionally, the table fetches `?limit=50&offset=0` but shows `Total: ${total}` — if there are more than 50 users, there's no pagination UI to see them. The total count is displayed but there's no way to navigate beyond the first 50.

**Severity:** Medium (Feature gap)

**Fix:** Add pagination controls (next/prev or infinite scroll) when `total > users.length`.

### 1.16 `admin-user-table.tsx` — Security: User Emails Displayed in Plain Text

**File:** `apps/web/src/app/(app)/admin/_components/admin-user-table.tsx:74`

**Finding:** User emails are rendered in full in the admin table. While this is an admin-only page, consider masking emails for privacy (e.g., `h***@outlook.com`) with a reveal-on-click affordance.

**Severity:** Low (Privacy)

### 1.17 All Admin Tables — Accessibility: No `<caption>` or `scope` on `<th>`

**File:** All admin table components

**Finding:** None of the admin tables include a `<caption>` element or `scope="col"` on `<th>` elements. Screen readers may have difficulty associating header cells with data cells.

**Severity:** Low (Accessibility)

**Fix:** Add `scope="col"` to all `<th>` elements and consider adding a visually-hidden `<caption>`.

---

## 2. Offline Pages

### 2.1 `offline/page.tsx` — Bug: Hardcoded Black Text on Potentially Dark Background

**File:** `apps/web/src/app/(app)/offline/page.tsx:23-25`

**Finding:** The brand mark uses `text-black text-2xl font-bold` — hardcoded black text. On dark mode (which the app supports), this "H" will be invisible or nearly invisible against the dark background. The `style={{ background: 'none' }}` also removes any background that might provide contrast.

**Severity:** High (Design system drift / Dark mode bug)

**Fix:** Use design tokens: `text-fg` instead of `text-black`, or use the same brand mark styling as the TopBar: `bg-brand text-brand-fg`.

### 2.2 `offline/page.tsx` — Bug: `export const dynamic = 'force-static'` in Client Component

**File:** `apps/web/src/app/(app)/offline/page.tsx:5`

**Finding:** `export const dynamic = 'force-static'` is a Next.js route segment config, but the component is marked `'use client'`. Route segment configs are only effective in server components. This export is silently ignored — the page won't be force-static.

**Severity:** Medium (Bug)

**Fix:** Move the `dynamic` export to a separate `offline/layout.tsx` server component, or remove it if the page is intended to be client-side only.

### 2.3 `offline/page.tsx` — Missing: No Copyright Header

**File:** `apps/web/src/app/(app)/offline/page.tsx`

**Finding:** Unlike every other file in the project, this file has no Apache 2.0 copyright header.

**Severity:** Trivial (Code quality)

### 2.4 `offline/loading.tsx` — Design: Skeleton Doesn't Match Offline Page Layout

**File:** `apps/web/src/app/(app)/offline/loading.tsx`

**Finding:** The loading skeleton shows a 12×12 square, a 6-unit-high bar, and a 4-unit-high bar. The actual offline page has a 16×16 brand mark, an h1, and a paragraph. The sizes don't match, causing a layout shift when the page loads.

**Severity:** Low (UX)

**Fix:** Match the skeleton dimensions to the actual page content: `size-16` for the brand mark, `h-7 w-32` for the title, `h-4 w-64` for the description.

---

## 3. Layout / Navigation

### 3.1 `top-bar.tsx` — Design System: Hardcoded `bg-black`

**File:** `apps/web/src/components/layout/top-bar.tsx:42`

**Finding:** The TopBar uses `bg-black` instead of a design token like `bg-bg` or `surface-elevated`. This breaks dark mode consistency — the top bar will always be pure black regardless of the theme system.

**Severity:** High (Design system drift)

**Fix:** Replace `bg-black` with `bg-bg` or `surface-elevated` to use the design token system.

### 3.2 `top-bar.tsx` — Bug: `pt-safe` Is Not a Standard Tailwind Class

**File:** `apps/web/src/components/layout/top-bar.tsx:42`

**Finding:** `pt-safe` is used as a Tailwind class, but it's not a standard Tailwind utility. It likely requires a custom plugin or utility definition. If not defined, this class silently does nothing, and the top bar won't have safe-area-inset padding on iOS.

**Severity:** Medium (PWA / iOS)

**Fix:** Verify `pt-safe` is defined in the Tailwind config. If not, replace with `style={{ paddingTop: 'env(safe-area-inset-top)' }}` or define a custom utility.

### 3.3 `nav-drawer.tsx` — Bug: `useEffect` Auto-Close Depends on `setOpen` Causing Infinite Loop Risk

**File:** `apps/web/src/components/layout/nav-drawer.tsx:67-69`

**Finding:** 
```ts
useEffect(() => {
  setOpen(false);
}, [pathname, setOpen]);
```
`setOpen` is from `useNavDrawer()` which returns `{ ...useContext(StateCtx), ...useContext(ActionsCtx) }`. The `setOpen` function is memoized via `useCallback` in the provider, so this should be stable. However, the `useNavDrawer()` hook creates a new merged object on every render: `{ ...useContext(StateCtx), ...useContext(ActionsCtx) }`. This means `setOpen` reference is stable (from `useCallback`), so the effect is safe. No bug here, but the pattern is fragile.

**Severity:** None (verified safe, but fragile pattern)

### 3.4 `nav-drawer.tsx` — Security: Logout Doesn't Clear All Client State

**File:** `apps/web/src/components/layout/nav-drawer.tsx:73-83`

**Finding:** The `logout()` function calls `queryClient.clear()` which clears React Query cache, but it doesn't:
- Clear `localStorage` (auth tokens, user preferences, install dismissed count)
- Clear `sessionStorage`
- Reset any Zustand/global state stores

After logout, stale user data may persist in localStorage and be visible if the user logs in as a different user.

**Severity:** Medium (Security)

**Fix:** Add `localStorage.clear()` and `sessionStorage.clear()` before `router.push('/login')`.

### 3.5 `nav-drawer.tsx` — UX: No Loading State on Logout

**File:** `apps/web/src/components/layout/nav-drawer.tsx:73-83`

**Finding:** The logout button has no loading/disabled state during the async `fetch('/api/auth/signout')` call. A user could tap "Sign out" multiple times, triggering multiple signout requests.

**Severity:** Low (UX)

**Fix:** Add a `loggingOut` state and disable the button during the request.

### 3.6 `nav-drawer.tsx` — Design: Trailing Whitespace in Overlay Class

**File:** `apps/web/src/components/layout/nav-drawer.tsx:63`

**Finding:** `"bg-overlay fixed inset-0 z-[60] "` has a trailing space. Minor but indicates a formatting miss.

**Severity:** Trivial

### 3.7 `nav-drawer-context.tsx` — Performance: `useNavDrawer()` Creates New Object Every Render

**File:** `apps/web/src/components/layout/nav-drawer-context.tsx:37-39`

**Finding:** 
```ts
export function useNavDrawer(): NavDrawerState & NavDrawerActions {
  return { ...useContext(StateCtx), ...useContext(ActionsCtx) };
}
```
This creates a new object on every render. Any component using `useNavDrawer()` will re-render whenever its parent re-renders, even if the context values haven't changed, because the returned object reference always changes. `NavTrigger` uses this hook.

**Severity:** Low (Performance)

**Fix:** Use `useMemo` or have consumers call `useNavDrawerState()` and `useNavDrawerActions()` separately (which are already exported and properly memoized).

### 3.8 `nav-trigger.tsx` — Bug: Always Calls `setOpen(true)` Instead of `toggle()`

**File:** `apps/web/src/components/layout/nav-drawer.tsx:37`

**Finding:** The NavTrigger button's `onClick` always calls `setOpen(true)`, never `toggle()`. The `aria-expanded={open}` suggests it should toggle, but clicking it when open does nothing (it only opens). Since the drawer auto-closes on route change and has swipe-to-dismiss, this is probably intentional, but the `open` variable is read from context and used for `aria-label`/`aria-expanded` — it's misleading since the button only opens.

**Severity:** Low (UX / ARIA accuracy)

**Fix:** Either use `toggle()` or remove the `open` variable and hardcode `aria-expanded={false}` / `aria-label="Open navigation"`.

### 3.9 `command-palette.tsx` — Bug: `GROUP_LABELS.settings` Shows "IconSettings" Instead of "Settings"

**File:** `apps/web/src/components/layout/command-palette.tsx:37`

**Finding:** 
```ts
const GROUP_LABELS: Record<CommandGroup, string> = {
  navigation: 'Navigate',
  create: 'Create',
  settings: 'IconSettings',  // ← Bug: should be 'Settings'
};
```
The settings group header in the command palette renders "IconSettings" as visible text.

**Severity:** High (Visible UI bug)

**Fix:** Change `'IconSettings'` to `'Settings'`.

### 3.10 `command-palette.tsx` — Bug: Placeholder Shows "IconSearch…" Instead of "Search…"

**File:** `apps/web/src/components/layout/command-palette.tsx:~120`

**Finding:** The input placeholder is `"IconSearch\u2026"` which renders as "IconSearch…" — the "Icon" prefix is a leftover from a find-and-replace that converted icon references. The `sr-only` label also says "IconSearch commands".

**Severity:** High (Visible UI bug)

**Fix:** Change to `"Search\u2026"` and `"Search commands"`.

### 3.11 `command-palette.tsx` — Bug: `aria-activedescendant` Uses Wrong Index Format

**File:** `apps/web/src/components/layout/command-palette.tsx:~115`

**Finding:** `aria-activedescendant={... ? \`command-option-${activeIdx}\` : undefined}` references the element with `id="command-option-${flatIndex}"`. But `flatIndex` is computed via `flatRows.findIndex(...)` inside the render loop — if two commands have the same id (shouldn't happen but defensively), the IDs would collide. More importantly, the `aria-activedescendant` uses `activeIdx` while the element ID uses `flatIndex` — these should always be the same value, but the indirection is fragile.

**Severity:** Low (Accessibility)

### 3.12 `command-palette.tsx` — Performance: `flatRows.findIndex()` Called Per Row

**File:** `apps/web/src/components/layout/command-palette.tsx:~165`

**Finding:** Inside the render loop for each group's rows, `flatRows.findIndex((r) => r.command.id === command.id)` is called for each row. This is O(n²) — for 30 commands, it's 900 comparisons per render. Not a real problem at this scale, but architecturally wasteful.

**Severity:** Trivial (Performance)

**Fix:** Pre-compute a `Map<string, number>` of command id → flat index.

### 3.13 `command-palette.tsx` — Missing: No Admin Commands

**File:** `apps/web/src/components/layout/command-palette.tsx` / `apps/web/src/lib/commands.ts`

**Finding:** The command registry has no admin commands (navigate to /admin, reset onboarding, toggle feature flags, etc.). Admin users who want to quickly jump to the admin panel can't do so via ⌘K.

**Severity:** Low (Feature gap)

**Fix:** Add admin commands to `COMMANDS` in `commands.ts`, conditionally filtered by admin status.

### 3.14 `command-palette.tsx` — Missing: No Dashboard Command

**File:** `apps/web/src/lib/commands.ts`

**Finding:** The command list has navigation to Chat, Chart, News, Calendar, Alerts, Journal, Settings — but no Dashboard command. The nav drawer has Dashboard as the first item.

**Severity:** Low (Feature gap)

### 3.15 `install-nudge.tsx` — Bug: `bumpDismiss()` Called on Install Success

**File:** `apps/web/src/components/layout/install-nudge.tsx:78-83`

**Finding:** `onInstall()` calls `bumpDismiss()` at the end, even when the user accepts the install. This means accepting the install counts as a "dismiss" — incrementing the dismiss counter. If the user uninstalls and revisits, they're one step closer to never seeing the prompt again.

**Severity:** Low (Logic)

**Fix:** Only call `bumpDismiss()` in `onDismiss()`, not in `onInstall()` when `outcome === 'accepted'`.

### 3.16 `install-nudge.tsx` — Bug: iOS Detection Includes macOS with Touch

**File:** `apps/web/src/components/layout/install-nudge.tsx:55-58`

**Finding:** 
```ts
const isMac = /Macintosh/.test(ua);
const isTouch = 'ontouchend' in window || navigator.maxTouchPoints > 0;
const isiOS = /iPhone|iPad|iPod/.test(ua) || (isMac && isTouch);
```
This detects iPadOS 13+ (which reports as Macintosh) correctly, but also flags macOS laptops with touch screens (some Windows laptops running macOS VMs, or Macs with Touch Bar) as iOS. The "Add to Home Screen" instruction is wrong for these devices.

**Severity:** Low (Edge case)

**Fix:** Add `!/Macintosh/.test(ua) || /iPad/.test(ua)` refinement, or check for `navigator.standalone` more carefully.

### 3.17 `lazy-chrome.tsx` — Good: Proper Code Splitting

**File:** `apps/web/src/components/layout/lazy-chrome.tsx`

**Finding:** `CommandPalette` and `InstallNudge` are dynamically imported with `ssr: false`. This is correct — these are client-only interactive components that don't need to be in the SSR bundle.

**Severity:** None (positive finding)

### 3.18 `offline-banner.tsx` — Bug: `retrying` State Never Reset to `false`

**File:** `apps/web/src/components/layout/offline-banner.tsx:37-40`

**Finding:** The retry button sets `setRetrying(true)` then calls `window.location.reload()`. Since the page reloads, `retrying` is never set back to `false`. If the reload fails (e.g., still offline), the button stays disabled with the spinner forever. The banner shows "Retry" with a spinner but the user can't click it again.

**Severity:** Medium (UX bug)

**Fix:** Add a timeout to reset `retrying`:
```ts
setRetrying(true);
window.location.reload();
setTimeout(() => setRetrying(false), 5000); // reset after 5s in case reload stalls
```

### 3.19 `offline-banner.tsx` — Design: `pointer-events-none` on Container May Block Clicks

**File:** `apps/web/src/components/layout/offline-banner.tsx:29`

**Finding:** The outer `m.div` has `pointer-events-none` while the inner content div has `pointer-events-auto`. This is the correct pattern for overlay banners, but the `fixed inset-x-0 z-40` means the full-width container covers the viewport. The inner div only covers its own width. This is fine.

**Severity:** None (verified correct)

### 3.20 `skip-to-content.tsx` — Bug: `scrollIntoView()` Without Options May Jump Instantly

**File:** `apps/web/src/components/layout/skip-to-content.tsx:22`

**Finding:** `target?.scrollIntoView()` without `{ behavior: 'smooth' }` jumps instantly. For a skip link, instant jump is actually the correct behavior (screen reader users want immediate focus, not animation). No bug.

**Severity:** None (verified correct)

### 3.21 `skip-to-content.tsx` — Missing: No Fallback When Target Doesn't Exist

**File:** `apps/web/src/components/layout/skip-to-content.tsx:20-23`

**Finding:** If `document.getElementById(targetId)` returns null, both `target?.focus()` and `target?.scrollIntoView()` are no-ops. The default `href="#main-content"` still navigates to the anchor, which is correct. But the target element needs `tabindex={-1}` to be focusable — if it doesn't have that, `focus()` does nothing.

**Severity:** Low (Accessibility)

**Fix:** Ensure the main content element has `tabindex={-1}` and an `id="main-content"`.

---

## 4. UI Component Library

### 4.1 `button.tsx` — Design System: `md` Size Comment Says 48px But Class Is `h-10` (40px)

**File:** `apps/web/src/components/ui/button.tsx:39-43`

**Finding:** The comment says:
```
md = 48px (h-12) — default. Comfortable thumb-zone target.
```
But the actual class is:
```ts
md: 'h-10 px-4 text-sm rounded-sm',
```
`h-10` = 40px, not 48px. The `sm` and `md` sizes are both `h-10` (40px), making them identical in height. The `lg` is `h-12` (48px), which the comment says should be `md`.

**Severity:** High (Design system drift / Button sizing bug)

**Fix:** Either fix the class to `h-12 px-4 text-sm rounded-sm` for `md`, or update the comment to reflect the actual sizes.

### 4.2 `button.tsx` — Dead Code: Empty `inlineStyle` Variable

**File:** `apps/web/src/components/ui/button.tsx:62-63`

**Finding:** 
```ts
// Variant-driven inline styles removed — flat surfaces only.
const inlineStyle: React.CSSProperties = style ?? {};
```
The comment says styles were removed, but the variable and `style={inlineStyle}` prop remain. This is dead code — `inlineStyle` is just `style` passed through.

**Severity:** Trivial (Dead code)

**Fix:** Remove the `inlineStyle` variable and use `style` directly.

### 4.3 `button.tsx` — Missing: No Focus Ring

**File:** `apps/web/src/components/ui/button.tsx:66-72`

**Finding:** The Button has no `focus-visible:ring` or `focus-visible:outline` styles. Keyboard users get no visual indicator when a button is focused. The Input component has `focus-visible:outline-none` with a ring, but Button has nothing.

**Severity:** High (Accessibility)

**Fix:** Add focus ring classes:
```ts
'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
```

### 4.4 `input.tsx` — Bug: Empty String in `cn()` Call

**File:** `apps/web/src/components/ui/input.tsx:34`

**Finding:** There's an empty string `''` as an argument to `cn()`:
```ts
'border-border focus:border-border focus:ring-2 focus:ring-fg/30',
'',  // ← useless empty string
'transition-all duration-200',
```
This is harmless (clsx ignores empty strings) but indicates a leftover from a removed class.

**Severity:** Trivial (Code quality)

### 4.5 `input.tsx` — Bug: Focus Border Color Doesn't Change

**File:** `apps/web/src/components/ui/input.tsx:33-34`

**Finding:** Both the default and focus states use `border-border`:
```ts
error
  ? 'border-danger/60 focus:border-danger/80 ...'
  : 'border-border focus:border-border ...',
```
The focus border color is the same as the default border color. There's no visual feedback from the border on focus — only the ring provides feedback. This may be intentional (minimal design), but it's unusual.

**Severity:** Low (UX)

### 4.6 `drawer.tsx` — Bug: Focus Effect Runs Only Once on Mount

**File:** `apps/web/src/components/ui/drawer.tsx:59-83`

**Finding:** The `useEffect` that focuses the first focusable element has `[]` deps:
```ts
React.useEffect(() => {
  // Focus the first focusable element on open...
}, []);
```
This runs only once when `DrawerContent` mounts. If the drawer is opened, closed, and reopened, the effect won't re-run because the component stays mounted (vaul keeps the portal mounted). The focus move only works on the first open.

**Severity:** Medium (Accessibility)

**Fix:** Add an `open` dependency or use a `key` that changes on open. Alternatively, watch the `open` prop:
```ts
React.useEffect(() => {
  if (!open) return;
  // focus logic
}, [open]);
```
But `DrawerContent` doesn't receive `open` directly. The parent `Drawer` component would need to pass it down, or use a different approach.

### 4.7 `drawer.tsx` — Design: Trailing Space in Overlay Class

**File:** `apps/web/src/components/ui/drawer.tsx:29`

**Finding:** `'fixed inset-0 z-50 bg-overlay '` has a trailing space.

**Severity:** Trivial

### 4.8 `confirm-drawer.tsx` — Bug: `useConfirm()` Resolves `true` Before Async `onConfirm` Completes

**File:** `apps/web/src/components/ui/confirm-drawer.tsx:104-113`

**Finding:** In the imperative `useConfirm()` hook, `handleConfirm` resolves the promise immediately:
```ts
const handleConfirm = useCallback(async () => {
  setBusy(true);
  try {
    resolveRef.current?.(true);  // ← resolves immediately
    resolveRef.current = null;
  } finally {
    setBusy(false);
    setOpen(false);
  }
}, []);
```
The `busy` state is set to `true` then immediately to `false` in the `finally` block. The `busy` indicator never actually shows because the promise resolves synchronously. The caller gets `true` before any async work in their `onConfirm` handler runs.

**Severity:** Medium (UX bug)

**Fix:** The `useConfirm` hook's `confirm()` function should accept an optional `onConfirm` async handler, and only resolve after it completes:
```ts
const confirm = useCallback((opts: ConfirmOptions & { onConfirm?: () => Promise<void> }): Promise<boolean> => {
  // ...
}, []);
```
Or document that `useConfirm` only returns the user's choice and the caller must handle their own loading state.

### 4.9 `empty-state.tsx` — Design: `tone="brand"` Doesn't Use Brand Color

**File:** `apps/web/src/components/ui/empty-state.tsx:45-48`

**Finding:** 
```ts
tone === 'brand' ? 'text-fg bg-bg-elev-2 h-20 w-20' : 'text-fg-muted bg-bg-elev-2 h-16 w-16',
```
The `brand` tone uses `text-fg` (not `text-brand`) and `bg-bg-elev-2` (not `bg-brand/10`). The only difference between `brand` and `muted` is the size (80×80 vs 64×64) and text color (`text-fg` vs `text-fg-muted`). The "brand" tone doesn't use any brand color at all.

**Severity:** Medium (Design system drift)

**Fix:** Use brand-tinted colors for the `brand` tone: `text-brand bg-brand/10 h-20 w-20`.

### 4.10 `switch.tsx` — Bug: Switch Knob Color Uses `bg-brand-fg` Which May Be Invisible

**File:** `apps/web/src/components/ui/switch.tsx:42`

**Finding:** The switch knob uses `bg-brand-fg`:
```ts
'inline-block size-5 rounded-sm bg-brand-fg shadow-sm transition-transform duration-150',
```
When the switch is unchecked, the track is `bg-bg-elev-3` (dark elevated surface) and the knob is `bg-brand-fg`. If `brand-fg` is a dark color (which it often is for dark brand colors), the knob may be nearly invisible against the dark track.

**Severity:** Medium (Design system / Contrast)

**Fix:** Use `bg-fg` or `bg-white` for the knob to ensure contrast in both checked and unchecked states.

### 4.11 `switch.tsx` — Bug: `translate-x-[22px]` Is Hardcoded

**File:** `apps/web/src/components/ui/switch.tsx:43`

**Finding:** The checked knob translates `22px` right. The track is `w-12` (48px) and the knob is `size-5` (20px). With `translate-x-0.5` (2px) for unchecked, the checked position should be `48 - 20 - 2 - 2 = 24px` (accounting for padding). `22px` is close but may not be perfectly centered. This is a magic number that should be calculated.

**Severity:** Low (Design)

### 4.12 `segmented.tsx` — Bug: `variant="accent"` Active Text Uses `text-black`

**File:** `apps/web/src/components/ui/segmented.tsx:~100`

**Finding:** 
```ts
active && variant === 'accent' && 'text-black',
```
The active accent segment uses `text-black` for its text color. In dark mode, if the accent indicator background is light, this works. But if the accent background is dark, the text will be invisible. The `solid` variant also uses `text-black` with `bg-fg`.

**Severity:** Medium (Dark mode)

**Fix:** Use `text-bg` instead of `text-black` for theme-aware contrast, or ensure the accent background is always light enough for black text.

### 4.13 `segmented.tsx` — Bug: Accent Indicator Has `backgroundImage: 'none'` Inline Style

**File:** `apps/web/src/components/ui/segmented.tsx:~115`

**Finding:** 
```tsx
<m.span
  layoutId={layoutId}
  className="absolute inset-0 -z-0 rounded-sm"
  style={{ backgroundImage: 'none' }}
  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
/>
```
The accent indicator has `backgroundImage: 'none'` but no background color class. The indicator is invisible — it's a transparent rounded rectangle. The active text gets `text-black` but there's no visible background behind it. This means the `accent` variant doesn't actually show a sliding indicator.

**Severity:** High (UI bug)

**Fix:** Add a background class to the indicator: `className="absolute inset-0 -z-0 rounded-sm bg-brand"` (or whatever the accent color should be).

### 4.14 `tooltip.tsx` — Bug: `delay-300` Is Not a Standard Tailwind Transition Delay

**File:** `apps/web/src/components/ui/tooltip.tsx:46`

**Finding:** `group-hover/tooltip:delay-300` is used as a Tailwind class. Standard Tailwind doesn't include `delay-300` for transition delays (the default scale goes up to `delay-700` but `delay-300` is actually valid in Tailwind v3+). However, the comment says "350ms" delay, while `delay-300` = 300ms. The comment and implementation disagree.

**Severity:** Low (Consistency)

### 4.15 `toaster.tsx` — Bug: Hardcoded RGBA Background

**File:** `apps/web/src/components/ui/toaster.tsx:48`

**Finding:** 
```ts
'![background:rgba(24,24,27,0.9)]',
```
The toast background is hardcoded to `rgba(24,24,27,0.9)` — a near-black color. This doesn't respect the design token system or dark mode. In light mode (if supported), toasts would be dark on light background, which might be intentional, but it's not theme-aware.

**Severity:** Medium (Design system drift)

**Fix:** Use a CSS variable or design token: `![background:var(--bg-elev-2)]` with opacity.

### 4.16 `toaster.tsx` — Bug: `useSonner` May Not Be Available in All Sonner Versions

**File:** `apps/web/src/components/ui/toaster.tsx:22`

**Finding:** `import { Toaster as SonnerToaster, useSonner } from 'sonner'` — `useSonner` is a relatively new Sonner API. If the installed version doesn't support it, this import will fail at build time. The code uses it for SR announcements, which is a good practice, but it's version-dependent.

**Severity:** Low (Dependency risk)

### 4.17 `tag-input.tsx` — Bug: `filtered` Computed on Every Render Without `useMemo`

**File:** `apps/web/src/components/ui/tag-input.tsx:42-44`

**Finding:** 
```ts
const filtered = suggestions
  .filter((s) => s.toLowerCase().startsWith(input.toLowerCase()) && !value.includes(s))
  .slice(0, 5);
```
This runs on every render without memoization. For large suggestion lists, this could cause unnecessary computation. Also, `input.toLowerCase()` is called twice per iteration.

**Severity:** Low (Performance)

**Fix:** Wrap in `useMemo` with `[suggestions, input, value]` deps.

### 4.18 `tag-input.tsx` — Accessibility: Suggestion List Missing ARIA Roles

**File:** `apps/web/src/components/ui/tag-input.tsx:104-118`

**Finding:** The suggestion dropdown is a `<ul>` with `<li>` containing `<button>`s, but there's no `role="listbox"` / `role="option"` / `aria-selected`. The input doesn't have `role="combobox"` or `aria-expanded` or `aria-controls` pointing to the suggestion list. Keyboard navigation (arrow up/down) works but isn't announced to screen readers.

**Severity:** Medium (Accessibility)

**Fix:** Add ARIA combobox pattern: `role="combobox"` on input, `aria-expanded={focused && filtered.length > 0}`, `aria-controls="tag-suggestions"`, `role="listbox"` on `<ul>`, `role="option"` + `aria-selected` on each `<li>`.

### 4.19 `tag-input.tsx` — Bug: Backspace Removal Doesn't Work When Input Has Text

**File:** `apps/web/src/components/ui/tag-input.tsx:64-67`

**Finding:** 
```ts
if (e.key === 'Backspace' && !input && value.length > 0) {
  const last = value[value.length - 1];
  if (last) remove(last);
  return;
}
```
Backspace only removes the last tag when the input is empty. This is the standard behavior for tag inputs, so this is correct. No bug.

**Severity:** None (verified correct)

### 4.20 `sparkline.tsx` — Bug: `Math.min(...values)` Stack Overflow on Large Arrays

**File:** `apps/web/src/components/ui/sparkline.tsx:29-30`

**Finding:** 
```ts
const min = Math.min(...values);
const max = Math.max(...values);
```
Using spread operator with `Math.min`/`Math.max` can cause stack overflow for very large arrays (>~100,000 elements). For sparkline data this is unlikely, but it's a known anti-pattern.

**Severity:** Low (Edge case)

**Fix:** Use `reduce`:
```ts
const min = values.reduce((a, b) => Math.min(a, b), Infinity);
const max = values.reduce((a, b) => Math.max(a, b), -Infinity);
```

### 4.21 `stat-card.tsx` — Design: Comment Says "Lucide icon" But Project Uses Tabler Icons

**File:** `apps/web/src/components/ui/stat-card.tsx:14`

**Finding:** The comment says `/** Lucide icon (or any 14–16px ReactNode). */` but the project exclusively uses `@tabler/icons-react` (per the button.tsx comment: "satisfy steering rule §10"). The comment references the wrong icon library.

**Severity:** Trivial (Documentation)

### 4.22 `animated-number.tsx` — Bug: Initial `useMotionValue(value)` Doesn't Update When `value` Changes Before Mount

**File:** `apps/web/src/components/ui/animated-number.tsx:22`

**Finding:** `const motionValue = useMotionValue(value)` initializes with the first `value` prop. The `useEffect` at line 30 updates it when `value` changes. But between initial render and the first effect, if `value` changes (e.g., rapid price updates), the motion value may be stale. This is a minor race condition.

**Severity:** Low (Race condition)

### 4.23 `provider-info-dot.tsx` — Bug: `role="button"` on a `<span>` Without Keyboard Handler

**File:** `apps/web/src/components/ui/provider-info-dot.tsx:73-81`

**Finding:** 
```tsx
<span
  role="button"
  aria-label={ariaLabel}
  onClick={(e) => e.stopPropagation()}
  ...
>
```
A `<span>` with `role="button"` needs `tabIndex={0}` and an `onKeyDown` handler (for Enter/Space) to be keyboard accessible. Currently, this "button" is only clickable with a mouse — keyboard users can't interact with it.

**Severity:** Medium (Accessibility)

**Fix:** Add `tabIndex={0}` and `onKeyDown` handler:
```tsx
onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.stopPropagation();
    e.preventDefault();
  }
}}
```
Or better, use a real `<button>` element.

---

## 5. Providers

### 5.1 `providers/index.tsx` — Good: Correct Provider Nesting Order

**File:** `apps/web/src/components/providers/index.tsx`

**Finding:** The provider nesting order is correct: `QueryProvider > NuqsAdapter > TimeProvider > SwRegister + children`. QueryClient is outermost so all hooks can use it. NuqsAdapter wraps URL state. TimeProvider wraps time-dependent components.

**Severity:** None (positive finding)

### 5.2 `query-provider.tsx` — Design: `retry: 2` May Mask Errors

**File:** `apps/web/src/components/providers/query-provider.tsx:24`

**Finding:** The default `retry: 2` with exponential backoff means failed queries retry twice before showing an error. For a trading app where stale data can lead to bad decisions, this delay could be costly. The comment says "no retries that would mask provider errors" but then sets `retry: 2`.

**Severity:** Low (Design decision)

### 5.3 `sw-register.tsx` — Bug: `toast.info()` with `duration: Infinity` Never Auto-Dismisses

**File:** `apps/web/src/components/providers/sw-register.tsx:26-33`

**Finding:** 
```ts
toast.info('Update available', {
  action: { label: 'Reload', onClick: () => { ... } },
  duration: Infinity,
});
```
`duration: Infinity` means the update toast stays forever until the user clicks "Reload". If the user ignores it, the toast permanently occupies screen space. On mobile, this blocks part of the viewport.

**Severity:** Medium (UX)

**Fix:** Use a long but finite duration (e.g., `30_000` for 30 seconds) or add a dismiss button.

### 5.4 `sw-register.tsx` — Missing: No `controllerchange` Listener

**File:** `apps/web/src/components/providers/sw-register.tsx`

**Finding:** The SW registration listens for `updatefound` and shows a toast when a new SW is installed. But it doesn't listen for `controllerchange` — when the new SW actually takes over. If the user clicks "Reload", the `SKIP_WAITING` message is sent, but if the reload happens before the new SW activates, the user may still get the old content.

**Severity:** Low (PWA)

**Fix:** Listen for `navigator.serviceWorker.addEventListener('controllerchange', ...)` and reload after the new controller takes over.

### 5.5 `time-provider.tsx` — Bug: `window.matchMedia` Called Without SSR Guard

**File:** `apps/web/src/components/providers/time-provider.tsx:33`

**Finding:** 
```ts
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
```
This is inside a `useEffect` (which only runs client-side), so it's safe. No bug.

**Severity:** None (verified correct)

### 5.6 `time-provider.tsx` — Performance: MutationObserver on `document.documentElement` May Be Overkill

**File:** `apps/web/src/components/providers/time-provider.tsx:36-40`

**Finding:** A `MutationObserver` watches `document.documentElement` for `data-reduce-motion` attribute changes. This is a niche feature (programmatically forcing reduced motion) that likely never changes at runtime. The observer runs on every DOM attribute mutation on `<html>`, which is wasteful.

**Severity:** Low (Performance)

**Fix:** Remove the MutationObserver and only check on mount + media query change. If programmatic control is needed, use a custom event instead.

### 5.7 `time-provider.tsx` — Bug: Context Value Not Memoized

**File:** `apps/web/src/components/providers/time-provider.tsx:48-52`

**Finding:** 
```tsx
<TimeContext.Provider value={{ now, formatRelative: formatRelativeTs }}>
```
The `value` object is created inline on every render. Since `now` updates every 30 seconds, this triggers a re-render of all `useNow()` / `useTime()` consumers every 30 seconds. The `formatRelativeTs` is memoized via `useCallback`, but the object itself is new each time. This is actually correct behavior — `now` changes, so consumers should re-render. But the object creation could be wrapped in `useMemo` for cleanliness.

**Severity:** Trivial (Performance)

---

## 6. Hooks

### 6.1 `use-copied.ts` — Good: Proper Cleanup

**File:** `apps/web/src/hooks/use-copied.ts`

**Finding:** The hook properly clears the timeout on unmount and when `trigger` is called again. Clean implementation.

**Severity:** None (positive finding)

### 6.2 `use-local-storage.ts` — Bug: `initialValue` Not Used When Key Changes

**File:** `apps/web/src/hooks/use-local-storage.ts:24-35`

**Finding:** When the `key` changes, the effect re-reads from localStorage. If the new key doesn't exist, it falls back to `initialValueRef.current`. But `storedValue` still holds the old key's value until the effect runs. There's a brief render where the state is stale.

**Severity:** Low (Race condition)

### 6.3 `use-local-storage.ts` — Bug: `setValue` Doesn't Trigger Cross-Tab Sync

**File:** `apps/web/src/hooks/use-local-storage.ts:42-50`

**Finding:** `setValue` writes to localStorage and updates state, but the `storage` event only fires in *other* tabs, not the current tab. This is correct browser behavior. However, if the same key is used by multiple components in the same tab, they won't sync with each other — only the component that called `setValue` updates.

**Severity:** Low (Architecture)

### 6.4 `use-voice-input.ts` — Good: Proper Ref Pattern for Callbacks

**File:** `apps/web/src/hooks/use-voice-input.ts:44-47`

**Finding:** The hook uses `onTextRef` and `onErrorRef` to avoid stale closures — the `start` callback can be memoized without depending on `onText`/`onError`. Clean pattern.

**Severity:** None (positive finding)

### 6.5 `use-voice-input.ts` — Bug: `supported` State Initialized to `false` on SSR

**File:** `apps/web/src/hooks/use-voice-input.ts:42`

**Finding:** `const [supported, setSupported] = useState(false)` starts as `false` and is only set to `true` in `useEffect`. On SSR, `supported` is always `false`. If the UI conditionally renders the mic button based on `supported`, it will flash (hidden on SSR, shown after hydration). This is the correct SSR-safe pattern, but the flash may be noticeable.

**Severity:** Low (UX / Hydration)

---

## 7. Lib Utilities

### 7.1 `admin-auth.ts` — Security: Single-User Mode Is a Privilege Escalation Risk

**File:** `apps/web/src/lib/admin-auth.ts:55-62`

**Finding:** 
```ts
// Check if any admin exists
const adminCount = await db
  .select({ count: sql<number>`count(*)` })
  .from(schema.users)
  .where(eq(schema.users.role, 'admin'));

if (Number(adminCount[0]?.count ?? 0) === 0) {
  // No admins exist — single-user mode, treat as admin
  return { admin: ..., reason: 'authenticated' };
}
```
Any authenticated user gets admin access when no admin exists. In a multi-user deployment where admins haven't been set up yet, every user has admin privileges. This is documented as "single-user mode" but is dangerous if the app goes live without setting an admin.

**Severity:** High (Security)

**Fix:** Add a startup warning when no admin exists, or require an explicit `SINGLE_USER_MODE=true` env var to enable this fallback.

### 7.2 `admin-auth.ts` & `admin-check.ts` — Code Duplication

**File:** `apps/web/src/lib/admin-auth.ts` and `apps/web/src/lib/admin-check.ts`

**Finding:** Both files implement the same admin-check logic (check role === 'admin', then check if any admin exists). `admin-check.ts` uses `cache()` from React; `admin-auth.ts` doesn't. The logic is duplicated.

**Severity:** Low (Code quality)

**Fix:** Have `admin-check.ts` call `getAdminUser()` from `admin-auth.ts`, or extract the shared logic.

### 7.3 `api.ts` — Security: `x-user-id` Header Trust Is a Potential Bypass

**File:** `apps/web/src/lib/api.ts:34-37`

**Finding:** 
```ts
const headerId = req.headers.get('x-user-id');
if (headerId) {
  return { userId: headerId };
}
```
The fast path trusts the `x-user-id` header without verifying it came from the middleware. If an attacker can send a request directly to the route handler (bypassing middleware), they can set `x-user-id` to any value. The middleware sets this header, but in serverless environments, direct invocation might be possible.

**Severity:** Medium (Security — defense in depth)

**Fix:** The middleware strips and re-sets the header, so an inbound `x-user-id` from a client should be overwritten. Verify the middleware always deletes the header before setting it (it does: `headers.delete('x-user-id')` at line 75 in middleware.ts). The risk is low but the trust model should be documented.

### 7.4 `auth-anomaly.ts` — Bug: In-Memory State Doesn't Work in Serverless

**File:** `apps/web/src/lib/auth-anomaly.ts:30-31`

**Finding:** 
```ts
const events: AuthEvent[] = [];
```
The sliding window is in-memory. In serverless (Vercel), each function invocation may be a fresh instance, so the event window resets frequently. The file acknowledges this: "each instance has its own window — this is a best-effort early-warning system." This is a known limitation, not a bug.

**Severity:** Low (Known limitation)

### 7.5 `commands.ts` — Bug: `z.function()` Is Not Valid Zod

**File:** `apps/web/src/lib/commands.ts:73`

**Finding:** 
```ts
export const commandSchema = z.object({
  ...
  action: z.function().optional(),
  ...
});
```
`z.function()` in Zod validates function types, but it's rarely used and may not work as expected with arbitrary functions. More importantly, this schema is never used in the codebase (it's exported but `validateCommand` is never called from any file). This is dead code.

**Severity:** Low (Dead code)

**Fix:** Remove `commandSchema`, `validateCommand`, and the `z` import if unused.

### 7.6 `commands.ts` — Code Quality: `import { z } from 'zod'` After Export Statements

**File:** `apps/web/src/lib/commands.ts:62`

**Finding:** The `import { z } from 'zod'` statement appears after `export` statements, which is unusual in TypeScript. Imports are hoisted, so it works, but it's poor style and may confuse linters.

**Severity:** Trivial (Code quality)

### 7.7 `commands.ts` — Dead Code: `ComponentType` Re-export

**File:** `apps/web/src/lib/commands.ts:80`

**Finding:** `export type { ComponentType }` re-exports `ComponentType` from React, but it's imported at the top and never used in the file. The `Icon` type from Tabler is used instead. This re-export is unnecessary.

**Severity:** Trivial (Dead code)

### 7.8 `cron.ts` — Security: `AUTH_COOKIE_SECRET` Fallback to Empty String

**File:** `apps/web/src/lib/cron.ts:117`

**Finding:** 
```ts
const payload = await verifyAuthToken(token, env.AUTH_COOKIE_SECRET ?? '');
```
If `AUTH_COOKIE_SECRET` is not set, it falls back to an empty string. `verifyAuthToken` with an empty secret would use an empty key for HMAC verification, which could allow forged tokens. The `getKey('')` call would create a valid CryptoKey from an empty string.

**Severity:** High (Security)

**Fix:** Reject the session cookie path if `AUTH_COOKIE_SECRET` is not configured:
```ts
if (!env.AUTH_COOKIE_SECRET) {
  hasSessionAuth = false;
} else {
  const payload = await verifyAuthToken(token, env.AUTH_COOKIE_SECRET);
  hasSessionAuth = payload !== null;
}
```

### 7.9 `csrf.ts` — Good: Proper Double-Submit Cookie Pattern

**File:** `apps/web/src/lib/csrf.ts`

**Finding:** The CSRF implementation uses the double-submit cookie pattern: the middleware sets a cookie, and the client sends the same value as a header. The middleware verifies they match. This is a well-established CSRF prevention pattern.

**Severity:** None (positive finding)

### 7.10 `env.ts` — Security: Dev Secrets Persisted to `.hamafx/dev-secrets.json`

**File:** `apps/web/src/lib/env.ts:72-78`

**Finding:** In dev mode, generated secrets are written to `.hamafx/dev-secrets.json` with mode 0600. This is correct for dev, but if `.hamafx/` is not in `.gitignore`, these secrets could be committed. The file-level comment says "already-gitignored" but this should be verified.

**Severity:** Low (Security — dev only)

### 7.11 `env.ts` — Bug: `getServerEnv()` Called at Module Load Time

**File:** `apps/web/src/lib/env.ts:131-135`

**Finding:** 
```ts
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST && process.env.NEXT_PHASE !== 'phase-production-build') {
  getAuthEnv();
  getServerEnv();
}
```
Both env getters are called at module import time. If any env var is missing in production, this throws and crashes the entire application on startup. This is intentional ("errors surface on first call") but means a single missing env var prevents the app from starting at all, even for routes that don't need that var.

**Severity:** Medium (Resilience)

**Fix:** Consider lazy validation — only validate env vars when they're actually needed by a specific route.

### 7.12 `format.ts` — Good: Clean Relative Time Formatting

**File:** `apps/web/src/lib/format.ts`

**Finding:** Clean, pure function with proper edge case handling (negative diff, non-finite timestamps). No issues.

**Severity:** None (positive finding)

### 7.13 `fuzzy-match.ts` — Bug: Empty Query Returns Score 0, Not Filtered Out

**File:** `apps/web/src/lib/fuzzy-match.ts:36-39`

**Finding:** 
```ts
if (query.length === 0) {
  if (target.length === 0) {
    return { score: -1, indices: [] };
  }
  return { score: 0, indices: [] };
}
```
When query is empty, every non-empty target gets score 0. In `rankByQuery`, these are all included and sorted by score (all 0), preserving original order. This is correct for showing all commands when the palette opens with no query. No bug.

**Severity:** None (verified correct)

### 7.14 `market-client.ts` — Bug: `console.warn` in Retry Logic

**File:** `apps/web/src/lib/market-client.ts:33`

**Finding:** 
```ts
console.warn(`[market-client] Fetch failed (attempt ${i + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`, err);
```
The project has a structured logger (`lib/logger.ts`), but the market client uses `console.warn` directly. This bypasses the redaction and structured logging system.

**Severity:** Low (Code quality)

**Fix:** Use the structured logger. However, `market-client.ts` is a client-side module (it uses relative URLs like `/api/market/price`), so the server-side pino logger isn't available. A client-side logger would be needed.

### 7.15 `market-client.ts` — Bug: `fetchWithRetry` Retries on All Errors Including 4xx

**File:** `apps/web/src/lib/market-client.ts:25-37`

**Finding:** `fetchWithRetry` catches all errors and retries. But `fetch()` doesn't throw on HTTP errors (4xx, 5xx) — it returns a response with `ok: false`. The retry only triggers on network errors (AbortError, connection refused, etc.). This is actually correct behavior — don't retry on 4xx. No bug.

**Severity:** None (verified correct)

### 7.16 `nowpayments.ts` — Security: Sandbox API URL Is Default

**File:** `apps/web/src/lib/nowpayments.ts:56`

**Finding:** 
```ts
const baseUrl = env.NOWPAYMENTS_API_BASE ?? 'https://api-sandbox.nowpayments.io';
```
The default API base URL is the sandbox. If `NOWPAYMENTS_API_BASE` is not set in production, payments will go through the sandbox, which won't process real payments. This is a safe default (fail to sandbox, not to production), but it should be validated in production.

**Severity:** Low (Configuration)

### 7.17 `session.ts` — Bug: `isMarketOpen` Has Incorrect DST Logic

**File:** `apps/web/src/lib/session.ts:58-65`

**Finding:** 
```ts
const isUsDst = month >= 2 && month <= 10;
const closeHour = isUsDst ? 21 : 22;
const openHour = isUsDst ? 21 : 22;
```
US DST starts in March (month 2) and ends in November (month 10). But `month >= 2 && month <= 10` includes March through November, which is approximately correct but doesn't match the exact DST transition dates (second Sunday of March to first Sunday of November). Also, `closeHour` and `openHour` are the same value in both branches (`21` for DST, `22` for non-DST), which seems like a bug — the open and close hours should differ.

Actually, looking at the logic: on Friday, market closes at `closeHour` (21 or 22 UTC). On Sunday, market opens at `openHour` (21 or 22 UTC). If both are the same, the market closes at 22:00 Friday and opens at 22:00 Sunday (non-DST), or closes at 21:00 Friday and opens at 21:00 Sunday (DST). This is actually correct for FX market hours.

But `getSessionInfo` uses `22:00 UTC` as the weekend cutoff (Friday 22:00 - Sunday 22:00), while `isMarketOpen` uses DST-adjusted hours. These two functions disagree on when the weekend starts/ends.

**Severity:** Medium (Logic inconsistency)

**Fix:** Align `getSessionInfo` with `isMarketOpen`'s DST-aware hours, or remove DST logic from `isMarketOpen` and use fixed 22:00 UTC everywhere.

### 7.18 `storage.ts` — Code Quality: Mixed Responsibilities

**File:** `apps/web/src/lib/storage.ts`

**Finding:** This file contains both Supabase Storage upload functions AND generic `safeGetItem`/`safeSetItem` localStorage helpers. These are unrelated concerns — the localStorage helpers should be in a separate file (e.g., `lib/local-storage.ts` or merged with `use-local-storage.ts`).

**Severity:** Low (Code organization)

### 7.19 `thread-export.ts` — Bug: Size Truncation Counter Is Inaccurate

**File:** `apps/web/src/lib/thread-export.ts:~120-130`

**Finding:** 
```ts
const potentialTrailer = `\n_(truncated due to size limit: omitted ${messages.length - messagesCount} messages)_\n`;
```
`messagesCount` is incremented after the size check passes, so when the size check fails, `messagesCount` hasn't been incremented for the current message. The trailer says "omitted X messages" where X = `messages.length - messagesCount`. But `messagesCount` includes all messages before the current one, not the current one. So the count is off by 1 — it should be `messages.length - messagesCount - 1` (the current one is also omitted), or `messages.length - messagesCount` if `messagesCount` is the count of included messages (which it is, since it's incremented after the push). Actually, `messagesCount` is incremented after `blocks.push()`, so when we break, `messagesCount` is the count of successfully added messages. `messages.length - messagesCount` is the number of remaining messages including the current one that was too big. This is correct.

**Severity:** None (verified correct after careful analysis)

### 7.20 `usage-alerts.ts` — Bug: `sentAlerts` Set Never Cleared Between Cron Runs

**File:** `apps/web/src/lib/usage-alerts.ts:16-18`

**Finding:** 
```ts
const sentAlerts = new Set<string>();
export function resetSentAlerts() { sentAlerts.clear(); }
```
The `sentAlerts` Set persists across cron invocations within the same process. This is the dedup mechanism — once a 50% alert is sent, it won't be sent again until `resetSentAlerts()` is called. But if the cron job that calls `resetSentAlerts()` doesn't run (e.g., monthly reset cron fails), alerts will never fire again. The `resetSentAlerts` function is exported but it's unclear who calls it and when.

**Severity:** Medium (Logic)

**Fix:** Add a time-based reset: store the timestamp alongside the alert key and clear entries older than 30 days. Or document that `resetSentAlerts` must be called monthly.

### 7.21 `usage-alerts.ts` — Performance: N+1 Query Pattern

**File:** `apps/web/src/lib/usage-alerts.ts:35-38`

**Finding:** 
```ts
const allSettings = await db.select().from(schema.userSettings);
```
Then for each user, it does additional queries:
```ts
const [userRow] = await db.select(...).from(schema.userSettings).innerJoin(schema.users, ...)...
const monthlySpend = await getMonthlySpend(settings.userId);
const providerSpend = await getProviderMonthlySpend(settings.userId, providerId);
```
This is an N+1 pattern — for N users, there are 1 + N + N + N×P queries (P = providers with thresholds). For a small user base this is fine, but it won't scale.

**Severity:** Low (Performance — acceptable for personal-mode app)

---

## 8. Middleware

### 8.1 `middleware.ts` — Security: CSRF Cookie Set Without `httpOnly`

**File:** `apps/web/src/middleware.ts:82-87`

**Finding:** 
```ts
next.cookies.set('hfx_csrf', cookieToken, {
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
});
```
The CSRF cookie is set without `httpOnly: true`. This is actually correct for the double-submit cookie pattern — the client JavaScript needs to read the cookie to send it as a header. If it were `httpOnly`, `getCsrfToken()` in `csrf.ts` couldn't read it.

**Severity:** None (verified correct)

### 8.2 `middleware.ts` — Security: Legacy Mode Bypasses All Auth in Development

**File:** `apps/web/src/middleware.ts:29-36`

**Finding:** 
```ts
if (process.env.AUTH_MODE === 'legacy' && process.env.NODE_ENV !== 'production') {
  headers.set('x-user-id', '__system__');
  return next;
}
```
In development with `AUTH_MODE=legacy`, all requests get `x-user-id: __system__`, bypassing authentication entirely. The env.ts file warns about this in production, but if `AUTH_MODE=legacy` is accidentally set in a non-production deployment (staging, preview), all auth is bypassed.

**Severity:** Medium (Security)

**Fix:** Add the warning log in middleware when legacy mode is active, or require an explicit `AUTH_MODE=legacy` + `ALLOW_LEGACY_AUTH=true` double opt-in.

### 8.3 `middleware.ts` — Bug: CSRF Check Excludes `/api/cron` But Cron Uses Session Cookie

**File:** `apps/web/src/middleware.ts:51`

**Finding:** The CSRF check applies to state-changing `/api/*` requests, but the matcher excludes `/api/cron`. The cron routes accept session cookies for admin-UI triggered refreshes (see `cron.ts`). If the admin UI sends a POST to `/api/cron/*`, it won't have a CSRF token check. This could allow CSRF attacks on cron endpoints.

**Severity:** Medium (Security)

**Fix:** Either include `/api/cron` in the CSRF check (if the admin UI sends CSRF tokens), or verify that cron endpoints only accept Bearer tokens (not session cookies) for state-changing operations.

### 8.4 `middleware.ts` — Good: Request ID Propagation

**File:** `apps/web/src/middleware.ts:27`

**Finding:** The middleware mints/propagates `x-request-id` on every request, and the response echoes it. This is excellent for debugging and log correlation.

**Severity:** None (positive finding)

---

## 9. Cross-Cutting Issues

### 9.1 Design System: Inconsistent Use of `text-black` vs Design Tokens

**Files:** `top-bar.tsx:42`, `offline/page.tsx:23`, `segmented.tsx:~100`, `button.tsx` (danger/success variants)

**Finding:** Multiple components use `text-black` or `bg-black` instead of design tokens (`text-fg`, `bg-bg`, `text-bg`). This breaks dark mode and theme consistency. The design system has tokens for foreground/background colors, but they're not used consistently.

**Severity:** High (Design system drift)

**Fix:** Audit all uses of `text-black` / `bg-black` and replace with appropriate design tokens.

### 9.2 Admin Components: No Error/Retry Pattern

**Files:** All admin table components (cron, traces, telemetry, users)

**Finding:** All admin data-fetching components have the same pattern: fetch on mount, toast on error, show empty state. None have a retry button or error state. This is a systemic issue across the admin section.

**Severity:** Medium (UX pattern)

**Fix:** Create a shared `useAdminData` hook or `AdminDataSection` wrapper that handles loading/error/empty/retry states consistently.

### 9.3 Admin Components: No React Query Usage

**Files:** All admin components

**Finding:** Despite having `QueryClient` available, all admin components use raw `fetch` + `useState` + `useEffect`. This means no caching, no background refetch, no stale-while-revalidate. Every tab switch re-fetches from scratch.

**Severity:** Medium (Performance pattern)

### 9.4 Command Palette: Multiple "Icon" Prefix Bugs

**Files:** `command-palette.tsx` (GROUP_LABELS, placeholder, sr-only label), `commands.ts` (comments mention "IconSearch")

**Finding:** A find-and-replace operation appears to have converted icon-related text to "Icon*" prefixes in user-visible strings. This affects:
- `GROUP_LABELS.settings` = `'IconSettings'` (visible group header)
- Input placeholder = `'IconSearch…'` (visible placeholder)
- sr-only label = `'IconSearch commands'`

**Severity:** High (Visible UI bug)

**Fix:** Remove all "Icon" prefixes from user-visible strings.

### 9.5 Accessibility: Missing Focus Rings on Interactive Elements

**Files:** `button.tsx`, `nav-drawer.tsx` (logout button), `provider-info-dot.tsx`

**Finding:** The Button component lacks focus-visible ring styles. The nav-drawer logout button also lacks focus styles. The provider-info-dot uses `role="button"` on a `<span>` without keyboard support. These are systemic accessibility gaps.

**Severity:** High (Accessibility)

---

## 10. Priority Summary

### 🔴 Critical / High Priority

| # | File | Issue | Type |
|---|------|-------|------|
| 3.9 | `command-palette.tsx:37` | `GROUP_LABELS.settings` = `'IconSettings'` — visible UI bug | UI Bug |
| 3.10 | `command-palette.tsx:~120` | Placeholder shows "IconSearch…" — visible UI bug | UI Bug |
| 4.13 | `segmented.tsx:~115` | Accent indicator has no background color — invisible | UI Bug |
| 4.1 | `button.tsx:39-43` | `md` size is `h-10` (40px) but comment says 48px — sizing mismatch | Design |
| 4.3 | `button.tsx` | No focus ring on buttons | Accessibility |
| 2.1 | `offline/page.tsx:23` | `text-black` invisible in dark mode | Dark Mode |
| 3.1 | `top-bar.tsx:42` | `bg-black` ignores design tokens | Design System |
| 7.1 | `admin-auth.ts:55-62` | Single-user mode gives all users admin access | Security |
| 7.8 | `cron.ts:117` | `AUTH_COOKIE_SECRET ?? ''` allows forged tokens | Security |
| 9.1 | Multiple | Systemic `text-black` / `bg-black` usage | Design System |
| 9.5 | Multiple | Missing focus rings on interactive elements | Accessibility |

### 🟡 Medium Priority

| # | File | Issue | Type |
|---|------|-------|------|
| 1.3 | `admin/page.tsx` | All tabs re-fetch on switch, no caching | Performance |
| 1.5 | Admin tables | No error/retry state on fetch failure | UX |
| 1.12 | `admin-onboarding-control.tsx` | Uses `window.confirm()` instead of `ConfirmDrawer` | Design Drift |
| 2.2 | `offline/page.tsx:5` | `force-static` in client component is ignored | Bug |
| 3.2 | `top-bar.tsx:42` | `pt-safe` may not be a valid Tailwind class | PWA |
| 3.4 | `nav-drawer.tsx` | Logout doesn't clear localStorage/sessionStorage | Security |
| 4.6 | `drawer.tsx` | Focus effect only runs once on mount | Accessibility |
| 4.8 | `confirm-drawer.tsx` | `useConfirm` resolves before async work completes | UX Bug |
| 4.9 | `empty-state.tsx` | `tone="brand"` doesn't use brand colors | Design Drift |
| 4.10 | `switch.tsx:42` | Knob color may be invisible on unchecked track | Contrast |
| 4.12 | `segmented.tsx` | `text-black` in active segments breaks dark mode | Dark Mode |
| 4.15 | `toaster.tsx:48` | Hardcoded RGBA background | Design Drift |
| 4.18 | `tag-input.tsx` | Suggestion list missing ARIA combobox roles | Accessibility |
| 4.23 | `provider-info-dot.tsx` | `role="button"` span without keyboard handler | Accessibility |
| 5.3 | `sw-register.tsx:26` | Update toast with `duration: Infinity` never dismisses | UX |
| 7.11 | `env.ts:131-135` | Env validation at module load crashes app on missing var | Resilience |
| 7.17 | `session.ts` | `isMarketOpen` and `getSessionInfo` disagree on weekend hours | Logic |
| 7.20 | `usage-alerts.ts` | `sentAlerts` Set never auto-clears | Logic |
| 8.2 | `middleware.ts:29-36` | Legacy mode bypasses all auth in non-production | Security |
| 8.3 | `middleware.ts:51` | CSRF check excludes `/api/cron` which accepts cookies | Security |
| 3.18 | `offline-banner.tsx` | `retrying` state never reset to false | UX Bug |

### 🟢 Low Priority / Polish

| # | File | Issue | Type |
|---|------|-------|------|
| 1.2 | `admin/layout.tsx` | Silent redirect to `/chat` for non-admins | UX |
| 1.4 | `admin/page.tsx` | Tab nav not ARIA-compliant | Accessibility |
| 1.6 | `admin-cron-table.tsx` | Missing `finishedAt`/duration column | Feature |
| 1.8 | `admin-feature-flags.tsx` | No disabling during toggle request | Race |
| 1.9 | `admin-log-viewer.tsx` | `NODE_ENV` check in client component | UX |
| 1.10 | `admin-log-viewer.tsx` | Array index as key | React |
| 1.11 | `admin-log-viewer.tsx` | No auto-scroll for new logs | UX |
| 1.13 | `admin-onboarding-control.tsx` | Indentation error | Code Quality |
| 1.15 | `admin-user-table.tsx` | No pagination for >50 users | Feature |
| 1.16 | `admin-user-table.tsx` | Emails in plain text | Privacy |
| 1.17 | All admin tables | No `<caption>` or `scope` on tables | Accessibility |
| 2.3 | `offline/page.tsx` | Missing copyright header | Code Quality |
| 2.4 | `offline/loading.tsx` | Skeleton doesn't match page layout | UX |
| 3.5 | `nav-drawer.tsx` | No loading state on logout | UX |
| 3.7 | `nav-drawer-context.tsx` | `useNavDrawer()` creates new object each render | Performance |
| 3.8 | `nav-trigger.tsx` | Always opens, never toggles | UX |
| 3.15 | `install-nudge.tsx` | `bumpDismiss()` called on install success | Logic |
| 3.16 | `install-nudge.tsx` | iOS detection includes macOS touch | Edge Case |
| 4.2 | `button.tsx` | Dead `inlineStyle` variable | Dead Code |
| 4.4 | `input.tsx` | Empty string in `cn()` | Code Quality |
| 4.5 | `input.tsx` | Focus border color same as default | UX |
| 4.11 | `switch.tsx` | Hardcoded `translate-x-[22px]` | Design |
| 4.14 | `tooltip.tsx` | Comment says 350ms, class is 300ms | Consistency |
| 4.17 | `tag-input.tsx` | `filtered` not memoized | Performance |
| 4.20 | `sparkline.tsx` | `Math.min(...values)` stack overflow risk | Edge Case |
| 4.21 | `stat-card.tsx` | Comment says "Lucide" but project uses Tabler | Docs |
| 4.22 | `animated-number.tsx` | Motion value stale before first effect | Race |
| 5.2 | `query-provider.tsx` | `retry: 2` may mask errors | Design |
| 5.4 | `sw-register.tsx` | No `controllerchange` listener | PWA |
| 5.6 | `time-provider.tsx` | MutationObserver may be unnecessary | Performance |
| 6.2 | `use-local-storage.ts` | Stale state when key changes | Race |
| 6.5 | `use-voice-input.ts` | `supported` flash on hydration | UX |
| 7.2 | `admin-auth.ts` + `admin-check.ts` | Duplicated admin check logic | Code Quality |
| 7.3 | `api.ts` | `x-user-id` header trust model | Security |
| 7.5 | `commands.ts` | Dead `commandSchema` / `validateCommand` | Dead Code |
| 7.6 | `commands.ts` | Import after exports | Code Quality |
| 7.10 | `env.ts` | Dev secrets file gitignore verification | Security |
| 7.14 | `market-client.ts` | `console.warn` instead of structured logger | Code Quality |
| 7.16 | `nowpayments.ts` | Sandbox API URL is default | Config |
| 7.18 | `storage.ts` | Mixed responsibilities | Code Org |
| 8.1 | `middleware.ts` | CSRF cookie not httpOnly (correct) | Verified |
| 9.3 | Admin components | No React Query usage | Performance |

---

**Total findings: 62**
- Critical/High: 11
- Medium: 21
- Low/Polish: 30

