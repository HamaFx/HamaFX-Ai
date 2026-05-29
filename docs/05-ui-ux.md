# 05 — UI / UX

> Design philosophy: **dense but quiet**. Trading UIs fail when they feel busy. Information density comes from hierarchy, not noise.
>
> **Phase 6 update (Nov 2026)**: bottom navigation has been retired in favour of a left-side nav drawer triggered from the top bar. Theme refactored to pure neutral grayscale ("premium black"). News, calendar, and settings rebuilt as proper trading-desk surfaces with filters, time bucketing, sentiment pulse, system status, and a local-prefs panel.

## Design north stars

1. **Mobile-first, thumb-zone aware** — primary CTAs live in the bottom 35% of the screen (login submit, drawer Save Entry, etc.).
2. **One subject per screen** — at most one "primary" thing visible at a time on mobile.
3. **Single global menu** — every page has the same hamburger trigger in the top bar that opens the same `<NavDrawer/>`.
4. **Calm pure-black dark theme** with warm champagne-gold brand. No light theme yet.
5. **Numbers > words** — prices, deltas, and times are first-class typographic citizens via `tabular-nums`.

## Information architecture

```
(app)
├── /chat                  ← default landing (server redirect to most recent thread)
│   └── /[threadId]
├── /chart/[symbol]
│   └── /pro               ← env-gated TradingView Advanced widget
├── /news
├── /calendar
├── /alerts
├── /journal
├── /settings
│   └── /usage             ← detailed cost & token breakdown
└── /offline               ← service-worker fallback
```

The `/more` route was deleted in Phase 6 — every destination is in the nav drawer.

## App shell

```
┌────────────────────────────────────────────┐
│ [☰]  HamaFX-Ai                  [right]    │ ← TopBar (sticky, glass, h=56)
├────────────────────────────────────────────┤
│                                            │
│  Page content                              │
│  (scrollable, max-w-2xl, px-4)             │
│                                            │
│                                            │
└────────────────────────────────────────────┘
```

- **Hamburger ☰** opens the global nav drawer (single instance, context-controlled).
- **Brand mark** centers and links to `/chat`.
- **Right slot** is page-defined (e.g. timeframe picker on chart, thread switcher inside chat).
- The chat route renders its own `<ChatTopBar/>` and the global TopBar is suppressed there to avoid a double header.

### Why a side drawer instead of a bottom nav?

The bottom nav we shipped in Phase 5 was eating ~88px of permanent vertical chrome on a 932px iPhone canvas (~9.4% of the visible area) and forcing us into a 5-item compromise that needed a `/more` overflow page. Mounting the same `<NavDrawer/>` once at the layout level and triggering it from a hamburger:

- Returns the full canvas to every page (chat especially benefits — composer + last message both fit above the fold).
- Eliminates the "two drawer instances accidentally compete" bug that produced the "menu sometimes doesn't open" report.
- Lets the drawer hold sectioned destinations (Markets / Personal) and identity strip with breathing room a 5-item bottom bar never had.

### Nav drawer (single global instance)

```
┌────────────────────────────────────────┐
│  ⭐ HamaFX·Ai                          │
│     Personal trading copilot           │
│                                        │
│  MARKETS                               │
│  ┌──────────────────────────────────┐  │
│  │  💬  Chat                        │● │
│  │      Ask anything about your…    │  │
│  ├──────────────────────────────────┤  │
│  │  📈  Chart                       │  │
│  │      Live candles + structure    │  │
│  ├──────────────────────────────────┤  │
│  │  📰  News                        │  │
│  │      Tagged headlines            │  │
│  ├──────────────────────────────────┤  │
│  │  📅  Calendar                    │  │
│  │      Macro events                │  │
│  └──────────────────────────────────┘  │
│                                        │
│  PERSONAL                              │
│  ┌──────────────────────────────────┐  │
│  │  🔔  Alerts                      │  │
│  │  📓  Journal                     │  │
│  │  ⚙️   Settings                   │  │
│  └──────────────────────────────────┘  │
│  ──────────────────────────────────    │
│  ↩️   Sign out                         │
└────────────────────────────────────────┘
```

