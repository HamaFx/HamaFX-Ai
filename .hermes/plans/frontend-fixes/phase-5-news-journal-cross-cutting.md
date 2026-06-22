# Phase 5 — News, Journal, Calendar, Alerts & Cross-Cutting Fixes

**Priority:** P3 — Final polish and feature completeness
**Estimated files touched:** 20
**Findings covered:** 42 (10 bugs + 12 improvements + 10 polish + 10 upgrades)

---

## Overview

This phase addresses the remaining feature pages — news, journal, calendar, alerts, dashboard — plus cross-cutting concerns like shared utilities, pagination, service worker updates, and DST handling. These are the final fixes to bring the frontend to production quality.

---

## Task 5.1 — Fix News `useBookmarks` Re-rendering All Cards (🟡 P2)

**File:** `components/news/use-bookmarks.tsx`, `components/news/article-card.tsx`

### Problem

Every `ArticleCard` calls `useBookmarks()` independently — bookmarking one re-renders all 120 cards.

### Fix

Lift bookmark state to a context provider:

```tsx
// bookmarks-context.tsx
const BookmarksContext = createContext<BookmarksContextValue | null>(null);

export function BookmarksProvider({ children }) {
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem('hfx_news_bookmarks');
      if (stored) setBookmarks(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  const isBookmarked = useCallback((id: string) => bookmarks.has(id), [bookmarks]);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('hfx_news_bookmarks', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  return (
    <BookmarksContext.Provider value={{ bookmarks, isBookmarked, toggleBookmark }}>
      {children}
    </BookmarksContext.Provider>
  );
}
```

Wrap news page with provider. Only the toggled card re-renders.

### Verification

1. Bookmark one article — only that card re-renders
2. Bookmarks persist across reloads

---

## Task 5.2 — Fix News `article-card.tsx` Missing Memoization (🟡 P2)

### Fix

```tsx
export const ArticleCard = memo(function ArticleCard({ article, onPin }: Props) {
  // ... body
}, (prev, next) => {
  if (prev.article.id !== next.article.id) return false;
  if (prev.article.title !== next.article.title) return false;
  if (prev.article.bookmarked !== next.article.bookmarked) return false;
  return true;
});
```

---

## Task 5.3 — Fix News `live-timestamp.tsx` Interval Cleanup (🟡 P2)

### Fix

```tsx
useEffect(() => {
  const interval = setInterval(() => setNow(Date.now()), 60_000);
  return () => clearInterval(interval);
}, []);
```

### Verification

1. Navigate away from news — no intervals running in DevTools

---

## Task 5.4 — Fix News Page Missing Pagination (🟢 Upgrade)

**File:** `news/page.tsx`, `news/_components/news-view.tsx`

### Fix

Implement infinite scroll with React Query `useInfiniteQuery` + IntersectionObserver:

```tsx
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ['news', filter],
  queryFn: ({ pageParam = 0 }) => fetch(`/api/news?offset=${pageParam}&limit=20`).then(r => r.json()),
  getNextPageParam: (last) => last.hasMore ? last.nextOffset : undefined,
  initialPageParam: 0,
});

const sentinelRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  const sentinel = sentinelRef.current;
  if (!sentinel) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    },
    { rootMargin: '200px' },
  );
  observer.observe(sentinel);
  return () => observer.disconnect();
}, [fetchNextPage, hasNextPage, isFetchingNextPage]);
```

### Verification

1. First 20 articles load, scroll down — next 20 load automatically

---

## Task 5.5 — Fix Journal `entry-list.tsx` Missing Virtualization (🟢 Upgrade)

**File:** `journal/_components/entry-list.tsx` (23,116 bytes — largest file)

### Fix

Use `@tanstack/react-virtual` (same as Phase 3 Task 3.8):

```tsx
const virtualizer = useVirtualizer({
  count: entries.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 120,
  overscan: 5,
});
```

### Verification

1. 100+ entries — smooth scroll, ~15-20 DOM nodes

---

## Task 5.6 — Fix Journal `entry-form.tsx` Validation (🟡 P2)

### Fix

