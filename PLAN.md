# HamaFX-Ai Frontend Redesign — PLAN

> **For Hermes:** This plan covers what to build and why. Each numbered Phase
> becomes a separate bite-sized implementation plan (TDD-style) when the user
> approves. Do not start implementation until the user signs off on PLAN.md.

## Goal

Refine the existing premium-black, champagne-gold design system into something
**cleaner, sharper, and more typographically distinctive** — without abandoning
brand identity. Apply one uniform density strategy across all 20 pages. Fix
four specific anti-patterns in current code (gradient user bubble, glass
overload, monolithic chart, ArticleCard decoration density).

## Strategic decisions (confirmed with user)

| Question | Decision |
|---|---|
| Visual direction | **Stay in premium-black family** — refine, don't replace. Keep oklch neutral canvas + champagne gold. Less glass, sharper edges, tighter type, more typographic personality. |
| Information density | **Uniform density everywhere** — single strategy applied to chat, chart, news, calendar, settings, auth. No per-surface special-casing. |
| Rollout scope | **Whole-app in one pass** — all 20 pages redesigned together over multiple sub-phases. No "partially redesigned" mid-state. |
| Anti-patterns to fix | **All four, equal priority** — gradient user bubble, glassmorphism overload, 939-LOC monolithic chart, ArticleCard 5-zone stacking. |

## Tech stack (fixed — no changes here)

Next.js 15 App Router · React 19 · TypeScript strict · Tailwind v4 ·
shadcn/ui primitives on Radix · `motion/react` (LazyMotion) · TradingView
lightweight-charts v5 · `sonner` toaster · `vaul` drawer · `lucide-react`
icons (already exclusively used) · `cmdk` if needed for command palette.

No new dependencies unless absolutely necessary. No rebrand. No stack swap.

## North star — what "well-crafted" means for this codebase

Five principles that every phase implements:

1. **Typography carries hierarchy** — not color, not glass, not shadows. A page
   with NO color treatment beyond black/white/gold should still be readable
   and feel intentional.
2. **One density, applied everywhere** — every list row, every card, every
   chat bubble uses the same spacing/typography primitives. No "this page is
   just different."
3. **No decoration without information** — sentiment ribbons, glyph arrows,
   ring-1 chips, animated reveals are kept only where they encode data
   (sentiment, direction, status). Decorative ones go.
4. **Real-time data must not shift layout** — price changes, tick updates,
   streaming text must never change the size of the surrounding container.
   Tabular nums + reserved widths.
5. **Mobile is the truth, desktop is the same thing with more room** —
   desktop layouts add a right rail or a side panel; they do NOT add
   columns-of-everything or stretch the mobile UI to fill the screen.

---

## 1. Information architecture / navigation

### Current state

- Single `<NavDrawer>` context-driven — one source of truth for menu state
- `<TopBar>` (sticky glass) on all pages except `/chat` where `<ChatTopBar>` takes over
- `/more` route was deleted in Phase 6 — drawer IS the hub
- Desktop sidebar (hidden `<md:block>`) + mobile bottom nav (`md:hidden`)
- 5 primary surfaces: Chat, Chart, News, Calendar, Journal + secondary: Alerts, Settings

### Target state

Keep the existing single-drawer architecture (it works). Refinements:

- **Nav drawer sections** (typed, semantic):
  1. *Trading* — Chart, Alerts, Journal
  2. *Intelligence* — Chat, News, Calendar
  3. *Account* — Settings hub, API keys, Usage
  4. *Session* — Sign out, Build id

  Currently the drawer is a flat list. Grouping makes scanning faster on
  mobile (where drawer is the whole nav) and adds visual structure on
  desktop (where it lives in the sidebar permanently).

- **Active state**: replace the current row-of-icons pattern with a single
  brand-colored 2px left-rail indicator + bold text. Icon stays but is
  subtle (fg-muted when inactive, fg when active). This matches the
  Bloomberg pattern of "the active item is unmistakable."

- **Desktop sidebar (≥md)**: fixed width 240px, no collapse by default.
  Remove the bottom-nav duplicate that mobile gets. The mobile drawer
  becomes the desktop sidebar's slide-out panel (same `<NavDrawerProvider>`
  instance, layout-aware rendering).

- **Top bar**: drop the 56px height to 52px. Right side carries just:
  live connection-state pill, current user avatar (links to profile), menu
  trigger. On `/chat`, swap for `<ChatTopBar>` as today. No other top-bar
  variants.

- **No floating action buttons**. The current FAB pattern (alerts, journal)
  was a Phase 5 holdover. Replace with header-right "New" buttons that match
  the nav treatment. FABs on iOS feel like 2018.

- **Breadcrumbs**: add only on settings sub-pages (`Settings › API Keys`).
  Not on top-level pages — the page title is enough.

---

## 2. Design system

### 2.1 Color palette — refined

The current tokens are largely good. Changes:

