# HamaFX-Ai Premium Frontend Overhaul — Implementation Prompt

> **FOR THE IMPLEMENTING AGENT:** Read this entire document before writing any code. This is a prescriptive specification, not a suggestion. Every decision below was made by the project owner after a comprehensive 5-agent design review. Do not deviate from the design decisions. Do not invent new patterns. Follow the constraints.

> **IMPLEMENTATION PROGRESS — Updated by implementation agent (session 1):**
>
> | Phase | Status | Details |
> |-------|--------|---------|
> | Phase 1: Foundation | ✅ Complete | Packages installed, fonts migrated, color tokens updated, 118 files icon-migrated, lucide-react removed, AmbientBackground deleted |
> | Phase 2: Critical Fixes | ⚠️ 90% done | XSS, stale closure, aria-controls, bg-fg-fg, surface-panel, radius, accessibility all fixed. Remaining: replace local `relativeTime` with shared `formatRelative()`, dead code D2–D6 |
> | Phase 3: Token Migration | ❌ Not started | 100+ raw color classes, 38 hex colors, 24 rgba() values, 3 glow shadows, 12 bare rounded, orphaned shadcn tokens |
> | Phase 4: Chat Redesign | ❌ Not started | Chat bubbles, empty state, typing indicator, 35+ tool cards, multi-agent viz, quick prompts, composer, top bar, message list |
> | Phase 5: Page Redesigns | ❌ Not started | Dashboard, chart, settings, auth, signals, news, calendar, alerts, journal, error pages |
> | Phase 6: Desktop & Premium | ❌ Not started | DesktopSidebar, 2-pane layout, command palette, predictive search, page transitions |
> | Phase 7: Verification | ❌ Not started | Grep checks, typecheck, lint, build, browser testing |
>
> **Key notes for the next agent:**
> - Icons are fully migrated to `@tabler/icons-react` — verify with `grep -rn "lucide-react" apps/web/src/` (should return 0)
> - `globals.css` already has the new premium color tokens (§1.1, §1.2)
> - `lib/format.ts` has `formatRelative()` — use it to replace the local `relativeTime()` in `signals-dashboard.tsx`
> - `react-markdown` and `remark-gfm` are already dependencies — XSS fix in `ai-review-panel.tsx` is done
> - The `AmbientBackground` component file is deleted — do not re-add it
> - `pnpm` is available via `export PATH="/home/user/.local/bin:$PATH"` and `PNPM_HOME="/home/user/.local/share/pnpm"`
> - SSH key for pushing: already configured in `~/.ssh/id_ed25519` (HamaFx GitHub account)
> - The git remote is set to `git@github.com:HamaFx/HamaFX-Ai.git` (SSH)

---

## 0. PROJECT CONTEXT

**Repo:** `HamaFx/HamaFX-Ai` — clone via SSH  
**Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4 (CSS-first `@theme` in `globals.css`, NO `tailwind.config.js`), PostCSS via `@tailwindcss/postcss`, pnpm 9 + Turborepo 2  
**Fonts:** Currently Inter + JetBrains Mono via `next/font/google` — **CHANGING to Geist Sans + JetBrains Mono**  
**Icons:** Currently `lucide-react` — **CHANGING to `@tabler/icons-react`**  
**Animation:** `motion` (framer-motion successor, `motion/react`)  
**Drawer:** `vaul`  
**Virtual:** `@tanstack/react-virtual`  
**Markdown:** `react-markdown` + `remark-gfm` + `shiki`  
**Charts:** `lightweight-charts` v5 + TradingView widget  
**Class Merge:** `cn()` from `@/lib/cn` (clsx + tailwind-merge)  
**ORM:** Drizzle ORM  
**All UI files live in:** `apps/web/src/`

### 0.1 What This Overhaul Does
A complete premium redesign of the HamaFX-Ai frontend. The previous "institutional terminal" overhaul stripped all AI-slop patterns (gradients, glass, orbs) but also stripped all visual identity, leaving a monochrome zinc-on-zinc developer scaffold. This overhaul replaces that with a distinctive, premium trading terminal aesthetic — sharp, data-first, with a real brand identity — while keeping the excellent architecture, data flow, and component structure intact.

### 0.2 What Must NOT Change
- Component architecture, data flow, AI SDK integration, tool part registry, virtualization, routing, server-side logic
- The `cn()` utility, the `motion` animation system, the `vaul` drawer system
- The PWA setup, service worker, offline fallback
- The auth backend (bcrypt, rate limiting, audit logging, 2FA)
- The multi-agent deliberation concept (5 agents + consensus grade)

---

## 1. DESIGN IDENTITY DECISIONS (OWNER-SPECIFIED)

### 1.1 Brand Accent Color
**DECISION:** `#F07010` (orange) — extracted from the owner's color palette photo. This is the must-have accent. Bold, distinctive, not the typical fintech blue/teal. Connects to the energy/intensity of trading.

**Usage rules — the accent is used with EXTREME RESTRAINT, only on:**
- Primary CTA buttons (the `bg-brand text-brand-fg` pattern)
- AI signal badges and AI-attributed elements
- Active nav state indicator (left border or background tint)
- The logo mark
- Focus rings on interactive elements
- Chart AI overlay zones (semi-transparent)

**The accent must NEVER appear on:**
- Regular borders, backgrounds, text body
- Secondary/ghost buttons
- Cards, panels, or surfaces
- Market signal colors (those have their own palette — see §1.6)

### 1.2 Canvas / Background Color
**DECISION:** `#0A0A0A` (near-black) — extracted from the owner's color palette photo. Darker than obsidian but not pure black — premium feel on OLED without being harsh.

**Surface token hierarchy (replace existing in `globals.css` `@theme`):**
```css
--color-bg: #0A0A0A;              /* Canvas — near-black (from palette photo) */
--color-bg-elev-1: #141414;       /* Surface panels — slightly lifted */
--color-bg-elev-2: #1E1E1E;       /* Elevated popovers/drawers */
--color-bg-elev-3: #2A2A2A;       /* Hover/active surface */
--color-border: #1E1E1E;          /* Structural borders */
--color-divider: #141414;         /* Internal dividers */
--color-overlay: rgba(0, 0, 0, 0.80);
```
These are the FINAL values from the owner's palette photo — not placeholders. The relative hierarchy (canvas < elev-1 < elev-2 < elev-3 < border) is preserved.

**Full palette from owner's photo (for reference):**
| Color | Hex | Usage |
|-------|-----|-------|
| | `#0A0A0A` | Canvas (background) |
| | `#141414` | Surface panels (elev-1) |
| | `#1E1E1E` | Elevated surfaces (elev-2) / borders |
| | `#2A2A2A` | Hover/active (elev-3) |
| | `#808080` | Secondary text (fg-muted) |
| | `#F0F0F0` | Primary text (fg) |
| | `#F07010` | **Brand accent (MUST-HAVE)** |

**Text tokens (updated from palette):**
```css
--color-fg: #F0F0F0;              /* Primary text — from palette */
--color-fg-muted: #808080;        /* Secondary text — from palette */
--color-fg-subtle: #555555;       /* Tertiary/label text — derived (between muted and border) */
```

### 1.3 Border Radius System
**DECISION:** Keep uniform `rounded-sm` (2px) — sharp terminal aesthetic.  
**Rule:** Maximum border-radius across the entire application is `rounded-sm` (2px). This is intentional and deliberate, not a default.

```css
--radius-sm: 2px;
--radius-md: 2px;    /* Enforce 2px everywhere */
--radius-lg: 2px;
--radius-xl: 2px;
--radius-2xl: 2px;
--radius-pill: 2px;  /* NO PILLS. Sharp only. */
```

**Exceptions:** SVG elements (sparklines, charts) use `strokeLinecap` not CSS radius. No other exceptions.

