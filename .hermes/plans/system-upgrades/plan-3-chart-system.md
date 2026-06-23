# Plan 3 — Chart System: Lite vs Pro Consolidation

**Priority:** P1 — Architecture decision + upgrade
**Estimated files touched:** 20
**Goal:** Evaluate removing the lite chart, determine if pro (TradingView) can replace it, and implement the best path forward.

---

## Current Architecture

### Lite Chart (lightweight-charts)
- **Route:** `/chart/[symbol]` — the default chart page
- **Components:** `chart.tsx`, `chart-canvas.tsx` (16KB), `chart-rsi.tsx`, `chart-macd.tsx`, `chart-atr.tsx`
- **Features:** SMC overlays (swings, BOS/CHoCH, FVG, order blocks, liquidity), RSI/MACD/ATR sub-panes, EMA/SMA/Bollinger/Pivot indicators, 4 theme options, live price stitching from BiQuote, PriceTag, PinToChat, SymbolPicker, TimeframePicker
- **Data:** `useChartData` hook fetches candles + indicators, `usePrice` for live ticks, `useStructure` for SMC events
- **Known issues:** Memory leaks (subscription leak), chart recreation on every candle update, wrong forex precision, stale theme ref

### Pro Chart (TradingView widget)
- **Route:** `/chart/[symbol]/pro` — secondary, must navigate explicitly
- **Component:** `tradingview-widget.tsx` (5KB) — embeds TradingView via script tag
- **Features:** TradingView drawing tools, native indicator ecosystem, better performance
- **Limitations:** Only 3 symbols mapped, no SMC overlays, no sub-panes, hardcoded dark theme, no PinToChat, no PriceTag integration

### Shared Components
- `symbol-picker.tsx`, `timeframe-picker.tsx`, `chart-settings-drawer.tsx`, `overlay-toggle.tsx`
- `performance-chart.tsx` — used by journal page, imports from `chart.tsx`

---

## Feature Comparison

| Feature | Lite Chart | Pro Chart (TradingView) |
|---------|-----------|------------------------|
| SMC overlays (swings, BOS/CHoCH, FVG, OB, liquidity) | ✅ | ❌ |
| RSI/MACD/ATR sub-panes | ✅ | ✅ (native) |
| EMA/SMA/Bollinger indicators | ✅ | ✅ (native, more options) |
| Drawing tools | ❌ | ✅ |
| Theme options | ✅ (4 themes) | ❌ (hardcoded dark) |
| Live price stitching (BiQuote) | ✅ | ❌ (uses OANDA data) |
| PriceTag integration | ✅ | ❌ |
| PinToChat | ✅ | ❌ |
| SymbolPicker (dynamic) | ✅ (but hardcoded) | ❌ (hardcoded 3) |
| Error/empty/skeleton states | ✅ | ❌ |
| Performance | ⚠️ (memory leaks) | ✅ |
| TradingView ecosystem | ❌ | ✅ |
| Symbol support | 3 (hardcoded) | 3 (hardcoded) |

---

## 🔴 Bugs in Pro Chart (5)

### Bug 1: `setTimeout` polling loop not properly cleaned up
**File:** `tradingview-widget.tsx` ~line 85-100
The timeout ID is never stored, so `clearTimeout` can't cancel the pending timeout in cleanup.

**Fix:** Store timeout ID and clear it in cleanup.

### Bug 2: Only 3 symbols mapped — crashes for unmapped symbols
**File:** `tradingview-widget.tsx`
Any symbol outside XAUUSD/EURUSD/GBPUSD shows a blank chart or crashes.

**Fix:** Add dynamic symbol mapping via the symbol catalog (Plan 1 Upgrade 1).

### Bug 3: Container ID collision risk
**File:** `tradingview-widget.tsx`
`containerId = tv-${symbol}-${tf}` can collide if two pro charts render simultaneously.

**Fix:** Use `useId()` or a random suffix.

### Bug 4: No widget cleanup beyond `innerHTML = ''`
**File:** `tradingview-widget.tsx`
Effect cleanup only sets `container.innerHTML = ''`. TradingView may have registered global listeners.

**Fix:** Store widget reference and call any available cleanup API.

### Bug 5: Theme hardcoded to `'dark'`
**File:** `tradingview-widget.tsx`
No way to switch to light theme.

**Fix:** Make theme configurable from chart settings.

---

## 🟡 Improvements (7)

### Imp 1: Use `onLoad` instead of polling for TV script
Replace `setTimeout` polling with `<Script onLoad={() => setTvReady(true)} />`.

### Imp 2: Add error boundary around pro chart
If TradingView fails to load, show a fallback error state.

### Imp 3: Add loading skeleton for pro chart
Show a skeleton placeholder while the TradingView script loads.

### Imp 4: Pass chart settings to TradingView
Pass user's chart settings (indicators, timeframe) to the widget config.

### Imp 5: Add deep-link support for overlays
Chat AI deep-links to `/chart/{symbol}?overlays=bos_choch,fvg`. Show a banner linking to structure chart.

### Imp 6: Add PinToChat support for pro chart
Capture the TradingView container as an image for pin-to-chat.

### Imp 7: Add PriceTag integration for pro chart
Show the live BiQuote price tag above the TradingView widget.

---

## 🔵 Polish (4)