| Token | Current | Proposed | Why |
|---|---|---|---|
| `--color-bg` | `oklch(8% 0 0)` | unchanged | True black canvas is the brand |
| `--color-bg-elev-1` | `oklch(12% 0 0)` | unchanged | |
| `--color-bg-elev-2` | `oklch(16% 0 0)` | unchanged | |
| `--color-bg-elev-3` | `oklch(20% 0 0)` | unchanged | |
| `--color-border` | `oklch(22% 0 0)` | unchanged | |
| `--color-divider` | `oklch(28% 0 0 / 0.4)` | `oklch(28% 0 0 / 0.5)` | Slightly more visible — fewer cards rely on glass blur |
| `--color-overlay` | `oklch(0% 0 0 / 0.75)` | unchanged | |
| `--color-fg` | `oklch(96% 0 0)` | unchanged | |
| `--color-fg-muted` | `oklch(76% 0 0)` | unchanged | |
| `--color-fg-subtle` | `oklch(60% 0 0)` | **`oklch(68% 0 0)`** | Lifts to clear WCAG AA 4.5:1 on bg-elev-1 — was borderline for body text |
| `--color-brand` | `oklch(82% 0.14 85)` | unchanged | Champagne gold is the brand |
| `--color-brand-fg` | `oklch(8% 0 0)` | unchanged | |
| `--color-accent` | `oklch(70% 0.14 285)` | **REMOVE from general use** | Reserved for one specific context (verification warnings). Not a "second brand." |
| `--color-bull/bear/neutral/warn/info` | unchanged | unchanged | Semantic, kept far apart |

**Anti-pattern fix 1: remove `--gradient-brand` and `--gradient-accent`
from chat bubble use**. The brand gradient stays as a CSS variable but is
ONLY used for: login marquee (single approved use), the brand button
hover-press, and the active-nav 2px left rail (linear-gradient
edge-fade, not a fill gradient).

User message bubble becomes: solid `--color-brand` fill, no gradient, no
glow shadow. One inset highlight (`inset 0 1px 0 oklch(100% 0 0 / 0.18)`)
for the "raised pill" feel. Same with brand buttons — solid fill, not
gradient.

### 2.2 Typography scale — new

Current setup uses Tailwind defaults + a clamp-based fluid scale for
`--text-sm/base/lg`. That doesn't give enough expressive range.

**Font stack** (final):
- Display + body sans: **Inter Variable** (Google Fonts, already common)
  with `font-feature-settings: 'cv11', 'ss01', 'ss03'` (Inter's stylistic
  alternates for cleaner `g`, `l`, and open digits) + `font-variation-settings: 'opsz' 32`
  on display sizes for optical-size adjustment.
- Numeric / monospace: **JetBrains Mono Variable** (already in deps for
  developer context — keep it) for tickers, prices, timestamps, anything
  where alignment matters. `font-feature-settings: 'tnum', 'cv01'`.

**Scale** (Tailwind `@theme`):

| Token | Size | Line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `text-display-2xl` | clamp(2.25rem, 1.5rem + 3.5vw, 3.5rem) | 1.05 | 700 | -0.035em | Settings page hero numbers only |
| `text-display-xl` | clamp(1.75rem, 1.2rem + 2.5vw, 2.5rem) | 1.1 | 700 | -0.03em | Page titles (h1) |
| `text-display-lg` | clamp(1.375rem, 1rem + 1.5vw, 1.75rem) | 1.15 | 600 | -0.025em | Section titles (h2) |
| `text-display-md` | clamp(1.125rem, 1rem + 0.5vw, 1.25rem) | 1.25 | 600 | -0.02em | Card titles (h3) |
| `text-body-lg` | 1.0625rem | 1.55 | 450 | -0.005em | Reading text (news body, chat) |
| `text-body` | 0.9375rem | 1.55 | 450 | -0.003em | Default body — tighter than 1rem |
| `text-body-sm` | 0.8125rem | 1.5 | 450 | 0 | Meta, helper, dense lists |
| `text-caption` | 0.6875rem | 1.4 | 500 | 0.04em uppercase | Eyebrow labels, section dividers |
| `text-numeric-xl` | 1.5rem | 1 | 600 | -0.02em | Price tiles, big stats |
| `text-numeric-lg` | 1.125rem | 1.1 | 500 | -0.01em | Table cells, journal rows |
| `text-numeric` | 0.875rem | 1.2 | 500 | 0 | Inline numbers in dense UI |

`text-body-sm` becomes the workhorse for meta/timestamps/labels — currently
the codebase uses ad-hoc `text-xs`, `text-[11px]`, `text-[10px]` (8 different
sizes under 12px in the audit). Collapse those.

**Rationale**: tighter tracking on display sizes creates the "well-crafted"
feel. Optical sizing means Inter renders correctly at large sizes.
`font-weight: 450` on body (vs default 400) gives the page weight without
making it bold. The numeric scale is separate from the prose scale so prices
and headings can both feel intentional.

### 2.3 Spacing scale — uniform

Current: `--space-1` through `--space-10` (4, 8, 12, 16, 24, 32, 48, 64, 80, 96px).