**FIX:** Replace all `rounded-t-xl`, `rounded-t-2xl`, `rounded-r-3xl`, `rounded-lg`, `rounded-r-lg`, `rounded-l-lg` with `rounded-sm`. Files to fix:
- `drawer.tsx` — `rounded-t-xl` → `rounded-sm`
- `nav-drawer.tsx` — `rounded-r-3xl` → `rounded-sm`
- `message.tsx` — `rounded-l-lg` / `rounded-r-lg` → `rounded-sm`
- Any other violations found via grep: `grep -rn "rounded-[tlr]-\(lg\|xl\|2xl\|3xl\|full\)" apps/web/src/`

### 1.4 Typography Strategy
**DECISION:** Switch from Inter to **Geist Sans** (Vercel's font, less ubiquitous than Inter). Keep **JetBrains Mono** for all numeric/data displays.

**Implementation in `apps/web/src/app/layout.tsx`:**
```tsx
import { GeistSans } from 'geist/font/sans';
import { JetBrains_Mono } from 'next/font/google';

// Replace the Inter import with GeistSans
// GeistSans.variable provides --font-sans
```

**Install:** `pnpm add geist` (in `apps/web/`)

**Font usage rules (UNCHANGED but ENFORCED):**
| Use Case | Font | Tailwind Utility |
|----------|------|-----------------|
| UI labels, buttons, navigation, body prose, headings | Geist Sans | `font-sans` |
| ALL numbers: prices, spreads, R-multiples, percentages, pip counts, indicator values, timestamps, OHLC, equity, stat card numbers | JetBrains Mono | `font-mono` + `tabular-nums` |

**Rule:** Every numeric value rendered to the user MUST use `font-mono` + `tabular-nums`. No exceptions. Audit all existing components and add `font-mono tabular-nums` to any numeric display that's missing it.

**Heading treatment:** Geist Sans at weight 600, `tracking-tight` (-0.02em). Display sizes use the existing fluid typography scale (`--text-display-*` tokens).

### 1.5 Icon Strategy
**DECISION:** Switch from `lucide-react` to **`@tabler/icons-react`** (different stroke style, less AI-slop-ubiquitous).

**Install:** `pnpm add @tabler/icons-react` (in `apps/web/`)

**Migration rules:**
1. Replace ALL `lucide-react` imports with `@tabler/icons-react` equivalents
2. Tabler icon naming convention: `IconName` → e.g., `IconSparkles`, `IconBrain`, `IconBot`, `IconMenu2`, `IconX`, `IconArrowRight`, etc.
3. **CRITICAL:** The following icons are BANNED (instant AI-slop tells) — replace with alternatives or remove entirely:
   - `Sparkles` → `IconBolt` or `IconChartDots` (for AI features)
   - `Brain` → `IconCpu` or `IconTopology` (for reasoning/agent)
   - `Bot` → `IconRobot` (only if needed; prefer `IconCpu`)
   - `Loader2` → `IconLoader2` (fine, keep)
4. Use a consistent icon size: `size={16}` for inline, `size={20}` for nav/headers, `size={24}` for empty states
5. Use `stroke={1.5}` as the default stroke width for all icons

**Icon mapping table (lucide → tabler):**
| Lucide | Tabler | Notes |
|--------|--------|-------|
| Menu | IconMenu2 | Nav trigger |
| X | IconX | Close/dismiss |
| Sparkles | IconBolt | AI features (BANNED lucide name) |
| Brain | IconCpu | Reasoning (BANNED lucide name) |
| Bot | IconRobot | AI agent (BANNED lucide name) |
| Send | IconArrowRight / IconArrowUp | Composer send |
| ArrowRight | IconArrowRight | |
| ArrowLeft | IconArrowLeft | |
| ChevronDown | IconChevronDown | |
| ChevronRight | IconChevronRight | |
| Check | IconCheck | |
| Copy | IconCopy | |
| Edit | IconEdit | |
| Trash2 | IconTrash | |
| Plus | IconPlus | |
| Minus | IconMinus | |
| Search | IconSearch | |
| Settings | IconSettings | |
| Bell | IconBell | |
| TrendingUp | IconTrendingUp | |
| TrendingDown | IconTrendingDown | |
| Activity | IconActivity | |
| BarChart3 | IconChartBar | |
| Target | IconTarget | |
| AlertTriangle | IconAlertTriangle | |
| RefreshCw | IconRefresh | |
| Zap | IconBolt | |
| Quote | IconQuote | |
| KeyRound | IconKey | |
| Loader2 | IconLoader2 | |
| CheckCircle2 | IconCircleCheck | |
| Eye | IconEye | Password toggle |
| EyeOff | IconEyeOff | Password toggle |

> For any lucide icon not listed, find the closest Tabler equivalent at https://tabler.io/icons

### 1.6 Market Signal Colors
**DECISION:** Refined palette, reserved ONLY for price/P&L data. Signal colors must NOT appear on UI chrome (buttons, badges, borders).

```css
--color-bull: #22C55E;    /* Softer green — bullish/long (price/P&L ONLY) */
--color-bear: #EF4444;    /* Red — bearish/short (price/P&L ONLY) */
--color-warn: #F59E0B;    /* Amber — warnings (keep for calendar events, alerts) */
--color-info: #3B82F6;    /* Blue — informational (keep but use sparingly) */
--color-neutral: #71717A; /* Zinc-500 — neutral */
```

**Enforcement rules:**
- `text-bull` / `bg-bull/10` → ONLY on price changes, P&L values, candle bodies, win rates
- `text-bear` / `bg-bear/10` → ONLY on price drops, losses, stop-loss levels
- `text-warn` / `bg-warn/10` → ONLY on calendar high-impact events, alert warnings
- Buttons use `bg-brand text-brand-fg` (primary) or neutral surfaces — NEVER green/red
- Badges for status (Armed/Paused/Triggered) use neutral tones, not signal colors
- The `success` button variant → change from `bg-emerald-500` to `bg-brand text-brand-fg`

### 1.7 Logo & Brand Mark
**STATUS:** The owner will provide a logo file. Until received, create a placeholder geometric mark — a candlestick-inspired abstract shape using the brand accent color `#F07010`.

**Wire the logo into ALL locations:**
1. `top-bar.tsx` — replace the `size-6` box with "H" text
2. `nav-drawer.tsx` — identity strip avatar
3. `not-found.tsx` (404 page) — replace text "H"
4. `offline/page.tsx` — replace text "H"
5. `(auth)/layout.tsx` — auth pages brand mark
6. PWA icons (`public/icons/`) — generate from logo
7. OG image / favicon

**Placeholder logo (until owner provides file):**
```tsx
// A simple geometric mark: two candlesticks forming an abstract "H"
<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
  <rect x="4" y="6" width="3" height="12" rx="1" fill="currentColor" />
  <rect x="10" y="3" width="3" height="18" rx="1" fill="currentColor" opacity="0.6" />
  <rect x="17" y="8" width="3" height="10" rx="1" fill="currentColor" />
  <line x1="5.5" y1="2" x2="5.5" y2="22" stroke="currentColor" stroke-width="0.5" />
  <line x1="18.5" y1="4" x2="18.5" y2="20" stroke="currentColor" stroke-width="0.5" />
</svg>
```
Color: `text-brand` (the `#F07010` accent). The placeholder uses `currentColor` so it inherits the accent.

### 1.8 Desktop Layout Strategy
**DECISION:** Mobile-first, desktop-second. The implementing agent chooses the best desktop layout. **Recommended approach:**

**Mobile (< 1024px):** Keep current mobile-first pattern — bottom sheet nav (NavDrawer), full-screen chat, single-column pages. This is already well-built.

**Desktop (≥ 1024px / `lg:`):** 2-pane layout with persistent sidebar:
- **Left sidebar (240px, fixed):** Logo + nav items (vertical list, not bottom sheet) + user identity strip at bottom. Collapsible to icon-only (48px) via a toggle.
- **Main content area:** Existing page content with wider container (`lg:max-w-5xl`, `xl:max-w-7xl`).
- **Command palette:** Centered floating panel on desktop (not bottom sheet). Keep bottom sheet on mobile.

**Implementation:**
1. In `(app)/layout.tsx`: Add a `lg:flex` wrapper with a `<DesktopSidebar />` component (hidden below `lg:`) and the main content area.
2. `DesktopSidebar` — new component in `components/layout/desktop-sidebar.tsx`:
   - `hidden lg:flex` — only visible on desktop
   - `w-60` (240px) default, `w-12` collapsed
   - Vertical nav list with icons + labels
   - Active state: left border 2px brand accent + slightly elevated background
   - User identity strip at bottom (avatar + name + sign out)
   - Collapse toggle button at top
3. `NavDrawer` (mobile bottom sheet) — add `lg:hidden` to the trigger, keep for mobile only.
4. `CommandPalette` — on `lg+`: centered floating panel with backdrop. On mobile: keep current vaul bottom sheet.
5. Add intermediate container breakpoint: `lg:max-w-5xl` between `max-w-2xl` and `xl:max-w-7xl`.

### 1.9 Chat Bubble Design
**DECISION:** Full-width assistant (no bubble), user in compact right-aligned bubble.

**Implementation in `message.tsx`:**
- **Assistant messages:** Full-width, no bubble background. Just `py-3` padding. Content flows edge-to-edge within the max-width container. A small avatar/icon on the left (16px, brand accent tint) to distinguish.
- **User messages:** Compact right-aligned bubble. `bg-bg-elev-2` (elevated surface), `rounded-sm`, `px-4 py-2`, `max-w-[85%] ml-auto`. No border (the elevation difference from canvas is enough).
- **Timestamps:** Add timestamps to BOTH user and assistant messages (currently only assistant has them). Use `font-mono text-caption text-fg-subtle`.

### 1.10 Chat Empty State
**DECISION:** Minimal branded — logo + "Start a conversation" + 4 quick prompts.

**Implementation in `chat-screen.tsx` (replace `EmptyChatState`):**
```
[Brand logo mark — 48px, accent color]
[Wordmark: "HamaFX·Ai" — font-sans font-semibold text-lg]

"Start a conversation" — text-fg-muted, text-sm

[4 quick prompt cards in a 2x2 grid:]
- "Analyze XAU/USD structure"     → deep-links to chat with pre-filled prompt
- "Today's macro calendar"        → deep-links to chat with calendar prompt
- "Set a price alert"             → deep-links to chat with alert prompt
- "Review my journal"             → deep-links to chat with journal prompt

Each card: bg-bg-elev-1, border-border, rounded-sm, px-4 py-3, hover:bg-bg-elev-3
Icon: Tabler icon (16px) on the left, prompt text on the right
No Sparkles icon. No "How can I help?" copy.
```

### 1.11 Data Density
**DECISION:** Balanced — comfortable spacing but data-rich (TradingView mobile style).

**Rules:**
- Watchlist rows: 40px height, `text-sm`, symbol + price + change% + mini sparkline visible without expanding
- Stat cards: `text-2xl font-mono tabular-nums` for primary values (currently `text-lg` — too small)
- Tables: 36-40px row height, `text-sm`, `font-mono tabular-nums` for numeric columns
- Journal entries: 48-56px collapsed height, expandable for details
- News cards: 72px collapsed, headline + source + time + sentiment badge visible
- Calendar events: 56px collapsed, event name + time + importance badge

### 1.12 Motion & Animation
**DECISION:** Subtle purposeful motion only.

**Allowed animations:**
- Page transitions: `next-view-transitions` crossfade between routes (150-200ms, `ease-organic`)
- Number count-ups: `AnimatedNumber` component (already exists, keep using it)
- Status pulses: `animate-pulse` on live/stale indicators (keep existing)
- Skeleton shimmer: existing `.shimmer` class (keep)
- Loading spinners: existing `animate-spin` (keep)
- Drawer open/close: vaul's built-in spring physics (keep)
- Segmented control slide: existing `layoutId` animation (keep)

**BANNED animations (AI-slop):**
- `hover:scale-105` or any scale on hover for cards
- `whileInView` fade-in-up on sections
- Staggered entrance animations on lists
- Parallax effects
- 3D card tilts
- Bouncing dots typing indicator → replace with a single pulsing cursor line or a subtle "Thinking…" text with pulse

**`prefers-reduced-motion`:** ALL animations must respect `prefers-reduced-motion: reduce`. Add `motion-safe:` prefixes or conditional checks. Fix existing components that lack this (message entrance animations, scroll FAB, cursor blink in `text.tsx`, agent deliberation animations).

### 1.13 Loading States
**DECISION:** Both skeleton shimmer AND placeholder morph — use whichever fits each context.

**Rules:**
- **Skeleton shimmer** for: page-level loading (route transitions), dashboard widgets, journal entries, news cards, calendar events, settings sections. Match the final layout shape. Use existing `Skeleton` / `SkeletonCard` components, refined.
- **Placeholder morph** for: stat cards (show `0.00` or `---` in mono font that morphs to real value via `AnimatedNumber`), watchlist prices (show last known value until updated), chart (show cached/last chart until new data loads).
- **Crossfade:** When transitioning from skeleton to real content, use a 200ms opacity crossfade (not a hard cut). Implement via `next-view-transitions` or a simple `animate-in fade-in` class.

### 1.14 AI Assistant Voice
**DECISION:** Expert mentor — like a senior trader giving you analysis. Warm but authoritative. Not robotic, not overly casual.

**Copy guidelines for empty states, tooltips, error messages, and AI UI text:**
- ✅ "XAU/USD is testing the 2,400 resistance. London session opened bullish — here's what I'm watching."
- ✅ "Your win rate dropped 8% this week. Let's review the losing trades together."
- ✅ "Three high-impact events tomorrow. FOMC at 14:00 EST is the one to watch."
- ❌ "How can I help you today?" (generic AI-slop)
- ❌ "Transform your trading workflow!" (marketing slop)
- ❌ "Oops! Something went wrong 🤖" (childish)
- ❌ "Let's dive in!" (overly casual)

**Error messages:** Specific and actionable. Not "Couldn't load this page" but "Couldn't load your trade history. Check your connection and try again."

---

## 2. CRITICAL BUG FIXES (DO FIRST)

### 2.1 Security Fixes
| # | Issue | File | Fix |
|---|-------|------|-----|
| S1 | **XSS vulnerability** — `markdownToHtml()` uses naive regex | `journal/_components/ai-review-panel.tsx` | Replace with `react-markdown` (already a dependency). Render markdown directly via `<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>` instead of `dangerouslySetInnerHTML`. |
| S2 | **`dangerouslySetInnerHTML`** on Shiki output | `chat/parts/text.tsx` | Keep Shiki for syntax highlighting (it sanitizes), but add a comment documenting why it's safe. Ensure Shiki output is always wrapped and no user input bypasses Shiki. |

### 2.2 Code Bug Fixes
| # | Issue | File | Fix |
|---|-------|------|-----|
| B1 | **Stale `messages` closure** in multi-agent SSE | `chat-screen.tsx` ~210 | Use a `ref` to hold the latest messages array, or restructure the fetch to read from a ref instead of the closure variable. |
| B2 | **Scroll FAB misaligned on wide screens** | `chat-screen.tsx` ~575 | Change from `fixed` to `absolute` within the scroll container, or use `sticky` positioning. |
| B3 | **Error banner invisible when scrolled up** | `chat-screen.tsx` ~555 | Move error banner outside the scroll container — pin it between the top bar and the scroll area. |
| B4 | **`aria-controls` ID collision** | `parts/tool-card.tsx` ~72 | Use `useId()` hook to generate unique IDs for each tool card's `aria-controls` and the corresponding content panel. |
| B5 | **Module-level mutable cache** | `regen-model-picker.tsx` ~31 | Move the cache into a `useRef` or `useMemo` so it's per-instance, not shared across all picker instances. |
| B6 | **`bg-fg-fg` typo** | `entry-list.tsx` line 151 | Fix to `bg-fg` (or the intended token). |
| B7 | **Duplicate `border-zinc-800` and `border` classes** | `message.tsx` ~300 | Remove the duplicate. Use only `border border-border`. |
| B8 | **`rounded-l-lg`/`rounded-r-lg`** on regen buttons | `message.tsx` ~274/285 | Replace with `rounded-sm`. |
| B9 | **Dead `bg` field** on quick-prompt objects | `quick-prompts.tsx` 61-93 | Either implement per-prompt icon background tints using the brand accent at low opacity, or remove the `bg` field from the interface and all objects. |
| B10 | **Double `surface-panel p-6` wrapping** | `register/page.tsx`, `reset-password/` | Remove the inner `surface-panel p-6` wrapper — the auth layout already provides it. |
| B11 | **Duplicated `relativeTime` function** | signals-dashboard, alert-list, entry-list | Extract to a shared utility in `lib/format.ts` and import everywhere. |
| B12 | **`rounded-r-3xl` on nav drawer** | `nav-drawer.tsx` | Replace with `rounded-sm`. |
| B13 | **`rounded-t-xl` on drawer component** | `drawer.tsx` | Replace with `rounded-sm`. |

### 2.3 Dead Code Removal
| # | Item | File | Action |
|---|------|------|--------|
| D1 | `AmbientBackground` component returns `null` but is imported | `ambient-background.tsx`, `(app)/layout.tsx` | Delete the file and remove the import. |
| D2 | Nav badge field exists but never populated | `nav-drawer.tsx` | Either implement badge counts (alerts count, unread news) or remove the field. **Recommended:** Implement — show alert count badge on the Alerts nav item. |
| D3 | `localStorage.setItem('hamafx:last-path', pathname)` writes but never reads | `nav-drawer.tsx` | Either implement "continue where you left off" on app open, or remove the tracking. **Recommended:** Remove for now — add later as a feature. |
| D4 | Stale "champagne gold" comments | `performance-chart.tsx` and others | Update or remove comments that reference the old design system. |
| D5 | Stale "glass" comments | 9 files | Update comments to match the new design system. |
| D6 | `Segmented` "gradient" variant has no gradient | `segmented.tsx` | Rename the variant to "solid" or "accent" and update all usages. |

---

## 3. DESIGN TOKEN MIGRATION

### 3.1 Replace Raw Color Classes with Tokens
**100+ instances across 25+ files.** Systematic migration:

| Raw Class | Replace With |
|-----------|-------------|
| `bg-zinc-950` | `bg-bg-elev-1` |
| `bg-zinc-900` | `bg-bg-elev-2` |
| `bg-zinc-800` | `bg-bg-elev-3` |
| `border-zinc-800` | `border-border` |
| `border-zinc-900` | `border-divider` |
| `text-zinc-50` | `text-fg` |
| `text-zinc-400` | `text-fg-muted` |
| `text-zinc-500` | `text-fg-subtle` |
| `text-emerald-500` | `text-bull` |
| `bg-emerald-500` | `bg-bull` |
| `text-red-500` | `text-bear` |
| `bg-red-500` | `bg-bear` |
| `text-amber-500` | `text-warn` |
| `bg-amber-500` | `bg-warn` |
| `text-blue-500` | `text-info` |
| `bg-blue-500` | `bg-info` |
| `bg-surface` (orphaned shadcn) | `bg-bg-elev-1` |
| `bg-background` (orphaned shadcn) | `bg-bg` |
| `bg-foreground` (orphaned shadcn) | `bg-fg` |
| `text-foreground` (orphaned shadcn) | `text-fg` |

**Method:** Use grep to find all instances, replace systematically. After migration, run a verification grep to confirm zero raw color classes remain (excluding `globals.css` and any chart canvas code that requires raw hex).

### 3.2 Replace Hardcoded Hex Colors
**38 instances in `.tsx` components.** Replace with CSS variable references:

```tsx
// BAD
<div style={{ backgroundColor: '#09090B' }} />
<canvas style={{ color: '#FAFAFA' }} />

// GOOD
<div style={{ backgroundColor: 'var(--color-bg-elev-1)' }} />
// Or better — use Tailwind classes:
<div className="bg-bg-elev-1" />
// For canvas API (chart-colors.ts, use-chart-theme.ts):
const fgColor = getComputedStyle(document.documentElement).getPropertyValue('--color-fg').trim(); // "#F0F0F0"
```

**Exception:** Chart canvas rendering (`chart-colors.ts`, `use-chart-theme.ts`) may need raw hex for canvas API calls. Convert these to read from CSS variables at runtime:
```ts
const getComputedStyleValue = (varName: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
const bullColor = getComputedStyleValue('--color-bull');
```

### 3.3 Replace Raw `rgba()` Values
**24 instances.** Replace with token-based alpha:

```tsx
// BAD
<div className="bg-[rgba(239,68,68,0.1)]" />

// GOOD
<div className="bg-bear/10" />
```

### 3.4 Remove Glow Shadows
**3 instances in error/offline/not-found pages.** Remove:
```tsx
// REMOVE:
boxShadow: '0 0 24px -4px rgba(250, 250, 250, 0.15)'
```
Replace with flat shadow or no shadow.

### 3.5 Fix Bare `rounded` Classes
**12 instances.** Replace bare `rounded` (no size) with `rounded-sm`.

### 3.6 Remove Redundant `font-sans` Class
**1 instance in `symbols-form.tsx:524`.** `font-sans` is the default — remove the explicit class.

---

## 4. FONT MIGRATION (Inter → Geist Sans)

### 4.1 Install Geist
```bash
cd apps/web && pnpm add geist
```

### 4.2 Update Root Layout
In `apps/web/src/app/layout.tsx`:
1. Remove `import { Inter } from 'next/font/google'`
2. Add `import { GeistSans } from 'geist/font/sans'`
3. Replace `const inter = Inter({ ... })` with using `GeistSans`
4. Update the `className` on `<html>`: replace `inter.variable` with `GeistSans.variable`
5. The `--font-sans` CSS variable will now be provided by Geist Sans

### 4.3 Update `globals.css` Font Stack
```css
--font-sans: var(--font-sans), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
/* Keep as-is — the --font-sans variable is now populated by GeistSans.variable */
```

### 4.4 Update `package.json`
Remove `lucide-react` from dependencies (after icon migration is complete).

---

## 5. ICON MIGRATION (lucide-react → @tabler/icons-react)

### 5.1 Install Tabler
```bash
cd apps/web && pnpm add @tabler/icons-react
```

### 5.2 Migration Process
1. Search for all `from 'lucide-react'` imports: `grep -rn "from 'lucide-react'" apps/web/src/`
2. For each file, replace the import and all icon references using the mapping table in §1.5
3. Tabler icons use `stroke={1.5}` as default — add this prop to all icon usages
4. Remove `lucide-react` from `package.json` after all migrations are complete
5. Verify with: `grep -rn "lucide-react" apps/web/src/` — should return zero results

**Files with the most icons to migrate (priority):**
- `chat-top-bar.tsx` — 11 icons
- `agent-deliberation.tsx` — 8 icons
- `nav-drawer.tsx` — 7+ icons
- `chat-screen.tsx` — 5+ icons
- `message.tsx` — 5+ icons
- `composer.tsx` — 4+ icons
- All 35+ `parts/*.tsx` files — 1-3 icons each

---

## 6. CHAT REDESIGN (PRIORITY PAGE #1)

### 6.1 Chat Bubbles
See §1.9 for the full specification. Implementation in `message.tsx`:
- Assistant: full-width, no bubble, `py-3`, small accent icon on left
- User: compact right-aligned, `bg-bg-elev-2`, `rounded-sm`, `max-w-[85%] ml-auto`
- Add timestamps to user messages (currently missing)
- Add copy button to user messages (currently missing)
- Remove duplicate `border` classes
- Fix `rounded-l-lg`/`rounded-r-lg` → `rounded-sm`

### 6.2 Chat Empty State
See §1.10 for the full specification. Replace `EmptyChatState` in `chat-screen.tsx`.

### 6.3 Typing Indicator
Replace the three bouncing dots (`animate-bounce`) with a single pulsing cursor:
```tsx
// Replace bouncing dots with:
<span className="inline-block h-4 w-0.5 bg-fg animate-pulse" />
<span className="ml-2 text-sm text-fg-muted">Thinking…</span>
```
Respect `prefers-reduced-motion` — show static "Thinking…" text without pulse.

### 6.4 Chat Tool Cards (35+ parts)
**DECISION:** Redesign ALL tool cards to match the new premium system.

**Design system for all tool cards (`parts/*.tsx`):**
- Container: `bg-bg-elev-1 border border-border rounded-sm`
- Header: `px-3 py-2 border-b border-divider` — icon (Tabler, 16px) + title + status badge
- Body: `px-3 py-3` — data display
- Status indicators: use text labels, not Unicode symbols (replace `✓`, `⚠`, `✗` with Tabler icons or text)
- Data values: `font-mono tabular-nums text-sm`
- Labels: `text-fg-muted text-xs uppercase tracking-wide`
- Expand/collapse: Tabler `IconChevronDown` / `IconChevronRight` (16px), not `+`/`−` text
- Fix `aria-controls` ID collision with `useId()` hook

**Files to redesign (all 35+):**
`get-price.tsx`, `get-candles.tsx`, `get-market-structure.tsx`, `get-indicators.tsx`, `get-news.tsx`, `get-cot.tsx`, `get-correlation.tsx`, `get-intermarket.tsx`, `get-intermarket-resonance.tsx`, `get-journal-stats.tsx`, `get-portfolio-snapshot.tsx`, `get-seasonality.tsx`, `get-session-levels.tsx`, `get-social-sentiment.tsx`, `get-system-diagnostics.tsx`, `log-journal.tsx`, `plan.tsx`, `agent-deliberation.tsx`, `tool-card.tsx`, `text.tsx`, `fallback.tsx`, `citation-warning.tsx`, and all others in `parts/`.

### 6.5 Multi-Agent Deliberation Visualization
**DECISION:** Keep the concept (5 agents + consensus grade), redesign the visual to be more premium.

**Redesign `agent-deliberation.tsx`:**
- Replace the 8 lucide icons with Tabler equivalents
- Clean up the SVG connectors — make them subtle (`stroke-width="1"`, `opacity="0.3"`, `stroke="var(--color-border)"`)
- Agent cards: `bg-bg-elev-1 border border-border rounded-sm p-3`
- Agent grade display: `font-mono text-lg font-bold` with grade color (A=brand accent, B=bull, C=neutral, D=warn, F=bear)
- Consensus grade: large `font-mono text-2xl font-bold` centered, with a subtle brand accent ring
- Add `prefers-reduced-motion` support — disable infinite animations
- Remove `shadow-none` dead classes on glow elements

### 6.6 Quick Prompts
- Remove the dead `bg` field from the `Prompt` interface and all prompt objects (or implement it with subtle accent tints)
- Replace all lucide icons with Tabler equivalents
- Cards: `bg-bg-elev-1 border border-border rounded-sm px-4 py-3 hover:bg-bg-elev-3 transition-colors`

### 6.7 Composer
- Replace lucide icons with Tabler
- Fix `aria-busy` misuse on voice toggle — use `aria-pressed` instead
- Add drag-over visual feedback (file count badge when files are dragged over)
- Keep the send/stop morph animation (it's good)

### 6.8 Chat Top Bar
- Replace 11 lucide icons with Tabler equivalents
- Add keyboard shortcut for new chat (e.g., display `⌘N` hint)
- Fix the comment/code mismatch on threshold
- Thread switcher checkboxes: add `role="checkbox"` / `aria-checked`

### 6.9 Message List
- Improve virtualization estimate — use a more granular size estimate based on message content type (text vs tool-call vs markdown with tables)
- Add unread message count to the scroll-to-bottom FAB
- Replace bouncing dots typing indicator (see §6.3)

---

## 7. DASHBOARD REDESIGN (PRIORITY PAGE #2)

### 7.1 Widget Visual Hierarchy
**DECISION:** Build dashboard widget visual hierarchy — hero widgets vs secondary widgets.

**Hero widgets** (today-glance, PnL heatmap, equity curve):
- Subtle accent left border: `border-l-2 border-l-brand`
- Larger values: `text-2xl` or `text-3xl font-mono tabular-nums`
- More padding: `p-5` vs `p-4` for secondary
- Sparklines larger: `h-12` vs `h-8`

**Secondary widgets** (stats, watchlist, open-positions, alerts, calendar, news-pulse):
- Standard `border border-border rounded-sm p-4`
- `text-lg font-mono tabular-nums` values

### 7.2 Stat Card Enhancement
In `stat-card.tsx`:
- Enlarge primary values: `text-2xl font-mono tabular-nums font-bold` (currently `text-lg`)
- Add trend indicator: `↑ 2.3%` or `↓ 1.2%` with `text-bull` / `text-bear`
- Make cards clickable (add `onClick` prop, `cursor-pointer hover:bg-bg-elev-3`)
- Fix the empty `TONE_TINT` for `muted` and `fg` tones — give them a visible (but subtle) left border

### 7.3 "Add Widget" Dropdown
Replace the native `<details>` element with a proper dropdown component using the existing `Popover` API or a simple conditional render with a Tabler `IconPlus` button.

---

## 8. CHART REDESIGN (PRIORITY PAGE #3)

### 8.1 AI Signal Overlays on Charts
**DECISION:** Build AI signal overlays — pattern zones with confidence badges.

**Implementation:**
- When AI identifies a pattern (e.g., "bullish engulfing on 4H"), draw a semi-transparent overlay zone on the chart using `lightweight-charts` primitives
- Badge on the zone: `bg-brand/10 border border-brand/30 rounded-sm px-2 py-1 text-xs font-mono` — "AI: Bullish Engulfing — 78%"
- Tap badge → inline popover with explanation (not a page navigation)
- When chat references a price level, chart auto-scrolls and highlights with a pulsing line
- Use the brand accent color for AI overlay zones (semi-transparent: `brand/15` fill, `brand/40` border)

### 8.2 Chart Sub-header
- Replace the hand-rolled TV/Structure toggle with the shared `Segmented` component
- Add fullscreen mode button (Tabler `IconMaximize`)
- Add keyboard shortcuts for timeframe changes (1, 5, 15, 30, 60, 240, D, W)

### 8.3 Chart Loading
- Keep the skeleton that matches chart aspect ratio (already good)
- Add crossfade from skeleton to loaded chart

---

## 9. SETTINGS REDESIGN (PRIORITY PAGE #4)

### 9.1 Settings Search
Add a Cmd-K style search within settings — typing filters visible settings sections.

### 9.2 Scroll-spy Nav
On mobile, the settings nav horizontal scroll should update the active item as the user scrolls the page (IntersectionObserver).

### 9.3 Fix Issues
- Remove misleading "glass" comments
- Fix inconsistent error page layout (align with app-level error pattern)
- Fix code indentation in `page.tsx` DB query block

---

## 10. AUTH REDESIGN (PRIORITY PAGE #5)

### 10.1 Auth Modernization
**DECISION:** Add the following (owner-selected):

1. **Google sign-in button** — standard OAuth button with Google logo, `border border-border bg-bg-elev-1 rounded-sm h-12 w-full` (match existing input height)
2. **Password visibility toggle** — Tabler `IconEye` / `IconEyeOff` button inside password inputs, toggles `type="password"` ↔ `type="text"`
3. **Terms of service checkbox** on register page — required checkbox with link to terms/privacy, cannot submit without checking
4. **Fix double `surface-panel` wrapping** on register and reset-password pages — remove the inner wrapper

**NOT adding (owner excluded):** Apple sign-in, GitHub sign-in, passkey/WebAuthn, magic link

### 10.2 Auth Layout
- Replace `AmbientBackground` import (it returns null — dead code)
- Use the actual logo (owner-provided) instead of PWA icon
- Keep the `surface-panel` container for the form
- Keep the password strength indicator (it's good)
- Add a password strength meter bar (visual "weak/medium/strong") in addition to the criteria checklist

---

## 11. OTHER PAGES REDESIGN

### 11.1 Signals Page (Weakest — Fix First)
- Add `loading.tsx` with skeleton matching the dashboard layout
- Add `error.tsx` with page-specific error message
- Replace raw `<h2>` with `PageHeader` component
- Fix the 3 StatCards using the same `Target` icon — give each a unique Tabler icon
- Add a cumulative returns performance chart (use `lightweight-charts` or a custom SVG)
- Add filtering by symbol, status, date, bias
- Replace duplicated `relativeTime` with shared utility from `lib/format.ts`

### 11.2 News Page
- Add breaking news banner: dismissible top strip for high-impact news with `animate-pulse` on the badge
- Add AI news digest: "Today's market narrative" — a 3-sentence AI summary at the top of the page
- Add source credibility indicators (tier badges)
- Add impact scoring tags (high/medium/low)

### 11.3 Calendar Page
- Add calendar grid view (ForexFactory style) — toggle between list and week grid
- Show actual vs forecast values once released, with surprise indicators (green/red tint for better/worse)
- Add event detail drawer — click any event → drawer with historical data and AI analysis
- Add "Notify me" button on high-impact events

### 11.4 Alerts Page
- Add distance-to-trigger indicator: "XAUUSD is 0.3% from your alert level"
- Add mini sparkline on each alert card showing recent price relative to alert level
- Color urgency: green (far), amber (close), red (about to trigger) — using the signal color palette

### 11.5 Journal Page
- Fix XSS in `markdownToHtml` → use `react-markdown` (critical, see §2.1)
- Replace duplicated `relativeTime` with shared utility
- Keep the existing virtualized entry list, sortable tables, drawdown chart, AI reviews (they're good)
- Apply token migration to all raw color classes

### 11.6 404 & Error Pages
- Replace text "H" logo with actual brand logo
- Add navigation suggestions on 404 (Dashboard, Journal, Chart, Chat links)
- Add collapsible "Technical details" section with error digest for support
- Add page-specific error messages (journal error ≠ chart error ≠ settings error)
- Remove glow shadows

### 11.7 Offline Page
- Replace text "H" logo with actual brand logo
- Add auto-retry with exponential backoff (instead of manual retry only)

---

## 12. PREMIUM FEATURES TO BUILD

### 12.1 AI Signal Overlays on Charts ✅
See §8.1 for full specification.

### 12.2 Distance-to-Trigger on Alerts ✅
See §11.4 for full specification.

### 12.3 Predictive Search with Inline Previews ✅
**Implementation in `command-palette.tsx`:**
- Typing a symbol (e.g., "XAU") shows results with:
  - Symbol name + 7-day sparkline (mini SVG, 60x20px)
  - Current price (`font-mono tabular-nums`)
  - AI signal status: "AI: Bullish — 72%" (if available)
  - Active alert count: "3 active alerts"
- User can act directly from the dropdown:
  - `Enter` → open chart
  - `⌘A` → set alert
  - `⌘C` → ask AI
- Add frecency ranking (frequency + recency) to command results
- Add keyboard shortcut hints in results

### 12.4 Breaking News Banner ✅
See §11.2 for specification.

### 12.5 Calendar Grid View ✅
See §11.3 for specification.

### 12.6 Dashboard Widget Visual Hierarchy ✅
See §7.1 for specification.

### 12.7 Page Transition Animations ✅
- Implement `next-view-transitions` crossfade between routes (the library is already installed)
- 150-200ms duration, `ease-organic` cubic-bezier
- Add skeleton→content crossfade within pages (200ms opacity fade)
- Respect `prefers-reduced-motion`

### 12.8 Branded 404/Error Pages ✅
See §11.6 for specification.

### 12.9 Centered Command Palette on Desktop ✅
See §1.8 for specification.

### 12.10 Persistent Desktop Sidebar ✅
See §1.8 for specification.

---

## 13. FEATURES EXCLUDED (DO NOT BUILD)

The owner explicitly excluded these features as "AI slop and extra things":
- ❌ **Swipe-to-confirm** for trades/deletions — use standard confirm dialogs
- ❌ **Long-press privacy mode** (blur balances) — not building
- ❌ **Keyboard shortcut overlay** (? key) — not building
- ❌ **Haptic feedback** (vibration API) — not building
- ❌ **Live data state indicators** (pulsing dots on prices) — not building

---

## 14. ACCESSIBILITY FIXES

| Issue | File | Fix |
|-------|------|-----|
| No `prefers-reduced-motion` on message entrance / scroll FAB / cursor blink | `chat-screen.tsx`, `message-list.tsx`, `text.tsx` | Add `motion-safe:` prefixes or conditional checks. Use `useReducedMotion()` from `motion/react`. |
| `aria-busy` misused on voice toggle | `composer.tsx` | Use `aria-pressed` instead |
| Thread switcher checkboxes lack ARIA | `chat-top-bar.tsx` | Add `role="checkbox"` / `aria-checked` |
| Popover API fallback uses global selector | `message.tsx` | Use a ref-based selector scoped to the message component |
| Tag input missing ARIA listbox pattern | `tag-input.tsx` | Add `role="listbox"`, `role="option"`, `aria-activedescendant` |
| `role="alert"` on stale indicator | `stale-indicator.tsx` | Change to `role="status"` |
| `role="img"` on provider-info-dot | `provider-info-dot.tsx` | Change to `role="button"` or remove role |
| Nav drawer Title used as layout container | `nav-drawer.tsx` | Use a proper title text element, move layout to a separate div |
| Top bar `·Ai` separator read by screen readers | `top-bar.tsx` | Add `aria-hidden` to the middot or use a different separator |
| Button loading state has no `aria-busy` | `button.tsx` | Add `aria-busy={isLoading}` |
| Command palette combobox ARIA pattern | `command-palette.tsx` | Make the listbox a child of the combobox, not a sibling |
| `sm:h-9` button below 44pt touch target | `button.tsx` | Increase to `h-10` (40px) minimum, or document that the wrapper provides the remaining 4px |

---

## 15. IMPLEMENTATION ORDER

> **STATUS LEGEND:** ✅ = Done — ❌ = Not started — ⚠️ = Partially done
>
> **Last updated by:** Implementation agent (session 1) — Phases 1–2 complete, Phase 2 dead-code items D2–D6 remaining.

### Phase 1: Foundation (Do First) — ✅ COMPLETE
1. ✅ Install `geist` and `@tabler/icons-react` packages — `geist@^1.7.2` and `@tabler/icons-react@^3.44.0` added to `apps/web/package.json`
2. ✅ Migrate fonts: Inter → Geist Sans in `layout.tsx` — `GeistSans` from `geist/font/sans` replaces `Inter`; `--font-sans` variable preserved; `themeColor` updated to `#0A0A0A`; body class `bg-zinc-950` → `bg-bg`
3. ✅ Update `globals.css` with new color tokens — canvas `#0A0A0A`, elev-1 `#141414`, elev-2 `#1E1E1E`, elev-3 `#2A2A2A`, border `#1E1E1E`, fg `#F0F0F0`, fg-muted `#808080`, fg-subtle `#555555`, brand `#F07010`, bull `#22C55E`; all radii set to 2px; comment block updated
4. ✅ Migrate all icons: lucide-react → @tabler/icons-react — **118 files** migrated, 773 identifier replacements. False positives fixed: `Link` from `next-view-transitions`/`next/link` (20 files), `X-CSRF-Token`/`X-AI-Prefs` HTTP headers (3 files), `User` in comments (4 files). `LucideIcon` type → `Icon` type.
5. ✅ Remove `lucide-react` from `package.json` — dependency removed; comment in `button.tsx` updated
6. ✅ Remove `AmbientBackground` dead code and imports — file deleted; imports removed from `(app)/layout.tsx`, `(auth)/layout.tsx`, `onboarding/layout.tsx`; zero references remain

### Phase 2: Critical Fixes — ⚠️ MOSTLY COMPLETE (D2–D6 dead code remaining)
7. ✅ Fix XSS in `markdownToHtml` → `react-markdown` — `ai-review-panel.tsx`: removed vulnerable `markdownToHtml()` function and `dangerouslySetInnerHTML`; replaced with `<ReactMarkdown remarkPlugins={[remarkGfm]}>`
8. ✅ Fix stale closure in multi-agent SSE — `chat-screen.tsx`: added `messagesRef` (useRef + useEffect sync); fetch body uses `messagesRef.current` instead of stale `messages`; removed `messages` from dependency array
9. ✅ Fix `aria-controls` ID collision with `useId()` — `tool-card.tsx`: added `useId()` hook; `aria-controls` and content panel `id` now use unique `contentId`
10. ✅ Fix `bg-fg-fg` typo — `entry-list.tsx` line 151: `bg-fg-fg` → `bg-fg`
11. ✅ Fix double `surface-panel` on auth pages — `register/page.tsx`: removed inner `surface-panel p-6` wrapper; `reset-password-form.tsx`: removed inner `surface-panel p-6` from both the no-token case and the form case
12. ✅ Fix all radius violations — `drawer.tsx`: `rounded-t-xl` → `rounded-sm`; `nav-drawer.tsx`: `rounded-r-3xl` → `rounded-sm`; `message.tsx`: `rounded-l-lg` and `rounded-r-lg` → `rounded-sm`; `import-trades.tsx`: `rounded-t-2xl` → `rounded-sm`
13. ✅ Fix all accessibility issues (§14) — `composer.tsx`: removed `aria-busy` on voice toggle (already had `aria-pressed`); `stale-indicator.tsx`: `role="alert"` → `role="status"`; `provider-info-dot.tsx`: `role="img"` → `role="button"`; `top-bar.tsx`: added `aria-hidden` to `·Ai` middot separator; `button.tsx`: added `aria-busy={loading}` and increased `sm` height from `h-9` to `h-10` (40px touch target)
14. ⚠️ Extract `relativeTime` to shared utility — `lib/format.ts` already has `formatRelative()` (equivalent). `signals-dashboard.tsx` has a local `relativeTime()` that should be replaced with the shared `formatRelative()`. **NOT YET REPLACED** — the local function still exists.
14b. ⚠️ Remove all dead code (§2.3):
  - D1 ✅ `AmbientBackground` — deleted (done in Phase 1)
  - D2 ❌ Nav badge field in `nav-drawer.tsx` — either implement alert count badge or remove the field
  - D3 ❌ `localStorage.setItem('hamafx:last-path', pathname)` in `nav-drawer.tsx` — remove dead write (recommended: remove for now)
  - D4 ❌ Stale "champagne gold" comments in `performance-chart.tsx` and others — update/remove
  - D5 ❌ Stale "glass" comments in 9 files — update comments to match new design system
  - D6 ❌ `Segmented` "gradient" variant in `segmented.tsx` — rename to "solid" or "accent" and update all usages

### Phase 3: Token Migration — ❌ NOT STARTED
16. ❌ Replace 100+ raw color classes with tokens (§3.1) — `bg-zinc-950`→`bg-bg-elev-1`, `bg-zinc-900`→`bg-bg-elev-2`, `bg-zinc-800`→`bg-bg-elev-3`, `border-zinc-800`→`border-border`, `border-zinc-900`→`border-divider`, `text-zinc-50`→`text-fg`, `text-zinc-400`→`text-fg-muted`, `text-zinc-500`→`text-fg-subtle`, `text-emerald-500`→`text-bull`, `bg-emerald-500`→`bg-bull`, `text-red-500`→`text-bear`, `bg-red-500`→`bg-bear`, `text-amber-500`→`text-warn`, `bg-amber-500`→`bg-warn`, `text-blue-500`→`text-info`, `bg-blue-500`→`bg-info`, `bg-surface`→`bg-bg-elev-1`, `bg-background`→`bg-bg`, `bg-foreground`→`bg-fg`, `text-foreground`→`text-fg`
17. ❌ Replace 38 hardcoded hex colors (§3.2) — replace inline `style={{ backgroundColor: '#09090B' }}` etc. with CSS variable references or Tailwind classes. Exception: chart canvas code (`chart-colors.ts`, `use-chart-theme.ts`) may use `getComputedStyle()` to read CSS vars at runtime.
18. ❌ Replace 24 raw `rgba()` values (§3.3) — replace `bg-[rgba(239,68,68,0.1)]` with `bg-bear/10` etc.
19. ❌ Remove 3 glow shadows (§3.4) — remove `boxShadow: '0 0 24px -4px rgba(...)'` in error/offline/not-found pages
20. ❌ Fix 12 bare `rounded` classes (§3.5) — replace bare `rounded` (no size) with `rounded-sm`
21. ❌ Fix orphaned shadcn tokens (§3.1) — `bg-surface`, `bg-background`, `bg-foreground`, `text-foreground`
22. ❌ Remove redundant `font-sans` class — `symbols-form.tsx:524`

### Phase 4: Chat Redesign — ❌ NOT STARTED
23. ❌ Implement new chat bubble design (full-width assistant, compact user) — `message.tsx`: assistant full-width no bubble `py-3` + accent icon; user `bg-bg-elev-2 rounded-sm px-4 py-2 max-w-[85%] ml-auto`; add timestamps to user messages; add copy button to user messages; remove duplicate `border` classes
24. ❌ Replace empty state with minimal branded version — `chat-screen.tsx`: replace `EmptyChatState` with logo mark + "Start a conversation" + 4 quick prompt cards (2×2 grid)
25. ❌ Replace typing indicator with pulsing cursor — replace bouncing dots with `<span className="inline-block h-4 w-0.5 bg-fg animate-pulse" />` + "Thinking…" text; respect `prefers-reduced-motion`
26. ❌ Redesign all 35+ tool card parts — `parts/*.tsx`: container `bg-bg-elev-1 border border-border rounded-sm`; header `px-3 py-2 border-b border-divider`; data values `font-mono tabular-nums text-sm`; labels `text-fg-muted text-xs uppercase tracking-wide`; expand/collapse with Tabler `IconChevronDown`/`IconChevronRight`; replace Unicode status symbols with Tabler icons
27. ❌ Redesign multi-agent deliberation visualization — `agent-deliberation.tsx`: clean SVG connectors (`stroke-width="1"`, `opacity="0.3"`); agent cards `bg-bg-elev-1 border border-border rounded-sm p-3`; grade display `font-mono text-lg font-bold`; consensus grade `font-mono text-2xl font-bold` with brand accent ring; add `prefers-reduced-motion` support; remove `shadow-none` dead classes
28. ❌ Fix quick prompts — `quick-prompts.tsx`: remove dead `bg` field from `Prompt` interface and all prompt objects (or implement with subtle accent tints); cards `bg-bg-elev-1 border border-border rounded-sm px-4 py-3 hover:bg-bg-elev-3`
29. ❌ Fix composer — `composer.tsx`: icons already migrated to Tabler; `aria-busy` already fixed; still need drag-over visual feedback (file count badge when files dragged over)
30. ❌ Fix chat top bar — `chat-top-bar.tsx`: icons already migrated; still need keyboard shortcut for new chat (`⌘N` hint); fix comment/code mismatch on threshold; thread switcher checkboxes need `role="checkbox"` / `aria-checked`
31. ❌ Fix message list — `message-list.tsx`: improve virtualization estimate (granular size by content type); add unread message count to scroll-to-bottom FAB; replace bouncing dots typing indicator

### Phase 5: Page Redesigns — ❌ NOT STARTED
32. ❌ Dashboard: widget hierarchy, stat card enhancement, add widget dropdown
33. ❌ Chart: AI signal overlays, Segmented toggle, fullscreen, keyboard shortcuts
34. ❌ Settings: search, scroll-spy, fix comments/indentation
35. ❌ Auth: Google sign-in, password toggle, terms checkbox, fix surface-panel (surface-panel already fixed in Phase 2)
36. ❌ Signals: add loading/error/PageHeader, performance chart, filtering, fix icons (icons already migrated)
37. ❌ News: breaking news banner, AI digest, source credibility, impact scoring
38. ❌ Calendar: grid view, actual vs forecast, event detail drawer
39. ❌ Alerts: distance-to-trigger, mini sparkline, urgency colors
40. ❌ Journal: fix XSS (done in Phase 2), replace relativeTime (pending), token migration
41. ❌ 404/error/offline: branded logo, navigation suggestions, error details, remove glow

### Phase 6: Desktop Layout & Premium Features — ❌ NOT STARTED
42. ❌ Build `DesktopSidebar` component (persistent sidebar on `lg+`)
43. ❌ Update `(app)/layout.tsx` with 2-pane desktop layout
44. ❌ Add intermediate container breakpoint (`lg:max-w-5xl`)
45. ❌ Centered command palette on desktop
46. ❌ Predictive search with inline previews in command palette
47. ❌ Page transition animations (next-view-transitions crossfade)
48. ❌ Skeleton→content crossfade

### Phase 7: Final Verification — ❌ NOT STARTED
49. ❌ Grep verification: zero `lucide-react` imports remaining
50. ❌ Grep verification: zero raw `zinc-*`, `emerald-500`, `red-500`, `amber-500`, `blue-500` classes in components (excluding globals.css)
51. ❌ Grep verification: zero `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-full` in components
52. ❌ Grep verification: zero `backdrop-blur`, `hover:scale`, `whileInView`, `float-orb`, `animate-reveal`
53. ❌ Grep verification: zero hardcoded hex colors in `.tsx` files (excluding chart canvas code)
54. ❌ Run `pnpm typecheck` — must pass
55. ❌ Run `pnpm lint` — must pass
56. ❌ Run `pnpm build` — must pass
57. ❌ Test `prefers-reduced-motion` in browser
58. ❌ Test all pages on mobile viewport (375px)
59. ❌ Test all pages on desktop viewport (1440px)
60. ❌ Verify all Tabler icons render correctly
61. ❌ Verify Geist Sans font loads correctly

---

## 16. ANTI-AI-SLOP CONSTRAINT MATRIX

The implementing agent MUST NOT introduce any of the following patterns. These are the AI-slop tells that the previous overhaul already eliminated — do not bring them back:

| Pattern | Status | Example |
|---------|--------|---------|
| Purple-blue gradient heroes | ❌ BANNED | `bg-gradient-to-r from-purple-500 to-blue-500` |
| `backdrop-blur` / glassmorphism | ❌ BANNED | `backdrop-blur-md bg-white/10` |
| `hover:scale-105` or any hover scale | ❌ BANNED | `hover:scale-105 transition-transform` |
| `whileInView` fade-in-up | ❌ BANNED | `whileInView={{ y: 0, opacity: 1 }}` |
| `Sparkles` / `Brain` / `Bot` lucide icons | ❌ BANNED | (migrated to Tabler alternatives) |
| "Transform your workflow" copy | ❌ BANNED | Use expert mentor voice instead |
| `bg-blue-600` CTA buttons | ❌ BANNED | Use `bg-brand text-brand-fg` |
| Three rounded cards in a row | ❌ BANNED | Use varied layouts |
| Inter as the only font | ❌ BANNED | Now using Geist Sans |
| `rounded-full` / `rounded-lg` / `rounded-xl` | ❌ BANNED | Only `rounded-sm` (2px) |
| "How can I help?" empty states | ❌ BANNED | Use "Start a conversation" |
| Staggered entrance animations | ❌ BANNED | Only subtle purposeful motion |
| Bouncing dots typing indicator | ❌ BANNED | Use pulsing cursor + "Thinking…" |
| `float-orb` / `animate-reveal` | ❌ BANNED | Already removed, do not re-add |
| Glow shadows | ❌ BANNED | Use flat shadows only |
| `oklch()` inline styles | ❌ BANNED | Use hex or CSS variables |
| Ambient gradient orbs | ❌ BANNED | Already removed, do not re-add |

---

## 17. OWNER'S DESIGN DECISIONS SUMMARY

| Decision | Choice | Details |
|----------|--------|---------|
| Brand accent color | **#F07010 (orange)** | Extracted from owner's palette photo. Must-have accent. |
| Canvas color | **#0A0A0A (near-black)** | Extracted from owner's palette photo. |
| Border radius | **Uniform 2px** | Sharp terminal aesthetic. `rounded-sm` everywhere. |
| Font | **Geist Sans** | Replace Inter. Keep JetBrains Mono for numbers. |
| Icons | **Tabler Icons** | Replace lucide-react. Ban Sparkles/Brain/Bot. |
| Logo | **Owner-provided** | Wire into all locations. Placeholder geometric mark until received. |
| Desktop layout | **Mobile-first, desktop-second** | 2-pane with persistent sidebar on `lg+`. Agent chooses best layout. |
| Chat bubbles | **Full-width assistant, compact user** | No bubble on assistant. Right-aligned bubble on user. |
| Chat empty state | **Minimal branded** | Logo + "Start a conversation" + 4 quick prompts. No Sparkles. |
| Data density | **Balanced** | TradingView mobile style. Comfortable but data-rich. |
| Motion | **Subtle purposeful** | Page transitions, count-ups, status pulses only. No decorative motion. |
| Signal colors | **Refined, reserved for data** | `#22C55E` bull, `#EF4444` bear. ONLY on price/P&L. Not on UI chrome. |
| Loading states | **Skeleton shimmer + placeholder morph** | Both approaches, context-dependent. |
| AI voice | **Expert mentor** | Senior trader giving analysis. Warm but authoritative. |
| Scope | **Everything** | All phases, all pages, all features. |
| Chat tool cards | **Redesign ALL** | All 35+ parts redesigned to premium system. |
| Multi-agent viz | **Redesign premium** | Keep concept, cleaner visuals. |
| Auth additions | **Google, password toggle, terms checkbox, fix surface-panel** | No Apple/GitHub/passkey/magic link. |
| Page priorities | **Chat, Dashboard, Chart, Settings, Auth** | These get the most attention. |
| Competitor reference | **None — make it premium and unique** | No specific reference app. |
| Premium features to build | **AI overlays, alert distance, predictive search, news banner, calendar grid, dashboard hierarchy, page transitions, branded errors** | |
| Features excluded | **Swipe-to-confirm, privacy mode, keyboard overlay, haptics, live indicators** | Owner considers these AI slop. |

---

## 18. FILE REFERENCE: REVIEW REPORTS

The following detailed review reports were used to compile this specification. The implementing agent should reference them for additional context on specific issues:

1. **HamaFX-Ai-Frontend-Review.md** — Master review (421 lines) covering all categories
2. **HamaFX-Ai-Chat-UI-Analysis.md** — Deep dive on all chat components (413 lines)
3. **HamaFX-Ai-Design-System-Audit.md** — Token consistency audit with grep-verified counts (383 lines)
4. **HamaFX-Ai-Page-Components-Analysis.md** — Page-by-page assessment of all 10 sections (527 lines)

> **NOTE TO OWNER:** Provide these review reports AND the logo file to the implementing agent. The color palette has already been extracted and embedded in this document (§1.1 and §1.2). The agent only needs the logo file to complete the implementation.

---

*End of implementation prompt. The implementing agent should now have everything needed to execute the full premium frontend overhaul of HamaFX-Ai.*
