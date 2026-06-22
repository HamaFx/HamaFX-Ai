# Phase 5 — News, Journal, Calendar, Alerts & Cross-Cutting Fixes

**Priority:** P3 — Final polish and feature completeness
**Estimated files touched:** 20
**Findings covered:** 42 (10 bugs + 12 improvements + 10 polish + 10 upgrades)

---

## Overview

This phase addresses the remaining feature pages — news, journal, calendar, alerts, dashboard — plus cross-cutting concerns like shared utilities, pagination, service worker updates, and DST handling.

---

## Task 5.1 — Fix News `useBookmarks` Re-rendering All Cards (🟡 P2)

**Files:** `use-bookmarks.tsx`, `article-card.tsx`

### Fix

Lift bookmark state to a context provider:
```tsx
// bookmarks-context.tsx
export function BookmarksProvider({ children }) {
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const isBookmarked = useCallback((id) => bookmarks.has(id), [bookmarks]);
  const toggleBookmark = useCallback((id) => {
    setBookmarks(prev => { /* toggle + persist */ });
  }, []);
  return <BookmarksContext.Provider value={{ bookmarks, isBookmarked, toggleBookmark }}>{children}</BookmarksContext.Provider>;
}
```

### Verification

1. Bookmark one article — only that card re-renders

---

## Task 5.2 — Fix `article-card.tsx` Missing Memoization (🟡 P2)

### Fix

Wrap in `React.memo` with custom comparison on `article.id`, `article.title`, `article.bookmarked`.

---

## Task 5.3 — Fix `live-timestamp.tsx` Interval Cleanup (🟡 P2)

### Fix

Verify `clearInterval` in useEffect cleanup.

---

## Task 5.4 — Fix News Page Missing Pagination (🟢 Upgrade)

### Fix

Implement infinite scroll with `useInfiniteQuery` + `IntersectionObserver`.

### Verification

1. Scroll down — next 20 articles load automatically

---

## Task 5.5 — Fix Journal `entry-list.tsx` Missing Virtualization (🟢 Upgrade)

### Fix

Use `@tanstack/react-virtual` with `estimateSize: () => 120`.

---

## Task 5.6 — Fix Journal `entry-form.tsx` Validation (🟡 P2)

### Fix

Add zod schema for symbol, direction, prices, notes (max 5000 chars).

---

## Task 5.7 — Fix Journal `stats-summary.tsx` Empty State (🟡 P2)

### Fix

Show `EmptyState` when no entries. Guard division by zero in win rate and avg R.

---

## Task 5.8 — Fix Calendar `event-card.tsx` Timezone Display (🟡 P2)

### Fix

Use `toLocaleString` with `timeZoneName: 'short'` for local timezone display.

---

## Task 5.9 — Fix Calendar `calendar-view.tsx` Missing Loading States (🟡 P2)

### Fix

Add Skeleton loading state and error state with Retry button.

---

## Task 5.10 — Fix Calendar `calendar-toolbar.tsx` Filter State (🟡 P2)

### Fix

Use `nuqs` `useQueryState` for filter persistence in URL.

---

## Task 5.11 — Fix Alerts `alert-form.tsx` Validation (🟡 P2)

### Fix

Add zod schema for symbol, condition, price, channel.

---

## Task 5.12 — Fix Alerts `alert-list.tsx` Missing Empty State (🟡 P2)

### Fix

Show `EmptyState` with "Create alert" CTA when no alerts.

---

## Task 5.13 — Fix Dashboard Hardcoded Placeholder Data (🟡 P2)

**File:** `dashboard/page.tsx`

### Fix

Replace placeholders with real data: recent alerts, upcoming events, journal entries, equity curve. Use `Promise.all` for parallel fetching.

### Verification

1. No "Chart Component Placeholder" text
2. All cards populated with user-specific data

---

## Task 5.14 — Fix `formatRelative` Duplicated Across 6+ Files (🔵 Polish)

### Fix

Create `lib/format.ts` with `formatRelative` and `formatRelativeShort`. Import in all files. Remove local definitions.

### Verification

1. `grep -rn "function formatRelative" apps/web/src/` — only in `lib/format.ts`

---

## Task 5.15 — Fix `lib/session.ts` DST Handling (🟢 Upgrade)

### Fix

Determine US DST (March-November). Adjust close/open hours: 21:00 UTC during DST, 22:00 UTC during standard time.

---

## Task 5.16 — Fix `lib/storage.ts` Error Handling (🟡 P2)

### Fix

Create `safeGetItem`, `safeSetItem`, `safeRemoveItem` with try-catch.

---

## Task 5.17 — Fix `lib/fuzzy-match.ts` Edge Cases (🟡 P2)

### Fix