Target: keep the same tokens but enforce them as the ONLY spacing scale.
Audit grep target: no `p-3.5`, `gap-2.5`, `mt-2.5` — every spacing value
must be one of `--space-1` through `--space-5`. Coarser than `--space-5`
is reserved for page-level vertical rhythm only.

Component internal padding: standardized per surface type:

| Surface | Mobile padding | Desktop padding |
|---|---|---|
| Page (`<main>`) | `px-4 py-4` | `px-6 py-6` |
| Card | `p-4` | `p-5` |
| List row | `py-3 px-4` | `py-3 px-5` |
| Modal/drawer | `p-5` | `p-6` |
| Form field | `py-2.5 px-3` | `py-3 px-3.5` |
| Chat bubble | `px-3.5 py-2.5` | `px-4 py-3` |

Same on every page. No "this card is bigger because the content is bigger."

### 2.4 Radii — sharper

Current: `--radius-sm: 4px`, `--radius-md: 8px`, `--radius-lg: 12px`,
`--radius-xl: 16px`, `--radius-2xl: 20px`.

The 12/16/20px radii are responsible for the "rounded-everything" softness.
Reduce the ladder:

| Token | Current | Proposed |
|---|---|---|
| `--radius-sm` | 4px | **2px** (was already used; make canonical) |
| `--radius-md` | 8px | **6px** |
| `--radius-lg` | 12px | **10px** (cards) |
| `--radius-xl` | 16px | **14px** (modals/drawers — max anything) |
| `--radius-2xl` | 20px | **REMOVE** |
| `--radius-pill` | (new) | **999px** (chips, tags, status pills) |

`--radius-2xl` removal cascades. Search-replace `rounded-3xl` →
`rounded-xl` across the codebase. Anything bigger than 14px on a
production surface is decoration, not design.

### 2.5 Elevation — borders + tonal, not glass

The current glass utilities are the second anti-pattern. Replacement:

```
.card-solid          bg-bg-elev-1  border border-divider
.card-elevated       bg-bg-elev-2  border border-border
.card-interactive    card-solid + hover:bg-bg-elev-2 transition
```

Glass utilities (`glass`, `glass-strong`, `glass-subtle`, `card-premium`)
are deprecated for content surfaces. They survive ONLY for:
- `<TopBar>` (one use)
- `<NavDrawer>` panel (one use)
- Command palette (one use, if added)
- Login marquee container (already used via AmbientBackground)

**Result**: removing `backdrop-filter` from ~30 surfaces cuts compositing
cost on mobile noticeably (iOS Safari is the worst offender). Static
elevations are also more predictable — they don't shift with what's
behind them.

### 2.6 Motion — keep restrained

Current `--ease-organic: cubic-bezier(0.2, 0.8, 0.2, 1)` is good. Reduce
the motion budget:

- Page transitions: keep — 200ms enter, 150ms exit
- Hover transitions: 120ms (was 150-200ms)
- Tap scale: 0.97 (was 0.85 — too aggressive)
- Reveal animations (`animate-reveal`): limit to lists with >3 items
- `whileTap`, `whileHover`: only on primary CTAs and chips

The `shimmer` keyframe (used for skeletons) stays. Reduce its duration
from 1.8s to 1.4s — faster reads as "loaded soon" not "stuck."

Reduced-motion behavior stays (all durations to 0.01ms).

---

## 3. Component inventory

82 existing components, grouped by what they do:

### Primitives (`components/ui/`) — keep, refine

| Component | Action |
|---|---|
| `animated-number.tsx` | Keep, no changes |
| `button.tsx` | **Refactor** — drop the gradient brand variant, replace with solid-fill brand. Three variants only: solid-brand, ghost, secondary. |
| `confirm-drawer.tsx` | Keep, no changes |
| `drawer.tsx` | Keep, no changes (vaul-based, fine) |
| `empty-state.tsx` | Keep, no changes |
| `fab.tsx` | **Remove** — FABs are out (see IA). Move any usages to header-right buttons. |
| `input.tsx` | Keep, standardize heights |
| `motion-config.tsx` | Keep |
| `segmented.tsx` | Keep |
| `skeleton.tsx` | Keep |
| `sparkline.tsx` | Keep |
| `stale-indicator.tsx` | Keep |
| `stat-card.tsx` | **Refactor** — drop the gradient variant. Standardize padding to card rules. |
| `switch.tsx` | Keep |
| `toaster.tsx` | Keep (sonner-based) |
| `tooltip.tsx` | Keep |

### Layout (`components/layout/`)

| Component | Action |
|---|---|
| `ambient-background.tsx` | **Reduce** — `intensity="vivid"` is login-only (already correct). Default `subtle` opacity drops from 0.06 to 0.04. The bottom-left orb is removed entirely; one orb at top-right only. Less is more. |
| `nav-drawer.tsx` | **Refactor** — add section groupings, brand-rail active indicator, 240px fixed desktop width |
| `nav-drawer-context.tsx` | Keep |
| `nav-trigger.tsx` | Keep |
| `offline-banner.tsx` | Keep |
| `page-header.tsx` | Keep, standardize |
| `placeholder.tsx` | Keep |
| `skip-to-content.tsx` | Keep (a11y) |
| `top-bar.tsx` | **Refactor** — 52px height, glass→solid-with-border, tighter right-side cluster |

