# Phase 2 — Chart & Trading Component Fixes

**Priority:** P1 — Fix after security issues are resolved
**Estimated files touched:** 15
**Findings covered:** 32 (8 bugs + 11 improvements + 9 polish + 4 upgrades)

---

## Overview

The chart system is the core trading feature of HamaFX-Ai. This phase fixes critical bugs causing memory leaks, performance degradation, and incorrect data display. It also addresses massive code duplication across sub-panes and prepares the architecture for future enhancements.

---

## Task 2.1 — Fix Time-Sync Subscription Leak in Sub-panes (🔴 P1)

**Files:** `chart-rsi.tsx` (~line 95), `chart-macd.tsx` (~line 110), `chart-atr.tsx` (~line 85)

### Problem

Time-sync subscription on the main chart's `timeScale()` is never unsubscribed in cleanup. When sub-panes unmount, zombie callbacks keep firing on disposed charts.

### Fix

Store the callback and unsubscribe in cleanup:
```ts
const syncRange = (range: Range | null) => {
  if (!range) return;
  (chart.timeScale() as { setVisibleLogicalRange(r: unknown): void }).setVisibleLogicalRange(range);
};
mainTs.subscribeVisibleLogicalRangeChange(syncRange);

return () => {
  mainTs.unsubscribeVisibleLogicalRangeChange(syncRange);
  instanceRef.current?.dispose();
  instanceRef.current = null;
  ro.disconnect();
};
```

### Verification

1. Open chart with RSI, toggle off — no memory leaks in DevTools
2. Toggle on/off repeatedly — no console errors
3. Repeat for MACD and ATR

---

## Task 2.2 — Fix Chart Recreation on Every Candle Update (🔴 P1)

**Files:** All three sub-panes

### Problem

`mainChart` and `candles` in the `useEffect` dependency array causes the entire sub-pane chart to be torn down and rebuilt every 5-30 seconds.

### Fix

Separate chart creation (mount-once) from data updates. Use refs to hold latest data:
```ts
// Effect 1: Create chart ONCE
useEffect(() => { /* create chart */ }, [mainChart]);

// Effect 2: Update data only
useEffect(() => {
  instanceRef.current?.series.setData(/* mapped data */);
}, [result, candles]);
```

### Verification

1. Open chart with RSI, wait 60s — no flash or rebuild
2. Check React DevTools profiler — no chart creation on data updates

---

## Task 2.3 — Fix `applyDecimals` Never Called (🔴 P1)

**File:** `chart-canvas.tsx` (~line 195), `chart-view.tsx`

### Problem

Candle precision hardcoded to 2 decimals. EURUSD needs 5, GBPUSD needs 5.

### Fix

Import `priceDecimals` from `@hamafx/shared` and call `applyDecimals`:
```ts
import { priceDecimals } from '@hamafx/shared';

const handleChartReady = useCallback((instance: MainChartInstance | null) => {
  if (!instance) return;
  instance.applyDecimals(priceDecimals(symbol));
}, [symbol]);
```

Also set initial precision in `createMainChart`.

### Verification

1. EURUSD chart — 5 decimals
2. XAUUSD chart — 2 decimals
3. Switch symbols — decimals update

---

## Task 2.4 — Fix `useChartTheme` Stale Ref (🔴 P1)

**File:** `chart-canvas.tsx` (~line 60), `use-chart-theme.ts`

### Problem

`containerRef.current` is `null` on first render. React doesn't re-render when a ref changes.

### Fix

Use state variable instead of ref:
```ts
const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
<div ref={setContainerEl} />
const theme = useChartTheme(containerEl, settings);
```

Apply to all sub-panes too.

### Verification

1. Chart font matches `--font-sans` (Inter)
2. Theme changes update correctly

---

## Task 2.5 — Fix Live Candle Stitching Race Condition (🔴 P1)

**File:** `chart-view.tsx` (~line 155-180)

### Fix

