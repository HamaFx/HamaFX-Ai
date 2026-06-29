# Phase 2 — Journal Depth, Alerts, Onboarding & Cross-Cutting Systems

> **For:** AI agents vibecoding the implementation. This file is your complete spec.
> **Scope:** Journal analytics, decision-signal feedback, alert UX, onboarding upgrade,
> and cross-cutting infrastructure (light theme, live-data fabric, PWA, personalization,
> shareable snapshots).
> **No chart-page changes in this phase.**
> **Design law:** Pure-black OKLCH glass terminal. Semantic tokens only (`bg-bg-elev-1`,
> `text-fg`, `text-bull/bear/warn`, `border-divider`, `text-brand`). Zero raw Tailwind palette
> colors. Motion is functional only. Tabular-nums on all numerics. No purple gradients, no
> AI-slop decorations.

---

## Features in this phase

| # | Feature | Size | Surfaces |
|---|---------|------|----------|
| 2.1 | Rich journal analytics suite | L | `journal/` |
| 2.2 | Setup tagging + tag analytics | M | `journal/` |
| 2.3 | AI trade review | M | `journal/` + `ai/` |
| 2.4 | Screenshot / import trades | M | `journal/` |
| 2.5 | Decision-signal feedback loop UI | M | `chat/` + signals |
| 2.6 | Smart alert digest & noise control UX | S | `settings/` |
| 2.7 | Interactive, progress-saved onboarding | M | `onboarding/` |
| 2.8 | Real light theme (or remove affordance) | M | global |
| 2.9 | Shared TimeProvider + live-data fabric | M | global |
| 2.10 | PWA depth | S | global |
| 2.11 | Personalization layer | S/M | `nav/` + global |
| 2.12 | Shareable, branded snapshots | M | `share/` |

---

## 2.1 — Rich Journal Analytics Suite

### Goal
Turn the journal from a basic stats page into a serious performance tool: drawdown curve,
R-distribution histogram, win-rate by symbol/session/setup-tag, expectancy, streaks, and
best/worst times of day.

### Current state
**File:** `apps/web/src/app/(app)/journal/_components/stats-summary.tsx`
- Already shows: win rate, total R, profit factor, max drawdown, expectancy, best/worst trade,
  trade distribution gauge, rolling cumulative R sparkline, rolling win-rate sparkline,
  day-of-week chart.
- Uses `StatCard`, `Sparkline`, `EmptyState` components.
- Data comes from `entries: JournalEntry[]` and `stats: JournalStats`.

**File:** `apps/web/src/app/(app)/journal/_components/journal-view.tsx`
- Client component. Fetches via `useQuery` from `/api/journal`. Renders `StatsSummary`,
  `EntryList`, `PerformanceChart`, and an entry form drawer.

**File:** `apps/web/src/app/(app)/journal/_components/entry-list.tsx`
- Virtualized trade list with tabs (active/closed/all), filters (symbol, side, search),
  live price tracking, and PnL sliders.

**File:** `apps/web/src/app/api/journal/route.ts`
- GET: returns `{ entries, stats }` via `listEntries` + `computeStats`.
- POST: creates new entries.

**Backend:** `packages/ai/src/journal/persistence.ts` — `computeStats(userId)` returns
`JournalStats` with winRate, totalR, profitFactor, maxDrawdown, expectancy, etc.

### Implementation steps

#### Step 1: Extend `JournalStats` with new computed metrics

**File:** `packages/shared/src/schemas/` — find the `JournalStats` type and add:

```typescript
interface JournalStats {
  // ... existing fields ...
  // New fields:
  avgWinR: number;           // average winning R
  avgLossR: number;          // average losing R
  maxWinStreak: number;      // longest win streak
  maxLossStreak: number;     // longest loss streak
  currentStreak: { type: 'win' | 'loss' | 'none'; count: number };
  recoveryFactor: number;    // totalR / maxDrawdown (if maxDrawdown !== 0)
  rDistribution: Array<{ bucket: string; count: number }>; // histogram buckets
  bySymbol: Array<{ symbol: string; trades: number; winRate: number; totalR: number; expectancy: number }>;
  bySession: Array<{ session: string; trades: number; winRate: number; totalR: number }>;
  byHour: Array<{ hour: number; trades: number; winRate: number; totalR: number }>;
  byDayOfWeek: Array<{ day: string; trades: number; winRate: number; totalR: number }>;
  byTag: Array<{ tag: string; trades: number; winRate: number; totalR: number; expectancy: number }>;
}
```

**File:** `packages/ai/src/journal/persistence.ts` — extend `computeStats` to calculate the new
fields. The closed-trade entries are already loaded; compute:

- **avgWinR / avgLossR**: filter closed trades by outcome, average their `rMultiple`.
- **Streaks**: sort closed trades by `closedAt` ascending, iterate tracking current streak.
- **Recovery factor**: `totalR / Math.abs(maxDrawdown)` (guard against division by zero).
- **R-distribution**: bucket `rMultiple` values into ranges: `[-3,-2)`, `[-2,-1)`, `[-1,0)`,
  `[0,0)`, `(0,1]`, `(1,2]`, `(2,3]`, `[3+)`. Count trades per bucket.
- **By symbol**: group by `symbol`, compute per-group stats.
- **By session**: determine session from `openedAt` UTC hour (Asian 00-08, London 08-16,
  NY 13-21, Off otherwise). Group and compute.
- **By hour**: group by `new Date(openedAt).getUTCHours()`.
- **By day of week**: group by `new Date(openedAt).getUTCDay()`.
- **By tag**: flatten all tags from all entries, group by tag, compute stats.

#### Step 2: Create new analytics components

**New file:** `apps/web/src/app/(app)/journal/_components/analytics/drawdown-chart.tsx`