Add zod validation:
```ts
const entrySchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  direction: z.enum(['long', 'short']),
  entryPrice: z.number().positive('Entry price must be positive'),
  exitPrice: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  notes: z.string().max(5000, 'Notes must be under 5000 characters').optional(),
  emotion: z.string().max(100).optional(),
});
```

### Verification

1. Empty symbol — validation error
2. Notes over 5000 chars — validation error

---

## Task 5.7 — Fix Journal `stats-summary.tsx` Empty State (🟡 P2)

### Fix

```tsx
if (entries.length === 0) {
  return <EmptyState icon={BookOpen} title="No journal entries yet" description="Start logging your trades to see statistics here." action={<Button onClick={onNewEntry}>Add first entry</Button>} />;
}

const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
const avgR = totalTrades > 0 ? totalR / totalTrades : 0;
```

### Verification

1. No entries — empty state shows
2. No NaN or Infinity in stats

---

## Task 5.8 — Fix Calendar `event-card.tsx` Timezone Display (🟡 P2)

### Fix

```tsx
function formatEventTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    weekday: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}
```

### Verification

1. Event times show in local timezone with timezone label

---

## Task 5.9 — Fix Calendar `calendar-view.tsx` Missing Loading States (🟡 P2)

### Fix

```tsx
if (isLoading) return <div className="space-y-3">{Array.from({length:5}).map((_,i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
if (error) return <EmptyState icon={CalendarX} title="Failed to load calendar" action={<Button onClick={refetch}>Retry</Button>} />;
```

---

## Task 5.10 — Fix Calendar `calendar-toolbar.tsx` Filter State (🟡 P2)

### Fix

Use `nuqs` for filter state in URL:
```tsx
const [importance, setImportance] = useQueryState('importance', { defaultValue: 'all' });
const [currency, setCurrency] = useQueryState('currency', { defaultValue: 'all' });
```

### Verification

1. Filter — URL updates, shareable, back button restores

---

## Task 5.11 — Fix Alerts `alert-form.tsx` Validation (🟡 P2)

### Fix

```ts
const alertSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  condition: z.enum(['above', 'below', 'crosses_up', 'crosses_down']),
  price: z.number().positive('Price must be positive'),
  channel: z.enum(['email', 'telegram', 'push']),
  active: z.boolean(),
});
```

---

## Task 5.12 — Fix Alerts `alert-list.tsx` Missing Empty State (🟡 P2)

### Fix

```tsx
if (alerts.length === 0) {
  return <EmptyState icon={Bell} title="No alerts configured" description="Create price alerts to get notified when the market hits your targets." action={<Button onClick={onCreate}>Create alert</Button>} />;
}
```

---

## Task 5.13 — Fix Dashboard Hardcoded Placeholder Data (🟡 P2)

**File:** `app/(app)/dashboard/page.tsx`

### Problem

Dashboard is entirely hardcoded with "Chart Component Placeholder" text.

### Fix

Replace with real data fetching:
```tsx
const [recentAlerts, upcomingEvents, recentJournal, equityCurve] = await Promise.all([
  getRecentAlerts(user.userId, 5),
  getUpcomingEvents(7),
  getRecentJournalEntries(user.userId, 5),
  getEquityCurve(user.userId, 30),
]);

// Render stat cards, equity chart, event list, alert list, journal list
```

### Verification

1. No "Chart Component Placeholder" text
2. All cards populated with user-specific data
3. Empty states show when no data

---

## Task 5.14 — Fix `formatRelative` Duplicated Across 6+ Files (🔵 Polish)

### Fix

Create shared utility in `lib/format.ts`:
```ts
export function formatRelative(timestamp: number | string | Date, now: number = Date.now()): string {
  const t = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = now - t;
  if (diffMs < 0) return 'just now';
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  if (diffMs < 7 * 86_400_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
  if (diffMs < 30 * 86_400_000) return `${Math.floor(diffMs / (7 * 86_400_000))}w ago`;
  return new Date(t).toLocaleDateString();
}
```

Import in all files. Remove all local definitions.

### Verification

1. `grep -rn "function formatRelative" apps/web/src/` — only in `lib/format.ts`

