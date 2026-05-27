# Design Document — Phase 4: Polish & Reliability

## Overview

Phase 4 is a zero-new-features pass that fixes broken data pipelines, eliminates blank-page states, upgrades indicator accuracy, and polishes the chat UX. The biggest impact item is fixing the cron scheduling — without it, News and Calendar are permanently empty.

## Architecture Changes

No new packages, tables, or deployables. Changes are:
1. `vercel.json` gains a `crons` array (Hobby plan = once/day fallback).
2. Indicator functions gain additive output fields (strength, percentFilled, magnitude).
3. UI components gain loading/error/retry states.
4. A one-time seed script for manual data population.

---

## 1. Cron Scheduling Fix

### Problem
GitHub Actions workflows fire every 5–15 min but the account has exhausted its free-tier minutes (2000 min/month for private repos). Every run shows `startup_failure`.

### Solution
**Dual-path scheduling:**
- **Primary**: GitHub Actions (when minutes are available — resets monthly).
- **Fallback**: Vercel Cron in `vercel.json`. Hobby plan caps at once/day, but that's enough to keep pages populated.
- **Manual**: `scripts/seed-crons.sh` for immediate seeding.

```json
// apps/web/vercel.json — add crons array
{
  "crons": [
    { "path": "/api/cron/news", "schedule": "0 */6 * * *" },
    { "path": "/api/cron/calendar", "schedule": "0 */12 * * *" },
    { "path": "/api/cron/alerts", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/snapshots", "schedule": "5 0 * * *" },
    { "path": "/api/cron/embedding-backfill", "schedule": "15 */6 * * *" },
    { "path": "/api/cron/fred-actuals", "schedule": "30 1 * * *" },
    { "path": "/api/cron/briefings", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/weekly-review", "schedule": "0 18 * * 0" },
    { "path": "/api/cron/cot", "schedule": "0 22 * * 5" }
  ]
}
```

Note: On Hobby, Vercel will fire each at most once/day regardless of the schedule string. The schedule strings are written for Pro so upgrading is seamless.

### Seed script

```bash
#!/usr/bin/env bash
# scripts/seed-crons.sh — manually trigger all crons to populate empty tables.
# Usage: CRON_SECRET=<your-secret> ./scripts/seed-crons.sh
set -euo pipefail
BASE="${PRODUCTION_URL:-https://hama-fx-ai.vercel.app}"
AUTH="Authorization: Bearer ${CRON_SECRET:?Set CRON_SECRET}"
echo "Seeding news..."
curl -fsS -H "$AUTH" "$BASE/api/cron/news"
echo -e "\nSeeding calendar..."
curl -fsS -H "$AUTH" "$BASE/api/cron/calendar"
echo -e "\nSeeding snapshots..."
curl -fsS -H "$AUTH" "$BASE/api/cron/snapshots"
echo -e "\nSeeding embeddings..."
curl -fsS -H "$AUTH" "$BASE/api/cron/embedding-backfill"
echo -e "\nDone."
```

---

## 2. Chart Page — Loading & Error States

### Current state
- Server renders `<ChartView>` which is a `'use client'` component.
- `useCandles` returns `{ data, isLoading, error }` from TanStack Query.
- No explicit loading/error UI — chart just doesn't render until data arrives.

### Fix
Add explicit states to `ChartView`:

```tsx
if (isLoading) return <ChartSkeleton />;
if (error) return <ChartError error={error} onRetry={refetch} />;
if (!candles || candles.length === 0) return <ChartEmpty symbol={symbol} tf={tf} />;
```

`ChartSkeleton`: animated pulse div matching chart aspect ratio (16:9 on mobile, 21:9 on desktop).

---

## 3. News & Calendar — Refresh Buttons

Both pages currently show a static empty state with curl instructions. Replace with:

```tsx
// Client island mounted inside the empty state
function RefreshButton({ endpoint }: { endpoint: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<'idle' | 'ok' | 'error'>('idle');
  
  function refresh() {
    startTransition(async () => {
      const res = await fetch(endpoint, { method: 'GET' });
      setResult(res.ok ? 'ok' : 'error');
      if (res.ok) router.refresh(); // revalidate server component
    });
  }
  // ...
}
```