A mini chart showing the equity curve with drawdown periods shaded.
- Reuse the `Sparkline` SVG pattern but with a filled area below the line.
- Shade regions where the curve is below its running maximum in `bg-bear/20`.
- Label: "Max DD: -{maxDrawdown}R · Recovery: {recoveryFactor}".
- `h-20 w-full`, `role="img"` `aria-label="Drawdown chart: max drawdown {maxDrawdown}R"`.

**New file:** `apps/web/src/app/(app)/journal/_components/analytics/r-distribution.tsx`

A histogram of R-multiples.
- Vertical bars, one per bucket. Positive buckets: `bg-bull/60`. Negative: `bg-bear/60`.
- X-axis labels: bucket ranges in `text-caption text-fg-subtle tabular-nums`.
- Y-axis: count, with grid lines in `border-divider/30`.
- `h-32 w-full`, `role="img"` `aria-label="R-multiple distribution histogram"`.

**New file:** `apps/web/src/app/(app)/journal/_components/analytics/breakdown-table.tsx`

A reusable table for by-symbol / by-session / by-hour / by-day / by-tag breakdowns.
```typescript
interface BreakdownTableProps {
  title: string;
  data: Array<{ label: string; trades: number; winRate: number; totalR: number; expectancy?: number }>;
  sortBy?: 'trades' | 'winRate' | 'totalR' | 'expectancy';
}
```
- Table with columns: Label | Trades | Win Rate | Total R | Expectancy (optional).
- `tabular-nums` on all numerics.
- Win rate colored: >55% → `text-bull`, <40% → `text-bear`, else `text-fg-muted`.
- Total R colored: positive → `text-bull`, negative → `text-bear`.
- Sortable column headers (clickable `<th>` with `aria-sort`).
- Container: `border border-divider bg-bg-elev-1 rounded-lg overflow-hidden`.
- `role="table"` with proper ARIA.

**New file:** `apps/web/src/app/(app)/journal/_components/analytics/streak-display.tsx`

Current + max streaks.
- Three stat pills: "Current: {n}W/{n}L", "Best win streak: {n}", "Worst loss streak: {n}".
- Current streak pill colored: win → `bg-bull/10 text-bull`, loss → `bg-bear/10 text-bear`,
  none → `bg-bg-elev-2 text-fg-muted`.

#### Step 3: Create a tabbed analytics panel in `journal-view.tsx`

Add a tab switcher above the stats summary:
- Tab 1: "Overview" (existing `StatsSummary` + `PerformanceChart`)
- Tab 2: "Analytics" (new: drawdown chart, R-distribution, breakdown tables)
- Tab 3: "Trades" (existing `EntryList`)

Use the `Segmented` component for the tab switcher:
```tsx
<Segmented
  value={tab}
  onChange={setTab}
  options={[
    { value: 'overview', label: 'Overview' },
    { value: 'analytics', label: 'Analytics' },
    { value: 'trades', label: 'Trades' },
  ]}
  ariaLabel="Journal view"
/>
```

In the "Analytics" tab, render:
```tsx
<div className="flex flex-col gap-4">
  <DrawdownChart entries={entries} stats={stats} />
  <RDistribution stats={stats} />
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <BreakdownTable title="By Symbol" data={stats.bySymbol} />
    <BreakdownTable title="By Session" data={stats.bySession} />
    <BreakdownTable title="By Day of Week" data={stats.byDayOfWeek} />
    <BreakdownTable title="By Hour (UTC)" data={stats.byHour} />
  </div>
  <StreakDisplay stats={stats} />
</div>
```

### Files to create/modify
- [ ] `packages/shared/src/schemas/` — extend `JournalStats`
- [ ] `packages/ai/src/journal/persistence.ts` — extend `computeStats`
- [ ] `apps/web/src/app/(app)/journal/_components/analytics/drawdown-chart.tsx` — new
- [ ] `apps/web/src/app/(app)/journal/_components/analytics/r-distribution.tsx` — new
- [ ] `apps/web/src/app/(app)/journal/_components/analytics/breakdown-table.tsx` — new
- [ ] `apps/web/src/app/(app)/journal/_components/analytics/streak-display.tsx` — new
- [ ] `apps/web/src/app/(app)/journal/_components/journal-view.tsx` — add tab switcher

---

## 2.2 — Setup Tagging + Tag Analytics

### Goal
Replace comma-separated tag text input with chip-based tags with autocomplete. Add per-tag
analytics ("your 'London breakout' setups: 62% win, +1.4R avg").

### Current state
**File:** `apps/web/src/app/(app)/journal/_components/entry-form.tsx`
- Tags are a comma-separated text input: `tagsInput` state, split by comma on submit.
- No autocomplete, no chip display, no validation against duplicates.

**File:** `apps/web/src/app/(app)/journal/_components/entry-list.tsx`
- Tags are displayed as plain text in the trade row. No tag filtering.

### Implementation steps

#### Step 1: Create a `TagInput` component

**New file:** `apps/web/src/components/ui/tag-input.tsx`

```typescript
'use client';
interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];      // previously used tags
  placeholder?: string;
  maxTags?: number;            // default 10
  maxTagLength?: number;       // default 40
}
```

**Behavior:**
- Render existing tags as chips: `inline-flex items-center gap-1 bg-bg-elev-2 text-fg-muted rounded-md px-2 py-0.5 text-body-sm`.
  Each chip has a remove button (`X` icon, `size-3`, `text-fg-subtle hover:text-bear`).