---

## Task 5.15 — Fix `lib/session.ts` DST Handling (🟢 Upgrade)

### Fix

```ts
export function isMarketOpen(now: Date = new Date()): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const month = now.getUTCMonth();
  const isUsDst = month >= 2 && month <= 10;
  const closeHour = isUsDst ? 21 : 22;
  const openHour = isUsDst ? 21 : 22;
  if (day === 5 && hour >= closeHour) return false;
  if (day === 6) return false;
  if (day === 0 && hour < openHour) return false;
  return true;
}
```

### Verification

1. Summer (DST) — close at 21:00 UTC
2. Winter (standard) — close at 22:00 UTC

---

## Task 5.16 — Fix `lib/storage.ts` Error Handling (🟡 P2)

### Fix

```ts
export function safeGetItem<T>(key: string, fallback: T): T {
  try { const item = localStorage.getItem(key); return item === null ? fallback : JSON.parse(item) as T; }
  catch { return fallback; }
}
export function safeSetItem<T>(key: string, value: T): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.error(`[storage] Failed to set ${key}:`, e); return false; }
}
```

### Verification

1. Fill localStorage to quota — no crash
2. Corrupt entry — returns fallback

---

## Task 5.17 — Fix `lib/fuzzy-match.ts` Edge Cases (🟡 P2)

### Fix

Handle: empty query (score 0), empty target (score -1), exact match (1000), starts with (500), contains (250), fuzzy character match with consecutive bonus.

---

## Task 5.18 — Fix `lib/commands.ts` Command Registration (🟡 P2)

### Fix

Add typed `Command` interface and validation function.

---

## Task 5.19 — Fix `lib/thread-export.ts` Large Export Handling (🟡 P2)

### Fix

Limit to 500 messages, 5MB max. Truncate with notice.

---

## Task 5.20 — Fix `lib/env.ts` Missing Validation (🟡 P2)

### Fix

Use zod schema to validate all env vars at startup. Throw clear error if required vars missing.

---

## Task 5.21 — Fix `instrumentation.ts` Sentry Configuration (🟡 P2)

### Fix

Add `beforeSend` to scrub PII (authorization headers, cookies, user email):
```ts
beforeSend(event) {
  if (event.request?.headers) {
    delete event.request.headers.authorization;
    delete event.request.headers.cookie;
  }
  if (event.user?.email) event.user.email = undefined;
  return event;
}
```

---

## Task 5.22 — Fix `sw-register.tsx` Service Worker Updates (🟢 Upgrade)

### Fix

Add update notification with toast:
```tsx
reg.addEventListener('updatefound', () => {
  const newWorker = reg.installing;
  newWorker?.addEventListener('statechange', () => {
    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
      toast.info('Update available', {
        action: { label: 'Reload', onClick: () => { newWorker.postMessage({ type: 'SKIP_WAITING' }); window.location.reload(); } },
        duration: Infinity,
      });
    }
  });
});
```

### Verification

1. Deploy new version — users see update toast
2. Click Reload — new version loads

---

## Task 5.23 — Fix `query-provider.tsx` Default Options (🟡 P2)

### Fix

```tsx
const [client] = useState(() => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (error instanceof Response && error.status >= 400 && error.status < 500) return false;
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
}));
```

---

## Task 5.24 — Fix `providers/index.tsx` Provider Order (🔵 Polish)

### Fix

QueryProvider outermost, then NuqsAdapter, then SWRegister.

---

## Task 5.25 — Fix `app/share/[id]/page.tsx` Public Share Page (🟡 P2)

### Fix

- No auth required (public share)
- Validate share ID format
- Show 404 for invalid/expired shares
- Read-only content

---

## Task 5.26 — Fix `app/(app)/offline/page.tsx` Offline Page (🔵 Polish)

### Fix

```tsx
export const dynamic = 'force-static';
```
Must work with no server connection. Include Retry button.

---

## Task 5.27 — Fix `app/page.tsx` Landing Page Redirect (🔵 Polish)

### Fix