Add validation guards:
```ts
// Guard 1: Verify tick is for correct symbol
if (tick.symbol && tick.symbol !== symbol) return candles;
// Guard 2: Reject stale ticks
if (barTime < lastCandle.t) return candles;
// Guard 3: Reject far-future ticks (clock skew)
if (barTime > lastCandle.t + tfMs * 2) return candles;
```

### Verification

1. Live candle updates correctly during market hours
2. Stale ticks rejected
3. Rapid symbol switching — no cross-contamination

---

## Task 2.6 — Fix `setCandles` Silent Stale Data (🔴 P1)

**File:** `chart-canvas.tsx` (~line 85)

### Fix

Clear chart when candles is empty:
```ts
if (!candles || candles.length === 0) {
  instance.setCandles([]);
  return;
}
```

### Verification

1. Switch to symbol with no data — chart clears
2. Switch back — data reappears

---

## Task 2.7 — Fix Performance Chart Recreation on `totalR` Sign Change (🔴 P1)

**File:** `performance-chart.tsx` (~line 105)

### Fix

Remove `totalR` from deps, use `applyOptions` in separate effect:
```ts
useEffect(() => {
  series.applyOptions({ lineColor: totalR >= 0 ? '#eab308' : '#f0594a' });
}, [totalR]);
```

### Verification

1. Equity curve crosses breakeven — no flicker

---

## Task 2.8 — Remove Redundant `autoSize` + ResizeObserver (🟡 P2)

**Files:** All chart components

### Fix

Remove manual ResizeObserver, rely on `autoSize: true` only.

### Verification

1. Resize browser — chart resizes smoothly
2. No double-resize events

---

## Task 2.9 — Fix Theme Effect Unnecessary `candles` Dependency (🟡 P2)

**File:** `chart-canvas.tsx` (~line 100)

### Fix

Remove `candles` from dependency array: `}, [theme]);`

---

## Task 2.10 — Fix `setMarkers` API for lightweight-charts v5 (🟡 P2)

**File:** `chart-canvas.tsx` (~line 215)

### Fix

Try v5 API first (chart-level), fall back to v4 (series-level):
```ts
if (typeof chartAny.setMarkers === 'function') {
  chartAny.setMarkers(candleSeries, markers); // v5
} else if (typeof seriesAny.setMarkers === 'function') {
  seriesAny.setMarkers(markers); // v4
}
```

### Verification

1. Structure overlays (swing points, BOS/CHoCH) render correctly

---

## Task 2.11 — Fix localStorage Race Condition (🟡 P2)

**File:** `chart-view.tsx` (~line 75-100)

### Fix

Use single `useEffect` for localStorage writes:
```ts
useEffect(() => {
  if (!hydrated) return;
  localStorage.setItem('hfx_chart_config', JSON.stringify({ indicators, settings }));
}, [indicators, settings, hydrated]);
```

Add cross-tab sync via `storage` event listener.

### Verification

1. Toggle multiple indicators quickly — all persist
2. Two tabs — settings sync across tabs

---

## Task 2.12 — Fix `overlaySet` Rebuilt on Every Tick (🟡 P2)

**File:** `chart-view.tsx` (~line 195)

### Fix

Use raw `candles` instead of `candlesWithLive`:
```ts
const overlaySet = useMemo(() => {
  if (!structure || !candles) return null;
  return buildOverlays(structure, candles.map(c => c.t), PALETTE, toggleRecord);
}, [structure, candles, toggleRecord]);
```

### Verification

1. `buildOverlays` does NOT run on every 1.5s tick

---

## Task 2.13 — Fix `hydrated` Gate Causing Settings Drawer Flash (🟡 P2)

**File:** `chart-view.tsx` (~line 70, 230)

### Fix

Remove `{hydrated && ...}` gate. Render drawer immediately with default settings.

### Verification

1. Hard refresh — settings drawer button visible immediately

---

## Task 2.14 — Extract `useSubPaneChart` Hook (🟡 P2)

**Files:** All three sub-pane components

### Fix

Create shared hook that handles: dynamic import, chart creation, time-sync, theme, ResizeObserver. Each sub-pane becomes ~20 lines.

### Verification

1. All sub-panes render identically
2. Code reduced from ~600 to ~100 lines

---