- Input field below or inline with chips: `Input` component with `text-body-sm`.
- On Enter or comma: add the typed text as a new tag (trim, dedup, enforce maxTags/maxTagLength).
- Autocomplete dropdown: when typing, filter `suggestions` by prefix match. Show up to 5
  suggestions in a dropdown (`absolute z-10 bg-bg-elev-1 border border-divider rounded-md shadow-md`).
  Keyboard nav: arrow up/down, Enter to select, Escape to close.
- `aria-label="Tags"` on the container. Each chip has `aria-label="Remove tag {tag}"`.

#### Step 2: Fetch tag suggestions

In `entry-form.tsx`, fetch previously used tags:
```typescript
const { data: allEntries } = useQuery<JournalEntry[]>({
  queryKey: ['journal', 'all-tags'],
  queryFn: async () => {
    const res = await fetch('/api/journal?limit=500');
    if (!res.ok) return [];
    const data = await res.json();
    return data.entries;
  },
  staleTime: 60_000,
});

const tagSuggestions = useMemo(() => {
  const set = new Set<string>();
  allEntries?.forEach(e => e.tags?.forEach(t => set.add(t)));
  return Array.from(set).sort();
}, [allEntries]);
```

Replace the `tagsInput` state with `tags: string[]` and use `TagInput`:
```tsx
<TagInput
  value={tags}
  onChange={setTags}
  suggestions={tagSuggestions}
  placeholder="Add tags (e.g. London breakout, trend continuation)"
/>
```

Update the submit handler to pass `tags` directly (no comma splitting needed).

#### Step 3: Add tag filtering to `entry-list.tsx`

Add a tag filter dropdown next to the existing symbol/side filters:
- A `<select>` or chip rail of all tags from the current entries.
- Filter `filteredEntries` by selected tag(s).

#### Step 4: Display tag analytics in the analytics tab

In the "Analytics" tab from 2.1, add a `BreakdownTable` for by-tag stats:
```tsx
<BreakdownTable title="By Tag" data={stats.byTag} sortBy="totalR" />
```

### Files to create/modify
- [ ] `apps/web/src/components/ui/tag-input.tsx` — new
- [ ] `apps/web/src/app/(app)/journal/_components/entry-form.tsx` — replace tag input
- [ ] `apps/web/src/app/(app)/journal/_components/entry-list.tsx` — add tag filter

---

## 2.3 — AI Trade Review

### Goal
One-tap "review this trade": the AI critiques entry timing, R:R, and management vs. the recorded
context, and suggests improvements. Weekly auto-review digest.

### Current state
**Backend:** `packages/ai/src/journal/` exists. The `weekly-review` cron exists at
`apps/web/src/app/api/cron/weekly-review/route.ts`.
**File:** `apps/web/src/app/(app)/journal/_components/entry-list.tsx` — each trade row has
action buttons (close, delete). No "AI review" action.

### Implementation steps

#### Step 1: Create an AI review API endpoint

**New file:** `apps/web/src/app/api/journal/[id]/review/route.ts`

```typescript
// POST /api/journal/[id]/review
// Generates an AI review of a specific trade entry.
```

- Use `withAuth` from `@/lib/api`.
- Fetch the journal entry by ID (ensure it belongs to the user).
- Fetch market context around the entry time (candles for the symbol around `openedAt`).
- Call the AI (via `resolveModel` + `generateText` from `packages/ai`) with a prompt:
  ```
  You are a trading coach. Review this trade:
  Symbol: {symbol}, Side: {side}, Entry: {entry}, Stop: {stop}, Target: {target}
  Opened: {openedAt}, Closed: {closedAt}, Outcome: {outcome}, R: {rMultiple}
  Notes: {notes}
  
  Market context (candles around entry): {candle data}
  
  Provide:
  1. Entry timing assessment (was the entry well-timed relative to price action?)
  2. R:R assessment (was the risk/reward appropriate?)
  3. Trade management assessment (was the stop/target placement reasonable?)
  4. One key improvement suggestion
  Keep it concise (3-4 paragraphs max).
  ```
- Return `{ review: string }` (markdown).
- Include CSRF protection.

#### Step 2: Add "AI Review" button to trade rows

In `entry-list.tsx`, add a review button for closed trades:
```tsx
{entry.outcome !== 'open' && (
  <button
    onClick={() => openReview(entry.id)}
    className="text-fg-subtle hover:text-brand p-1.5 rounded-md hover:bg-bg-elev-2"
    aria-label="AI review this trade"
    title="AI review"
  >
    <Sparkles className="size-3.5" />
  </button>
)}
```

#### Step 3: Create a review drawer

**New file:** `apps/web/src/app/(app)/journal/_components/review-drawer.tsx`

```typescript
'use client';
interface ReviewDrawerProps {
  entryId: string | null;
  onClose: () => void;
}
```

- Uses the `Drawer` component.
- Fetches the review from `/api/journal/[id]/review` when `entryId` is set.
- Shows a loading state (`Skeleton` with "Analyzing trade…").
- Renders the review markdown with `ReactMarkdown` + `remarkGfm` (same styling as
  `chat/parts/text.tsx`).
- Header: `Sparkles` icon + "AI Trade Review" in `text-body-sm font-semibold text-fg`.
- `role="dialog"` `aria-label="AI trade review"`.

#### Step 4: Wire up in `entry-list.tsx`

```typescript
const [reviewEntryId, setReviewEntryId] = useState<string | null>(null);

// In the action buttons:
onClick={() => setReviewEntryId(entry.id)}

// At the bottom:
<ReviewDrawer entryId={reviewEntryId} onClose={() => setReviewEntryId(null)} />
```

### Files to create/modify
- [ ] `apps/web/src/app/api/journal/[id]/review/route.ts` — new
- [ ] `apps/web/src/app/(app)/journal/_components/review-drawer.tsx` — new
- [ ] `apps/web/src/app/(app)/journal/_components/entry-list.tsx` — add review button + drawer

