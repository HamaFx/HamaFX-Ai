# DESIGN_SYSTEM_AND_UX_ROADMAP.md
## HamaFX-Ai Premium UI/UX Overhaul — Machine-Executable Technical Specification

> **Downstream AI Coding Agent: Read this file in full before touching any code.**
> This is a blueprint, not a suggestion. Every Tailwind class, file path, and
> DOM structure below is prescriptive. Do not hallucinate variables, invent
> new design tokens, or deviate from the anti-AI-slop constraint matrix.

---

## IMPLEMENTATION PROGRESS TRACKER

| Phase | Task | Status | Commit |
|-------|------|--------|--------|
| **Phase 1** | Task 1: globals.css token replacement | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 2** | Task 2A: Gut AmbientBackground | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 2** | Task 2B: Restyle TopBar | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 2** | Task 2C: Restyle ChatTopBar | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 2** | Task 2D: ChatScreen desktop grid shell | ✅ DONE (partial — grid root added, left/right asides pending) | `feat/institutional-terminal-ui` |
| **Phase 2** | Task 2E: (app)/layout.tsx wider desktop | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 2** | Root layout.tsx dark-only | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 2** | Composer restyle | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 2** | QuickPrompts restyle | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 2** | NavDrawer restyle | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 3** | Task 3A: text.tsx streaming CLS + markdown | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 3** | Task 3B: message-list.tsx typing indicator | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 3** | Task 3C: message.tsx bubbles + actions | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 3** | Task 3D: composer.tsx (already partially done) | ✅ DONE (Phase 2) | — |
| **Phase 3** | Task 3E: quick-prompts.tsx (already done) | ✅ DONE (Phase 2) | — |
| **Phase 4** | Task 4A: UI primitives (button, stat-card, etc.) | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 4** | Task 4B: All chat tool parts (35+ files) | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 4** | Task 4C: Layout components (command-palette, etc.) | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 4** | Task 4D: Page components (dashboard, journal, etc.) | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 4** | Task 4E: Auth pages | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 4** | Task 4F: Onboarding | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 4** | Task 4G: Loading states | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 4** | Task 4H: Error states | ✅ DONE | `feat/institutional-terminal-ui` |
| **Phase 5** | Final sweep + verification | ⬜ PENDING | — |

### What's Done (Phase 1 + Phase 2 + Phase 3 + Phase 4)
1. **globals.css** — Complete token replacement: pure black/zinc surfaces, sharp radii (max 4px), flat shadows, no glass/gradient/glow utilities, no light theme, no float orbs, no reveal animations. md-prose and shiki updated for terminal density.
2. **ambient-background.tsx** — Returns `null`. No orbs, no gradients.
3. **top-bar.tsx** — Sharp `bg-black border-b border-zinc-800 h-12` bar. No glass, no rounded-full, no gradient brand mark.
4. **chat-top-bar.tsx** — Sharp status bar. All rounded-full → rounded-sm, glass-strong → surface-elevated, brand colors → neutral zinc/fg.
5. **chat-screen.tsx** — Root div now supports `xl:grid xl:grid-cols-12` for desktop. Error banner, scroll FAB, and empty state restyled.
6. **(app)/layout.tsx** — `bg-black` on root, `xl:max-w-7xl` on main.
7. **layout.tsx (root)** — `color-scheme: dark` only, `themeColor: '#000000'`.
8. **composer.tsx** — Sharp form container, rounded-sm buttons, no inline gradient/glow styles, leading-[1.4] on textarea.
9. **quick-prompts.tsx** — Sharp cards, neutral icon containers, no per-prompt color customization.
10. **nav-drawer.tsx** — surface-elevated, rounded-sm, no oklch inline styles, no glow shadows.
11. **text.tsx** — Streaming container: `leading-[1.4]` + `tracking-tight`, fixed `bg-fg` cursor. Markdown overrides: tables `table-auto font-mono text-xs text-right border-zinc-900`, lists `pl-0 list-none` with `›` chevron, code blocks `rounded-sm border-zinc-800 bg-zinc-950`, inline code `bg-zinc-900 border-zinc-800 rounded-sm`, blockquotes `border-l-2 border-zinc-700`, links `text-fg underline decoration-zinc-700`, headings `tracking-tight`.
12. **message-list.tsx** — Typing indicator: `bg-zinc-950 border-zinc-800 rounded-sm`, white dots (`bg-fg rounded-sm`).
13. **message.tsx** — User bubbles: `bg-zinc-900 border-zinc-800 rounded-sm`. Assistant bubbles: `bg-zinc-950 border-zinc-800 rounded-sm`. Edit mode: `border-zinc-700 bg-zinc-900 rounded-sm`. Action buttons: `bg-zinc-950 border-zinc-800 rounded-sm`. Regen menu: `surface-elevated rounded-sm`. All brand/glass/gradient/oklch removed.
14. **button.tsx** — Flat variants: `bg-fg text-black` primary, `border-zinc-800 bg-zinc-950` secondary, `bg-red-500` danger, `bg-emerald-500` success. All `rounded-sm`. Sizes tightened (h-9/h-10/h-12). Removed inline `backgroundImage` and `boxShadow` gradient styles.
15. **stat-card.tsx** — `rounded-sm border-zinc-800 bg-zinc-950 p-3`, `font-mono text-lg` on values.
16. **sparkline.tsx** — `strokeWidth="1"`, `strokeLinecap="square"`, `strokeLinejoin="miter"`.
17. **All 35+ chat tool parts** — Batch replaced: all `rounded-*` → `rounded-sm`, all `glass` → `surface-*`, all `text-brand` → `text-fg`, all `text-bull/bear/warn/info` → `text-emerald-500/red-500/amber-500/blue-500`, all `bg-bg-elev-*` → `bg-zinc-*`, all `border-divider` → `border-zinc-800`, all `oklch()` inline styles → hex/rgba, all `var(--gradient-*)` → `none`, all `backdrop-blur` removed.
18. **All page components** (dashboard, journal, news, calendar, alerts, signals, chart, settings) — Same batch replacement applied.
19. **All auth/onboarding/error/loading files** — Same batch replacement applied.
20. **All .ts files** (chart-colors, use-chart-theme, manifest) — oklch references replaced with hex values.

### What's Remaining (Phase 5)
- **Phase 5:** Final grep verification sweep, typecheck, lint, build

---

## 0. PROJECT ARCHITECTURE CONTEXT (READ FIRST)

### 0.1 Tech Stack (Do Not Change)

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 App Router + React 19 |
| Styling | Tailwind CSS v4 (CSS-first `@theme` in `globals.css`, NO `tailwind.config.js`) |
| PostCSS | `@tailwindcss/postcss` single plugin |
| Fonts | `Inter` (sans, `--font-sans`) + `JetBrains Mono` (mono, `--font-mono`) via `next/font/google` |
| AI SDK | Vercel AI SDK v5 (`ai` + `@ai-sdk/react`) |
| Markdown | `react-markdown` + `remark-gfm` + `shiki` |
| Charts | `lightweight-charts` v5 (TradingView) |
| Animation | `motion` (framer-motion successor, `motion/react`) |
| Drawer | `vaul` |
| Virtual | `@tanstack/react-virtual` |
| Icons | `lucide-react` exclusively |
| Class Merge | `cn()` from `@/lib/cn` (clsx + tailwind-merge) |
| ORM | Drizzle ORM |
| Package Mgr | pnpm 9.15.4 + Turborepo 2 |

### 0.2 Monorepo Layout (Web App Only — Where All UI Work Happens)

```
HamaFX-Ai/
├── apps/web/                     # ← ALL UI files live here
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx        # Root layout: <html>, fonts, <Providers>
│   │   │   ├── globals.css       # Tailwind v4 @theme block + all design tokens
│   │   │   ├── (app)/            # Authenticated route group
│   │   │   │   ├── layout.tsx    # App shell: TopBar, NavDrawer, AmbientBg
│   │   │   │   ├── chat/         # Chat routes (primary surface)
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── page.tsx  # /chat → redirect to latest thread
│   │   │   │   │   └── [threadId]/page.tsx  # Server component → <ChatScreen>
│   │   │   │   ├── dashboard/    # Modular widget canvas
│   │   │   │   ├── chart/[symbol]/  # TradingView + structure overlays
│   │   │   │   ├── journal/      # Trade journal + analytics
│   │   │   │   ├── news/         # News feed + sentiment
│   │   │   │   ├── calendar/     # Economic calendar
│   │   │   │   ├── alerts/       # Price/indicator alerts
│   │   │   │   ├── signals/      # Signal track record
│   │   │   │   └── settings/     # Multi-section settings
│   │   │   ├── (auth)/           # Login, forgot-password, reset-password
│   │   │   └── api/              # API routes (do not touch for UI work)
│   │   ├── components/
│   │   │   ├── chat/             # ChatScreen, Composer, MessageList, Message, parts/*
│   │   │   ├── layout/           # TopBar, NavDrawer, AmbientBackground, etc.
│   │   │   ├── ui/               # Primitives: Button, Input, Drawer, Segmented, etc.
│   │   │   ├── chart/            # Chart, overlays, price-tag, symbol-picker
│   │   │   ├── calendar/         # EventCard
│   │   │   ├── news/             # ArticleCard, bookmarks
│   │   │   └── providers/        # React Query, theme providers
│   │   ├── hooks/                # usePrices, useChartData, useVoiceInput, etc.
│   │   └── lib/                  # cn, csrf, format, session, api, etc.
│   ├── postcss.config.mjs        # @tailwindcss/postcss only
│   ├── next.config.mjs           # CSP headers, transpilePackages, Sentry
│   └── package.json
├── packages/                     # Shared packages (ai, db, data, indicators, shared, config)
└── AGENTS.md                     # Canonical dev guide
```

### 0.3 Current State Assessment

The app currently uses a **custom OKLCH-based theme system** in `globals.css`
with semantic CSS variables (`--color-bg`, `--color-fg`, `--color-bull`, etc.)
mapped to Tailwind v4 `@theme` utilities (`bg-bg`, `text-fg`, `text-bull`).

**What must change:** The existing system uses glassmorphism (`glass`,
`glass-strong`, `card-premium` utilities with `backdrop-blur`), rounded
corners up to `rounded-3xl` / `rounded-full`, ambient gradient orbs, and
soft champagne-gold branding. The overhaul replaces ALL of this with the
ultra-dense institutional terminal aesthetic specified below.

**What must NOT change:** The component architecture, data flow, AI SDK
integration, tool part registry, virtualization, routing, or any server-side
logic. This is a pure CSS/layout/styling overhaul.

---

## 1. GLOBAL TAILWIND TOKENS & ATOMIC MAPPINGS

### 1.1 Theme Token Replacement

**File:** `apps/web/src/app/globals.css`

Replace the entire `@theme {}` block and all `:root` custom properties with
the institutional terminal palette below. Tailwind v4 uses CSS-first config —
there is NO `tailwind.config.js`. All custom utilities are defined via
`@utility` in this file.

#### 1.1.1 Core Surface Tokens (Replace Existing)