## Task 2.15 — Consolidate Theme Presets (🔵 Polish)

**Files:** `chart-themes.ts`, `use-chart-theme.ts`, `chart-canvas.tsx`

### Fix

Keep `chart-themes.ts` as single source of truth. Import in other files.

### Verification

1. Change theme color in one place — updates everywhere

---

## Task 2.16 — Fix Typo "Volatity" → "Volatility" (🔵 Polish)

**File:** `chart-settings-drawer.tsx` (~line 190)

---

## Task 2.17 — Fix Duplicate Overlay Constants (🔵 Polish)

**Files:** `overlay-toggle.tsx`, `overlay-sheet.tsx`

### Fix

Create shared `overlay-constants.ts` file.

---

## Task 2.18 — Remove Dead Code (🔵 Polish)

- `performance-chart.tsx`: Remove `seriesRef` if unused, or use it for Task 2.7
- `use-indicators.ts`: Verify if imported anywhere, delete if dead
- `chart-canvas.tsx`: Remove `_symbol` prefix if only used for aria-label

---

## Task 2.19 — Add Error Boundary Around Chart (🟢 Upgrade)

**File:** `chart-view.tsx`

### Fix

Create `ChartErrorBoundary` class component. Wrap chart components.

### Verification

1. Chart crash — shows error state, not white screen

---

## Task 2.20 — Add Crosshair Sync (🟢 Upgrade)

### Fix

In `useSubPaneChart`, add `subscribeCrosshairMove` to sync crosshairs between main chart and sub-panes.

### Verification

1. Hover main chart — sub-panes show crosshair at same time

---

## Task 2.21 — Create Shared `useLightweightCharts` Hook (🟢 Upgrade)

### Fix

Centralize dynamic import with module-level cache.

---

## Task 2.22 — Fix `timeframeToMs` Duplication (🔵 Polish)

### Fix

Import from `@hamafx/shared` if available, or create there.

---

## Task 2.23 — Fix TradingView Widget `setTimeout` Cleanup (🟡 P2)

**File:** `tradingview-widget.tsx` (~line 85-100)

### Fix

Use `onLoad` on Script component instead of polling.

---

## Completion Checklist

- [x] Task 2.1 — Time-sync subscription leak fixed
- [x] Task 2.2 — Chart no longer recreated on candle update
- [x] Task 2.3 — `applyDecimals` called with correct precision
- [x] Task 2.4 — `useChartTheme` uses state not ref
- [x] Task 2.5 — Live candle stitching validates symbol/timestamps
- [x] Task 2.6 — Empty candles clears chart
- [x] Task 2.7 — Performance chart uses `applyOptions` for color
- [x] Task 2.8 — Redundant ResizeObserver removed
- [x] Task 2.9 — Theme effect no longer depends on `candles`
- [x] Task 2.10 — `setMarkers` uses v5 API with v4 fallback
- [x] Task 2.11 — localStorage writes consolidated
- [x] Task 2.12 — `overlaySet` uses raw `candles`
- [x] Task 2.13 — Settings drawer renders immediately
- [x] Task 2.14 — `useSubPaneChart` hook extracted
- [x] Task 2.15 — Theme presets consolidated
- [x] Task 2.16 — "Volatity" typo fixed
- [x] Task 2.17 — Overlay constants shared
- [x] Task 2.18 — Dead code removed
- [x] Task 2.19 — Error boundary added
- [x] Task 2.20 — Crosshair sync implemented
- [x] Task 2.21 — `useLightweightCharts` hook created
- [x] Task 2.22 — `timeframeToMs` imported from shared
- [x] Task 2.23 — TradingView widget uses `onLoad`

## Post-Phase Verification

1. `pnpm typecheck` — zero errors
2. `pnpm lint` — zero errors
3. EURUSD chart — 5 decimal precision, live updates, sub-panes work
4. XAUUSD chart — 2 decimal precision
5. Toggle RSI/MACD/ATR — no memory leaks, no console errors
6. React DevTools profiler — no chart recreation on data updates
7. Resize browser — charts resize smoothly
8. Test on mobile — no jank