Handle: empty query (score 0), empty target (no match), exact match (highest), starts-with, contains, fuzzy character match with consecutive bonus.

---

## Task 5.18 — Fix `lib/commands.ts` Command Registration (🟡 P2)

### Fix

Add `Command` interface with typed fields. Validate at registration.

---

## Task 5.19 — Fix `lib/thread-export.ts` Large Export Handling (🟡 P2)

### Fix

Limit to 500 messages, truncate at 5MB.

---

## Task 5.20 — Fix `lib/env.ts` Missing Validation (🟡 P2)

### Fix

Use zod schema for env vars. Fail at startup with clear error if invalid.

---

## Task 5.21 — Fix `instrumentation.ts` Sentry Configuration (🟡 P2)

### Fix

Scrub PII in `beforeSend`: remove auth headers, cookies, user email. Sample traces at 10%.

---

## Task 5.22 — Fix `sw-register.tsx` Service Worker Updates (🟢 Upgrade)

### Fix

Check for updates every 60s. Show toast on new version with "Reload" button. Use `postMessage({ type: 'SKIP_WAITING' })`.

---

## Task 5.23 — Fix `query-provider.tsx` Default Options (🟡 P2)

### Fix

```ts
defaultOptions: {
  queries: { staleTime: 30_000, gcTime: 300_000, retry: 3, refetchOnWindowFocus: false },
  mutations: { retry: 0 },
}
```

---

## Task 5.24 — Fix `providers/index.tsx` Provider Order (🔵 Polish)

### Fix

QueryProvider outermost, then NuqsAdapter, then SWRegister.

---

## Task 5.25 — Fix `app/share/[id]/page.tsx` Public Share Page (🟡 P2)

### Fix

No auth required. Validate share ID format. Show 404 for invalid/expired shares.

---

## Task 5.26 — Fix `app/(app)/offline/page.tsx` Offline Page (🔵 Polish)

### Fix

Add `export const dynamic = 'force-static'`. No server dependencies.

---

## Task 5.27 — Fix `app/page.tsx` Landing Page Redirect (🔵 Polish)

### Fix

```ts
const session = await auth();
redirect(session?.user ? '/dashboard' : '/login');
```

---

## Task 5.28 — Fix `app/not-found.tsx` Styling (🔵 Polish)

### Fix

Styled 404 with link to dashboard.

---

## Task 5.29 — Fix `app/error.tsx` Error Recovery (🔵 Polish)

### Fix

Show error message, error digest ID, "Try again" + "Go to dashboard" buttons.

---

## Task 5.30 — Fix `lib/market-client.ts` Error Handling (🟡 P2)

### Fix

Proper try-catch with typed errors for network failures and invalid responses.

---

## Task 5.31 — Fix `lib/catalog-server.ts` Caching (🟡 P2)

### Fix

5-minute TTL cache for model catalog.

---

## Task 5.32 — Fix `lib/request-id.ts` Header Propagation (🔵 Polish)

### Fix

Generate, get from header, set on response for tracing.

---

## Task 5.33 — Fix `lib/cron.ts` Error Handling (🟡 P2)

### Fix

Add timeout, try-catch, logging with duration.

---

## Task 5.34 — Fix `sentiment-summary.tsx` Edge Cases (🟡 P2)

### Fix

Handle empty articles, clamp sentiment score to [-1, 1], label as Bullish/Bearish/Neutral.

---

## Task 5.35 — Fix `refresh-button.tsx` Loading State (🔵 Polish)

### Fix

Add spinner with `refreshing` state.

---

## Task 5.36 — Fix `news-toolbar.tsx` Filter Persistence (🟡 P2)

### Fix

Use `nuqs` for category, sentiment, search query state.

---

## Task 5.37 — Fix `calendar-hero.tsx` Stats Display (🔵 Polish)

### Fix

Handle empty events — all stats show 0.

---

## Task 5.38 — Fix `settings/usage/page.tsx` Chart Rendering (🟡 P2)

### Fix

Show empty state when no usage data. Filter out zero-token entries.

---

## Task 5.39 — Fix `bulk-test-button.tsx` Progress (🟡 P2)

### Fix

Show `Testing… {current}/{total}` progress during bulk test.

---

## Task 5.40 — Fix `save-bar.tsx` Unsaved Changes Warning (🟡 P2)

### Fix

Track `hasUnsavedChanges`. Add `beforeunload` warning. Show save bar only when changes exist.

---

## Task 5.41 — Fix `settings/agent/page.tsx` Agent Configuration (🟡 P2)

### Fix

Ensure no duplicate `id`, proper loading/error states, saves configuration properly.

---

## Task 5.42 — Final Cross-Cutting Verification (🟢 Upgrade)