```css
@theme {
  /* ── Surfaces ── Pure black / zinc grayscale. Zero chroma, zero hue. */
  --color-bg: #000000;              /* Canvas — pure black */
  --color-bg-elev-1: #09090B;       /* Surface panels — zinc-950 */
  --color-bg-elev-2: #18181B;       /* Elevated popovers/drawers — zinc-900 */
  --color-bg-elev-3: #27272A;       /* Hover/active surface — zinc-800 */

  /* ── Borders ── */
  --color-border: #27272A;          /* Structural borders — zinc-800 */
  --color-divider: #111113;         /* Internal dividers — near-black */
  --color-overlay: rgba(0, 0, 0, 0.85);

  /* ── Text ── */
  --color-fg: #FAFAFA;              /* Primary text — zinc-50 */
  --color-fg-muted: #A1A1AA;        /* Secondary text — zinc-400 */
  --color-fg-subtle: #71717A;       /* Tertiary/label text — zinc-500 */

  /* ── Brand ── Remove champagne gold. Replace with neutral white accent. */
  --color-brand: #FAFAFA;           /* Brand = white on black (institutional) */
  --color-brand-fg: #000000;        /* Brand foreground = black */
  --color-brand-glow: rgba(250, 250, 250, 0.15);

  /* ── Market Signal States ── */
  --color-bull: #10B981;            /* Emerald-500 — bullish/long */
  --color-bear: #EF4444;            /* Red-500 — bearish/short */
  --color-neutral: #71717A;         /* Zinc-500 — neutral */
  --color-warn: #F59E0B;            /* Amber-500 — warning */
  --color-info: #3B82F6;            /* Blue-500 — informational */

  /* ── Radii ── SHARP GEOMETRY. Max rounded-md (4px). */
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 4px;                 /* Was 12px — flatten */
  --radius-xl: 4px;                 /* Was 16px — flatten */
  --radius-2xl: 4px;                /* Was 20px — flatten */
  --radius-pill: 4px;               /* Was 999px — NO PILLS. Sharp only. */

  /* ── Shadows ── Minimal, flat. No glow. */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.6);
  --shadow-md: 0 2px 8px -2px rgba(0, 0, 0, 0.7);
  --shadow-lg: 0 4px 16px -4px rgba(0, 0, 0, 0.8);
  --shadow-xl: 0 8px 32px -8px rgba(0, 0, 0, 0.9);
  --shadow-glow-brand: none;        /* DISABLED — no glow */
  --shadow-glow-accent: none;       /* DISABLED — no glow */

  /* ── Fonts ── */
  --font-sans: var(--font-sans), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace;

  /* ── Fluid Typography (keep existing scale) ── */
  --text-sm: clamp(0.8rem, 0.7rem + 0.5vw, 0.875rem);
  --text-base: clamp(0.95rem, 0.85rem + 0.5vw, 1rem);
  --text-lg: clamp(1rem, 0.9rem + 0.6vw, 1.125rem);

  --text-display-2xl: clamp(2.25rem, 1.5rem + 3.5vw, 3.5rem);
  --text-display-xl: clamp(1.75rem, 1.2rem + 2.5vw, 2.5rem);
  --text-display-lg: clamp(1.25rem, 1rem + 1vw, 1.5rem);
  --text-display-md: clamp(1.125rem, 1rem + 0.5vw, 1.25rem);

  --text-body-lg: 1.0625rem;
  --text-body: 0.9375rem;
  --text-body-sm: 0.8125rem;
  --text-caption: 0.6875rem;

  --text-numeric-xl: 1.5rem;
  --text-numeric-lg: 1.125rem;
  --text-numeric: 0.875rem;

  --ease-organic: cubic-bezier(0.2, 0.8, 0.2, 1);
}
```

#### 1.1.2 Light Theme — DELETE ENTIRELY

Remove the `@media (prefers-color-scheme: light)` block and the
`:root[data-theme="light"]` block. This is a **dark-only** institutional
terminal. Set `color-scheme: dark` permanently on `:root`.

#### 1.1.3 Glass/Blur Utilities — DELETE AND REPLACE

**DELETE these `@utility` blocks entirely:**
- `@utility glass { ... }`
- `@utility glass-strong { ... }`
- `@utility glass-subtle { ... }`
- `@utility card-premium { ... }`
- `@utility glow-brand { ... }`
- `@utility glow-accent { ... }`

**REPLACE with flat surface utilities:**

```css
@utility surface-panel {
  background: var(--color-bg-elev-1);
  border: 1px solid var(--color-border);
}

@utility surface-elevated {
  background: var(--color-bg-elev-2);
  border: 1px solid var(--color-border);
}

@utility surface-flat {
  background: var(--color-bg);
  border: 1px solid var(--color-divider);
}
```

#### 1.1.4 Gradient Tokens — DELETE

Remove ALL gradient custom properties from `:root`:
- `--gradient-brand`
- `--gradient-danger`
- `--gradient-brand-soft`
- `--gradient-accent`

Remove ALL shadow press tokens that reference gradients:
- `--shadow-brand-press`
- `--shadow-brand-press-strong`
- `--shadow-danger-press`

Replace with flat equivalents:
```css
--shadow-brand-press: 0 2px 8px -2px rgba(0, 0, 0, 0.7);
--shadow-danger-press: 0 2px 8px -2px rgba(0, 0, 0, 0.7);
```

#### 1.1.5 Ambient/Float Animations — DELETE

Remove these keyframes and their associated classes:
- `@keyframes float-slow`, `.float-orb-1`
- `@keyframes float-medium`, `.float-orb-2`
- `@keyframes float-fast`, `.float-orb-3`

Remove `@keyframes reveal` and `@utility animate-reveal` (scroll-driven entrance animations are AI-slop).

### 1.2 Atomic Token → Tailwind Class Mapping

The downstream agent MUST use these EXACT utility classes. Do not invent
intermediate values. The `@theme` tokens above generate these utilities
automatically in Tailwind v4.

| Concept | Tailwind Utility | Hex Value |
|---------|-----------------|-----------|
| Canvas background | `bg-bg` | `#000000` |
| Surface panel | `bg-bg-elev-1` | `#09090B` |
| Elevated popover/drawer | `bg-bg-elev-2` | `#18181B` |
| Hover/active surface | `bg-bg-elev-3` | `#27272A` |
| Structural border | `border-border` | `#27272A` |
| Internal divider | `border-divider` | `#111113` |
| Primary text | `text-fg` | `#FAFAFA` |
| Secondary text | `text-fg-muted` | `#A1A1AA` |
| Tertiary/label text | `text-fg-subtle` | `#71717A` |
| Brand accent (white) | `text-brand` / `bg-brand` | `#FAFAFA` |
| Brand foreground (black) | `text-brand-fg` | `#000000` |
| Signal bullish/long | `text-bull` / `bg-bull/10` | `#10B981` |
| Signal bearish/short | `text-bear` / `bg-bear/10` | `#EF4444` |
| Signal warning | `text-warn` / `bg-warn/10` | `#F59E0B` |
| Signal info | `text-info` / `bg-info/10` | `#3B82F6` |
| Signal neutral | `text-neutral` / `bg-neutral/10` | `#71717A` |

### 1.3 Font Stack Mapping

| Use Case | Tailwind Utility | Font Family |
|----------|-----------------|-------------|
| UI labels, buttons, navigation, body prose | `font-sans` | Inter (via `--font-sans`) |
| Numbers, prices, spreads, tickers, metrics, timestamps, code | `font-mono` | JetBrains Mono (via `--font-mono`) |

**Rule:** Every numeric value rendered to the user MUST use `font-mono` +
`tabular-nums`. This includes: prices, spreads, R-multiples, percentages,
pip counts, indicator values, timestamps, candle OHLC, equity values, and
stat card numbers. No exceptions.

### 1.4 Border-Radius Constraint

**MAXIMUM border-radius across the entire application: `rounded-md` (4px).**

- All cards, panels, inputs, buttons, chips, badges: `rounded-sm` (2px) or `rounded-md` (4px)
- NO `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-full`
- The `--radius-pill` token is set to `4px` to enforce this at the utility level
- SVG elements (sparklines, charts) are exempt — they use `strokeLinecap` not CSS radius

### 1.5 Spacing Tokens (Keep Existing)

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --touch-min: 44px;
  --topbar-h: 48px;       /* Was 56px — tighten for terminal density */
}
```

---

## 2. VIEWPORT COMPONENT LAYOUT TREES (JSX PSEUDO-STRUCTURE)

### 2.1 Mobile Viewport (< 768px)

The mobile layout is a **fixed full-screen surface** with three vertical
zones. The existing `ChatScreen` already uses `fixed inset-0 z-50 flex
flex-col` — this pattern is correct and should be preserved, but the child
styling must change.

#### 2.1.1 Mobile Chat Surface Layout Tree

**File:** `apps/web/src/components/chat/chat-screen.tsx`

```
<div className="bg-bg paint-isolated fixed inset-0 z-50 flex flex-col">

  {/* ZONE 1: Pinned top status bar — h-12, sharp, no glass */}
  <ChatTopBar ... />
  {/* ChatTopBar root element must change to: */}
  {/* <header className="flex h-12 w-full items-center justify-between
       border-b border-zinc-800 bg-black px-3 pt-safe"> */}

  {/* ZONE 2: Scrollable chat workspace */}
  <div ref={scrollRef}
       className="no-overscroll relative flex-1 overflow-y-auto">

    {/* Inner content wrapper — remove max-w-2xl on mobile, keep on md+ */}
    <div className="mx-auto w-full md:max-w-2xl">

      {/* Thread summary (if present) */}
      {/* Agent deliberation (if present) */}

      {/* Either empty state OR message list */}
      {isEmpty ? <EmptyChatState /> : <MessageList />}

      {/* Error banner */}
    </div>
  </div>

  {/* ZONE 3: Bottom-docked interface module */}
  <div className="mx-auto w-full md:max-w-2xl">
    <Composer />
  </div>
</div>
```

#### 2.1.2 Mobile Bottom-Docked Interface Module

**File:** `apps/web/src/components/chat/composer.tsx`

The composer must be restructured to contain the quick-action prompt pills
ABOVE the text input, all inside a single docked container.

```
{/* Bottom dock container — NO backdrop-blur, NO glass */}
<div className="fixed bottom-0 left-0 right-0 z-50
                border-t border-zinc-800 bg-black
                pb-safe">

  {/* Quick-action prompt pills — horizontal scroll */}
  <div className="flex overflow-x-auto whitespace-nowrap gap-2 p-2
                    scrollbar-hide">
    {quickPrompts.map(pill => (
      <button className="shrink-0 border border-zinc-800 bg-zinc-950
                        text-zinc-400 hover:text-zinc-100 hover:border-zinc-700
                        rounded-sm px-3 py-1.5 font-mono text-xs
                        transition-colors">
        {pill.label}
      </button>
    ))}
  </div>

  {/* Compact text area input wrapper — absolute height limitation */}
  <div className="flex items-end gap-2 p-3">
    {/* Text input — max-h-32 to prevent keyboard displacement */}
    <textarea className="flex-1 resize-none border border-zinc-800
                         bg-zinc-950 text-zinc-100 placeholder:text-zinc-600
                         rounded-sm px-3 py-2 font-sans text-sm
                         focus:outline-none focus:border-zinc-700
                         max-h-32 min-h-[44px] overflow-y-auto" />
    {/* Send button — sharp, no rounded-full */}
    <button className="shrink-0 inline-flex size-[44px] items-center
                        justify-center bg-zinc-100 text-black
                        hover:bg-zinc-300 rounded-sm
                        disabled:opacity-40 disabled:cursor-not-allowed
                        transition-colors">
      <ArrowUp className="size-[18px]" strokeWidth={2.5} />
    </button>
  </div>