Implementation: `vaul` Drawer with `direction="left"`, mounted once in `(app)/layout.tsx`. State lives in `<NavDrawerProvider>`; `<NavTrigger>` calls `setOpen(true)`. Auto-closes on route change.

## Chat surface (mobile)

```
┌────────────────────────────────────────────┐
│ [☰]   ( ✦ HamaFX-Ai copilot )   [+] [⋯]    │  ChatTopBar (h=56, glass, dynamic island)
├────────────────────────────────────────────┤
│                                            │
│           ✦                                │  Empty state: 80×80 sparkle
│        How can I help?                     │  orb, h2, helper text,
│  Ask about gold, EUR, GBP — bias,…         │  embedded quick-prompts
│                                            │  grid (no separate panel).
│  ┌────────────┐  ┌────────────┐            │
│  │ 📈 Bias on │  │ 📈 Top-down│            │
│  │ gold       │  │ 4H→15M     │            │
│  ├────────────┤  ├────────────┤            │
│  │ 📊 Show me │  │ 📅 Today's │            │
│  │ structure  │  │ calendar   │            │
│  ├────────────┴──┤───────────┐│            │
│  │ 🔔 Alert XAU  │            │            │
│  │ above 2400    │            │            │
│  └────────────────┘            │            │
│                                            │
├────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐ │
│ │ [📷]                     [🎤] [↑/■] │ │
│ │ Type a message…                        │ │
│ └────────────────────────────────────────┘ │  Composer (Unified Box, floating pill)
└────────────────────────────────────────────┘
```

Tool calls render as **typed inline parts** via `packages/ai/src/tools/*` ↔ `apps/web/src/components/chat/parts/*`; see `07-ai-agent.md`.

### Chat features (Phase 6 Modernization)