### Chat (`components/chat/`)

| Component | Action |
|---|---|
| `chat-screen.tsx` | **Refactor** — 354 LOC; the streaming + scroll + composer handoff should split into 3 hooks + 2 components |
| `chat-top-bar.tsx` | Keep, tighten |
| `composer.tsx` | **Refactor** — 440 LOC; split into Composer, VoiceButton, ModelPicker, AttachmentRow |
| `message-list.tsx` | Keep |
| `message.tsx` | **Refactor** — 372 LOC; user-bubble gradient removed (anti-pattern 1), action row visibility logic extracted |
| `nav-trigger.tsx` | (duplicate of layout; consolidate) |
| `parts/registry.tsx` | Keep |
| `parts/*` (16 files) | **Audit each** — many use glass; replace with card-solid |
| `quick-prompts.tsx` | Keep |

### Chart (`components/chart/`) — anti-pattern 3 home

| Component | Action | Target LOC |
|---|---|---|
| `chart.tsx` | **Split** | 939 → ≤300 |
| New: `chart-canvas.tsx` | Primary price chart only | ≤250 |
| New: `chart-rsi.tsx` | RSI sub-pane | ≤200 |
| New: `chart-macd.tsx` | MACD sub-pane | ≤200 |
| New: `chart-volume.tsx` | Volume sub-pane (optional) | ≤150 |
| `chart-settings-drawer.tsx` | Keep | |
| `overlay-toggle.tsx` | Keep | |
| `overlays.ts` (types only) | Keep | |
| `performance-chart.tsx` | Keep | |
| `price-tag.tsx` | Keep | |
| `symbol-picker.tsx` | Keep | |
| `timeframe-picker.tsx` | Keep | |

### News (`components/news/`)

| Component | Action |
|---|---|
| `article-card.tsx` | **Refactor** — anti-pattern 4 (5-zone stacking). Collapse to 3 zones. See §4.4. |
| `news-pulse.tsx` | Keep, reduce gradient |
| `use-bookmarks.ts` | Keep |
| (+ ~5 more) | Audit each |

### Calendar (`components/calendar/`)

| Component | Action |
|---|---|
| `event-card.tsx` | **Refactor** — 319 LOC, biggest risk of decoration density. Standardize to list-row aesthetic. |

### Onboarding (`components/onboarding/`)

| Component | Action |
|---|---|
| `wizard.tsx` | **Refactor** — 361 LOC; step components should be siblings, not nested |

### Settings, providers, page-level, parts

Each gets audited in its phase. No blanket changes — phase-by-phase.

---

## 4. Anti-pattern remediation — concrete

### 4.1 Gradient user bubble (`components/chat/message.tsx` lines 142-160)

**Before**:
```
className={cn(
  'relative flex max-w-[88%] flex-col gap-2 px-4 py-3',
  isUser
    ? 'text-brand-fg rounded-3xl rounded-br-md font-medium shadow-sm'
    : 'glass-subtle text-fg rounded-3xl rounded-bl-md',
)}
style={
  isUser ? {
    backgroundImage: 'var(--gradient-brand)',
    boxShadow: 'inset 0 1px 0 0 oklch(100% 0 0 / 0.15), 0 4px 12px -4px oklch(78% 0.16 78 / 0.4)',
  } : undefined
}
```

**After**:
```
className={cn(
  'relative flex max-w-[85%] flex-col gap-1.5 px-3.5 py-2.5',
  isUser
    ? 'text-brand-fg bg-brand rounded-2xl rounded-br-md font-medium'
    : 'bg-bg-elev-1 text-fg border border-divider rounded-2xl rounded-bl-md',
)}
style={
  isUser
    ? { boxShadow: 'inset 0 1px 0 0 oklch(100% 0 0 / 0.18)' }
    : undefined
}
```

Assistant bubble loses glass, gains solid surface + 1px border. Same
visual weight as user bubble from far, distinct on close read.

### 4.2 Glass overload — count + replace

Audit target: every `glass*` class usage on a content surface (not the
4 approved exceptions) gets replaced with `card-solid` / `card-elevated`.

Approximate current count (estimated from grep-able tokens):
- `glass-subtle` on message bubbles, ArticleCard, EventCard, drawer items
- `card-premium` on ArticleCard, Onboarding wizard card
- `glass-strong` on Regen menu, Toaster container
- `glass` on TopBar (legit), NavDrawer (legit)

Target after: zero `glass*` on content cards, zero `backdrop-filter` on
content rows. Only TopBar/NavDrawer/Login keep them.

### 4.3 chart.tsx refactor

Current is 939 LOC with hardcoded `#2563eb`, `#f97316`, `#48d597` for
MACD signal/histogram. The colors drift from the brand palette. The
file does 4 chart lifecycles in one component.