</div>
```

**Critical mobile constraints:**
- The textarea MUST have `max-h-32` (128px) and `overflow-y-auto` to prevent
  the input from growing unbounded and pushing content under the keyboard.
- The bottom dock MUST use `pb-safe` (env safe-area-inset-bottom) for iPhone notch.
- NO `backdrop-blur` anywhere. The dock is solid `bg-black`.
- Quick-action pills use `scrollbar-hide` (already defined in globals.css base layer).
- The scrollable workspace MUST have `pb-32` (128px bottom padding) so the last
  message is not hidden behind the docked composer.

#### 2.1.3 Mobile Top Status Bar

**File:** `apps/web/src/components/chat/chat-top-bar.tsx`

Replace the existing glass top bar with a sharp, dense status bar:

```
<header className="flex h-12 w-full items-center justify-between
                    border-b border-zinc-800 bg-black px-3 pt-safe
                    shrink-0">

  {/* Left: menu trigger + title */}
  <div className="flex items-center gap-2 min-w-0">
    <NavTrigger />
    <span className="text-fg text-sm font-semibold tracking-tight truncate">
      {title}
    </span>
    {pinnedSymbol && (
      <span className="text-fg-subtle font-mono text-xs uppercase">
        {pinnedSymbol}
      </span>
    )}
  </div>

  {/* Right: actions */}
  <div className="flex items-center gap-1 shrink-0">
    {/* New chat, more menu — icon buttons only, 32x32 */}
  </div>
</header>
```

#### 2.1.4 Mobile App Shell (Non-Chat Pages)

**File:** `apps/web/src/app/(app)/layout.tsx`

For non-chat pages on mobile, the app shell uses a simple top bar + scrollable
content pattern. The existing `AmbientBackground` component MUST be gutted
(see Task 1 below) or removed entirely.

```
<div className="text-fg relative min-h-svh bg-black">
  <SkipToContent />
  {/* AmbientBackground — REMOVE or replace with empty fragment */}
  <TopBar />
  <main id="main-content"
        className="mx-auto w-full max-w-2xl px-4 pt-4
                   focus:outline-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
    {children}
  </main>
  <NavDrawer />
  <OfflineBanner />
  <CommandPalette />
  <Toaster />