---

## 2.4 — Screenshot / Import Trades

### Goal
Attach a chart screenshot to a journal entry and/or parse a broker/MT5 statement to bulk-import
trades.

### Current state
**File:** `apps/web/src/app/api/upload/route.ts` — exists, handles file uploads.
**File:** `apps/web/src/app/(app)/journal/_components/entry-form.tsx` — no file attachment.
**Backend:** `tools/mt5/` directory exists, hinting at MT5 parsing capability.

### Implementation steps

#### Step 1: Add screenshot attachment to entry form

In `entry-form.tsx`:
- Add a file input (`<input type="file" accept="image/*" />`) styled as a drop zone.
- On file select: upload via `/api/upload`, get back the URL.
- Store the URL in a `screenshotUrl` state.
- Display a thumbnail preview with a remove button.
- Include `screenshotUrl` in the entry creation payload.

**DB schema change:** Add `screenshotUrl` column to the journal entries table (if not present).
Update `packages/db/src/schema/` and create a migration.

#### Step 2: Display screenshot in entry list

In `entry-list.tsx`, if an entry has `screenshotUrl`, show a small thumbnail:
```tsx
{entry.screenshotUrl && (
  <img
    src={entry.screenshotUrl}
    alt="Trade screenshot"
    className="size-12 rounded-md object-cover border border-divider"
    onClick={() => window.open(entry.screenshotUrl, '_blank')}
  />
)}
```

#### Step 3: Create MT5 import

**New file:** `apps/web/src/app/(app)/journal/_components/import-trades.tsx`

- A drawer with a file input accepting `.csv` / `.xlsx` / `.html` (MT5 statement formats).
- Parse the file client-side (or upload to a new `/api/journal/import` endpoint for server-side
  parsing).
- Show a preview table of parsed trades with a "Confirm import" button.
- Batch-create entries via the existing `/api/journal` POST endpoint.

**New file:** `apps/web/src/app/api/journal/import/route.ts`
- POST: accepts a file upload, parses it (use the `tools/mt5/` parser if available), returns
  parsed trades as JSON for preview.
- After user confirmation, batch-create entries.

### Files to create/modify
- [ ] `apps/web/src/app/(app)/journal/_components/entry-form.tsx` — add screenshot upload
- [ ] `apps/web/src/app/(app)/journal/_components/entry-list.tsx` — show screenshot thumbnail
- [ ] `apps/web/src/app/(app)/journal/_components/import-trades.tsx` — new
- [ ] `apps/web/src/app/api/journal/import/route.ts` — new
- [ ] `packages/db/src/schema/` — add `screenshotUrl` column (if needed)

---

## 2.5 — Decision-Signal Feedback Loop UI

### Goal
Build a UI for the existing `decision-signals` backend: signal cards with outcome tracking, a
"was this useful?" loop, and a personal signal scorecard.

### Current state
**Backend:** `packages/ai/src/decision-signals/` — full signal lifecycle: extraction,
evaluation, backtest engine, stats.
**API routes:**
- `apps/web/src/app/api/decision-signals/route.ts` — GET lists signals.
- `apps/web/src/app/api/decision-signals/[id]/feedback/route.ts` — POST feedback.
- `apps/web/src/app/api/decision-signals/stats/route.ts` — GET aggregate stats.
**File:** `apps/web/src/app/(app)/settings/track-record/page.tsx` — shows basic stats
(hit rate, per-model, per-horizon, recent signals). Uses `computeSignalStats`.

### Implementation steps

#### Step 1: Create a signals dashboard page

**New file:** `apps/web/src/app/(app)/signals/page.tsx`

Server component:
```typescript
export default async function SignalsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [signals, stats] = await Promise.all([
    listSignals(session.user.id, { limit: 50 }),
    computeSignalStats(session.user.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="AI Signals" description="Track record of AI directional recommendations." />
      <SignalsDashboard signals={signals} stats={stats} />
    </div>
  );
}
```

#### Step 2: Create the signals dashboard client component

**New file:** `apps/web/src/app/(app)/signals/_components/signals-dashboard.tsx`

```typescript
'use client';
interface SignalsDashboardProps {
  signals: DecisionSignal[];
  stats: SignalStats;
}
```

**Layout:**
- **Scorecard row** (top): 4 `StatCard`s — Total signals, Hit rate, Avg confidence,
  Active signals. Use existing `StatCard` component.
- **Signal cards list**: each signal is a card showing:
  - Header: symbol + bias (bullish/bearish/neutral with `text-bull`/`text-bear`/`text-fg-muted`)
    + timestamp (`formatRelative`).
  - Body: anchor price, stop, target, confidence percentage.
  - Status badge: `pending` → `bg-warn/10 text-warn`, `hit` → `bg-bull/10 text-bull`,
    `miss` → `bg-bear/10 text-bear`, `expired` → `bg-bg-elev-2 text-fg-muted`.
  - **Feedback row**: "Was this useful?" with 👍/👎 buttons. Posts to
    `/api/decision-signals/[id]/feedback`. Optimistic update with rollback on error.
  - Expandable details: the AI's reasoning (if stored).

**Signal card container:**
```tsx
<div className="border border-divider bg-bg-elev-1 rounded-lg p-3 flex flex-col gap-2">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <span className="text-fg font-semibold text-sm">{signal.symbol}</span>
      <span className={cn('text-caption font-bold uppercase', biasToken)}>{signal.bias}</span>
    </div>
    <StatusBadge status={signal.evalStatus} />
  </div>
  <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
    <div><span className="text-fg-subtle">Anchor</span> <span className="text-fg font-medium">{signal.anchorPrice}</span></div>
    <div><span className="text-fg-subtle">Stop</span> <span className="text-fg font-medium">{signal.stopLoss}</span></div>
    <div><span className="text-fg-subtle">Target</span> <span className="text-fg font-medium">{signal.takeProfit}</span></div>
  </div>
  <div className="flex items-center justify-between">
    <span className="text-fg-subtle text-caption">{formatRelative(signal.anchorAt)}</span>
    <FeedbackButtons signalId={signal.id} />
  </div>
</div>
```

