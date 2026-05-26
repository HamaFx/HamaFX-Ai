# 05 — UI / UX

> Design philosophy: **dense but quiet**. Trading UIs fail when they feel busy. Information density is achieved through hierarchy, not noise.

## Design north stars

1. **Mobile-first, thumb-zone aware** — primary actions live in the bottom 35% of the screen.
2. **One subject per screen** — at most one "primary" thing visible at a time on mobile.
3. **The chat is always one tap away** — bottom-bar FAB on every screen.
4. **Calm dark theme by default**, light theme available, both AAA contrast.
5. **Numbers > words** — prices, deltas, and times are first-class typographic citizens.

## Information architecture

```
(app)
├── /chat                  ← default landing
│   └── /[threadId]
├── /chart/[symbol]
├── /news
├── /calendar
├── /alerts
├── /journal
└── /settings
```

The bottom navigation has 5 destinations on mobile:

```
[ Chat ]   [ Chart ]   [ ⚡ FAB ]   [ News ]   [ More ]
```

The center FAB opens a **command sheet** (mobile) or **command palette** (desktop) to:

- switch symbol
- jump to thread
- "Ask AI: …" quick capture
- set alert
- log journal entry

## Layout grids

### Mobile (< 640px) — primary

```
┌────────────────────────────┐
│ Top bar (44px)             │ ← symbol pill + theme + thread switch
├────────────────────────────┤
│                            │
│  Page content              │
│  (scrollable)              │
│                            │
│                            │
├────────────────────────────┤
│ Bottom nav (64px + safe)   │
└────────────────────────────┘
```

- Top bar shows: selected symbol pill (tap → switch), live mid price, ⚙ icon.
- Bottom nav: 5 items, the middle one is a FAB-style command launcher.

### Tablet (≥ 640px)

- 12-col fluid grid, max content width 1100px.
- Side rail appears for thread list when on `/chat`.

### Desktop (≥ 1024px)

```
┌────────────┬─────────────────────────────┬─────────────────┐
│ Side rail  │ Main canvas (chart/chat)    │ Context panel   │
│ (260px)    │ (flexible)                  │ (320px optional)│
└────────────┴─────────────────────────────┴─────────────────┘
```

- Side rail: nav + thread list.
- Main canvas: the active page.
- Context panel (toggleable): live ticker tape + news ticker + calendar countdown.

## Chat surface (mobile)

```
┌──────────────────────────────────────────────────┐
│  XAUUSD  · 2 384.12  +0.42%   · 1h freshness ✓   │  ← contextual ticker
├──────────────────────────────────────────────────┤
│ 09:41  AI                                        │
│  Bias on gold 4H is bullish — price reclaiming   │
│  the 2 380 OB after liquidity sweep below…       │
│  [📈 chart annotation]                            │
│  [📰 3 cited articles ›]                          │
│ ──────────────────────────────────────────────── │
│ 09:42  You                                       │
│  Set an alert if 1H closes < 2 378               │
│  [🔔 alert created ›]                             │
├──────────────────────────────────────────────────┤
│ [Bias?] [Top-down] [Today's news] [Calendar]     │  ← chip rail
├──────────────────────────────────────────────────┤
│ Type a message…                          🎤  ↑  │
└──────────────────────────────────────────────────┘
```

Tool calls render as **rich inline cards** (chart, news list, alert receipt, calendar table) — see `07-ai-agent.md` for the React part registry.

## Chart surface (mobile)

- Top: timeframe pill row (`1m 5m 15m 30m 1h 4h 1d 1w`).
- Body: candle chart, full height minus 200px.
- Below: collapsible drawer with indicator toggles, key levels, and an "Ask AI about this view" button that pre-fills a prompt with the current chart context (symbol, timeframe, visible range).

## Design tokens

Tailwind v4 + CSS variables. Lives in `packages/ui/src/theme.css`.

### Color (semantic, not raw)

```css
:root {
  /* surfaces */
  --bg: oklch(15% 0.02 260);
  --bg-elev-1: oklch(18% 0.02 260);
  --bg-elev-2: oklch(22% 0.02 260);
  --border: oklch(28% 0.02 260);

  /* text */
  --fg: oklch(96% 0.01 260);
  --fg-muted: oklch(72% 0.02 260);
  --fg-subtle: oklch(55% 0.02 260);

  /* brand */
  --brand: oklch(72% 0.16 78); /* warm gold */
  --brand-fg: oklch(15% 0.02 260);

  /* states */
  --bull: oklch(72% 0.18 150); /* greener-than-default */
  --bear: oklch(67% 0.22 25); /* warmer red */
  --neutral: oklch(70% 0.02 260);
  --warn: oklch(78% 0.16 80);
  --info: oklch(72% 0.14 230);

  /* sizes */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
}

[data-theme='light'] {
  --bg: oklch(99% 0.005 260);
  --bg-elev-1: oklch(96% 0.005 260);
  --bg-elev-2: oklch(94% 0.005 260);
  --border: oklch(88% 0.005 260);
  --fg: oklch(22% 0.02 260);
  --fg-muted: oklch(45% 0.02 260);
  --fg-subtle: oklch(60% 0.02 260);
  /* brand/state stay tuned the same */
}
```