</div>
```

### 2.2 Desktop Viewport (≥ 1280px)

The desktop layout introduces a **12-column master grid shell** for the chat
route only. Non-chat routes keep the single-column `max-w-2xl` layout but
benefit from the new token system.

#### 2.2.1 Desktop Chat Master Grid Shell

**File:** `apps/web/src/components/chat/chat-screen.tsx`

The `ChatScreen` root must conditionally render a grid layout at the `xl:`
breakpoint. The approach: the root `div` uses `flex flex-col` on mobile and
`grid grid-cols-12` on `xl:`.

```
<div className="bg-black paint-isolated fixed inset-0 z-50
                flex flex-col xl:grid xl:grid-cols-12
                xl:h-screen xl:w-full xl:overflow-hidden">

  {/* ════════ LEFT COLUMN (xl:col-span-3) ════════ */}
  {/* Pinned trading pair watchlists + historic session vectors */}
  <aside className="hidden xl:flex xl:col-span-3 xl:flex-col
                     border-r border-zinc-800 h-full overflow-y-auto">

    {/* Watchlist panel */}
    <div className="border-b border-zinc-800 p-3">
      <h2 className="text-fg-subtle text-xs font-semibold uppercase
                     tracking-wider mb-2">
        Watchlist
      </h2>
      {/* Reuse WatchlistWidget data logic, restyle per §1 tokens */}
      <ul className="flex flex-col">
        {symbols.map(t => (
          <li className="flex items-center justify-between gap-3
                         border-b border-zinc-900 py-2 last:border-0">
            <span className="text-fg text-sm font-medium">{t.symbol}</span>
            <div className="flex items-center gap-2">
              <span className="text-fg font-mono text-sm tabular-nums">
                {t.mid.toFixed(decimals)}
              </span>
              <span className={cn('font-mono text-xs tabular-nums',
                                   isBull ? 'text-emerald-500' : 'text-red-500')}>
                {isBull ? '▲' : '▼'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>

    {/* Historic session vectors / thread list */}
    <div className="p-3">
      <h2 className="text-fg-subtle text-xs font-semibold uppercase
                     tracking-wider mb-2">
        Sessions
      </h2>
      {/* Thread list — compact rows */}
      <ul className="flex flex-col gap-1">
        {threads.map(t => (
          <li>
            <Link className="block border-l-2 border-transparent
                            hover:border-zinc-700 hover:bg-zinc-950
                            px-2 py-1.5 text-sm text-fg-muted
                            hover:text-fg transition-colors rounded-sm">
              {t.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  </aside>

  {/* ════════ CENTER COLUMN (xl:col-span-6) ════════ */}
  {/* Active AI dialogue stream */}
  <section className="xl:col-span-6 h-full flex flex-col justify-between
                       border-r border-zinc-800">

    {/* Sticky top asset banner */}
    <div className="sticky top-0 z-10 flex h-12 items-center
                        justify-between border-b border-zinc-800
                        bg-black px-4 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-fg text-sm font-semibold">{title}</span>
        {pinnedSymbol && (
          <span className="border border-zinc-800 bg-zinc-950
                          text-fg-muted font-mono text-xs uppercase
                          px-2 py-0.5 rounded-sm">
            {pinnedSymbol}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {/* Analysis mode selector, new chat, more */}
      </div>
    </div>

    {/* Message scroll area */}
    <div ref={scrollRef}
         className="no-overscroll relative flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-4">
        {/* ThreadSummary, AgentDeliberation, MessageList/EmptyState */}
      </div>
    </div>

    {/* Bottom-anchored prompt input container */}
    <div className="border-t border-zinc-800 bg-black p-3 pb-safe">
      <div className="mx-auto max-w-2xl">
        {/* Quick-action pills row (desktop: wrap, no horizontal scroll) */}
        <div className="hidden xl:flex xl:flex-wrap xl:gap-2 xl:mb-2">
          {quickPrompts.map(pill => (
            <button className="border border-zinc-800 bg-zinc-950
                              text-zinc-400 hover:text-zinc-100
                              hover:border-zinc-700 rounded-sm
                              px-3 py-1.5 font-mono text-xs
                              transition-colors">
              {pill.label}
            </button>
          ))}
        </div>
        <Composer />
      </div>
    </div>
  </section>

  {/* ════════ RIGHT COLUMN (xl:col-span-3) ════════ */}
  {/* Quantitative analytics matrix */}
  <aside className="hidden xl:flex xl:col-span-3 xl:flex-col
                     h-full overflow-y-auto">

    {/* Technical metric modules */}
    <div className="border-b border-zinc-800 p-3">
      <h2 className="text-fg-subtle text-xs font-semibold uppercase
                     tracking-wider mb-3">
        Metrics
      </h2>
      {/* RSI, MACD, ATR, etc. — dense grid */}
      <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
        {metrics.map(m => (
          <div className="border border-zinc-900 bg-zinc-950 p-2 rounded-sm">
            <dt className="text-fg-subtle uppercase tracking-wide">{m.label}</dt>
            <dd className={cn('text-fg tabular-nums mt-1', m.tone)}>
              {m.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>

    {/* Order book spreads */}
    <div className="border-b border-zinc-800 p-3">
      <h2 className="text-fg-subtle text-xs font-semibold uppercase
                     tracking-wider mb-2">
        Spread
      </h2>
      {/* Bid/ask spread table */}
      <table className="w-full font-mono text-xs">
        <tbody>
          {spreads.map(s => (
            <tr className="border-b border-zinc-900 last:border-0">
              <td className="text-fg py-1.5">{s.symbol}</td>
              <td className="text-emerald-500 text-right tabular-nums">
                {s.bid.toFixed(decimals)}
              </td>
              <td className="text-red-500 text-right tabular-nums">
                {s.ask.toFixed(decimals)}
              </td>
              <td className="text-fg-subtle text-right tabular-nums">
                {s.spread.toFixed(decimals)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Raw SVG line chart data component */}
    <div className="p-3">
      <h2 className="text-fg-subtle text-xs font-semibold uppercase
                     tracking-wider mb-2">
        Price
      </h2>
      {/* Sparkline — 1px stroke, zero fill, no rounded corners */}
      <Sparkline values={priceHistory}
                 className="h-16 w-full text-fg-muted" />
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-fg font-mono text-lg tabular-nums">
          {currentPrice.toFixed(decimals)}
        </span>
        <span className={cn('font-mono text-xs tabular-nums',
                            isBull ? 'text-emerald-500' : 'text-red-500')}>
          {isBull ? '+' : ''}{changePct.toFixed(2)}%
        </span>
      </div>
    </div>
  </aside>
</div>
```

#### 2.2.2 Desktop Non-Chat Pages

Non-chat pages (dashboard, journal, news, calendar, alerts, signals, settings)
keep the existing single-column `max-w-2xl` layout from `(app)/layout.tsx`.
The `TopBar` component is restyled per §2.1.3 but the layout structure
remains: sticky top bar + scrollable main content.

**Optional enhancement:** At `xl:` breakpoint, dashboard and journal pages
can expand to `max-w-7xl` and use multi-column grids for their widget
canvases. This is the only non-chat desktop layout change:

**File:** `apps/web/src/app/(app)/layout.tsx` — modify the `<main>` element:

```
<main id="main-content"
      className="mx-auto w-full max-w-2xl px-4 pt-4
                 xl:max-w-7xl xl:px-6
                 focus:outline-none"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
```

**File:** `apps/web/src/app/(app)/dashboard/_components/dashboard-canvas.tsx`

The dashboard grid should use:
```
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
  {widgets.map(w => <WidgetWrapper />)}
</div>
```

---

## 3. STREAMING COMPONENT DATA CONTRACTS & CLS MITIGATION

### 3.1 Streaming Markdown Container

**File:** `apps/web/src/components/chat/parts/text.tsx`

The streaming text container MUST enforce fixed line-height and tight
tracking to prevent cumulative layout shift (CLS) as tokens arrive.

**Current (replace):**
```tsx
<div className="md-prose text-sm leading-relaxed space-y-2">
  {text}
  <span className="inline-block w-[2px] h-[1em] bg-text-fg animate-pulse ml-[1px] align-middle" />
</div>
```

**Required replacement:**
```tsx
<div className="font-sans text-sm leading-[1.4] tracking-tight
                space-y-2 text-fg">
  {text}
  <span className="inline-block w-[2px] h-[1em] bg-fg
                   animate-pulse ml-[1px] align-middle" />
</div>
```

**Key changes:**
- `leading-relaxed` → `leading-[1.4]` — fixed line-height prevents reflow
- Add `tracking-tight` — tighter letter spacing for terminal density
- `bg-text-fg` → `bg-fg` — fix broken class reference
- Add `text-fg` — explicit text color

### 3.2 Parsed Markdown Block Formatting Rules

**File:** `apps/web/src/components/chat/parts/text.tsx`

The `ReactMarkdown` `components` prop must be updated with these EXACT
overrides. Every element type below is a hard requirement.

#### 3.2.1 Tables

```tsx
table: ({ children }) => (
  <div className="my-3 overflow-x-auto border border-zinc-900 rounded-sm">
    <table className="table-auto font-mono text-xs text-right
                      border-zinc-900 w-full">
      {children}
    </table>
  </div>
),
thead: ({ children }) => (
  <thead className="bg-zinc-900 border-b border-zinc-800">
    {children}
  </thead>
),
tbody: ({ children }) => (
  <tbody className="divide-y divide-zinc-900">
    {children}
  </tbody>
),
tr: ({ children }) => (
  <tr className="border-zinc-900 hover:bg-zinc-950 transition-colors">
    {children}
  </tr>
),
th: ({ children }) => (
  <th className="px-3 py-1.5 text-left font-semibold text-fg-subtle
                uppercase tracking-wider border-r border-zinc-900
                last:border-r-0">
    {children}
  </th>
),
td: ({ children }) => (
  <td className="px-3 py-1.5 text-fg tabular-nums border-r border-zinc-900
                last:border-r-0">
    {children}
  </td>
),
```

**Rules:**
- `table-auto` — browser-controlled column widths
- `font-mono` — all table data is monospace
- `text-xs` — dense, 12px
- `text-right` — default alignment for numeric data
- `border-zinc-900` — cell borders use the darkest border token
- `tabular-nums` on `td` — prevents number width jitter
- `rounded-sm` on wrapper — max 2px radius

#### 3.2.2 Lists

```tsx
ul: ({ children }) => (
  <ul className="pl-0 list-none my-2 space-y-1">
    {children}
  </ul>
),
ol: ({ children }) => (
  <ol className="pl-0 list-none my-2 space-y-1">
    {children}
  </ol>
),
li: ({ children }) => (
  <li className="text-fg text-sm leading-[1.4] flex gap-2">
    <span className="text-fg-subtle select-none">›</span>
    <span className="flex-1">{children}</span>
  </li>
),
```

**Rules:**
- `pl-0 list-none` — strip ALL default left padding and list-style markers
- List items use a `›` chevron prefix instead of bullets/discs
- `leading-[1.4]` — matches streaming container line-height
- `space-y-1` — tight vertical rhythm (4px)

#### 3.2.3 Inline Code

```tsx
code({ className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || '');
  const codeStr = String(children).replace(/\n$/, '');
  if (!match) {
    return (
      <code className="bg-zinc-900 text-fg-muted font-mono text-xs
                       border border-zinc-800 rounded-sm
                       px-1.5 py-0.5" {...props}>
        {children}
      </code>
    );
  }
  return <CodeBlock lang={match[1]!} code={codeStr} />;
}
```

#### 3.2.4 Code Blocks

```tsx
// CodeBlock wrapper
<div className="border border-zinc-800 bg-zinc-950
              rounded-sm my-2 overflow-hidden">

  {/* Header bar */}
  <div className="flex items-center justify-between
                  border-b border-zinc-800 bg-zinc-900
                  px-3 py-1.5">
    <span className="text-fg-subtle font-mono text-xs
                     uppercase tracking-wider">
      {lang || 'code'}
    </span>
    <button className="text-fg-muted hover:text-fg font-mono text-xs
                       transition-colors">
      {/* copy icon + label */}
    </button>
  </div>

  {/* Shiki code — transparent background */}
  <ShikiCode code={displayCode} lang={lang} />

  {/* Truncation toggle (if > 100 lines) */}
</div>
```

#### 3.2.5 Headings, Paragraphs, Links, Blockquotes

```tsx
h1: ({ children }) => (
  <h1 className="text-base font-bold mt-4 mb-2 text-fg tracking-tight">
    {children}
  </h1>
),
h2: ({ children }) => (
  <h2 className="text-sm font-semibold mt-3 mb-1.5 text-fg tracking-tight">
    {children}
  </h2>
),
h3: ({ children }) => (
  <h3 className="text-sm font-medium mt-2 mb-1 text-fg">
    {children}
  </h3>
),
p: ({ children }) => (
  <p className="leading-[1.4] whitespace-pre-line my-1.5 text-fg text-sm">
    {children}
  </p>
),
a: ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer"
     className="text-fg underline underline-offset-2
                decoration-zinc-700 hover:decoration-zinc-500">
    {children}
  </a>
),
blockquote: ({ children }) => (
  <blockquote className="border-l-2 border-zinc-700
                         text-fg-muted my-2 pl-3 italic
                         text-sm leading-[1.4]">
    {children}
  </blockquote>
),
hr: () => (
  <hr className="border-zinc-900 my-4" />
),
```

### 3.3 Inline SVG Chart Data Components

**File:** `apps/web/src/components/ui/sparkline.tsx`

The existing Sparkline component is close to correct. Enforce these constraints:

```tsx
<svg
  viewBox="0 0 100 100"
  preserveAspectRatio="none"
  className={cn('h-4 w-full', className)}
  role="img"
  aria-label={label}
>
  <path
    d={path}
    fill="none"                           // ← ZERO fill elements
    stroke={stroke ?? 'currentColor'}
    strokeWidth="1"                       // ← 1px width (was 2)
    strokeLinecap="square"                // ← sharp caps (was "round")
    strokeLinejoin="miter"                // ← sharp joins (was "round")
    vectorEffect="non-scaling-stroke"     // ← crisp at any size
  />
</svg>
```

**Rules for ALL inline SVG chart data:**
- `fill="none"` — zero fill elements, ever
- `strokeWidth="1"` — 1px stroke width only
- `strokeLinecap="square"` — sharp line caps, no rounded
- `strokeLinejoin="miter"` — sharp joins, no rounded
- `vectorEffect="non-scaling-stroke"` — crisp at any container size
- No gradient strokes, no filter effects, no drop shadows on SVG paths

### 3.4 Markdown Prose CSS (globals.css)

**Replace** the existing `.md-prose` block:

```css
.md-prose {
  line-height: 1.4;
}
.md-prose strong {
  color: var(--color-fg);
  font-weight: 600;
}
.md-prose em {
  font-style: italic;
  color: var(--color-fg);
}
.md-prose code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  background: var(--color-bg-elev-2);
  border: 1px solid var(--color-border);
  border-radius: 2px;             /* ← was 6px */
  padding: 1px 5px;
}
.md-prose ul {
  margin: 8px 0;
  padding-left: 0;                /* ← was 18px */
  list-style: none;               /* ← was disc */
}
.md-prose ul li {
  margin-top: 4px;
}
.md-prose ul li::marker {
  content: '';                    /* ← no marker */
  color: var(--color-fg-subtle);
}
.md-prose p {
  text-wrap: pretty;
}
.md-prose h1, .md-prose h2, .md-prose h3,
.md-prose h4, .md-prose h5, .md-prose h6 {
  text-wrap: balance;
}
```

### 3.5 Shiki Code Block CSS

**Replace** the existing `.shiki` block:

```css
.shiki {
  margin: 0 !important;
  background-color: transparent !important;
  padding: 0.75rem !important;
  font-family: var(--font-mono) !important;
  font-size: 0.8125rem !important;       /* text-body-sm */
  line-height: 1.4 !important;
  overflow-x: auto;
  border-radius: 0 !important;            /* ← sharp */
}
.shiki code {
  background-color: transparent !important;
  padding: 0 !important;
  border-radius: 0 !important;            /* ← sharp */
}
```

---

## 4. STEP-BY-STEP IMPLEMENTATION CHECKLIST FOR THE CODING AGENT

Each task below specifies the EXACT files to modify or create, the exact
changes to make, and the order in which to execute them. Do not skip steps.
Do not reorder. Each task builds on the previous.

---

### TASK 1: Gut globals.css — Replace Theme Tokens, Delete AI-Slop Utilities

**File:** `apps/web/src/app/globals.css`

**Actions (in order):**

1. **Replace the `@theme {}` block** with the institutional terminal palette
   defined in §1.1.1. Every `--color-*`, `--radius-*`, `--shadow-*` token
   must be updated.

2. **Delete the light theme blocks:**
   - `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { ... } }`
   - `:root[data-theme="light"] { ... }`

3. **Set `color-scheme: dark` permanently** in `:root` (remove the existing
   `color-scheme: dark` which is already there — confirm it stays).

4. **Delete glass/blur `@utility` blocks:**
   - `@utility glass { ... }`
   - `@utility glass-strong { ... }`
   - `@utility glass-subtle { ... }`
   - `@utility card-premium { ... }`
   - `@utility glow-brand { ... }`
   - `@utility glow-accent { ... }`

5. **Add flat surface `@utility` blocks** (see §1.1.3):
   - `@utility surface-panel { ... }`
   - `@utility surface-elevated { ... }`
   - `@utility surface-flat { ... }`

6. **Delete gradient custom properties** from `:root`:
   - `--gradient-brand`, `--gradient-danger`, `--gradient-brand-soft`, `--gradient-accent`
   - `--shadow-brand-press`, `--shadow-brand-press-strong`, `--shadow-danger-press`
   - Replace with flat shadow equivalents (see §1.1.4).

7. **Delete ambient/float keyframes and classes:**
   - `@keyframes float-slow`, `.float-orb-1`
   - `@keyframes float-medium`, `.float-orb-2`
   - `@keyframes float-fast`, `.float-orb-3`
   - `@keyframes reveal`, `@utility animate-reveal`

8. **Update `--topbar-h`** from `56px` to `48px`.

9. **Update `.md-prose` block** per §3.4.

10. **Update `.shiki` / `.shiki code` blocks** per §3.5.

11. **Keep these utilities unchanged** (they are still needed):
    - `@utility pt-safe`, `@utility pb-safe`, `@utility pl-safe`, `@utility pr-safe`
    - `@utility bottom-safe`, `@utility top-safe`
    - `.no-overscroll`, `.paint-isolated`
    - `@keyframes shimmer`, `.shimmer`
    - `@keyframes stale-pulse`, `.stale-pulse`
    - `@keyframes mic-pulse`, `.mic-pulse`
    - `@keyframes spin-ring`, `.agent-ring-active`
    - `@keyframes scroll-fab`, `@utility scroll-fab`
    - `@utility transition-organic`
    - `.scrollbar-hide` and scrollbar styling
    - `.skip-to-main`
    - `.scroll-shadows-x`
    - View transition names (`.chat-screen-composer`, etc.)
    - `[popover]` positioning
    - `.touch-swipe-hint` media queries
    - `@media (prefers-reduced-motion: reduce)` blocks

12. **Update `::selection`** to use neutral highlight:
    ```css
    ::selection {
      background-color: rgba(250, 250, 250, 0.2);
      color: var(--color-fg);
    }
    ```

13. **Update `:focus-visible`** to use neutral ring:
    ```css
    :focus-visible {
      outline: 2px solid var(--color-fg);
      outline-offset: 1px;
      border-radius: var(--radius-sm);
    }
    ```

**Verification:** After this task, `grep -r "backdrop-blur\|backdrop-filter\|glass\|card-premium\|glow-\|gradient-brand\|float-orb\|animate-reveal\|rounded-full\|rounded-3xl\|rounded-2xl\|rounded-xl\|rounded-lg" apps/web/src/` should return ZERO results in CSS. (Component files will still have references — those are fixed in later tasks.)

---

### TASK 2: Build the Core Responsive Layout Shell Framework

**Files to modify:**
- `apps/web/src/app/(app)/layout.tsx`
- `apps/web/src/components/layout/ambient-background.tsx`
- `apps/web/src/components/layout/top-bar.tsx`
- `apps/web/src/components/chat/chat-screen.tsx`
- `apps/web/src/components/chat/chat-top-bar.tsx`

**Actions:**

#### 2A: Gut AmbientBackground

**File:** `apps/web/src/components/layout/ambient-background.tsx`

Replace the entire component with a no-op:

```tsx
export function AmbientBackground() {
  return null;
}
```

The `(app)/layout.tsx` still imports it — the import stays, the component
just renders nothing. This is cleaner than removing the import across all
consumers (login page also uses it with `intensity="vivid"`).

**For the login page** (`apps/web/src/app/(auth)/layout.tsx` or wherever
`<AmbientBackground intensity="vivid" />` is used): replace with a simple
solid `bg-black` container. No orbs, no gradients, no noise overlay.

#### 2B: Restyle TopBar

**File:** `apps/web/src/components/layout/top-bar.tsx`

Replace the glass top bar with a sharp, dense bar:

```tsx
<header className="sticky top-0 z-30 flex h-12 w-full items-center
                    justify-between border-b border-zinc-800 bg-black
                    px-3 pt-safe">
  <NavTrigger />
  <Link href="/chat"
    className="flex flex-1 items-center gap-2 px-1 text-sm
               font-semibold tracking-tight text-fg">
    <span className="inline-flex size-6 items-center justify-center
                     bg-fg text-black rounded-sm">
      <span className="text-xs font-bold">H</span>
    </span>
    <span className="text-fg">HamaFX<span className="text-fg-subtle">·Ai</span></span>
  </Link>
  <div className="flex min-w-[44px] items-center justify-end gap-2">
    {right}
  </div>
</header>
```

**Key changes:**
- `glass-strong` → `bg-black border-b border-zinc-800`
- `rounded-full` → `rounded-sm` on brand mark
- Remove inline `boxShadow` and `height` style — use `h-12` class
- Remove `pointer-events-none` wrapper — not needed without glass
- Remove `max-w-2xl` constraint on the bar itself — let it span full width
  (the content inside can still be constrained)

#### 2C: Restyle ChatTopBar

**File:** `apps/web/src/components/chat/chat-top-bar.tsx`

Replace the glass surface with the sharp status bar per §2.1.3. The component
logic (menu trigger, thread title, pinned symbol, analysis mode, new chat,
more menu, thread list drawer) stays identical — only the styling changes.

**Find and replace all:**
- `glass-strong` → `bg-black border-b border-zinc-800`
- `rounded-full` → `rounded-sm`
- `rounded-3xl` → `rounded-sm`
- `rounded-2xl` → `rounded-sm`
- `rounded-xl` → `rounded-sm`
- `rounded-lg` → `rounded-sm`
- `backdrop-blur` → remove
- `shadow-lg` → remove
- `border-divider/60` → `border-zinc-800`
- Any inline `boxShadow` referencing `oklch` or `var(--shadow-*)` → remove
- Any inline `backgroundImage` referencing `var(--gradient-*)` → remove

#### 2D: Restructure ChatScreen for Desktop Grid

**File:** `apps/web/src/components/chat/chat-screen.tsx`

Modify the root `div` to support the 12-column grid at `xl:`:

**Current root:**
```tsx
<div className="bg-bg paint-isolated fixed inset-0 z-50 flex flex-col">
```

**Replace with:**
```tsx
<div className="bg-black paint-isolated fixed inset-0 z-50
                flex flex-col xl:grid xl:grid-cols-12
                xl:h-screen xl:w-full xl:overflow-hidden">
```

Then restructure the children into the three-column layout per §2.2.1.
The left `<aside>` and right `<aside>` are `hidden xl:flex`. The center
`<section>` spans `xl:col-span-6`.

**The mobile layout (flex flex-col) remains the default.** The grid only
activates at `xl:`. This means:
- Mobile: top bar → scroll area → composer (vertical flex)
- Desktop: 3-column grid (left aside | center section | right aside)

**The existing `ChatTopBar` component** renders inside the center `<section>`
on desktop (as the sticky top asset banner). On mobile it renders as the
pinned top status bar. The component itself doesn't need to know which
layout it's in — it just renders its content and the parent grid positions it.

**The `Composer`** renders inside the center `<section>` bottom on desktop,
and as the bottom-docked module on mobile. On mobile, the composer wrapper
keeps `fixed bottom-0 left-0 right-0 z-50`. On desktop, it's in-flow within
the section's flex layout.

**Implementation approach:** Use a wrapper that conditionally positions:

```tsx
{/* Composer wrapper */}
<div className="fixed bottom-0 left-0 right-0 z-50
                border-t border-zinc-800 bg-black pb-safe
                xl:static xl:border-t xl:border-zinc-800
                xl:z-auto xl:pb-0">
  <div className="mx-auto w-full md:max-w-2xl xl:max-w-none xl:px-4">
    <Composer ... />
  </div>
</div>
```

#### 2E: Update (app)/layout.tsx

**File:** `apps/web/src/app/(app)/layout.tsx`

- Keep `<AmbientBackground />` import (it now returns null)
- Update `<main>` to add `xl:max-w-7xl xl:px-6` for wider desktop pages
- Remove `text-fg relative min-h-svh` → `bg-black text-fg relative min-h-svh`
  (explicit bg-black for safety)

---

### TASK 3: Refactor AI Message Processing Layout — Streaming CLS Elimination

**Files to modify:**
- `apps/web/src/components/chat/parts/text.tsx`
- `apps/web/src/components/chat/message-list.tsx`
- `apps/web/src/components/chat/message.tsx`
- `apps/web/src/components/chat/composer.tsx`
- `apps/web/src/components/chat/quick-prompts.tsx`

#### 3A: Update TextPart Streaming Container

**File:** `apps/web/src/components/chat/parts/text.tsx`

Per §3.1, update the streaming container:
- `leading-relaxed` → `leading-[1.4]`
- Add `tracking-tight`
- Fix `bg-text-fg` → `bg-fg`
- Add explicit `text-fg`

Per §3.2, update ALL `ReactMarkdown` component overrides with the exact
table, list, code, heading, paragraph, link, and blockquote rules.

Per §3.2.4, update the `CodeBlock` wrapper:
- `rounded-xl` → `rounded-sm`
- `bg-bg-elev-1/60` → `bg-zinc-950`
- `border-divider` → `border-zinc-800`
- Header bar: `bg-bg-elev-2/60` → `bg-zinc-900`, `border-divider/60` → `border-zinc-800`
- Copy button: `rounded-md` → `rounded-sm`
- Truncation toggle: `bg-bg-elev-2/30` → `bg-zinc-900`, `border-divider/40` → `border-zinc-800`

Per §3.2.3, update inline `code` element:
- `bg-bg-elev-2` → `bg-zinc-900`
- `text-fg-subtle` → `text-fg-muted`
- `rounded` → `rounded-sm`
- `border-divider` → `border-zinc-800`

#### 3B: Update MessageList Virtualization

**File:** `apps/web/src/components/chat/message-list.tsx`

The virtualization logic is correct — keep it. Update styling only:

**Typing indicator bubble:**
- `bg-bg-elev-1` → `bg-zinc-950`
- `border-divider` → `border-zinc-800`
- `rounded-3xl rounded-bl-md` → `rounded-sm`
- `bg-brand` dots → `bg-fg` dots (white dots on black)

**Container:**
- `px-4 py-4` — keep (padding for scroll area)
- No other changes needed — the virtualizer positioning is layout-stable

#### 3C: Update Message Component

**File:** `apps/web/src/components/chat/message.tsx`

Find and replace ALL rounded and glass references:
- `rounded-3xl` → `rounded-sm`
- `rounded-2xl` → `rounded-sm`
- `rounded-xl` → `rounded-sm`
- `rounded-lg` → `rounded-sm`
- `rounded-full` → `rounded-sm`
- `glass` / `glass-strong` → `bg-zinc-950 border border-zinc-800`
- `bg-bg-elev-1` → `bg-zinc-950` (for message bubbles)
- `border-divider` → `border-zinc-800`

**User message bubble:**
```tsx
<div className="bg-zinc-900 border border-zinc-800
                rounded-sm px-4 py-3 text-fg">
```

**Assistant message bubble:**
```tsx
<div className="bg-zinc-950 border border-zinc-800
                rounded-sm px-4 py-3 text-fg">
```

**Action row buttons (copy, regenerate, edit):**
```tsx
<button className="inline-flex size-8 items-center justify-center
                   border border-zinc-800 bg-zinc-950
                   text-fg-muted hover:text-fg hover:border-zinc-700
                   rounded-sm transition-colors">
```

#### 3D: Update Composer

**File:** `apps/web/src/components/chat/composer.tsx`

**Complete styling overhaul:**

1. **Root container:** Remove all glass/blur. Use solid `bg-black border-t border-zinc-800`.

2. **Textarea:**
```tsx
<textarea className="flex-1 resize-none border border-zinc-800
                     bg-zinc-950 text-fg placeholder:text-fg-subtle
                     rounded-sm px-3 py-2 font-sans text-sm
                     focus:outline-none focus:border-zinc-700
                     max-h-32 min-h-[44px] overflow-y-auto" />
```

3. **Send button:**
```tsx
<button className="shrink-0 inline-flex size-[44px] items-center
                   justify-center bg-fg text-black
                   hover:bg-fg-muted rounded-sm
                   disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors">
  <ArrowUp className="size-[18px]" strokeWidth={2.5} />
</button>
```

4. **Stop button (streaming state):**
```tsx
<button className="shrink-0 inline-flex size-[44px] items-center
                   justify-center border border-red-500/30
                   bg-red-500/10 text-red-500 rounded-sm
                   transition-colors">
  <Square className="size-[16px]" strokeWidth={2.5} />
</button>
```

5. **Mic button:**
```tsx
<button className="shrink-0 inline-flex size-[44px] items-center
                   justify-center border border-zinc-800
                   bg-zinc-950 text-fg-muted hover:text-fg
                   rounded-sm transition-colors">
  <Mic className="size-[18px]" />
</button>
```

6. **Image button:**
```tsx
<button className="shrink-0 inline-flex size-[44px] items-center
                   justify-center border border-zinc-800
                   bg-zinc-950 text-fg-muted hover:text-fg
                   rounded-sm transition-colors">
  <ImagePlus className="size-[18px]" />
</button>
```

7. **Image thumbnail rail:**
```tsx
<div className="flex gap-2 mb-2">
  {images.map(img => (
    <div className="relative border border-zinc-800 rounded-sm
                    overflow-hidden size-16">
      <img src={img.url} alt={img.name}
           className="size-full object-cover" />
      <button className="absolute top-0 right-0 bg-black/80
                        text-fg p-0.5">
        <X className="size-3" />
      </button>
    </div>
  ))}
</div>
```

8. **Character counter:**
```tsx
<span className="font-mono text-xs tabular-nums text-fg-subtle">
  {formatCharCount(text.length)}
</span>
```

9. **Keyboard hint:**
```tsx
<span className="hidden md:block font-mono text-xs text-fg-subtle">
  Enter to send · Shift+Enter for new line
</span>
```

10. **Remove ALL inline styles** that reference `var(--gradient-*)`, `var(--shadow-brand-*)`, `oklch(*)`, or `boxShadow`.

#### 3E: Update QuickPrompts

**File:** `apps/web/src/components/chat/quick-prompts.tsx`

**Replace the prompt card styling:**

Current:
```tsx
<button className="bg-bg-elev-1 border border-divider text-fg
                   hover:bg-bg-elev-2 ... rounded-2xl ...">
```

Replace with:
```tsx
<button className="border border-zinc-800 bg-zinc-950 text-fg
                   hover:bg-zinc-900 hover:border-zinc-700
                   flex h-14 items-center gap-3 rounded-sm
                   px-3 text-left text-sm font-medium
                   transition-colors">
  <span className="shrink-0 inline-flex size-8 items-center
                   justify-center rounded-sm border border-zinc-800
                   bg-zinc-900">
    <Icon className="size-4" strokeWidth={2} />
  </span>
  <span className="line-clamp-2 leading-snug">{p.label}</span>
</button>
```

**Key changes:**
- `rounded-2xl` → `rounded-sm`
- `h-16` → `h-14` (tighter)
- `size-10` icon → `size-8` (tighter)
- `rounded-xl` icon → `rounded-sm`
- Remove inline `background` and `boxShadow` styles
- Remove `p.bg` / `p.fg` color customization — all icons use `text-fg-muted`
  on a neutral `bg-zinc-900` surface. The prompt label carries the meaning,
  not the icon color.

**EmptyChatState icon container:**
```tsx
<span className="inline-flex size-16 items-center justify-center
                 border border-zinc-800 bg-zinc-950 rounded-sm">
  <Sparkles className="size-8 text-fg-muted" />
</span>
```

---

### TASK 4: Inject Data-Dense UI Styling — Tables, Micro-Badges, Metric Fields

**Files to modify (in order):**

#### 4A: UI Primitives

**File:** `apps/web/src/components/ui/button.tsx`

```tsx
const variants: Record<Variant, string> = {
  primary: 'bg-fg text-black font-semibold hover:bg-fg-muted',
  secondary: 'border border-zinc-800 bg-zinc-950 text-fg hover:bg-zinc-900',
  ghost: 'text-fg-muted hover:text-fg hover:bg-zinc-950',
  danger: 'bg-red-500 text-white font-semibold hover:bg-red-600',
  success: 'bg-emerald-500 text-black font-semibold hover:bg-emerald-600',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-sm',     // was h-10, rounded-xl
  md: 'h-10 px-4 text-sm rounded-sm',    // was h-12, rounded-xl
  lg: 'h-12 px-5 text-base rounded-sm',  // was h-14, rounded-xl
};
```

Remove ALL inline styles (`backgroundImage`, `boxShadow` referencing
gradients). The button is now a flat surface.

**File:** `apps/web/src/components/ui/stat-card.tsx`

```tsx
<div className={cn(
  'relative flex flex-col gap-2 overflow-hidden rounded-sm',
  'border border-zinc-800 border-l-2 bg-zinc-950 p-3',
  TONE_TINT[tone],
)}>
  <div className="text-fg-subtle flex items-center gap-1.5
                   text-xs font-semibold uppercase tracking-wider">
    {icon}
    <span>{label}</span>
  </div>
  <div className={cn(
    'font-mono text-lg font-bold tabular-nums leading-none tracking-tight',
    TONE_CLASS[tone],
  )}>
    {value}
  </div>
  {sparkline ? <Sparkline ... /> : <div className="h-6" />}
</div>
```

**Tone mappings:**
```tsx
const TONE_CLASS: Record<StatTone, string> = {
  fg: 'text-fg',
  bull: 'text-emerald-500',
  bear: 'text-red-500',
  muted: 'text-fg-muted',
  warn: 'text-amber-500',
};

const TONE_TINT: Record<StatTone, string> = {
  fg: '',
  bull: 'border-l-emerald-500/40',
  bear: 'border-l-red-500/40',
  muted: '',
  warn: 'border-l-amber-500/40',
};
```

**Changes:** `rounded-lg` → `rounded-sm`, `p-4` → `p-3`, `text-numeric-lg` → `text-lg font-mono`.

**File:** `apps/web/src/components/ui/skeleton.tsx`

```tsx
// Skeleton
<div className="shimmer rounded-sm" ... />

// SkeletonCard
<div className="border border-zinc-800 bg-zinc-950/60
                flex flex-col gap-2 overflow-hidden rounded-sm p-3" ... />
```

**File:** `apps/web/src/components/ui/empty-state.tsx`

```tsx
<div className={cn(
  'flex flex-col items-center gap-5 px-6 py-10 text-center',
  !bare && 'border border-zinc-800 bg-zinc-950 rounded-sm',
  className,
)}>
  <span className={cn(
    'inline-flex items-center justify-center rounded-sm border',
    tone === 'brand'
      ? 'text-fg border-zinc-800 bg-zinc-900 h-16 w-16'
      : 'text-fg-muted border-zinc-800 bg-zinc-900 h-14 w-14',
  )}>
    {icon}
  </span>
  ...
</div>
```

**Changes:** `rounded-lg` → `rounded-sm`, `bg-brand/10` → `bg-zinc-900 border`, remove `text-brand` → `text-fg`.

**File:** `apps/web/src/components/ui/symbol-chip.tsx`

```tsx
<span className={cn(
  'inline-flex items-center gap-1 border border-zinc-800
   bg-zinc-950 text-fg-muted px-2 py-0.5
   text-xs font-bold uppercase tabular-nums rounded-sm',
  className,
)}>
  <span>{symbol}</span>
  {removable && (
    <button className="inline-flex size-4 items-center justify-center
                       rounded-sm hover:bg-zinc-800 transition-colors">
      <X className="size-2.5" strokeWidth={3} />
    </button>
  )}
</span>
```

**Changes:** `bg-brand/15 text-brand ring-brand/30 rounded-full ring-1` → `border border-zinc-800 bg-zinc-950 text-fg-muted rounded-sm`.

**File:** `apps/web/src/components/ui/segmented.tsx`

Update the segmented control container and items:
- Container: `border border-zinc-800 bg-zinc-950 rounded-sm` (was `rounded-full`)
- Active indicator: `bg-fg text-black rounded-sm` (was gradient/glass)
- Items: `rounded-sm` (was `rounded-full`)

**File:** `apps/web/src/components/ui/sparkline.tsx`

Per §3.3: `strokeWidth="2"` → `strokeWidth="1"`, `strokeLinecap="round"` → `strokeLinecap="square"`, `strokeLinejoin="round"` → `strokeLinejoin="miter"`.

**File:** `apps/web/src/components/ui/input.tsx`

```tsx
<input className={cn(
  'w-full border border-zinc-800 bg-zinc-950 text-fg
   placeholder:text-fg-subtle rounded-sm px-3 py-2
   font-sans text-sm focus:outline-none focus:border-zinc-700',
  className,
)} />
```

#### 4B: Chat Tool Part Renderers

**All files in:** `apps/web/src/components/chat/parts/`

For EVERY tool part renderer, apply these global find-and-replace patterns:

| Find | Replace |
|------|---------|
| `rounded-lg` | `rounded-sm` |
| `rounded-xl` | `rounded-sm` |
| `rounded-2xl` | `rounded-sm` |
| `rounded-3xl` | `rounded-sm` |
| `rounded-full` | `rounded-sm` |
| `rounded-md` | `rounded-sm` |
| `bg-bg-elev-1` | `bg-zinc-950` |
| `bg-bg-elev-2` | `bg-zinc-900` |
| `bg-bg-elev-2/60` | `bg-zinc-900` |
| `bg-bg-elev-2/30` | `bg-zinc-900/50` |
| `border-border` | `border-zinc-800` |
| `border-divider` | `border-zinc-900` |
| `border-divider/40` | `border-zinc-900` |
| `border-divider/30` | `border-zinc-900` |
| `border-divider/20` | `border-zinc-900/50` |
| `border-divider/60` | `border-zinc-800` |
| `text-bull` | `text-emerald-500` |
| `text-bear` | `text-red-500` |
| `text-warn` | `text-amber-500` |
| `text-info` | `text-blue-500` |
| `bg-bull/10` | `bg-emerald-500/10` |
| `bg-bear/10` | `bg-red-500/10` |
| `bg-warn/10` | `bg-amber-500/10` |
| `bg-info/10` | `bg-blue-500/10` |
| `bg-bull` | `bg-emerald-500` |
| `bg-bear` | `bg-red-500` |
| `border-bear/30` | `border-red-500/30` |
| `border-bear/40` | `border-red-500/40` |
| `text-brand` | `text-fg` |
| `bg-brand` | `bg-fg` |
| `bg-brand/15` | `bg-zinc-900` |
| `bg-brand/10` | `bg-zinc-900` |
| `bg-brand/30` | `bg-zinc-800` |
| `text-brand-fg` | `text-black` |
| `hover:bg-brand/25` | `hover:bg-zinc-800` |
| `ring-brand/30` | `ring-zinc-700` |
| `ring-brand/40` | `ring-zinc-700` |
| `focus-visible:ring-brand` | `focus-visible:ring-fg` |
| `border-l-bull/40` | `border-l-emerald-500/40` |
| `border-l-bear/40` | `border-l-red-500/40` |
| `border-l-warn/40` | `border-l-amber-500/40` |

**Specific files and additional changes:**

**`get-price.tsx`:**
- Card: `border-border bg-bg-elev-1 rounded-lg` → `border-zinc-800 bg-zinc-950 rounded-sm`
- Header text: `text-fg-muted` → `text-fg-subtle`
- Price value: `text-fg text-base` → `text-fg font-mono text-base tabular-nums`
- Spread: `text-fg-muted text-xs` → `text-fg-subtle font-mono text-xs tabular-nums`

**`get-candles.tsx`:**
- Card: same pattern as get-price
- OHLC values: add `font-mono tabular-nums`
- Bull/bear coloring: `text-bull` → `text-emerald-500`, `text-bear` → `text-red-500`
- Bar time: add `font-mono`

**`get-indicators.tsx`:**
- Same card pattern
- All indicator values: `font-mono tabular-nums`
- RSI coloring: `text-bull` → `text-emerald-500`, `text-bear` → `text-red-500`
- MACD histogram: same color mapping

**`get-news.tsx`:**
- Card: same pattern
- Sentiment dot: `bg-bull` → `bg-emerald-500`, `bg-bear` → `bg-red-500`, `bg-fg-muted` → `bg-zinc-500`
- Timestamp: add `font-mono`
- Link: `text-brand` → `text-fg underline underline-offset-2`

**`analyze-technical.tsx`:**
- Card: same pattern
- TfCard: `border-border bg-bg-elev-2 rounded-md` → `border-zinc-800 bg-zinc-900 rounded-sm`
- All numeric `dd` elements: add `font-mono`
- Bias/trend coloring: `text-bull` → `text-emerald-500`, `text-bear` → `text-red-500`
- Link: `text-brand` → `text-fg`
- Skeleton: `bg-bg-elev-2` → `bg-zinc-900`, `rounded-md` → `rounded-sm`

**`convene-committee.tsx`:**
- GradeBadge: `bg-bull/10 text-bull` → `bg-emerald-500/10 text-emerald-500`
- `bg-warn/10 text-warn` → `bg-amber-500/10 text-amber-500`
- `bg-bear/10 text-bear` → `bg-red-500/10 text-red-500`
- `rounded` → `rounded-sm`
- Card: same pattern as above

**`plan.tsx`:**
- Card: `border-divider/60 bg-bg-elev-1 rounded-2xl` → `border-zinc-800 bg-zinc-950 rounded-sm`
- Progress bar: `bg-brand/30` → `bg-fg/30`
- `rounded-full` → `rounded-sm`
- `rounded-2xl` → `rounded-sm`
- `text-brand` → `text-fg`
- `bg-brand` → `bg-fg`
- Step numbers: `font-mono text-caption tabular-nums` — keep, add `text-fg-subtle`
- Expected tools chips: `bg-bg-elev-2` → `bg-zinc-900`, `rounded` → `rounded-sm`

**`tool-card.tsx`:**
- Card: `border-border bg-bg-elev-1 rounded-md` → `border-zinc-800 bg-zinc-950 rounded-sm`
- `border-bear/30` → `border-red-500/30`
- Section pre: `bg-bg` → `bg-black`, `rounded` → `rounded-sm`
- `text-fg-subtle` labels: keep

**`agent-deliberation.tsx`:**
- All `rounded-full` → `rounded-sm`
- All `rounded-2xl` → `rounded-sm`
- `bg-brand` → `bg-fg`
- `text-brand` → `text-fg`
- `bg-bg-elev-3` → `bg-zinc-800`
- `bg-fg-muted` → `bg-zinc-500`
- Agent ring: `var(--color-brand)` → `#FAFAFA` in the conic-gradient
- Bias bars: `bg-bull` → `bg-emerald-500`, `bg-bear` → `bg-red-500`

#### 4C: Layout Components

**File:** `apps/web/src/components/layout/nav-drawer.tsx`

- Drawer surface: `glass-strong` → `bg-zinc-900 border-r border-zinc-800`
- Nav item active: `oklch(82% 0.14 85 / 0.18)` → `bg-zinc-800`
- Nav item inactive: `oklch(20% 0 0 / 0.6)` → `bg-zinc-950/60`
- Icon container: `rounded-xl` → `rounded-sm`
- Badge: `bg-brand/15 text-brand rounded-full` → `bg-zinc-800 text-fg rounded-sm`
- All `rounded-full` → `rounded-sm`
- Remove inline `boxShadow` references
- `text-brand` → `text-fg`

**File:** `apps/web/src/components/layout/page-header.tsx`

- `rounded-lg` → `rounded-sm`
- `bg-bg-elev-1` → `bg-zinc-950`
- `border-divider` → `border-zinc-800`

**File:** `apps/web/src/components/layout/offline-banner.tsx`

- `rounded-full` → `rounded-sm`
- `glass` → `bg-zinc-900 border border-zinc-800`

**File:** `apps/web/src/components/layout/command-palette.tsx`

- `glass-strong` → `bg-zinc-900 border border-zinc-800`
- `rounded-2xl` → `rounded-sm`
- `rounded-xl` → `rounded-sm`
- `rounded-lg` → `rounded-sm`
- `bg-bg-elev-1` → `bg-zinc-950`
- `bg-bg-elev-2` → `bg-zinc-900`

**File:** `apps/web/src/components/layout/install-nudge.tsx`

- `glass` → `bg-zinc-900 border border-zinc-800`
- `rounded-xl` → `rounded-sm`
- `rounded-full` → `rounded-sm`

#### 4D: Page-Level Components

**File:** `apps/web/src/app/(app)/dashboard/_components/dashboard-canvas.tsx`

- Widget wrapper: `rounded-lg` → `rounded-sm`, `bg-bg-elev-1` → `bg-zinc-950`, `border-divider` → `border-zinc-800`
- Grid: `grid-cols-1 md:grid-cols-2` → `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
- Customize toggle: `rounded-md` → `rounded-sm`
- Add widget dropdown: `rounded-md` → `rounded-sm`, `bg-bg-elev-1` → `bg-zinc-950`, `bg-bg-elev-2` → `bg-zinc-900`

**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/watchlist-widget.tsx`

- Section: `border-divider bg-bg-elev-1 rounded-lg` → `border-zinc-800 bg-zinc-950 rounded-sm`
- Row borders: `border-divider/40` → `border-zinc-900`
- Sparkline: per §3.3
- `text-bull` → `text-emerald-500`, `text-bear` → `text-red-500`
- Price: add `font-mono tabular-nums`

**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/briefing-widget.tsx`
**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/calendar-widget.tsx`
**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/news-pulse-widget.tsx`
**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/alerts-widget.tsx`
**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/open-positions-widget.tsx`
**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/equity-curve-widget.tsx`
**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/pnl-heatmap-widget.tsx`
**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/stats-widget.tsx`
**File:** `apps/web/src/app/(app)/dashboard/_components/widgets/today-glance-widget.tsx`

For ALL widget files, apply the global find-and-replace table from §4B.

**File:** `apps/web/src/app/(app)/signals/_components/signals-dashboard.tsx`

- StatCard: `rounded-lg border border-divider bg-bg-elev-1` → `rounded-sm border border-zinc-800 bg-zinc-950`
- SignalCard: same pattern
- Status badges: `bg-info/10 text-info` → `bg-blue-500/10 text-blue-500`, `bg-warn/10 text-warn` → `bg-amber-500/10 text-amber-500`, `bg-bull/10 text-bull` → `bg-emerald-500/10 text-emerald-500`, `bg-bear/10 text-bear` → `bg-red-500/10 text-red-500`
- `text-bull` → `text-emerald-500`, `text-bear` → `text-red-500`
- All numeric values: add `font-mono tabular-nums`
- `rounded` → `rounded-sm`

**File:** `apps/web/src/app/(app)/journal/_components/stats-summary.tsx`

- StatCard usage: tokens already updated via the primitive
- Distribution bars: `bg-brand` → `bg-fg`
- `bg-bg-elev-2` → `bg-zinc-900`
- `rounded` → `rounded-sm`
- All numerics: `font-mono tabular-nums`

**File:** `apps/web/src/app/(app)/journal/_components/analytics/breakdown-table.tsx`

- Container: `border border-divider bg-bg-elev-1 rounded-lg` → `border border-zinc-800 bg-zinc-950 rounded-sm`
- Header: `bg-bg-elev-2` → `bg-zinc-900`
- Row borders: `border-divider/30` → `border-zinc-900`
- `text-bull` → `text-emerald-500`, `text-bear` → `text-red-500`
- All numerics: already have `tabular-nums` — add `font-mono`

**File:** `apps/web/src/app/(app)/journal/_components/analytics/drawdown-chart.tsx`
**File:** `apps/web/src/app/(app)/journal/_components/analytics/r-distribution.tsx`
**File:** `apps/web/src/app/(app)/journal/_components/analytics/streak-display.tsx`

Apply the global find-and-replace table from §4B to each.

**File:** `apps/web/src/app/(app)/journal/_components/entry-list.tsx`
**File:** `apps/web/src/app/(app)/journal/_components/entry-form.tsx`
**File:** `apps/web/src/app/(app)/journal/_components/journal-view.tsx`
**File:** `apps/web/src/app/(app)/journal/_components/ai-review-panel.tsx`
**File:** `apps/web/src/app/(app)/journal/_components/import-trades.tsx`

Apply the global find-and-replace table from §4B to each.

**File:** `apps/web/src/app/(app)/news/_components/news-view.tsx`
**File:** `apps/web/src/app/(app)/news/_components/news-toolbar.tsx`
**File:** `apps/web/src/app/(app)/news/_components/sentiment-summary.tsx`
**File:** `apps/web/src/app/(app)/news/_components/refresh-button.tsx`

Apply the global find-and-replace table from §4B to each.

**File:** `apps/web/src/app/(app)/calendar/_components/calendar-view.tsx`
**File:** `apps/web/src/app/(app)/calendar/_components/calendar-toolbar.tsx`
**File:** `apps/web/src/app/(app)/calendar/_components/calendar-hero.tsx`
**File:** `apps/web/src/components/calendar/event-card.tsx`

Apply the global find-and-replace table from §4B to each.

**File:** `apps/web/src/app/(app)/alerts/_components/alert-list.tsx`
**File:** `apps/web/src/app/(app)/alerts/_components/alert-form.tsx`

Apply the global find-and-replace table from §4B to each.

**File:** `apps/web/src/app/(app)/chart/[symbol]/_components/chart-view.tsx`
**File:** `apps/web/src/app/(app)/chart/[symbol]/_components/overlay-sheet.tsx`
**File:** `apps/web/src/app/(app)/chart/[symbol]/_components/pro-chart-view.tsx`
**File:** `apps/web/src/app/(app)/chart/[symbol]/_components/chart-empty.tsx`
**File:** `apps/web/src/app/(app)/chart/[symbol]/_components/chart-skeleton.tsx`

Apply the global find-and-replace table from §4B to each.

**File:** `apps/web/src/app/(app)/settings/_components/*.tsx`

For ALL settings components, apply the global find-and-replace table from §4B.
Settings cards: `rounded-lg` → `rounded-sm`, `bg-bg-elev-1` → `bg-zinc-950`, `border-divider` → `border-zinc-800`.

**File:** `apps/web/src/app/(app)/settings/_components/settings-nav.tsx`
**File:** `apps/web/src/app/(app)/settings/_components/settings-row.tsx`
**File:** `apps/web/src/app/(app)/settings/_components/settings-section.tsx`

Apply the global find-and-replace table from §4B.

**File:** `apps/web/src/app/(app)/settings/_components/appearance-card.tsx`

This file likely controls the theme toggle. Since light theme is deleted,
remove the light/dark toggle UI. The app is permanently dark. Replace the
appearance card with a read-only "Theme: Terminal Dark" label or remove it
entirely from the settings nav.

#### 4E: Auth Pages

**File:** `apps/web/src/app/(auth)/layout.tsx`
**File:** `apps/web/src/app/(auth)/login/layout.tsx`
**File:** `apps/web/src/app/(auth)/forgot-password/layout.tsx`
**File:** `apps/web/src/app/(auth)/reset-password/layout.tsx`

- Remove `<AmbientBackground intensity="vivid" />` → replace with `null` or a simple `bg-black` div
- All `rounded-xl`, `rounded-2xl`, `rounded-3xl` → `rounded-sm`
- All `glass` → `bg-zinc-950 border border-zinc-800`
- All `bg-bg-elev-1` → `bg-zinc-950`
- All `bg-bg-elev-2` → `bg-zinc-900`
- All gradient references → remove
- All `text-brand` → `text-fg`

#### 4F: Onboarding Page

**File:** `apps/web/src/app/onboarding/layout.tsx`
**File:** `apps/web/src/components/onboarding/*.tsx`

Apply the global find-and-replace table from §4B to all onboarding components.

#### 4G: Loading States

**All `loading.tsx` files** in `apps/web/src/app/(app)/*/loading.tsx`:

These files typically render `<SkeletonCard>` or `<Skeleton>` primitives.
Since the primitives are updated in §4A, the loading files should work
automatically. Verify no hardcoded `rounded-lg` or `bg-bg-elev-*` classes
exist in any loading file.

#### 4H: Error States

**All `error.tsx` files** in `apps/web/src/app/(app)/*/error.tsx`:

Apply the global find-and-replace table from §4B.

---

### TASK 5: Final Sweep & Verification

After completing Tasks 1–4, run these verification commands:

```bash
# 1. Verify NO glassmorphism or backdrop-blur remains
grep -rn "backdrop-blur\|backdrop-filter\|glass-strong\|glass-subtle\|card-premium" apps/web/src/
# Expected: ZERO results

# 2. Verify NO ambient gradient orbs
grep -rn "float-orb\|ambient-orb\|AmbientBackground.*intensity" apps/web/src/
# Expected: ZERO results (AmbientBackground returns null)

# 3. Verify NO rounded-full or rounded-3xl/2xl/xl/lg
grep -rn "rounded-full\|rounded-3xl\|rounded-2xl\|rounded-xl\|rounded-lg" apps/web/src/
# Expected: ZERO results

# 4. Verify NO gradient references in inline styles
grep -rn "gradient-brand\|gradient-danger\|gradient-accent\|gradient-brand-soft" apps/web/src/
# Expected: ZERO results

# 5. Verify NO oklch references in component files (only globals.css should have them, and even there they're replaced with hex)
grep -rn "oklch" apps/web/src/
# Expected: ZERO results (all replaced with hex or Tailwind zinc utilities)

# 6. Verify NO glow shadows
grep -rn "glow-brand\|glow-accent\|shadow-glow" apps/web/src/
# Expected: ZERO results

# 7. Verify font-mono is used on all numeric displays (manual spot check)
grep -rn "tabular-nums" apps/web/src/components/chat/parts/
# Expected: multiple results — every tool part renderer should have tabular-nums

# 8. Type check
pnpm typecheck

# 9. Lint
pnpm lint

# 10. Build
pnpm --filter @hamafx/web build
```

---

## 5. ANTI-AI-SLOP CONSTRAINT MATRIX (PRINT AND PIN)

The downstream agent MUST NOT introduce any of the following. If any of
these appear in a generated file, the file is rejected and must be rewritten.

| # | Constraint | Rationale |
|---|------------|-----------|
| 1 | NO ambient glowing radial backgrounds or blurred mesh gradients | AI-slop trope. Institutional terminals don't glow. |
| 2 | NO glassmorphism (`bg-opacity` with heavy `backdrop-blur`) | Reduces text contrast. Data must be legible. |
| 3 | Max border-radius: `rounded-sm` (2px) or `rounded-md` (4px) | Sharp geometry. No pills, no blobs. |
| 4 | NO `rounded-full`, `rounded-3xl`, `rounded-2xl`, `rounded-xl`, `rounded-lg` | Enforces #3. |
| 5 | NO gradient backgrounds (`bg-gradient-*`, `var(--gradient-*)`) | Flat surfaces only. Data-first. |
| 6 | NO glow shadows (`shadow-glow-*`, colored `boxShadow`) | Distracts from data. |
| 7 | NO floating orb animations (`float-orb-*`, `animate-reveal`) | Decorative noise. |
| 8 | NO light theme | This is a dark-only terminal. |
| 9 | NO champagne gold / amber brand color | Brand is white-on-black. Neutral. |
| 10 | ALL numeric values use `font-mono` + `tabular-nums` | Data alignment and density. |
| 11 | NO `backdrop-filter` / `-webkit-backdrop-filter` in any CSS | Performance + contrast. |
| 12 | NO inline `style` referencing `oklch()`, `var(--gradient-*)`, or `var(--shadow-glow-*)` | Tokens are flat hex now. |
| 13 | SVG paths: `fill="none"`, `strokeWidth="1"`, sharp caps | Crisp data viz, no decorative curves. |
| 14 | NO `animate-reveal` or scroll-driven entrance animations | Content appears instantly. |
| 15 | NO `motion` spring/entrance on data elements | Motion is reserved for expand/collapse only (tool cards, plan pills). |

---

## 6. COMPONENT-BY-COMPONENT FILE MAP

For the downstream agent's reference. Every file that needs changes is
listed here with a one-line summary of what changes.

### globals.css
`apps/web/src/app/globals.css` — Replace all theme tokens, delete glass/gradient/float utilities, update md-prose and shiki CSS.

### Layout Shell
| File | Change |
|------|--------|
| `apps/web/src/app/layout.tsx` | No structural change. Body already uses `bg-bg text-fg`. Tokens update automatically. |
| `apps/web/src/app/(app)/layout.tsx` | Add `xl:max-w-7xl xl:px-6` to main. Add `bg-black` to root div. AmbientBackground returns null. |
| `apps/web/src/components/layout/ambient-background.tsx` | Return `null`. |
| `apps/web/src/components/layout/top-bar.tsx` | Replace glass with sharp `bg-black border-b border-zinc-800 h-12`. |
| `apps/web/src/components/layout/nav-drawer.tsx` | Replace glass/gradient with flat surfaces. All `rounded-*` → `rounded-sm`. |
| `apps/web/src/components/layout/page-header.tsx` | Token replacement. |
| `apps/web/src/components/layout/offline-banner.tsx` | Token replacement. |
| `apps/web/src/components/layout/command-palette.tsx` | Token replacement. |
| `apps/web/src/components/layout/install-nudge.tsx` | Token replacement. |

### Chat Surface
| File | Change |
|------|--------|
| `apps/web/src/components/chat/chat-screen.tsx` | Add xl:grid-cols-12 layout. Three-column desktop grid. |
| `apps/web/src/components/chat/chat-top-bar.tsx` | Replace glass with sharp status bar. |
| `apps/web/src/components/chat/composer.tsx` | Complete restyle. Sharp inputs, flat buttons, no glass. |
| `apps/web/src/components/chat/message-list.tsx` | Token replacement on typing indicator. |
| `apps/web/src/components/chat/message.tsx` | Token replacement on all bubble/action elements. |
| `apps/web/src/components/chat/quick-prompts.tsx` | Restyle prompt cards. Remove icon color customization. |
| `apps/web/src/components/chat/parts/text.tsx` | Streaming CLS fix. Markdown component overrides per §3.2. |
| `apps/web/src/components/chat/parts/tool-card.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/plan.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/agent-deliberation.tsx` | Token replacement. Ring color → white. |
| `apps/web/src/components/chat/parts/get-price.tsx` | Token replacement + font-mono. |
| `apps/web/src/components/chat/parts/get-candles.tsx` | Token replacement + font-mono. |
| `apps/web/src/components/chat/parts/get-indicators.tsx` | Token replacement + font-mono. |
| `apps/web/src/components/chat/parts/get-news.tsx` | Token replacement + font-mono. |
| `apps/web/src/components/chat/parts/get-calendar.tsx` | Token replacement + font-mono. |
| `apps/web/src/components/chat/parts/analyze-technical.tsx` | Token replacement + font-mono. |
| `apps/web/src/components/chat/parts/analyze-fundamental.tsx` | Token replacement + font-mono. |
| `apps/web/src/components/chat/parts/convene-committee.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/compute-risk.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/compute-position-health.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/forecast-volatility.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/get-correlation.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/get-cot.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/get-intermarket.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/get-intermarket-resonance.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/get-market-structure.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/get-portfolio-snapshot.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/get-seasonality.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/get-session-levels.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/get-social-sentiment.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/get-system-diagnostics.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/log-journal.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/set-alert.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/analyze-chart-image.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/annotate-chart.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/replay-setup.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/run-system-action.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/search-knowledge.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/share-snapshot.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/summarize-thread.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/verify-call.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/citation-warning.tsx` | Token replacement. |
| `apps/web/src/components/chat/parts/fallback.tsx` | Token replacement. |
| `apps/web/src/components/chat/_components/message-footer.tsx` | Token replacement. |
| `apps/web/src/components/chat/_components/regen-model-picker.tsx` | Token replacement. |
| `apps/web/src/components/chat/_components/thread-summary-header.tsx` | Token replacement. |

### UI Primitives
| File | Change |
|------|--------|
| `apps/web/src/components/ui/button.tsx` | Flat variants. Remove gradient inline styles. `rounded-xl` → `rounded-sm`. |
| `apps/web/src/components/ui/stat-card.tsx` | Token replacement. `font-mono` on values. |
| `apps/web/src/components/ui/skeleton.tsx` | Token replacement. |
| `apps/web/src/components/ui/empty-state.tsx` | Token replacement. |
| `apps/web/src/components/ui/symbol-chip.tsx` | Token replacement. `rounded-full` → `rounded-sm`. |
| `apps/web/src/components/ui/segmented.tsx` | Token replacement. `rounded-full` → `rounded-sm`. |
| `apps/web/src/components/ui/sparkline.tsx` | `strokeWidth="1"`, sharp caps. |
| `apps/web/src/components/ui/input.tsx` | Token replacement. |
| `apps/web/src/components/ui/drawer.tsx` | Token replacement. |
| `apps/web/src/components/ui/tooltip.tsx` | Token replacement. |
| `apps/web/src/components/ui/switch.tsx` | Token replacement. |
| `apps/web/src/components/ui/toaster.tsx` | Token replacement. |
| `apps/web/src/components/ui/confirm-drawer.tsx` | Token replacement. |
| `apps/web/src/components/ui/animated-number.tsx` | Token replacement. |
| `apps/web/src/components/ui/stale-indicator.tsx` | Token replacement. |
| `apps/web/src/components/ui/provider-info-dot.tsx` | Token replacement. |
| `apps/web/src/components/ui/tag-input.tsx` | Token replacement. |
| `apps/web/src/components/ui/motion-config.tsx` | No change needed. |

### Page Components
| File | Change |
|------|--------|
| `apps/web/src/app/(app)/dashboard/_components/dashboard-canvas.tsx` | Grid + token replacement. |
| `apps/web/src/app/(app)/dashboard/_components/widgets/*.tsx` | Token replacement (10 files). |
| `apps/web/src/app/(app)/journal/_components/*.tsx` | Token replacement (8 files). |
| `apps/web/src/app/(app)/news/_components/*.tsx` | Token replacement (4 files). |
| `apps/web/src/app/(app)/calendar/_components/*.tsx` | Token replacement (3 files). |
| `apps/web/src/app/(app)/alerts/_components/*.tsx` | Token replacement (2 files). |
| `apps/web/src/app/(app)/signals/_components/signals-dashboard.tsx` | Token replacement. |
| `apps/web/src/app/(app)/chart/[symbol]/_components/*.tsx` | Token replacement (5 files). |
| `apps/web/src/app/(app)/settings/_components/*.tsx` | Token replacement (~20 files). |
| `apps/web/src/app/(auth)/*/layout.tsx` | Remove AmbientBackground, token replacement. |
| `apps/web/src/app/onboarding/layout.tsx` | Token replacement. |
| `apps/web/src/components/onboarding/*.tsx` | Token replacement. |

### Shared Components
| File | Change |
|------|--------|
| `apps/web/src/components/calendar/event-card.tsx` | Token replacement. |
| `apps/web/src/components/news/article-card.tsx` | Token replacement. |
| `apps/web/src/components/chart/*.tsx` | Token replacement (chart components). |
| `apps/web/src/components/providers/*.tsx` | No visual change needed. |

---

## 7. EXECUTION ORDER SUMMARY

1. **Task 1** → `globals.css` (foundation — all tokens flow from here)
2. **Task 2A** → `ambient-background.tsx` (gut the orbs)
3. **Task 2B** → `top-bar.tsx` (sharp top bar)
4. **Task 2C** → `chat-top-bar.tsx` (sharp chat status bar)
5. **Task 2D** → `chat-screen.tsx` (desktop grid shell)
6. **Task 2E** → `(app)/layout.tsx` (wider desktop main)
7. **Task 3A** → `text.tsx` (streaming CLS + markdown rules)
8. **Task 3B** → `message-list.tsx` (typing indicator)
9. **Task 3C** → `message.tsx` (bubbles + actions)
10. **Task 3D** → `composer.tsx` (input + buttons)
11. **Task 3E** → `quick-prompts.tsx` (prompt cards)
12. **Task 4A** → All UI primitives (button, stat-card, skeleton, empty-state, symbol-chip, segmented, sparkline, input)
13. **Task 4B** → All chat tool parts (35+ files — apply global find-and-replace)
14. **Task 4C** → All layout components (nav-drawer, command-palette, etc.)
15. **Task 4D** → All page components (dashboard, journal, news, calendar, alerts, signals, chart, settings)
16. **Task 4E** → Auth pages
17. **Task 4F** → Onboarding
18. **Task 4G** → Loading states (verify only)
19. **Task 4H** → Error states
20. **Task 5** → Final sweep + verification commands

---

*End of specification. The downstream agent should now have everything needed
to execute the overhaul file-by-file without ambiguity.*