#### Step 3: Add to nav

In `apps/web/src/components/layout/nav-drawer.tsx`, add a "Signals" nav item:
```typescript
{
  href: '/signals',
  label: 'Signals',
  icon: Target,
  description: 'AI track record',
}
```

### Files to create/modify
- [ ] `apps/web/src/app/(app)/signals/page.tsx` — new
- [ ] `apps/web/src/app/(app)/signals/_components/signals-dashboard.tsx` — new
- [ ] `apps/web/src/components/layout/nav-drawer.tsx` — add Signals nav item

---

## 2.6 — Smart Alert Digest & Noise Control UX

### Goal
A friendly UI over the existing noise-config (dedup/cooldown/quiet-hours) with a live "you'd have
received N alerts this week" preview.

### Current state
**File:** `apps/web/src/app/(app)/settings/_components/noise-control-card.tsx`
- Has inputs for dedup TTL, cooldown, quiet hours.
- No debounce (fires on every keystroke — this is a known bug from the fixes plan).
- `saving` state tracked but never shown.
**API:** `apps/web/src/app/api/notifications/noise-config/route.ts` — GET/POST noise config.

### Implementation steps

#### Step 1: Redesign the noise control card

- Add a visual "alert preview" section at the top:
  - "This week: you would have received **N** alerts" (large number, `text-numeric-lg font-bold`).
  - "After noise filtering: **M** alerts" (with `text-bull` if M < N).
  - A mini bar chart showing alerts per day (last 7 days) vs filtered alerts per day.
- Group the config inputs under "Fine-tune filtering":
  - Dedup TTL: slider (0–60 min) with label showing current value.
  - Cooldown: slider (0–120 min) with label.
  - Quiet hours: time range pickers (from / to).
- Add a `saving` indicator: a small `Loader2` spinner + "Saving…" text that appears when
  `saving` is true (fix the existing bug where it's tracked but never rendered).
- **Debounce all inputs** by 500ms (fix the existing bug).

#### Step 2: Create the alert preview API

**New file:** `apps/web/src/app/api/alerts/preview-digest/route.ts`

- GET: returns `{ totalAlerts: number, filteredAlerts: number, dailyBreakdown: Array<{ date: string; total: number; filtered: number }> }`.
- Uses the user's noise config to simulate filtering on the last 7 days of alert triggers.

### Files to create/modify
- [ ] `apps/web/src/app/(app)/settings/_components/noise-control-card.tsx` — redesign
- [ ] `apps/web/src/app/api/alerts/preview-digest/route.ts` — new

---

## 2.7 — Interactive, Progress-Saved Onboarding

### Goal
Per-step validation, server-side progress save (resume on any device), a "try a sample chat"
preview, and a "skip setup, explore first" path.

### Current state
**File:** `apps/web/src/components/onboarding/wizard.tsx`
- 5-step wizard: name → timezone → provider + API key → trading style → symbols.
- Saves state to `sessionStorage` (including API key — a security bug from the fixes plan).
- No per-step validation. No server-side progress. No skip option.
- `handleNext` blindly advances without validating.

### Implementation steps

#### Step 1: Fix the security bug — remove API key from sessionStorage

In the save effect, exclude `apiKey`:
```typescript
const state = { step, name, timezone, defaultSymbol, selectedProvider, tradingStyle, selectedSymbols };
// Do NOT include apiKey
sessionStorage.setItem('hfx_onboarding_wizard', JSON.stringify(state));
```

#### Step 2: Add per-step validation

Create a `validateStep(step: number): string | null` function:
- Step 1 (name): `name.trim().length >= 2` → else "Please enter your name (at least 2 characters)".
- Step 3 (provider + key): `selectedProvider !== null && apiKey.trim().length >= 8` → else
  "Please select a provider and enter a valid API key".
- Step 5 (symbols): `selectedSymbols.length >= 1` → else "Please select at least one symbol".

In `handleNext`:
```typescript
const error = validateStep(step);
if (error) {
  toast.error(error);
  return;
}
setStep(s => s + 1);
```

Show inline error messages below the relevant fields (not just toasts).

#### Step 3: Add server-side progress saving

**New file:** `apps/web/src/app/onboarding/save-progress/route.ts`

- POST: receives partial wizard state (excluding API key), saves to `userSettings` in a
  `onboardingProgress` JSON column.
- Use `withAuth`.

In `wizard.tsx`, debounce-save progress every 2 seconds:
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    if (step > 1) {
      fetch('/api/onboarding/save-progress', withCsrf({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, name, timezone, defaultSymbol, selectedProvider, tradingStyle, selectedSymbols }),
      })).catch(() => {});
    }
  }, 2000);
  return () => clearTimeout(timer);
}, [step, name, timezone, defaultSymbol, selectedProvider, tradingStyle, selectedSymbols]);
```

On mount, load server-side progress (from the page's server component, passed as a prop).

#### Step 4: Add "Skip setup" option

In the wizard header:
```tsx
<button
  onClick={() => {
    // Mark onboarding as completed with defaults
    completeOnboardingAction({ /* minimal payload with defaults */ });
  }}
  className="text-fg-subtle hover:text-fg text-body-sm"
>
  Skip for now