1. **Add fullscreen toggle** for pro chart
2. **Add chart type selector** (candlestick, line, bar, Heikin Ashi)
3. **Smooth transition** between lite and pro using view transition API
4. **Add "Open in TradingView" external link** for advanced analysis

---

## 🟢 Upgrades (6)

### Upgrade 1: Implement hybrid approach (RECOMMENDED)
Make pro the default chart at `/chart/[symbol]`, move lite to `/chart/[symbol]/structure` for SMC analysis. Chat AI deep-links to `/structure` route. Add a toggle/tab in the chart header.

### Upgrade 2: Add custom indicator overlay on TradingView
Use TradingView's custom studies API to render SMC overlays directly on the TradingView chart.

### Upgrade 3: Add multi-timeframe layout
Show multiple timeframes side by side (4H | 1H | 15M) for top-down analysis.

### Upgrade 4: Add chart templates
Let users save chart configurations as templates ("ICT setup", "Scalping setup", etc.).

### Upgrade 5: Add chart sharing with snapshot
Enhance PinToChat to generate a shareable snapshot URL.

### Upgrade 6: Add replay/bar replay mode
Let users scroll back through historical candles bar-by-bar for backtesting.

---

## Risk Assessment: Removing Lite Chart

### What breaks if lite chart is deleted:

1. **🔴 Journal breaks** — `PerformanceChart` imports `getThemeColors` from `chart.tsx`.
   - **Mitigation:** Extract `getThemeColors` into a shared utility before deletion.

2. **🔴 Chat AI loses SMC overlays** — Chat tool renderers deep-link to `/chart/{symbol}?overlays=...`. TradingView ignores the param.
   - **Mitigation:** Keep lite chart at `/chart/[symbol]/structure` or implement custom TV studies.

3. **🔴 Pro chart only supports 3 symbols** — Any other symbol crashes.
   - **Mitigation:** Add dynamic symbol mapping via the symbol catalog (Plan 1).

4. **🟡 PerformanceChart depends on lightweight-charts** — The equity curve uses the library.
   - **Mitigation:** Keep `performance-chart.tsx` and `lightweight-charts` dependency.

5. **🟡 Chart settings drawer becomes orphaned** — Only applies to lite chart.
   - **Mitigation:** Remove or adapt for TradingView config.

### What can be safely removed:
- `chart-canvas.tsx` (if PerformanceChart's theme extraction is preserved)
- `chart-rsi.tsx`, `chart-macd.tsx`, `chart-atr.tsx` (TradingView has native sub-panes)
- `chart-settings-drawer.tsx` (TradingView has its own settings)
- `overlay-toggle.tsx`, `overlay-sheet.tsx` (if SMC overlays are moved to TV custom studies)

### What must be kept:
- `performance-chart.tsx` — used by journal
- `lightweight-charts` dependency — used by PerformanceChart
- `overlays.ts`, `use-structure.ts` — SMC logic, needed if keeping structure route
- `symbol-picker.tsx`, `timeframe-picker.tsx` — shared UI
- `pin-to-chat.tsx`, `price-tag.tsx` — reusable with pro chart

---

## Recommended Implementation: Hybrid Approach (Option C)

### Phase A: Move routes
1. Move pro chart from `/chart/[symbol]/pro` to `/chart/[symbol]` (becomes default)
2. Move lite chart from `/chart/[symbol]` to `/chart/[symbol]/structure`
3. Update all internal links and redirects
4. Add a tab/toggle in chart header: "TradingView" | "Structure"

### Phase B: Integrate shared components with pro
1. Add SymbolPicker and TimeframePicker to pro chart header
2. Add PriceTag above TradingView widget
3. Add PinToChat button
4. Add error/empty/skeleton states

### Phase C: Fix pro chart bugs
1. Fix setTimeout cleanup (Bug 1)
2. Add dynamic symbol mapping (Bug 2, depends on Plan 1)
3. Fix container ID collision (Bug 3)
4. Add proper widget cleanup (Bug 4)
5. Make theme configurable (Bug 5)

### Phase D: Preserve lite chart for SMC
1. Keep lite chart at `/structure` route
2. Keep overlays, sub-panes, indicators
3. Chat AI deep-links to `/structure` route
4. Add "View in TradingView" link from structure chart

### Phase E: Future — Custom TV studies
1. Research TradingView custom studies API
2. Implement SMC overlays as custom studies
3. If successful, deprecate lite chart entirely

---

## Completion Checklist

- [ ] Bug 1 — setTimeout cleanup in tradingview-widget
- [ ] Bug 2 — Dynamic symbol mapping
- [ ] Bug 3 — Container ID collision fix
- [ ] Bug 4 — Widget cleanup
- [ ] Bug 5 — Theme configurable
- [ ] Imp 1 — onLoad instead of polling
- [ ] Imp 2 — Error boundary around pro chart
- [ ] Imp 3 — Loading skeleton
- [ ] Imp 4 — Pass settings to TradingView
- [ ] Imp 5 — Overlay deep-link handling
- [ ] Imp 6 — PinToChat for pro chart
- [ ] Imp 7 — PriceTag for pro chart
- [ ] Upgrade 1 — Hybrid route structure implemented
- [ ] Polish 1-4 — Fullscreen, chart type, transitions, external link
- [ ] Verify journal PerformanceChart still works
- [ ] Verify chat AI deep-links work
- [ ] Verify all symbols work in pro chart