Split plan:
1. Extract `useChartTheme()` hook — pulls theme + gridStyle from
   `<ChartSettings>` context, returns resolved colors using design tokens.
   Replaces the hardcoded `#XXXXXX` values with
   `--color-bear`, `--color-warn`, `--color-bull`.
2. Extract `<ChartCanvas>`, `<ChartRSI>`, `<ChartMACD>`, `<ChartVolume>` —
   each owns one `useEffect` lifecycle for its container ref.
3. `chart.tsx` becomes the orchestrator: composes the four sub-charts,
   handles crosshair sync via the lightweight-charts `subscribeCrosshairMove`
   API, exposes the imperative handle (zoom in/out/reset).
4. No behavior change. Same chart output, same settings, same ZoomIn/Out/Max
   controls. Just smaller files + token-driven colors.

Estimated final sizes: 250+200+200+150+~250 (orchestrator) = ~1050 LOC
total, but each file ≤250 LOC.

### 4.4 ArticleCard — 5 zones → 3 zones

Current visual structure (lines 67-180):
1. Sentiment ribbon (1px left rail)
2. Meta strip (publisher · time · sentiment chip)
3. Headline (line-clamp 3)
4. Summary (line-clamp 2)
5. Tags row (#cpi #fed)
6. Action row (Ask AI · Bookmark · Open)

That's 6 visual zones. Reduce to 3:

```
┌────────────────────────────────────────┐
│ [headline — line-clamp 3, weight 600]  │
│ [meta inline — pub · time · ▲score]    │
│ [summary — line-clamp 2, muted]        │
└────────────────────────────────────────┘
```

Tags move into meta inline (if ≤3, shown small; otherwise under summary
collapsed by default with "show more" link). Action row moves out of the
card into the card's hover overlay (desktop) or long-press menu (mobile).
Sentiment ribbon stays — it's the "scannable at a glance" signal.

Implementation: rewrite `article-card.tsx` (~120 LOC target). No
`card-premium` — `card-interactive` instead.

---

## 5. Mobile-first layout strategy

### Breakpoints (Tailwind v4)

| Name | Min width | Layout |
|---|---|---|
| (base) | 0 | Single column, full-bleed, bottom-padded for nav |
| `sm` | 640px | Slightly more padding, two-column grids appear |
| `md` | 768px | **Breakpoint for layout switch**: sidebar appears, single column → two columns on dashboard surfaces |
| `lg` | 1024px | Three columns where it adds value (news grid, journal) |
| `xl` | 1280px | Sidebar widens to 240px (was 220), right rail appears on chart |
| `2xl` | 1536px | Cap — max-w-7xl stays |

### Touch targets

Already ≥44×44 from Phase 6. Audit for regressions:
- All `<button>` and `<a>` interactive elements
- `IconButton` wrapper enforces min-h-11 min-w-11
- Chat message action row 32×32 — **too small on mobile**. Bump to 36×36
  on touch devices (use `@media (hover: none)` query).

### Content prioritization for small screens

- **Above the fold on mobile = chart only if it's the last viewed**; chat
  wins by default for first-time users. Add a one-time prompt to pick
  default landing.
- **News/calendar**: collapse filters to a single "Filter" pill that opens
  a bottom sheet, not a sticky row of pills on mobile.
- **Settings**: keep the current hub-page with sections. Sub-pages are
  full-screen on mobile, side-panel-style on desktop.
- **Alerts/Journal**: list view on mobile (full row tap), split view on
  desktop (list left, detail right).

---

## 6. Desktop layout strategy

Desktop is mobile with more room. Three patterns, used per surface:

### Pattern A — Right rail (chart, journal)
Main content takes `flex-1`, right rail is `w-72` to `w-80`, fixed scroll.
Used on `/chart/[symbol]` for: order panel, recent journal entries for
this symbol, watchlist.

### Pattern B — Two-pane (settings, alerts, journal)
List left (`w-80`, fixed), detail right (flex-1, scroll).
Used on `/settings/*`, `/alerts`, `/journal`.

### Pattern C — Sidebar + content (news, calendar, chat)
NavDrawer as fixed sidebar (`w-60`), content area scrollable. Chat gets
a third pane for thread list (`w-64` list, flex-1 messages, optional
`w-72` context panel).

### What desktop doesn't get
- Wider top bar with extra actions
- Multi-column main content (except chart right rail / settings list)
- "Hover to preview" everywhere — keep hover affordances narrow

---

## 7. Performance budget

Real-time data is the core feature. The redesign must not regress it.

### Bundle size
- Current: web app reports ~340KB gzipped main chunk. **Cap at 360KB**
  after redesign (token changes + component changes net out close to zero).
- No new dependencies. Allowed: `react-virtuoso` (for long news/calendar
  lists — virtualize beyond 50 items), `cmdk` (for /chat command palette).

### Render cost for real-time updates
- **Tick stream** (`use-prices`): tick updates must not trigger any re-render
  outside the price tile. Wrap `AnimatedNumber` in `React.memo`; price tile
  uses `useSyncExternalStore` against the tick stream. **Audit target**:
  no parent above the price tile re-renders on a tick.
- **Streaming chat**: AI SDK v5 streams parts; each new part should append,
  not re-render the whole message list. Already mostly true via keys;
  audit `chat-screen.tsx` for any `setMessages` patterns.
- **Sparkline + chart**: lightweight-charts already isolates canvas updates;
  no action needed beyond ensuring theme changes don't recreate the chart
  instance (they already don't — `settings.theme` is a dep, but the
  `setOptions` call mutates).

### Animation budget
- CSS-only where possible (transitions on hover, color, opacity)
- `motion/react` only on: page transitions, drawer open/close, FAB → button
  morphs, list reorder
- No `layoutId` migrations beyond the existing tab indicator
- Skeleton shimmers capped at 1.4s cycle
- All transitions respect `prefers-reduced-motion`

### CSS performance
- Removing `backdrop-filter` from ~30 surfaces is the biggest win — iOS
  Safari compositing cost on `backdrop-filter` is 4-6× a normal element
- Audit `will-change` usage — it should be on transitioning elements only,
  not on always-rendered surfaces

---

## 8. Accessibility baseline

WCAG 2.2 AA target (current Phase 6 already meets most).

| Area | Status | Action |
|---|---|---|
| Contrast (body text) | `--color-fg-subtle` 60% L was borderline AA on `bg-elev-1` (12% L) | **Bump to 68% L** (now ~4.7:1) |
| Focus visible | 2px brand outline, 2px offset | Keep, audit for inline-only elements that lose focus ring |
| Touch targets | ≥44×44 declared | **Bump chat action row to 36×36 on touch** (still under 44 — but it's contextual to a larger message bubble) |
| Reduced motion | OS + user-forced | Keep, audit any new animations added |
| Skip to content | Present | Keep |
| Screen reader landmarks | Implicit via header/main/nav | Audit page-level landmark correctness |
| Live regions | Price tiles need `aria-live="polite"` | Audit and add where missing |
| Form labels | shadcn Input wraps Radix Label | Keep |

Specific a11y audits in this plan:
1. Chat message action row keyboard nav (Tab order through Copy → Edit → Regenerate)
2. Chart keyboard alternatives (currently mouse-only)
3. News bookmark button — has `aria-pressed`, keep
4. Toast region — sonner is `aria-live="polite"` by default, verify

---

## 9. Phased rollout

Eight phases. Whole-app in one pass, but each phase ends with all tests
green, typecheck green, lint green, build green. Per user preference —
"work a phase to green, commit at natural boundary, report, then continue."

### Phase R1 — Token foundation (1-2 days)

**What**: Lock the new tokens in `globals.css`. Bump `--color-fg-subtle`,
shrink `--radius-*` ladder, remove `--radius-2xl`, add typography scale,
add new numeric scale. No component changes yet — tokens are inert
unless components reference them.

**Files**: `apps/web/src/app/globals.css` only.

**Done when**: tokens in place, no visual change yet (just more options
available).

### Phase R2 — Primitives (3-4 days)

**What**: Refactor `Button`, `StatCard`, drop `FAB`, refresh `Tooltip`,
`Switch`, `Segmented` to the new type scale + radius scale. No token
migrations on content surfaces yet — primitives carry the new look.

**Files**:
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/stat-card.tsx`
- `apps/web/src/components/ui/fab.tsx` (delete)
- `apps/web/src/components/ui/tooltip.tsx`
- `apps/web/src/components/ui/switch.tsx`
- `apps/web/src/components/ui/segmented.tsx`
- `apps/web/src/components/ui/drawer.tsx`
- `apps/web/src/components/ui/skeleton.tsx`

**Done when**: UI primitives match the new spec, existing usages still
work (look slightly different but are coherent).

### Phase R3 — Layout chrome (2-3 days)

**What**: Refactor `TopBar`, `NavDrawer`, `PageHeader`, `AmbientBackground`
to new tokens + new IA (section-grouped drawer, brand-rail active state,
240px sidebar).

**Files**:
- `apps/web/src/components/layout/top-bar.tsx`
- `apps/web/src/components/layout/nav-drawer.tsx`
- `apps/web/src/components/layout/nav-drawer-context.tsx`
- `apps/web/src/components/layout/page-header.tsx`
- `apps/web/src/components/layout/ambient-background.tsx`
- `apps/web/src/app/(app)/layout.tsx`

**Done when**: app shell matches new IA. All 20 pages still render.

### Phase R4 — Chat (3-4 days)

**What**: Anti-pattern 1 + chat refactor. User bubble loses gradient.
Assistant bubble loses glass. `Message`, `Composer`, `ChatScreen`,
`ChatTopBar` refactored to component boundaries. `parts/*` audited.

**Files**:
- `apps/web/src/components/chat/message.tsx`
- `apps/web/src/components/chat/composer.tsx`
- `apps/web/src/components/chat/chat-screen.tsx`
- `apps/web/src/components/chat/chat-top-bar.tsx`
- `apps/web/src/components/chat/message-list.tsx`
- `apps/web/src/components/chat/parts/*` (16 files, audit each)
- `apps/web/src/app/(app)/chat/layout.tsx`
- `apps/web/src/app/(app)/chat/page.tsx`
- `apps/web/src/app/(app)/chat/[threadId]/page.tsx`

**Done when**: chat looks visually refined, message LOC down, no
gradient/glass on message bubbles.

### Phase R5 — Chart (3-4 days)

**What**: Anti-pattern 3. Split chart.tsx into 5 files. Extract theme
hook. Replace hardcoded colors with tokens.

**Files**:
- `apps/web/src/components/chart/chart.tsx` (rewrite, ≤300 LOC)
- `apps/web/src/components/chart/chart-canvas.tsx` (new)
- `apps/web/src/components/chart/chart-rsi.tsx` (new)
- `apps/web/src/components/chart/chart-macd.tsx` (new)
- `apps/web/src/components/chart/chart-volume.tsx` (new)
- `apps/web/src/components/chart/use-chart-theme.ts` (new hook)
- `apps/web/src/components/chart/chart-settings-drawer.tsx`
- `apps/web/src/components/chart/price-tag.tsx`
- `apps/web/src/components/chart/timeframe-picker.tsx`
- `apps/web/src/components/chart/symbol-picker.tsx`
- `apps/web/src/app/(app)/chart/[symbol]/page.tsx`
- `apps/web/src/app/(app)/chart/[symbol]/pro/page.tsx`

**Done when**: chart split, tokens drive colors, no hardcoded `#XXXXXX`
in chart code.

### Phase R6 — Content surfaces (4-5 days)

**What**: Anti-pattern 2 + 4. Replace glass on news/calendar/journal/
alerts/chat-parts. ArticleCard 5→3 zones. EventCard refactor. Cards use
`card-solid` / `card-elevated`, not `card-premium`.

**Files**:
- `apps/web/src/components/news/article-card.tsx` (rewrite)
- `apps/web/src/components/news/news-pulse.tsx`
- `apps/web/src/components/news/sentiment-chip.tsx` (new, extracted)
- `apps/web/src/components/calendar/event-card.tsx` (rewrite)
- `apps/web/src/components/calendar/calendar-page.tsx` (or similar)
- `apps/web/src/components/journal/*` (audit each)
- `apps/web/src/components/alerts/*` (audit each)
- `apps/web/src/app/(app)/news/page.tsx`
- `apps/web/src/app/(app)/calendar/page.tsx`
- `apps/web/src/app/(app)/journal/page.tsx`
- `apps/web/src/app/(app)/alerts/page.tsx`

**Done when**: content cards all use solid elevations, ArticleCard and
EventCard visually refined, no glass blur on rows.

### Phase R7 — Settings, onboarding, auth (3-4 days)

**What**: Apply uniform density to settings hub + sub-pages. Refactor
onboarding wizard to flat step components. Auth pages (login, register)
get the AmbientBackground vivid treatment as the marquee — no changes
needed there beyond aligning to the new typography scale.

**Files**:
- `apps/web/src/app/(app)/settings/layout.tsx`
- `apps/web/src/app/(app)/settings/page.tsx`
- `apps/web/src/app/(app)/settings/api-keys/page.tsx`
- `apps/web/src/app/(app)/settings/profile/page.tsx`
- `apps/web/src/app/(app)/settings/symbols/page.tsx`
- `apps/web/src/app/(app)/settings/usage/page.tsx`
- `apps/web/src/app/(app)/settings/agent/page.tsx`
- `apps/web/src/components/onboarding/wizard.tsx`
- `apps/web/src/components/onboarding/*` (audit)
- `apps/web/src/app/onboarding/page.tsx`
- `apps/web/src/app/(auth)/layout.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(auth)/register/page.tsx`
- `apps/web/src/app/share/[id]/page.tsx`
- `apps/web/src/app/(app)/offline/page.tsx`

**Done when**: all settings/onboarding/auth pages use the new type scale,
uniform density, no glass on content.

### Phase R8 — Hardening + docs (2-3 days)

**What**: Run the full verification gate. Update docs (`docs/06-frontend.md`,
`docs/AGENTS.md`). Lighthouse a11y/perf scores on each major surface.
Remove deprecated glass utilities from `globals.css` (or alias to
`card-solid` for safety). Update `package.json` scripts if any new ones
were added.

**Files**:
- `docs/06-frontend.md` (rewrite — currently describes Phase 6 state)
- `docs/AGENTS.md` (fix the multi-user claim, web3/worker-core removal,
  plans/ references, test/table counts from prior recon findings)
- `docs/02-codebase.md` (update LOC + table counts)
- `apps/web/src/app/globals.css` (remove deprecated utilities)
- `MIGRATION_V2.md` (check if it needs any visual notes)

**Done when**: docs match reality, no deprecated utilities, Lighthouse ≥90
on `/` and `/chat`, full test suite passes, typecheck clean, build succeeds.

---

## 10. Open questions

These need answers before or during execution:

1. **Bundle cap** — 360KB gzipped is my proposal; current is ~340KB. If
   you're tracking a tighter cap, say so. The `react-virtuoso` add for
   news/calendar lists is the main risk to stay under cap.

2. **Chart right rail on desktop** — Pattern A says chart gets a 72-80px
   right rail for orders + watchlist. None of that exists today. Is this
   in scope for this redesign, or should chart stay as-is structurally
   (only refactored internally)?

3. **Command palette** — `cmdk` for `/chat` slash-menu + global search
   is a common 2026 pattern (Linear, Raycast, Vercel). Adding it is
   ~half a day's work and a meaningful power-user upgrade. In scope?

4. **Settings user-toggleable density** — your answer was "uniform
   everywhere, no toggle." Confirming this is firm — no escape hatch for
   power users. If a user complains, we add the toggle then.

5. **Onboarding wizard visual treatment** — current 4-step wizard has
   heavy gradient backgrounds. Want it to feel like the rest of the app
   (restrained), or keep it as the "warm welcome" surface (vivid
   ambient)? I'd vote for restraint + one subtle warm tint on the
   active step indicator. Confirm.

6. **Sticky brand colors on `bg-brand` buttons** — currently the brand
   button uses `var(--gradient-brand)`. After anti-pattern 1 fix it's
   solid `bg-brand` + inset highlight. Want hover state to be a subtle
   brightness shift, or a true color shift (lighter gold on hover)?

7. **Documentation drift** — should I also include fixing the AGENTS.md
   + README LOC/table drift from the prior recon as part of Phase R8,
   or treat it as a separate hygiene PR?

---

## 11. Risks + tradeoffs

| Risk | Severity | Mitigation |
|---|---|---|
| Whole-app redesign introduces regressions on screens not yet refactored | Med | Each phase ends with full test + typecheck + build gate. No half-migrated surfaces ship. |
| Chart refactor changes behavior subtly (zoom math, crosshair sync) | High | Imperative-handle API must stay identical. Add tests for zoom-in/zoom-out/reset before refactor. |
| Token changes break third-party Radix primitives | Low | shadcn primitives use CSS variables already; verify each token has a fallback |
| Bundle size creep | Low | Cap at 360KB. `react-virtuoso` is the only new dep, and only if list perf is measured to need it |
| User-visible regressions during multi-phase rollout | Med | Each phase is deployable; user can rollback a single phase. Don't merge all at once. |
| Existing test coverage is thin (5 test files, 26 tests in `apps/web`) | Med | Phase R8 includes adding visual-regression tests (Playwright screenshot compare) for the redesigned surfaces. |
| Visual changes break user mental model | Low | This is a refinement, not a redesign. Same information architecture, same navigation, same color identity. |
| The 939-LOC chart.tsx split introduces inter-file coordination bugs | Med | Each sub-chart is independently tested. Crosshair sync via lightweight-charts pub/sub — no shared mutable state. |

---

## 12. What's NOT in scope

- Backend changes — chat route, AI agent, data adapters, worker all untouched
- Trading logic — risk, journal, alerts logic untouched
- Database / migrations — none needed
- Authentication flow changes — NextAuth v5 stays
- BYOK registry / API key encryption — untouched
- Real-time data pipeline — SignalR, candles_1m, live_ticks all untouched
- Provider integrations (BiQuote, Finnhub, Marketaux, FRED, CFTC) — untouched
- The trading chart's data feed — `lightweight-charts` integration stays
- Public repo hygiene (deploy scripts with hardcoded secrets in
  `do_upload.sh` / `do_upload_prod.sh` from prior recon) — separate PR,
  separate priority, not this one

---

## 13. Verification gate per phase

End of each phase, run:

```
pnpm turbo run test --force -- --run
pnpm typecheck
pnpm turbo run lint
pnpm --filter @hamafx/web build
```

All four must pass before phase is "done". The chart phase (R5) also
adds:

```
pnpm --filter @hamafx/web test -- --run
```

(Existing chart tests should continue to pass; add new ones for the
split components if behavior was implicit before.)

---

## 14. Estimated total effort

| Phase | Days | Cumulative |
|---|---|---|
| R1 Tokens | 1-2 | 2 |
| R2 Primitives | 3-4 | 6 |
| R3 Layout chrome | 2-3 | 9 |
| R4 Chat | 3-4 | 13 |
| R5 Chart | 3-4 | 17 |
| R6 Content surfaces | 4-5 | 22 |
| R7 Settings/onboarding/auth | 3-4 | 26 |
| R8 Hardening + docs | 2-3 | 29 |

~5-6 weeks calendar at one person focused. Matches the hardening
phases that preceded it.

---

## 15. After this plan is approved

Each numbered phase (R1-R8) becomes its own bite-sized TDD
implementation plan (per the `software-development/plan` skill). Each
implementation plan is one PR. The user works them phase-by-phase,
with a status report between phases per their established preference.

Do NOT start implementation until the user signs off on this PLAN.md.