The refresh button calls the cron endpoint directly. Since the user is already authenticated (middleware passes), and the cron handler checks `Authorization: Bearer CRON_SECRET`, we need a small change: add an **admin bypass** that accepts the session cookie as an alternative to the Bearer token for manual triggers from the UI.

### Admin bypass in `withCronAuth`

```ts
export async function withCronAuth(req: Request, handler: () => Promise<unknown>): Promise<Response> {
  // Path 1: Bearer token (cron schedulers)
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${process.env.CRON_SECRET}`) {
    // ... existing logic
  }
  
  // Path 2: Session cookie (admin UI refresh buttons)
  const cookie = req.cookies?.get('hfx_auth')?.value;
  if (cookie) {
    const payload = await verifyAuthToken(cookie, process.env.AUTH_COOKIE_SECRET!);
    if (payload) {
      // ... same handler logic
    }
  }
  
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}
```

---

## 4. Indicator Upgrades

All changes are **additive** — existing fields stay unchanged, new fields are appended.

### 4.1 Adaptive swing lookback

```ts
function defaultLookback(tf: Timeframe): number {
  switch (tf) {
    case '1m': case '5m': return 2;
    case '15m': case '30m': case '1h': return 3;
    case '4h': case '1d': case '1w': return 5;
  }
}
```

The `annotate_chart` tool and `/api/market/structure` route already accept `lookback` as a parameter. The change is to make the **default** timeframe-aware when no explicit lookback is passed.

### 4.2 Order block strength score

```ts
interface OrderBlock {
  // ... existing fields
  /** Strength 0–1 based on impulse magnitude / ATR, bar count, trend alignment. */
  strength: number;
}
```

Computed as: `clamp01(impulseMagnitude / (atr14 * 2)) * 0.5 + (impulseBarCount >= 3 ? 0.3 : 0.15) + (trendAligned ? 0.2 : 0)`.

### 4.3 FVG percent filled

```ts
interface FvgZone {
  // ... existing fields
  /** 0–1: how much of the gap has been retraced. 1.0 = fully mitigated. */
  percentFilled: number;
}
```

Computed by scanning bars after the FVG and tracking the deepest penetration into the gap zone.

### 4.4 Liquidity sweep magnitude

```ts
interface LiquiditySweep {
  // ... existing fields
  /** Wick extension beyond the level as a multiple of ATR(14). */
  magnitude: number;
}
```

---

## 5. Chat UX Polish

### 5.1 Auto-focus composer
Add `autoFocus` to the textarea + `useEffect` that re-focuses after `status` transitions from streaming → ready.

### 5.2 Auto-scroll
`useEffect` watching `messages.length` + `status` — scroll the container to bottom when a new message appears or streaming starts.

### 5.3 Typing indicator
When `status === 'submitted'` (before first token), render a three-dot pulse animation below the last user message.

### 5.4 Error retry
The error banner already exists. Add a "Retry" button that calls `sendMessage` with the last user message's text.

### 5.5 Live thread title
After `status` transitions to `ready`, re-fetch the thread metadata and update the header title without a full page reload.

### 5.6 Quick-prompt chips
Render below the composer when `messages.length <= 1` (only the system greeting or empty). Chips: "What's the bias on gold?", "Top-down XAUUSD 4H→15M", "Today's calendar", "Show me the structure", "Set an alert".

---

## 6. Error Handling

### Exponential backoff in hooks
TanStack Query already supports `retry` and `retryDelay`. Configure:
```ts
useQuery({
  queryKey: [...],
  queryFn: ...,
  retry: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
});
```

### Rate-limit UI
When the error is `PROVIDER_QUOTA_EXCEEDED`, show a countdown timer based on the throttle window (60s) instead of a generic error.

---

## 7. Streaming SSR

Add `loading.tsx` files for News and Calendar routes:

```tsx
// apps/web/src/app/(app)/news/loading.tsx
export default function NewsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-8 w-48 animate-pulse rounded bg-bg-elev-2" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-bg-elev-1" />
      ))}
    </div>
  );
}
```

---

## Testing Strategy

- Verify indicator math via existing golden tests + add new cases for the additive fields.
- Smoke-test all pages after cron seeding (curl + grep for expected content).
- Lighthouse audit after all UI changes land.
- No new property-based tests (optional, at team's discretion).

## Out of Scope

- New features (Phase 5 territory).
- Multi-user anything.
- New instruments.
- Changing the AI model or prompt.