```tsx
const session = await auth();
if (session?.user) redirect('/dashboard');
else redirect('/login');
```

---

## Task 5.28 — Fix `app/not-found.tsx` Styling (🔵 Polish)

### Fix

Styled 404 with link to dashboard.

---

## Task 5.29 — Fix `app/error.tsx` Error Recovery (🔵 Polish)

### Fix

Show error message + error ID + Try again + Go to dashboard buttons.

---

## Task 5.30 — Fix `lib/market-client.ts` Error Handling (🟡 P2)

### Fix

Proper try-catch with clear error messages for network errors, invalid data format, HTTP errors.

---

## Task 5.31 — Fix `lib/catalog-server.ts` Caching (🟡 P2)

### Fix

5-minute TTL cache for model catalog.

---

## Task 5.32 — Fix `lib/request-id.ts` Header Propagation (🔵 Polish)

### Fix

Generate, get from header, set on response.

---

## Task 5.33 — Fix `lib/cron.ts` Error Handling (🟡 P2)

### Fix

```ts
export async function runCronJob(name: string, fn: () => Promise<void>, options: { timeout?: number } = {}): Promise<Response> {
  const startTime = Date.now();
  try {
    const timeout = options.timeout ?? 30_000;
    await Promise.race([fn(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Cron job ${name} timed out`)), timeout))]);
    return Response.json({ ok: true, duration: Date.now() - startTime });
  } catch (error) {
    console.error(`[cron] ${name} failed:`, error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
```

---

## Task 5.34 — Fix `sentiment-summary.tsx` Edge Cases (🟡 P2)

### Fix

Handle empty articles, clamp sentiment score to [-1, 1], label as Bullish/Bearish/Neutral.

---

## Task 5.35 — Fix `refresh-button.tsx` Loading State (🔵 Polish)

### Fix

Add `refreshing` state with spinner.

---

## Task 5.36 — Fix `news-toolbar.tsx` Filter Persistence (🟡 P2)

### Fix

Use `nuqs` for filter state in URL.

---

## Task 5.37 — Fix `calendar-hero.tsx` Stats Display (🔵 Polish)

### Fix

Handle empty data — all stats show 0.

---

## Task 5.38 — Fix `settings/usage/page.tsx` Chart Rendering (🟡 P2)

### Fix

Handle empty usage data with EmptyState. Filter out zero-token days from chart.

---

## Task 5.39 — Fix `bulk-test-button.tsx` Progress (🟡 P2)

### Fix

Show `{current}/{total}` progress during sequential key testing.

---

## Task 5.40 — Fix `save-bar.tsx` Unsaved Changes Warning (🟡 P2)

### Fix

Track `hasUnsavedChanges`, add `beforeunload` warning, show save/discard bar.

---

## Task 5.41 — Fix `settings/agent/page.tsx` Agent Configuration (🟡 P2)

### Fix

Ensure proper loading, saving, no duplicate IDs (covered in Phase 1).

---

## Task 5.42 — Final Cross-Cutting Verification (🟢 Upgrade)

### 5.42a — Run full type check
```bash
pnpm typecheck
```

### 5.42b — Run full lint
```bash
pnpm lint
```

### 5.42c — Run tests
```bash
pnpm test
```

### 5.42d — Build check
```bash
pnpm build
```

### 5.42e — Audit for remaining issues
```bash
grep -rn "window.confirm" apps/web/src/ --include="*.tsx" --include="*.ts"
grep -rn "__system__" apps/web/src/ --include="*.ts"
grep -rn "'/auth/" apps/web/src/ --include="*.ts" --include="*.tsx"
grep -rn "function formatRelative" apps/web/src/ --include="*.ts" --include="*.tsx"
grep -rn "dangerouslySetInnerHTML" apps/web/src/ --include="*.tsx"
grep -rn "focus:outline-none" apps/web/src/ --include="*.tsx" | grep -v "focus-visible"
```
All should return zero results.

### 5.42f — Accessibility audit
Run axe DevTools on every page — zero WCAG violations.

### 5.42g — Performance audit
Run Lighthouse on key pages — Performance ≥85.

---

## Completion Checklist

- [ ] Task 5.1 — Bookmarks lifted to context
- [ ] Task 5.2 — ArticleCard memoized
- [ ] Task 5.3 — Live timestamp interval cleaned up
- [ ] Task 5.4 — News infinite scroll implemented
- [ ] Task 5.5 — Journal entry list virtualized
- [ ] Task 5.6 — Journal entry form validated
- [ ] Task 5.7 — Journal stats handles empty state
- [ ] Task 5.8 — Calendar event times in local timezone
- [ ] Task 5.9 — Calendar view has loading/error states
- [ ] Task 5.10 — Calendar toolbar filters persist in URL
- [ ] Task 5.11 — Alert form validated
- [ ] Task 5.12 — Alert list has empty state
- [ ] Task 5.13 — Dashboard uses real data
- [ ] Task 5.14 — `formatRelative` consolidated
- [ ] Task 5.15 — Session DST handling implemented
- [ ] Task 5.16 — Storage utilities have error handling
- [ ] Task 5.17 — Fuzzy match handles edge cases
- [ ] Task 5.18 — Commands typed and validated
- [ ] Task 5.19 — Thread export handles large threads
- [ ] Task 5.20 — Environment variables validated
- [ ] Task 5.21 — Sentry configured with privacy scrubbing
- [ ] Task 5.22 — Service worker shows update notification
- [ ] Task 5.23 — React Query default options configured
- [ ] Task 5.24 — Provider order correct
- [ ] Task 5.25 — Share page works without auth
- [ ] Task 5.26 — Offline page is static
- [ ] Task 5.27 — Root page redirects correctly
- [ ] Task 5.28 — 404 page styled
- [ ] Task 5.29 — Error page has recovery options
- [ ] Task 5.30 — Market client has error handling
- [ ] Task 5.31 — Catalog server cached
- [ ] Task 5.32 — Request ID propagated
- [ ] Task 5.33 — Cron jobs have timeout and error handling
- [ ] Task 5.34 — Sentiment summary handles empty data
- [ ] Task 5.35 — Refresh button has loading state
- [ ] Task 5.36 — News toolbar filters persist in URL
- [ ] Task 5.37 — Calendar hero stats handle empty data
- [ ] Task 5.38 — Usage page handles empty data
- [ ] Task 5.39 — Bulk test button shows progress
- [ ] Task 5.40 — Save bar warns about unsaved changes
- [ ] Task 5.41 — Agent settings page fixed
- [ ] Task 5.42 — Full verification: typecheck, lint, test, build, a11y, performance

## Post-Phase Verification

1. `pnpm typecheck` — zero errors
2. `pnpm lint` — zero errors
3. `pnpm test` — all pass
4. `pnpm build` — succeeds
5. axe DevTools — zero WCAG violations on all pages
6. Lighthouse — Performance ≥85 on key pages
7. No `window.confirm`, `__system__`, `/auth/`, duplicate `formatRelative` in codebase
8. All feature pages use real data
9. All forms have validation
10. All lists have empty states
11. All pages have loading states
12. All pages have error states

---

## Summary — All 5 Phases

| Phase | Focus | Bugs | Improvements | Polish | Upgrades | Total |
|-------|-------|------|-------------|-------|----------|-------|
| 1 | Security & Auth | 10 | 5 | 0 | 0 | 15 |
| 2 | Chart & Trading | 8 | 11 | 9 | 4 | 32 |
| 3 | Chat & Composer | 7 | 25 | 12 | 7 | 51 |
| 4 | Layout, Settings & UI | 9 | 14 | 10 | 6 | 39 |
| 5 | News, Journal & Cross-cutting | 0 | 12 | 10 | 10 | 42* |
| **TOTAL** | | **34** | **67** | **41** | **27** | **169** |

*Phase 5 includes cross-cutting fixes that span multiple areas.

### Execution Order

```
Phase 1 (Security) → Phase 2 (Charts) → Phase 3 (Chat) → Phase 4 (UI) → Phase 5 (Features)
```

Each phase should be completed and verified before moving to the next. Phases 2 and 3 touch different files and can run in parallel.