</button>
```

#### Step 5: Add "Try a sample chat" preview on the last step

Before the "Complete setup" button, add a collapsible preview:
```tsx
<details className="border border-divider rounded-lg p-3">
  <summary className="cursor-pointer text-body-sm text-fg-muted hover:text-fg">
    Try a sample chat
  </summary>
  <div className="mt-2 text-xs text-fg-subtle">
    A preview of what HamaFX-Ai can do. After setup, you'll be able to ask about any symbol.
  </div>
  {/* A static mock chat exchange showing a sample Q&A */}
</details>
```

### Files to create/modify
- [ ] `apps/web/src/components/onboarding/wizard.tsx` — validation, skip, preview, fix security
- [ ] `apps/web/src/app/onboarding/save-progress/route.ts` — new (or add to `actions.ts`)
- [ ] `packages/db/src/schema/` — add `onboardingProgress` column (if needed)

---

## 2.8 — Real Light Theme (or Remove Affordance)

### Goal
Either implement a full light theme with tokens + chart preset, or remove the light-mode hints
to avoid broken expectations.

### Current state
**File:** `apps/web/src/app/globals.css` — hard-dark only. `color-scheme: dark` set 3 times.
No `@media (prefers-color-scheme: light)` block.
**File:** `apps/web/src/app/layout.tsx` — `themeColor` has entries for both light and dark
(both `#0a0a0a`).
**File:** `apps/web/src/app/(app)/settings/_components/appearance-card.tsx` — has a theme
Segmented control (dark/light/system) that sets `document.documentElement.dataset.theme`.

### Implementation steps

#### Option A: Implement light theme

**Step 1:** Add light theme tokens to `globals.css`:

```css
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --color-bg: oklch(98% 0 0);
    --color-bg-elev-1: oklch(95% 0 0);
    --color-bg-elev-2: oklch(92% 0 0);
    --color-bg-elev-3: oklch(88% 0 0);
    --color-border: oklch(85% 0 0);
    --color-divider: oklch(80% 0 0 / 0.4);
    --color-fg: oklch(15% 0 0);
    --color-fg-muted: oklch(35% 0 0);
    --color-fg-subtle: oklch(45% 0 0);
    --color-glass: oklch(95% 0 0 / 0.7);
    --color-glass-strong: oklch(95% 0 0 / 0.85);
    /* Brand, bull, bear, warn stay the same (they work on both) */
  }
}

:root[data-theme="light"] {
  /* Same overrides as above */
}
```

**Step 2:** Add `<meta name="color-scheme" content="dark light">` to `layout.tsx`.

**Step 3:** Update `themeColor` in `layout.tsx` to have a proper light value:
```typescript
themeColor: [
  { media: '(prefers-color-scheme: light)', color: '#fafafa' },
  { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
],
```

**Step 4:** Add a light chart theme preset in `apps/web/src/components/chart/chart-themes.ts`:
```typescript
light: { bg: '#fafafa', grid: '#e5e5e5', text: '#666666' },
```

**Step 5:** Update `useChartTheme` to respect the theme attribute.

#### Option B: Remove light affordance

- Remove the theme Segmented control from `appearance-card.tsx`.
- Remove the light `themeColor` entry from `layout.tsx`.
- Remove `data-theme` attribute handling from globals.css.
- Keep everything dark-only.

**Recommendation:** Option A (implement light theme) is more work but delivers a premium
two-theme product. Option B is safe and quick. The agent should pick based on time budget.

### Files to create/modify
- [ ] `apps/web/src/app/globals.css` — add light theme tokens (Option A)
- [ ] `apps/web/src/app/layout.tsx` — fix `themeColor` + add `color-scheme` meta
- [ ] `apps/web/src/components/chart/chart-themes.ts` — add light preset (Option A)
- [ ] `apps/web/src/components/chart/use-chart-theme.ts` — respect light theme (Option A)
- [ ] `apps/web/src/app/(app)/settings/_components/appearance-card.tsx` — fix or remove

---

## 2.9 — Shared TimeProvider + Live-Data Fabric

### Goal
One ticking clock for all relative timestamps/countdowns, and a move from 1.5s polling to
SSE/WebSocket for prices — enabling smooth real-time across watchlist, chart, dashboard.

### Current state
Multiple components create their own intervals:
- `apps/web/src/components/news/live-timestamp.tsx` — 30s interval per instance.
- `apps/web/src/app/(app)/calendar/_components/calendar-hero.tsx` — 60s interval.
- `apps/web/src/components/calendar/event-card.tsx` — 60s interval per card.
- `apps/web/src/components/ui/animated-number.tsx` — MutationObserver per instance.
- `apps/web/src/hooks/use-prices.ts` — 1.5s polling per symbol set.

### Implementation steps

#### Step 1: Create a `TimeProvider`

**New file:** `apps/web/src/components/providers/time-provider.tsx`

```typescript
'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface TimeContextValue {
  now: number;                    // current timestamp, updates every 30s
  formatRelative: (ts: number) => string;
}

const TimeContext = createContext<TimeContextValue | null>(null);

export function TimeProvider({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const formatRelativeTs = useCallback((ts: number) => {
    return formatRelative(ts, now);
  }, [now]);

  return (
    <TimeContext.Provider value={{ now, formatRelative: formatRelativeTs }}>
      {children}
    </TimeContext.Provider>
  );
}

export function useTime() {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error('useTime must be used within TimeProvider');
  return ctx;
}
```

#### Step 2: Add `TimeProvider` to the provider tree

In `apps/web/src/components/providers/index.tsx`:
```tsx
<QueryProvider>
  <NuqsAdapter>
    <TimeProvider>
      <SwRegister />
      {children}
    </TimeProvider>
  </NuqsAdapter>
</QueryProvider>
```

#### Step 3: Refactor consumers