### Typography

- **Inter** as primary (variable, with `cv01,ss01` features for tabular numerals).
- **JetBrains Mono** for numbers in price tiles, code, and journal entry P/L.
- Modular scale: 12 / 14 / 16 / 18 / 22 / 28 / 36.
- Numerical readouts always `font-feature-settings: "tnum","cv01"`.

### Motion

- Durations: `xfast 80ms`, `fast 140ms`, `base 220ms`, `slow 340ms`.
- Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)` (organic-out).
- Reduced-motion respected globally; chart annotations switch from animated draw to instant.

### Density

| Token        | Mobile | Desktop |
| ------------ | ------ | ------- |
| Page padding | 16px   | 24–32px |
| Card padding | 12px   | 16–20px |
| Tap target   | 44×44  | 36×36   |
| Stack gap    | 8 / 12 | 12 / 16 |

## Component inventory (shadcn baseline + custom)

### From shadcn/ui

`button`, `input`, `textarea`, `dialog`, `drawer`, `sheet`, `tooltip`, `dropdown-menu`, `command`, `tabs`, `toggle-group`, `select`, `popover`, `scroll-area`, `separator`, `skeleton`, `toast` (sonner), `accordion`, `card`, `badge`, `avatar`, `slider`, `switch`.

### Custom (live in `packages/ui` or `apps/web/src/components`)

- `PriceTile` — bid/ask/change + sparkline.
- `SymbolPill` — selectable pill with live price.
- `TimeframePicker` — segmented control.
- `IndicatorChip` — with editable params popover.
- `NewsCard` — title + sentiment + symbol tags + ago.
- `EventRow` — economic event row with impact badge.
- `MessageBubble` — chat bubble with parts slots.
- `ToolCallCard` — generic shell for any tool's inline render.
- `FreshnessBadge` — green/yellow/red age dot + "5s ago".
- `BiasBadge` — bullish / bearish / neutral pill.
- `RangeBar` — ATR / day range visualisation.

## Accessibility

- All interactive elements ≥ 44×44 tap target on mobile.
- Visible focus rings always (2px, brand colour).
- Chart canvas: live region `aria-live="polite"` summarising "EURUSD 1H now 1.0823, RSI 54" on focus.
- Chat input: ARIA labels for streaming status (`Sending…`, `Receiving…`, `Done`).
- All charts have a "table view" alt-data drawer that exposes the same data tabular for screen readers.
- Color is never the only signal: bull/bear use up/down arrows + sign in addition to color.

## States and empty states

Every page must define:

1. **Loading** — `Skeleton` matching final layout (no spinners as primary loader).
2. **Empty** — illustrative copy + clear CTA ("No alerts yet — ask the agent to set one").
3. **Error** — error type + retry + "talk to agent about this" link.
4. **Stale** — banner if data > threshold, plus a refresh affordance.

## Iconography

`lucide-react`. Conventions:

- Bull / Bear: `ArrowUpRight` / `ArrowDownRight`.
- AI / Agent: `Sparkles`.
- Tool call: `Wrench`.
- Citation: `Link2`.
- Alert: `BellRing`.
- Journal: `BookOpen`.

## Sample wireframe sketches (text)

### `/chat` mobile

```
┌──────────────────────────────────┐
│ ⌄ XAUUSD  2 384.12 +0.42% • 5s   │
├──────────────────────────────────┤
│                                  │
│  Hi 👋 — what would you like to  │
│  look at? Tap a chip or ask…     │
│                                  │
│  [ Top-down on gold ]            │
│  [ Bias on EURUSD ]              │
│  [ Today's USD news ]            │
│  [ This week's calendar ]        │
│                                  │
├──────────────────────────────────┤
│ Type a message…           🎤  ↑  │
├──────────────────────────────────┤
│ 💬   📈   ⚡   📰   ⋯            │
└──────────────────────────────────┘
```

### `/chart/XAUUSD` mobile

```
┌──────────────────────────────────┐
│ ⌄ XAUUSD  2 384.12 +0.42% • 5s   │
├──────────────────────────────────┤
│ [ 1m 5m 15m 30m  1h  4h 1d 1w ]  │
├──────────────────────────────────┤
│                                  │
│   ── candles ──                  │
│                                  │
│                                  │
├──────────────────────────────────┤
│ [ EMA50 EMA200 RSI MACD + ]      │
│ Key levels: 2 378 / 2 392 / …    │
│ [ ✨ Ask AI about this view ]    │
├──────────────────────────────────┤
│ 💬   📈   ⚡   📰   ⋯            │
└──────────────────────────────────┘
```