- **Unified Box Composer**: The chat input is a single, encapsulating rounded container (`rounded-[28px]`). The textarea spans full width at the top, and utility icons (Attach, Voice, Send) sit in a dedicated bottom row, improving readability for long prompts.
- **Dynamic Island Header**: The chat title and AI status are enclosed in a perfectly centered `rounded-full` pill in the header, keeping the context strongly visually grounded.
- **Circular Utility Iconography**: Header action buttons (Menu, New Chat, More) and composer utilities use perfectly circular `rounded-full` tap targets, mirroring modern native iOS aesthetics.
- **Stop streaming**: send button morphs into a Stop button while a turn is in flight (wired to AI SDK's `stop()`).
- **Regenerate**: hover/focus the last assistant message to reveal a Regenerate affordance (drives `regenerate()`).
- **Light Markdown**: bold / italic / inline-code / fenced blocks (with copy) / bullets / numbered lists / https links. DOM-built in `chat/parts/text.tsx`, no `dangerouslySetInnerHTML` — no injection sink.
- **Initial-mount auto-scroll**: instant `scrollTop = scrollHeight` so the thread opens at the latest message; smooth-scroll only fires on new content if the user is within 240px of the bottom.
- **Voice input**: pulsing "Listening…" pill above the row + soft amber ring on the mic trigger.
- **Keyboard hint**: `Enter` / `Shift+Enter` legend appears on focus (desktop only).
- **Code-block copy** per fenced block.
- **Thread switcher** in the overflow menu (⋯), with auto-search input when there are >5 threads.
- **Ask AI deep-link**: `/chat?prompt=...` creates a fresh thread and auto-submits the prompt once on mount. Used by news article cards and calendar event cards.

## Chart surface (mobile)

```
┌────────────────────────────────────────────┐
│ [☰] HamaFX·Ai                              │
├────────────────────────────────────────────┤
│ XAU   EUR   GBP                $2384.12 ▲  │  Sticky sub-header (glass)
│ [1m 5m 15m 30m 1h 4h 1d 1w]    🔄 ⚙ 🖥     │  TF picker scrolls horiz.
├────────────────────────────────────────────┤
│                                            │
│   ── candles + overlays ──                 │  lightweight-charts wrapper
│                                            │
│                                            │
└────────────────────────────────────────────┘
```

- Sticky sub-header offset uses `var(--topbar-h)` so it always sits flush under the global TopBar.
- TF picker is a horizontally-scrolling row so all 8 timeframes stay reachable on 430px without truncation.
- `<StaleIndicator>` renders next to the overlays trigger when TanStack Query is background-refetching.
- Pro chart shortcut (Maximize2 icon) is gated by `NEXT_PUBLIC_TRADINGVIEW_ENABLED=1`.

## News surface (Phase 6)

```
┌────────────────────────────────────────────┐
│ News pulse                  Mixed          │  Stacked sentiment bar at top:
│ 47 headlines                               │  bullish / neutral / untagged /
│ ▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱                          │  bearish proportional split
│ ● Bullish 14 (30%)  ● Bearish 11 (23%) …   │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ 🔍 Search headlines…                       │
└────────────────────────────────────────────┘

[All] [▲ Bullish] [▼ Bearish] [· Neutral]    ← sentiment chip rail
[All] [USD] [XAUUSD] [EUR] [GBP] …            ← symbol chip rail (by frequency)
[🔖 Saved · 3]                  [↻ Updated 2m ago]

  TODAY · 12 ──────────────────────────────  ← sticky day bucket
  ┌──────────────────────────────────────┐
  │▌ Reuters · 14m ago        ▲ +0.42    │
  │  Big bold headline (clamped 3)        │
  │  Optional summary, clamped 2 lines    │
  │  [USD] [#cpi] [#fed]                  │
  │  ──────────────────────────────────  │
  │  ✦ Ask AI · 🔖 Save · ↗ Open         │
  └──────────────────────────────────────┘
```

- **Sentiment ribbon** (3px) on the left edge of every card encodes sentiment for at-a-glance scanning.
- **Bookmarks** persist in `localStorage` (key `hamafx:news:bookmarks`) with cross-tab `storage` event sync.
- **Auto-refresh** every 5 minutes via TanStack Query + an explicit "Updated Xm ago" pill that doubles as a manual refresh.
- **Time buckets**: Last hour / Today / Yesterday / This week / Older. Sticky headers under the top bar.
- **Ask AI** deep-links to `/chat?prompt=…` with the headline + URL pre-filled.

## Calendar surface (Phase 6)

```
┌────────────────────────────────────────────┐
│ ⚡ FOMC interest-rate decision             │  Hero card:
│  in 4h 22m · USD                       ✦  │  countdown to next high-impact
│                                            │
│  NEXT 14 DAYS                  3 today · 17│
│  ▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱                          │  impact distribution bar
│  ● High 4   ● Medium 9   ● Low 4          │
└────────────────────────────────────────────┘

[All] [▲ High] [■ Medium] [• Low]            ← importance chip rail
[All] [USD] [EUR] [GBP]    [Show past]       ← currency + past toggle
                          [↻ Updated 2m ago]

  TODAY · 3 ────────────────────────────────  ← sticky day bucket
  ┌──────────────────────────────────────┐
  │▌ [▲ USD]  United States · 14:30 EST  │  Importance ribbon on left
  │  in 4h 22m                            │  Red/amber/neutral
  │  Big bold title (clamped 2)          │
  │  Forecast 0.3 · Prev 0.2 · Actual —  │
  │  ──────────────────────────────────  │
  │  ✦ Ask AI · 🔔 Remind me             │
  └──────────────────────────────────────┘
```

- **Hero card** with live countdown (re-renders every 60s via a `useNowTick` hook) + Ask AI shortcut.
- **Impact bar** shows the next-14-days distribution so the user can gauge how event-heavy the week is.
- **Importance glyph** (▲/■/•) on every card so the cue isn't color-only.
- **Beat / miss chip** appears when both `actual` and `forecast` are present.
- **Remind me** uses the browser Notifications API to fire a system notification 5 minutes before the event. Local one-shot `setTimeout`, no server queue.
- **Ask AI** deep-link prefilled with the event name + time.
- **Auto-refresh** matches the news pattern.

## Settings surface (Phase 6)

Six structured cards, top to bottom:

1. **System status** — per-channel chips (Email / Telegram / Web push) with green Ready vs muted Off pills derived from env vars; live count of subscribed devices for web push; database connectivity probe; rollup pill ("All systems" / "Some channels off").
2. **Usage at a glance** — daily-budget gauge (green→amber→red as % climbs), 7d/30d totals, 30d turn count. Whole card is a Link to `/settings/usage`.
3. **Notifications** — Email / Telegram / Web push, each with a Ready/Off status pill and the existing test-button island.
4. **Preferences** *(new, local)* — default symbol (XAU/EUR/GBP), time format (12h/24h), force-reduce-motion. All `localStorage`-backed; reduce-motion writes a `data-reduce-motion="force"` attribute to `<html>` that the global CSS honours.
5. **Data & cache** *(new)* — clear bookmarks, reset preferences, clear all `hamafx:*` localStorage keys. Each destructive action gated by `<ConfirmDrawer>` with live counts.
6. **Session** — drawer-confirmed sign-out + a tiny footer with the resolved build id and Next.js / Vercel callout for bug-report disambiguation.

## Design tokens

Defined in `apps/web/src/app/globals.css` (Tailwind v4 `@theme` block + `:root` for layout/gradients).

### Color (semantic, pure neutral)

```css
@theme {
  /* Surfaces — pure neutral grayscale (no blue tint) */
  --color-bg:        oklch(8% 0 0);
  --color-bg-elev-1: oklch(12% 0 0);
  --color-bg-elev-2: oklch(16% 0 0);
  --color-bg-elev-3: oklch(20% 0 0);
  --color-border:    oklch(22% 0 0);
  --color-divider:   oklch(28% 0 0 / 0.4);
  --color-overlay:   oklch(0% 0 0 / 0.75);

  /* Glass surfaces — black-tinted base */
  --color-glass:        oklch(12% 0 0 / 0.6);
  --color-glass-strong: oklch(12% 0 0 / 0.78);
  --color-glass-edge:   oklch(96% 0 0 / 0.06);

  /* Text */
  --color-fg:        oklch(96% 0 0);
  --color-fg-muted:  oklch(76% 0 0);
  --color-fg-subtle: oklch(60% 0 0);

  /* Brand — refined champagne gold */
  --color-brand:    oklch(82% 0.14 85);
  --color-brand-fg: oklch(8% 0 0);

  /* Accent — desaturated indigo */
  --color-accent: oklch(70% 0.14 285);

  /* Market states */
  --color-bull:    oklch(72% 0.18 152);
  --color-bear:    oklch(70% 0.22 25);
  --color-neutral: oklch(70% 0 0);
  --color-warn:    oklch(82% 0.14 80);
  --color-info:    oklch(74% 0.14 230);
}
```

The previous Phase 5 theme had blue-tinted surfaces (`chroma 0.018 hue 265`) which read as "dark blue" rather than "premium black" on most displays. Phase 6 zeroes out the chroma on surfaces; brand/state colours stay vivid for contrast.

### Layout tokens

```css
:root {
  --topbar-h: 56px;
  --fab-bottom: calc(env(safe-area-inset-bottom) + 16px);
  --toast-bottom: calc(env(safe-area-inset-bottom) + 16px);

  /* 8-pt grid */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 48px;  --space-8: 64px;
  --space-9: 80px; --space-10: 96px;

  --touch-min: 44px;
}
```

Sticky elements reference `var(--topbar-h)` so changing the chrome height updates everything.

### Themeable gradients & shadows

```css
:root {
  --gradient-brand:        linear-gradient(135deg, oklch(85% 0.14 85), oklch(78% 0.15 70));
  --gradient-danger:       linear-gradient(135deg, oklch(72% 0.22 25), oklch(64% 0.22 15));
  --gradient-brand-soft:   linear-gradient(135deg, oklch(82% 0.14 85 / 0.16), oklch(70% 0.14 285 / 0.12));
  --gradient-accent:       linear-gradient(135deg, oklch(70% 0.14 285), oklch(74% 0.14 230));

  --shadow-inset-edge:      inset 0 1px 0 0 oklch(100% 0 0 / 0.12);
  --shadow-inset-edge-soft: inset 0 1px 0 0 oklch(100% 0 0 / 0.06);
  --shadow-brand-press:     0 8px 24px -6px oklch(82% 0.14 85 / 0.45), var(--shadow-inset-edge);
  --shadow-brand-press-strong: 0 12px 32px -8px oklch(82% 0.14 85 / 0.5), 0 0 0 1px oklch(82% 0.14 85 / 0.25), inset 0 1px 0 0 oklch(100% 0 0 / 0.18);
  --shadow-danger-press:    0 8px 24px -6px oklch(70% 0.22 25 / 0.45), var(--shadow-inset-edge);
}
```

Components reference these via `style={{ backgroundImage: 'var(--gradient-brand)' }}` instead of inlining OKLCH stops, so a future theme change touches one file.

### Typography

- **Inter Variable** for sans (loaded via `next/font/google`, `display: 'swap'`).
- **JetBrains Mono Variable** for mono.
- Type scale (rendered px): 11 / 12 / 14 / 16 / 18 / 20 / 24 / 30.
- Numerical readouts use `font-feature-settings: "tnum","cv01"` via the `.tabular-nums` utility.

### Motion

- `motion/react` with `LazyMotion + domAnimation` mounted once in `<MotionRoot>` (~25 KB gz vs ~40 KB full).
- Spring defaults `{ stiffness: 400, damping: 30 }`.
- Durations: `150–300ms` for micro-interactions, `≤400ms` for layout transitions.
- `prefers-reduced-motion` is honoured globally via the CSS rule on `*` *and* a user-forced override (`data-reduce-motion="force"` set by the Preferences card).

### Density

| Token            | Mobile | Desktop |
| ---------------- | ------ | ------- |
| Page padding     | 16px   | 24–32px |
| Card padding     | 16px   | 16–24px |
| Tap target (min) | 44×44  | 36×36   |
| Stack gap        | 12 / 16| 16 / 24 |

## Component inventory

### Layout primitives (`apps/web/src/components/layout/`)

- `<TopBar/>` — sticky glass top bar, hidden on `/chat` (chat has its own).
- `<NavTrigger/>` — hamburger button; both top bars use it.
- `<NavDrawer/>` — single global drawer instance, opened via context.
- `<NavDrawerProvider/>` + `useNavDrawer()` — context state for the drawer.
- `<AmbientBackground/>` — subtle warm orb + (login only) noise filter.
- `<OfflineBanner/>` — sticky pill at the bottom while offline.
- `<PageHeader/>` — title + optional icon + description for non-chat pages.
- `<SkipToContent/>` — keyboard skip link, visible on focus only.

### Chat primitives (`apps/web/src/components/chat/`)

- `<ChatScreen/>` — full-bleed surface (`fixed inset-0 z-50`).
- `<ChatTopBar/>` — chat-specific top bar with thread switcher in overflow menu.
- `<MessageList/>` + `<Message/>` — bubbles with hover/focus action row (Copy, Regenerate).
- `<Composer/>` — auto-grow textarea, image attach, voice input, Send/Stop morph button.
- `<QuickPrompts/>` — semantic-coloured chip grid embedded in the empty state.
- `chat/parts/text.tsx` — light Markdown renderer.
- `chat/parts/registry.tsx` — typed dispatch from `tool-<name>` parts to bespoke renderers.

### UI primitives (`apps/web/src/components/ui/`)

- `<Button/>` — variants `primary | secondary | ghost | danger | success`, sizes `sm (40) | md (48) | lg (56)`.
- `<Input/>` — h-12, text-base (kills iOS auto-zoom).
- `<Drawer/>` — vaul wrapper.
- `<Fab/>` — references `--fab-bottom`.
- `<Tooltip/>` — CSS-only, hover + focus-within.
- `<ConfirmDrawer/>` + `useConfirm()` — replaces native `confirm()`.
- `<Skeleton/>` / `<SkeletonCard/>` — shimmer placeholder.
- `<Segmented/>` — single primitive replacing the four ad-hoc segment groups; variants `gradient | solid | tone`.
- `<Switch/>` — pure CSS toggle (used by the Preferences card).
- `<StaleIndicator/>` — renders while a query is background-refetching.
- `<EmptyState/>` — single empty/zero-data card primitive, tones `brand | muted`.
- `<StatCard/>` — 2-line numeric summary with optional sparkline.
- `<Sparkline/>` — minimal SVG line chart.
- `<AnimatedNumber/>` — spring-tweened number for live prices (state-bound subscription so it stops scheduling work after settle).

### Chart primitives (`apps/web/src/components/chart/`)

- `<Chart/>` — `lightweight-charts` wrapper; never instantiate the lib directly in a page.
- `<SymbolPicker/>` / `<TimeframePicker/>` — both wrap `<Segmented/>`.
- `<PriceTag/>` — live price + delta + arrow.

### News / calendar / settings (page-local)

- News: `<SentimentSummary/>`, `<NewsToolbar/>`, `<NewsView/>`, `<ArticleCard/>`, `useBookmarks()`.
- Calendar: `<CalendarHero/>`, `<CalendarToolbar/>`, `<CalendarView/>`, `<EventCard/>` (with `RemindButton`).
- Settings: `<SystemStatusCard/>`, `<UsageGlance/>`, `<NotificationsCard/>`, `<PreferencesCard/>`, `<DataCard/>`, `<AboutCard/>`, `<SettingsRow/>`.

## Accessibility

- All interactive elements ≥ 44×44 tap target on mobile; visible focus rings (`outline: 2px solid var(--color-brand)`).
- `<SkipToContent/>` is the first focusable element; main content has `id="main-content"`.
- Color is never the only signal — sentiment chips include `▲`/`▼`/`·` glyphs; importance dots include `▲`/`■`/`•`.
- Live regions (`role="status" aria-live="polite"`) on offline banner, voice-listening pill, stale indicator, copy confirmation.
- Composer textarea is `text-base` so iOS Safari does not auto-zoom on focus.
- Reduced motion respected globally via media query AND user override (`data-reduce-motion="force"`).

## States and empty states

Every page must define:

1. **Loading** — `<Skeleton/>` matching final layout (no spinners).
2. **Empty** — `<EmptyState/>` with helpful copy + CTA.
3. **Error** — error boundary with retry.
4. **Stale** — `<StaleIndicator/>` while `isFetching && !isLoading` (Phase 6 enforced).

## Iconography

`lucide-react` exclusively. Sizes: `size-3.5` (inline), `size-4` (buttons / cards), `size-5` (nav), `size-6` (FAB / headers).

| Concept       | Icon                          |
| ------------- | ----------------------------- |
| AI / Agent    | `Sparkles`                    |
| Tool call     | `Wrench`                      |
| Citation      | `ExternalLink`                |
| Bull / Bear   | `TrendingUp` / `TrendingDown` |
| Alert         | `Bell` / `BellOff` / `BellRing` |
| Journal       | `BookOpen`                    |
| Bookmark      | `Bookmark` / `BookmarkCheck`  |
| Refresh       | `RotateCw`                    |
| Stop streaming| `Square` (filled)             |

The single intentional exception is the SVG `feTurbulence` noise filter rendered by `<AmbientBackground intensity="vivid">` on `/login` — used once for a controlled atmospheric effect, not as a structural icon.

## Wireframe sketches

Above sections include ASCII wireframes for chat, chart, news, and calendar surfaces. The settings page composes the six cards described in § Settings surface.