- `live-timestamp.tsx`: replace local interval with `useTime().formatRelative(ms)`.
- `calendar-hero.tsx`: replace `useNowTick` with `useTime().now`.
- `event-card.tsx`: replace local interval with `useTime().now`.
- `animated-number.tsx`: replace MutationObserver with a shared hook (or use the `useTime` `now`
  value as a re-render trigger if needed).

#### Step 4: Create SSE price stream (optional, larger effort)

**New file:** `apps/web/src/app/api/market/stream/route.ts`

- SSE endpoint that streams price updates for subscribed symbols.
- Client connects with `EventSource`, sends symbols as query params.
- Server fetches prices from the existing market data provider and pushes updates at the
  server's cache TTL (3s).

**New file:** `apps/web/src/hooks/use-price-stream.ts`

- Replaces `usePrices` for components that want real-time streaming.
- Uses `EventSource` to connect to `/api/market/stream?symbols=XAUUSD,EURUSD`.
- Falls back to polling if SSE is not supported.

**Note:** This is a larger effort. If time-constrained, at least implement the `TimeProvider`
and raise the polling interval from 1.5s to 3s to match the server cache.

### Files to create/modify
- [ ] `apps/web/src/components/providers/time-provider.tsx` — new
- [ ] `apps/web/src/components/providers/index.tsx` — add TimeProvider
- [ ] `apps/web/src/components/news/live-timestamp.tsx` — use `useTime`
- [ ] `apps/web/src/app/(app)/calendar/_components/calendar-hero.tsx` — use `useTime`
- [ ] `apps/web/src/components/calendar/event-card.tsx` — use `useTime`
- [ ] `apps/web/src/app/api/market/stream/route.ts` — new (optional SSE)
- [ ] `apps/web/src/hooks/use-price-stream.ts` — new (optional SSE client)

---

## 2.10 — PWA Depth

### Goal
Manifest `shortcuts`, `screenshots` for richer install prompts, per-device splash images, and
home-screen quick actions.

### Current state
**File:** `apps/web/src/app/manifest.ts` — has basic manifest with name, icons, start_url,
display, orientation, colors. No `shortcuts`, no `screenshots`, no `categories`.

### Implementation steps

#### Step 1: Enhance the manifest

In `apps/web/src/app/manifest.ts`, add:

```typescript
return {
  // ... existing fields ...
  categories: ['finance', 'productivity'],
  shortcuts: [
    { name: 'New Chat', url: '/chat', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    { name: 'Chart', url: '/chart/XAUUSD', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    { name: 'Alerts', url: '/alerts', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    { name: 'Journal', url: '/journal', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
  ],
  screenshots: [
    {
      src: '/screenshots/chat.png',
      sizes: '1080x1920',
      type: 'image/png',
      form_factor: 'narrow',
      label: 'AI trading chat',
    },
    {
      src: '/screenshots/dashboard.png',
      sizes: '1080x1920',
      type: 'image/png',
      form_factor: 'narrow',
      label: 'Trading dashboard',
    },
  ],
};
```

#### Step 2: Add screenshot images

Create or generate screenshot images in `apps/web/public/screenshots/`. These should be actual
screenshots of the app (or mockups) at 1080×1920 resolution. At minimum, add placeholder images.

### Files to create/modify
- [ ] `apps/web/src/app/manifest.ts` — add shortcuts, screenshots, categories
- [ ] `apps/web/public/screenshots/` — add screenshot images

---

## 2.11 — Personalization Layer

### Goal
User identity (name/avatar) in the nav drawer, unread/pending badges on nav items, and "continue
where you left off" on open.

### Current state
**File:** `apps/web/src/components/layout/nav-drawer.tsx`
- Shows the HamaFX logo in the identity strip, not the user's name/email/avatar.
- No badges on nav items.
- No "continue where you left off" feature.

### Implementation steps

#### Step 1: Add user identity to the nav drawer

The nav drawer is a client component. The user session data needs to be passed from the server
layout.

In `apps/web/src/app/(app)/layout.tsx`, pass the session to `NavDrawer`:
```tsx
const session = await auth();
// ...
<NavDrawer userName={session?.user?.name} userEmail={session?.user?.email} />
```

In `nav-drawer.tsx`, update the identity strip:
```tsx
<div className="flex items-center gap-3 px-3 py-3 border-b border-divider">
  <div className="size-10 rounded-full bg-brand/10 text-brand flex items-center justify-center text-sm font-bold">
    {userName?.charAt(0).toUpperCase() ?? 'H'}
  </div>
  <div className="flex flex-col min-w-0">
    <span className="text-fg text-body-sm font-semibold truncate">{userName ?? 'HamaFX User'}</span>
    <span className="text-fg-subtle text-caption truncate">{userEmail}</span>
  </div>
</div>
```

#### Step 2: Add badges to nav items

Add an optional `badge?: number` field to `NavItem`. Render a badge pill if present:
```tsx
{badge !== undefined && badge > 0 && (
  <span className="ml-auto bg-brand/15 text-brand text-caption font-bold rounded-full px-1.5 py-0.5 tabular-nums">
    {badge > 99 ? '99+' : badge}
  </span>
)}
```

Fetch badge counts:
- Chat: number of unread threads (or 0 — needs backend support).
- Alerts: count of active alerts (already fetched in dashboard).
- Journal: count of open positions.

These can be fetched via a single API call or passed from the layout.

#### Step 3: Add "Continue where you left off"

On app open, redirect to the user's last visited page. Store the last visited path in
`localStorage` on every route change:
```typescript
// In a client component in the layout:
useEffect(() => {
  const lastPath = localStorage.getItem('hamafx:last-path');
  if (lastPath && lastPath !== pathname) {
    // Optionally redirect, or show a "Continue where you left off" card
  }
  localStorage.setItem('hamafx:last-path', pathname);
}, [pathname]);
```