### Task 5.42a — `pnpm typecheck` — zero errors
### Task 5.42b — `pnpm lint` — zero errors
### Task 5.42c — `pnpm test` — all pass
### Task 5.42d — `pnpm build` — succeeds
### Task 5.42e — Audit for remaining issues:
```bash
grep -rn "window.confirm" apps/web/src/ --include="*.tsx" --include="*.ts"
grep -rn "__system__" apps/web/src/ --include="*.ts"
grep -rn "'/auth/" apps/web/src/ --include="*.ts" --include="*.tsx"
grep -rn "function formatRelative" apps/web/src/ --include="*.ts" --include="*.tsx"
grep -rn "dangerouslySetInnerHTML" apps/web/src/ --include="*.tsx"
grep -rn "focus:outline-none" apps/web/src/ --include="*.tsx" | grep -v "focus-visible"
```
All should return zero results.

### Task 5.42f — Accessibility audit with axe DevTools on all 17 pages
### Task 5.42g — Lighthouse performance audit (≥85 on key pages)

---

## Completion Checklist

- [ ] Task 5.1 — Bookmarks lifted to context
- [ ] Task 5.2 — ArticleCard memoized
- [ ] Task 5.3 — Live timestamp interval cleaned up
- [ ] Task 5.4 — News infinite scroll
- [ ] Task 5.5 — Journal entry list virtualized
- [ ] Task 5.6 — Journal entry form validated
- [ ] Task 5.7 — Journal stats handles empty state
- [ ] Task 5.8 — Calendar event times in local timezone
- [ ] Task 5.9 — Calendar loading/error states
- [ ] Task 5.10 — Calendar toolbar filters in URL
- [ ] Task 5.11 — Alert form validated
- [ ] Task 5.12 — Alert list empty state
- [ ] Task 5.13 — Dashboard uses real data
- [ ] Task 5.14 — `formatRelative` consolidated
- [ ] Task 5.15 — Session DST handling
- [ ] Task 5.16 — Storage utilities with error handling
- [ ] Task 5.17 — Fuzzy match edge cases
- [ ] Task 5.18 — Commands typed and validated
- [ ] Task 5.19 — Thread export handles large threads
- [ ] Task 5.20 — Environment variables validated
- [ ] Task 5.21 — Sentry privacy scrubbing
- [ ] Task 5.22 — Service worker update notification
- [ ] Task 5.23 — React Query default options
- [ ] Task 5.24 — Provider order correct
- [ ] Task 5.25 — Share page works without auth
- [ ] Task 5.26 — Offline page is static
- [ ] Task 5.27 — Root page redirects correctly
- [ ] Task 5.28 — 404 page styled
- [ ] Task 5.29 — Error page has recovery
- [ ] Task 5.30 — Market client error handling
- [ ] Task 5.31 — Catalog server cached
- [ ] Task 5.32 — Request ID propagated
- [ ] Task 5.33 — Cron jobs have timeout/error handling
- [ ] Task 5.34 — Sentiment summary handles empty
- [ ] Task 5.35 — Refresh button loading state
- [ ] Task 5.36 — News toolbar filters in URL
- [ ] Task 5.37 — Calendar hero stats handle empty
- [ ] Task 5.38 — Usage page handles empty
- [ ] Task 5.39 — Bulk test shows progress
- [ ] Task 5.40 — Save bar warns unsaved changes
- [ ] Task 5.41 — Agent settings page fixed
- [ ] Task 5.42 — Full verification: typecheck, lint, test, build, a11y, performance

## Post-Phase Verification

1. `pnpm typecheck` — zero errors
2. `pnpm lint` — zero errors
3. `pnpm test` — all pass
4. `pnpm build` — succeeds
5. axe DevTools — zero WCAG violations on all pages
6. Lighthouse — Performance ≥85 on key pages
7. No `window.confirm`, `__system__`, `/auth/`, duplicate `formatRelative`
8. All feature pages use real data
9. All forms have validation
10. All lists have empty states
11. All pages have loading states
12. All pages have error states

---

## Summary — All 5 Phases

| Phase | Focus | Tasks | Priority |
|-------|-------|-------|----------|
| 1 | Security & Auth | 15 | P0 |
| 2 | Chart & Trading | 23 | P1 |
| 3 | Chat & Composer | 35 | P2 |
| 4 | Layout, Settings & UI | 36 | P2 |
| 5 | News, Journal & Cross-cutting | 42 | P3 |
| **TOTAL** | | **151** | |

### Execution Order

```
Phase 1 (Security) → Phase 2 (Charts) → Phase 3 (Chat) → Phase 4 (UI) → Phase 5 (Features)
```

Phases 2 and 3 can be parallelized (different files). All other phases should be sequential.