Or show a card on the dashboard: "Continue where you left off → {last page name}".

### Files to create/modify
- [ ] `apps/web/src/app/(app)/layout.tsx` — pass session to NavDrawer
- [ ] `apps/web/src/components/layout/nav-drawer.tsx` — add identity strip + badges
- [ ] `apps/web/src/components/layout/nav-drawer-context.tsx` — extend if needed

---

## 2.12 — Shareable, Branded Snapshots

### Goal
Upgrade the share page to render markdown + an embedded mini-chart with annotations, an OG image,
and a branded frame — so shared analyses look premium in the wild.

### Current state
**File:** `apps/web/src/app/share/[id]/page.tsx`
- Server component. Renders `snap.body` as plain text in a `<p>` with `whitespace-pre-wrap`.
- Shows overlay price lines as small chips with inline border colors.
- No OG image, no markdown rendering, no mini-chart, no branding.

### Implementation steps

#### Step 1: Render markdown body

Replace the plain text `<p>` with a markdown renderer:
```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

<article className="prose prose-invert max-w-none text-sm leading-relaxed">
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    // Same component map as chat/parts/text.tsx
  }}>
    {snap.body}
  </ReactMarkdown>
</article>
```

**Note:** `react-markdown` and `remark-gfm` are already in `apps/web/package.json`.

#### Step 2: Add a branded frame

Wrap the content in a branded container:
```tsx
<div className="min-h-svh bg-bg text-fg flex flex-col">
  <header className="border-b border-divider px-6 py-4 flex items-center gap-3">
    <div className="size-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
      <Sparkles className="size-4" />
    </div>
    <div>
      <h1 className="text-fg text-base font-bold">HamaFX·Ai</h1>
      <p className="text-fg-subtle text-caption">AI Trading Analysis</p>
    </div>
  </header>
  <main className="mx-auto max-w-2xl w-full px-4 py-6 flex flex-col gap-4">
    <h2 className="text-fg text-lg font-semibold">{snap.title}</h2>
    {/* markdown content */}
    {/* chart annotations */}
  </main>
  <footer className="border-t border-divider px-6 py-4 text-center">
    <p className="text-fg-subtle text-caption">
      Generated by HamaFX·Ai · expires {expiry}
    </p>
  </footer>
</div>
```

#### Step 3: Add OG image generation

**New file:** `apps/web/src/app/share/[id]/opengraph-image.tsx`

Use Next.js's `opengraph-image` convention to generate a dynamic OG image:
```typescript
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'HamaFX-Ai Analysis';
export const size = { width: 1200, height: 630 };

export default async function OGImage({ params }) {
  const { id } = await params;
  // Fetch snapshot title
  // Return an ImageResponse with branded styling
  return new ImageResponse(
    (
      <div style={{ /* branded OG image styling */ }}>
        <h1>{title}</h1>
        <p>HamaFX·Ai Analysis</p>
      </div>
    ),
    { ...size }
  );
}
```

#### Step 4: Render chart annotations as a visual

Instead of just listing price line chips, render a mini visual:
- A simple horizontal price axis with markers at each price line.
- Or a small SVG showing the price lines relative to a recent price range.
- Each line colored with its `color` and labeled with its `title`.

### Files to create/modify
- [ ] `apps/web/src/app/share/[id]/page.tsx` — markdown rendering + branded frame
- [ ] `apps/web/src/app/share/[id]/opengraph-image.tsx` — new OG image

---

## Implementation order (recommended)

1. **2.9** TimeProvider (infrastructure — do first, everything benefits)
2. **2.2** Setup tagging (quick, improves data quality for analytics)
3. **2.1** Journal analytics suite (high value, builds on tagging)
4. **2.5** Decision-signal feedback UI (standalone, high trust signal)
5. **2.3** AI trade review (standalone, high value)
6. **2.6** Alert noise control UX (quick win)
7. **2.7** Onboarding upgrade (important for first impressions)
8. **2.11** Personalization layer (quick, improves nav feel)
9. **2.10** PWA depth (quick)
10. **2.12** Shareable snapshots (standalone, polish)
11. **2.4** Screenshot / import trades (medium effort)
12. **2.8** Light theme (do last — largest scope, most risk)

---

## Design checklist (apply to every component)

- [ ] Zero raw Tailwind palette colors — only semantic tokens
- [ ] `tabular-nums` on all numeric displays
- [ ] `border-divider` for all borders, `bg-bg-elev-1/2/3` for surfaces
- [ ] `text-fg` / `text-fg-muted` / `text-fg-subtle` for text hierarchy
- [ ] `text-bull` / `text-bear` / `text-warn` / `text-brand` for semantic colors
- [ ] `rounded-lg` for all cards (consistent radius)
- [ ] Motion only for state changes (entrance, exit, streaming) — no decorative animation
- [ ] `aria-label` / `role` on all non-text visual elements
- [ ] `min-h-[44px]` on all interactive elements (touch targets)
- [ ] `prefers-reduced-motion` respected (handled by `MotionRoot`)
- [ ] No `text-[9px]` — minimum `text-caption` (11px)
- [ ] Safe-area insets on mobile (`env(safe-area-inset-*)`)
- [ ] CSRF protection on all POST endpoints (`withCsrf` or `fetchCsrf`)
- [ ] `withAuth` on all API routes that need authentication
- [ ] Zod validation on all API inputs
- [ ] Error states: `role="alert"` + friendly message (never raw `error.message`)
- [ ] Loading states: `Skeleton` or `aria-busy="true"` with `aria-label`
- [ ] Empty states: `EmptyState` component with icon + title + description