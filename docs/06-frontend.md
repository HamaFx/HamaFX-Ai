# 06 — Frontend Architecture

## Overview

The HamaFX-Ai frontend is a Next.js 15 App Router application (`apps/web/`) using React 19, Tailwind CSS v4, and TanStack Query. It is a multi-tenant PWA — optimized for mobile-first use, installable to the home screen, and protected by a NextAuth session gate in edge middleware.

All source lives under `apps/web/src/`:

```
apps/web/src/
├── app/                    # Next.js App Router (pages, layouts, API routes)
│   ├── layout.tsx           # Root layout (fonts, providers, metadata)
│   ├── page.tsx             # / → redirects to /chat
│   ├── globals.css          # Design tokens, glass utilities, keyframes
│   ├── manifest.ts          # PWA manifest (standalone, portrait, black theme)
│   ├── not-found.tsx        # 404 page
│   ├── (auth)/              # /login, /register — NextAuth forms
│   ├── share/[id]/          # /share/[id] — public share w/ HMAC verification
│   └── (app)/               # Authenticated route group
│       ├── layout.tsx        # App shell: TopBar, NavDrawer, Toaster, etc.
│       ├── chat/             # /chat and /chat/[threadId]
│       ├── chart/[symbol]/   # /chart/[symbol] (TradingView Pro) and /chart/[symbol]/structure (Lightweight-charts SMC)
│       ├── news/             # /news — news feed with sentiment
│       ├── calendar/         # /calendar — economic calendar
│       ├── alerts/           # /alerts — alert management
│       ├── journal/          # /journal — trading journal
│       ├── settings/         # /settings, /settings/agent, /settings/usage
│       └── offline/          # /offline — offline fallback
├── components/             # Shared components
│   ├── layout/              # TopBar, NavDrawer, NavDrawerProvider, OfflineBanner, etc.
│   ├── chat/                # ChatScreen, Message, Composer, QuickPrompts, parts/*
│   ├── chart/               # Chart (lightweight-charts), overlays, price-tag, settings-drawer
│   ├── news/                # ArticleCard, LiveTimestamp, useBookmarks
│   ├── calendar/            # EventCard
│   ├── providers/           # QueryProvider, SwRegister, NuqsAdapter wrapper
│   └── ui/                  # shadcn/ui-style primitives (button, input, drawer, etc.)
├── hooks/                  # Custom React hooks
└── lib/                    # Utility libraries (api client, csrf, cn, etc.)
```

---

## Pages (13 Routes)

| Route | Type | Auth | Description |
|---|---|---|---|
| `/` | Server Component | No | Redirects to `/chat` |
| `/login` | Client/Server Component | No | NextAuth sign-in form, redirects to `callbackUrl` after success |
| `/chat` | Server Component | Yes | Landing — redirects to the most recent thread |
| `/chat/[threadId]` | Hybrid (RSC hydrate) | Yes | Full-screen chat: server loads thread+messages, client mounts `ChatScreen` with `useChat` |
| `/chart/[symbol]` | Hybrid | Yes | TradingView Pro Chart (default view, redirects to `/chart/[symbol]/structure` if `NEXT_PUBLIC_TRADINGVIEW_ENABLED !== '1'`) |
| `/chart/[symbol]/structure` | Hybrid | Yes | Lightweight-charts candlestick + SMC overlays + indicators |
| `/news` | Client Component | Yes | News feed with sentiment filter, bookmarks |
| `/calendar` | Client Component | Yes | Economic calendar with event cards |
| `/alerts` | Client Component | Yes | Alert CRUD list + form |
| `/journal` | Client Component | Yes | Trading journal with entries list, form, and stats summary |
| `/settings` | Server Component (force-dynamic) | Yes | Dashboard: system status, usage glance, agent card, AI prefs, notifications, preferences, data, about |
| `/settings/agent` | Server Component (force-dynamic) | Yes | Tool catalogue with 24h invocation telemetry (count, failures, p50/p95 latency) |
| `/settings/usage` | Server Component (force-dynamic) | Yes | Budget gauge, 7-day text-bar chart, per-model breakdown, recent turns |
| `/offline` | Static page | Yes | Offline fallback (served by SW when network is unavailable) |
| `/share/[id]` | Server Component | No | Public share page with HMAC token verification |

---

## Route Architecture

### Root Layout (`app/layout.tsx`)

Wraps everything in:
- **Fonts**: Inter variable (`--font-sans`) + JetBrains Mono (`--font-mono`)
- **ViewTransitions**: from `next-view-transitions` for animated page transitions
- **Providers**: `NuqsAdapter` (URL state) → `QueryProvider` (TanStack Query)
- **Metadata**: app title template `%s · HamaFX-Ai`, no-robots, PWA icons
- **Viewport**: device-width, max-scale 5, viewport-fit cover, dark theme-color

### Authenticated Shell (`(app)/layout.tsx`)

Shared by all authenticated pages under `/(app)/`. Renders:

```
<MotionRoot>                   # framer-motion config
  <NavDrawerProvider>          # single source of truth for menu state
    <SkipToContent />          # a11y skip link
    <AmbientBackground />      # fixed -z-10 subtle warm orb
    <SwRegister />             # deferred SW registration
    <TopBar />                 # sticky glass pill (hidden on /chat)
    <main id="main-content">   # max-w-2xl centered
      {children}
    </main>
    <NavDrawer />              # single global slide-in menu (vaul)
    <OfflineBanner />          # sticky network-state pill
    <Toaster />                # bottom-center sonner
  </NavDrawerProvider>
</MotionRoot>
```

### Chat Layout (`(app)/chat/layout.tsx`)

A pass-through — `return children`. The `ChatScreen` component renders its own full-bleed surface (`fixed inset-0 z-50`) that covers the global TopBar.

---

## Chat UI

### Overview

The chat experience is a full-bleed, mobile-first surface powered by the AI SDK's `useChat` hook. It supports streaming, image uploads, voice input, model-override regeneration, and deep-link auto-submit.

### ChatScreen Component

Location: `components/chat/chat-screen.tsx`

**Data flow**:

```
Server Component (chat/[threadId]/page.tsx)
  │
  ├─ getThread(id)           → validates thread exists
  ├─ listMessages(id, 200)   → hydrates UIMessage[] from Postgres
  ├─ listThreads(50)         → sidebar thread list
  │
  └─ passes to <ChatScreen>
       │
       ├─ useChat({ id, transport, messages: initialMessages })
       │   └─ DefaultChatTransport → POST /api/chat
       │       headers: X-CSRF-Token, X-AI-Prefs (localStorage)
       │       body: { threadId, messages, modelOverride? }
       │
       ├─ Auto-scroll: instant on mount, smooth when user < 240px from bottom
       ├─ Auto-title: after streaming completes, refetches thread to pick up LLM-generated title
       └─ Auto-submit: if `?prompt=` is present, sends it once per thread
```

**Layout**:

```
┌──────────────────────────────┐
│ ChatTopBar  ☰ · title · + · ⋯│  sticky, glass
├──────────────────────────────┤
│  Message scroll area          │  flex-1, no-overscroll
│  (or empty state w/ prompts) │  paint-isolated
├──────────────────────────────┤
│ Composer                      │  sticky, glass
└──────────────────────────────┘
```

### Message Component

Location: `components/chat/message.tsx`

Dispatches `UIMessage.parts` to type-specific renderers:

| Part Type | Renderer | Description |
|---|---|---|
| `text` | `TextPart` | Markdown rendered in a `.md-prose` container |
| `reasoning` | (hidden) | Skipped — internal model reasoning |
| `source-*` | (hidden) | Source citations, not shown to user |
| `file` | (hidden) | File metadata |
| `step-start` | (hidden) | Multi-step boundaries |
| `tool-{name}` | `ChatToolPart` | Tool invocation card with loading/done/error states |
| `data-citation-warning` | `CitationWarningPartView` | Tone-styled card when LLM makes unsupported claims |
| `data-verify-warning` | `CitationWarningPartView` | Reuses citation card with custom header |
| `data-plan` | `PlanPart` | Collapsible "Thinking" pill on system messages |

**Message hover actions** (assistant messages):

| Action | Description |
|---|---|
| Copy | Copies all text parts to clipboard, toast "Copied" |
| Edit (user only) | Inline textarea to modify the prompt, then resends |
| Regenerate | Calls `regenerate()` with the last user prompt |
| Regenerate with... | Popover menu: Lite (`gemini-2.5-flash-lite`), Flash (`gemini-2.5-flash`), Pro (`gemini-2.5-pro`) |

**Styling**:
- User messages: `rounded-3xl rounded-br-md`, brand gradient background, right-aligned
- Assistant messages: `glass-subtle rounded-3xl rounded-bl-md`, left-aligned
- Action row: `opacity-0 group-hover:opacity-100`, 32x32 pills

### Composer Component

Location: `components/chat/composer.tsx`

**Features**:

| Feature | Details |
|---|---|
| Text input | `<textarea>` with `field-sizing: content`, auto-resize up to 40dvh |
| Max characters | 8000, soft warning at 7500 |
| Image upload | Drag-drop or file picker, pre-uploaded to Supabase via `/api/upload`, max 4 images, 5 MB each |
| Voice input | Web Speech API, mic button with pulse animation, "Listening..." pill |
| Send/Stop button | Animated morph (motion/react): ArrowUp → Square when streaming |
| Keyboard | Enter to send, Shift+Enter for new line, desktop hint on focus |
| Paste handling | Clamps pasted text to max; handles pasted images |

### QuickPrompts Component

Location: `components/chat/quick-prompts.tsx`

5 chips shown in the empty chat state, 2-column grid on sm+:

| Prompt | Icon |
|---|---|
| "What's the bias on gold?" | TrendingUp |
| "Top-down XAUUSD 4H→15M" | LineChart |
| "Show me the structure" | BarChart3 |
| "Today's calendar" | CalendarDays |
| "Alert XAUUSD above 2400" | Bell |

### Chat Top Bar

Location: `components/chat/chat-top-bar.tsx`

Glass pill with: nav-drawer trigger (☰), thread title, thread list drawer, pinned symbol indicator, new chat button.

---

## Charts

### Chart Page (`/chart/[symbol]`)

**Page** (`chart/[symbol]/page.tsx`): Server component validates the symbol and renders `<ChartView>`.

**ChartView** (`chart/[symbol]/_components/chart-view.tsx`): Client orchestration component.

**Data flow**:

```
ChartView
├─ useTimeframe()             → URL state (?tf=) via nuqs
├─ useChartData(symbol, tf, indicators, 300, { enabled: visible })
│   └─ TanStack Query → GET /api/market/candles (or /api/market/indicators)
│       Per-TF polling intervals:
│         1m: 5s    5m-4h: 30s    1d-1w: 5min
│       Prefetches adjacent timeframes for instant switching
├─ usePrice(symbol)           → 3s polling → live tick merged into last candle
├─ useStructure(symbol, tf)   → conditionally fetches SMC overlays
└─ buildOverlays(structure, candles, palette, toggles)
```

**Live price merging**: Each tick's timestamp is bucketed into the current timeframe bar. If it matches the last candle's `t`, high/low/close are updated. If it's a new bar, a new candle is created.

**IntersectionObserver**: Chart data fetching pauses when the chart container scrolls out of view (128px root margin). Resumes when visible.

### Chart Component

Location: `components/chart/chart.tsx`

**Tech**: TradingView lightweight-charts v5 (dynamic import — code-split).

**Features**:
- Candlestick series with dynamic decimal formatting per symbol
- Sub-panes for RSI (purple, OB/OS lines at 70/30), MACD (blue/orange/green histogram), ATR (yellow)
- Timescale synchronization between main chart and sub-panes
- 4 color themes: `black` (default), `slate`, `navy`, `classic`
- 3 grid styles: `solid`, `dotted`, `none`
- Custom bull/bear candle colors
- Zoom controls (ZoomIn, ZoomOut, Maximize2)

**Theme palette**:

| Theme | Background | Grid | Text |
|---|---|---|---|
| black | #0c0c0c | #1f1f1f | #a1a8b3 |
| slate | #0f172a | #1e293b | #94a3b8 |
| navy | #020617 | #0f172a | #64748b |
| classic | #0e1118 | #262a35 | #a1a8b3 |

### Chart Toolbar

Sticky sub-header below the TopBar with:
- **SymbolPicker**: XAUUSD / EURUSD / GBPUSD
- **PriceTag**: live bid/ask with change from reference close
- **TimeframePicker**: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
- **StaleIndicator**: pulsing dot when fetching
- **OverlaySheet**: toggles for SMC overlays (swings, BOS/CHoCH, FVG, order blocks, liquidity)
- **ChartSettingsDrawer**: indicator toggles (EMA 20/50/200, SMA 50/100, Bollinger, RSI, MACD, ATR, Pivots) + theme/grid settings
- **Pro chart link** (if `NEXT_PUBLIC_TRADINGVIEW_ENABLED=1`)

### SMC Overlays

Location: `components/chart/overlays.ts`

Translates `StructureResult` into lightweight-charts marker/price-line primitives:

| Overlay | Marker | Price Line |
|---|---|---|
| Swings | Triangle arrows (highs/lows) | None |
| BOS/CHoCH | Arrow with "BOS"/"CHoCH" tag at break bar | Solid/dashed line at broken level |
| FVG | Square with "FVG" tag at start bar | Dotted line at gap midpoint (unmitigated only) |
| Order Blocks | Square with "OB" tag | Dotted line at OB midpoint (unmitigated only) |
| Liquidity | Circle with star at sweep point | None |

### Chart views (`/chart/[symbol]` & `/chart/[symbol]/structure`)

HamaFX-Ai uses a hybrid route partitioning layout for charts:
- **TradingView Pro Chart (`/chart/[symbol]`)**: The default high-performance view leveraging the TradingView Advanced Charting Widget. Renders with full drawing tools, symbol catalog compatibility, and configured timeframe toolbars. Redirects automatically to the Structure view if `NEXT_PUBLIC_TRADINGVIEW_ENABLED !== '1'`.
- **SMC Structure Chart (`/chart/[symbol]/structure`)**: Served by `lightweight-charts`. Renders specialized Smart Money Concept overlays (swings, BOS/CHoCH, FVG, order blocks, liquidity sweeps) alongside standard indicators (EMA, SMA, Bollinger, RSI, MACD, ATR, pivots).

A premium segmented control ("TradingView" | "Structure") is integrated in the header of both pages for smooth, responsive transitions between views.

---

## Navigation

### NavDrawer

Location: `components/layout/nav-drawer.tsx`

Left slide-in drawer powered by **vaul** (DrawerPrimitive.Root with `direction="left"`). Single global instance mounted in the app layout, controlled via React context.

**Sections**:

| Section | Items |
|---|---|
| Markets | Chat, Chart, News, Calendar |
| Personal | Alerts, Journal, Settings |

**Features**:
- Auto-closes on route change (`useEffect` on `pathname`)
- Active route: brand-tinted background with ring + glow
- Identity strip: brand logo, "HamaFX·Ai" + subtitle
- Footer: "Sign out" button — calls NextAuth `signOut()`, redirects to `/login`
- Safe-area aware (top/bottom insets)
- Rounded right edge (`rounded-r-3xl`)
- Focus trap, swipe-to-dismiss, Escape-to-close (vaul built-in)

### NavDrawerContext

Location: `components/layout/nav-drawer-context.tsx`

Single source of truth for the nav-drawer open state. Why context instead of per-trigger instances: the app renders two top bars (TopBar for non-chat, ChatTopBar for chat). Without a shared context, navigating between them could leave stale vaul instances.

```typescript
interface NavDrawerCtxShape {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}
```

### TopBar

Location: `components/layout/top-bar.tsx`

Sticky glass pill header. Three slots: `[☰ menu] [brand mark + title] [right slot]`.

- **Hides on `/chat` paths**: `if (pathname.startsWith('/chat')) return null;` — ChatTopBar takes over
- Centered, max-width 400px
- Safe-area aware (`pt-[calc(env(safe-area-inset-top)+12px)]`)
- Pointer-events: none on the wrapper, auto on the pill (prevents blocking interactions below)

---

## State Management

### TanStack Query (Primary Data Layer)

Provider: `components/providers/query-provider.tsx`

```typescript
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30s — most data is market data
      gcTime: 5 * 60_000,       // 5min — aggressive cleanup for personal mode
      retry: 1,                 // Surface errors, don't mask provider issues
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
})
```

**Per-timeframe polling intervals** (market data):

| Timeframe | Refetch Interval | staleTime |
|---|---|---|
| 1m | 5,000ms (5s) | 2,500ms |
| 5m, 15m, 30m, 1h, 4h | 30,000ms (30s) | 15,000ms |
| 1d, 1w | 300,000ms (5min) | 150,000ms |

**Price polling**: 1,500ms, paused when tab is hidden or offline.

**Adjacent timeframe prefetching**: When viewing one timeframe, the two adjacent timeframes are prefetched in the background for instant switching.

### URL State (nuqs)

`useQueryState` backed by the URL search params. Used for:

| Hook | Key | Type |
|---|---|---|
| `useTimeframe()` | `?tf=` | Timeframe (string literal union) |

### localStorage

| Key | Content | Write Location |
|---|---|---|
| `hfx_chart_config` | `{ indicators: ChartIndicators, settings: ChartSettings }` | `ChartSettingsDrawer` |
| `hamafx:ai-prefs` | AI model preferences JSON | Settings page |
| `hfx_news_bookmarks` | Bookmarked article IDs | `useBookmarks` hook |

### React Context

| Context | Scope | Purpose |
|---|---|---|
| `NavDrawerContext` | App layout | Single drawer open/close state shared by TopBar and ChatTopBar triggers |

---

## Styling

### Design System

**Approach**: Tailwind CSS v4 with custom `@theme` tokens. No component library beyond a handful of shadcn/ui-style Radix primitives (Drawer via vaul, Tooltip, Switch). All custom CSS is in `globals.css`.

**Color palette**: Pure-black neutral grayscale (`oklch` hue 0, chroma 0), champagne gold brand (`oklch(82% 0.14 85)`).

**Glass utilities** (Tailwind v4 `@utility`):

| Utility | Background | Blur | Border |
|---|---|---|---|
| `glass` | oklch(12% 0 0 / 0.45) | 24px saturate(160%) | 8% white |
| `glass-strong` | oklch(12% 0 0 / 0.70) | 40px saturate(200%) | 10% white |
| `glass-subtle` | oklch(14% 0 0 / 0.45) | 12px saturate(140%) | 6% white |
| `card-premium` | Gradient 14%→11% black | 16px saturate(140%) | 7% white |

**Fonts**: Inter (sans), JetBrains Mono (mono). Fluid typography: `clamp()` for text-sm, text-base, text-lg.

**Layout tokens** (CSS custom properties):

| Token | Value | Usage |
|---|---|---|
| `--topbar-h` | 56px | TopBar and ChatTopBar height |
| `--touch-min` | 44px | Minimum touch target size |
| `--fab-bottom` | `env(safe-area-inset-bottom) + 16px` | FAB positioning |

**Keyframes**: shimmer (skeleton loading), stale-pulse (data staleness), mic-pulse (voice recording), scroll-fab (auto-hiding "Latest" button).

**Reduced motion**: OS-level `prefers-reduced-motion` respected. User-forced `html[data-reduce-motion='force']` for the preferences toggle.

---

## PWA Setup

### Manifest

Location: `app/manifest.ts`

Generated as `MetadataRoute.Manifest`:

| Setting | Value |
|---|---|
| name | HamaFX-Ai |
| short_name | HamaFX |
| start_url | /chat |
| display | standalone |
| orientation | portrait |
| background_color | #0a0a0a |
| theme_color | #0a0a0a |
| icons | 192px, 512px, maskable 512px |

### Service Worker

Location: `public/sw.js` (generated from template by `scripts/generate-sw.mjs`)

**Caching strategies**:

| Request Type | Strategy | Details |
|---|---|---|
| Navigations | Network-first with 3s timeout | Fallback: cached `/chat` → cached `/offline` → 503 text |
| Static assets (`/_next/static/`, `/icons/`) | Cache-first | Falls back to network on miss, populates cache |
| Fingerprinted assets (`favicon.ico`, `manifest.webmanifest`) | Cache-first | Same as above |
| API routes (`/api/auth`, `/api/cron`, `/api/admin`, `/api/chat`, `/api/market`) | **Bypass** | Never cached, never SW-handled |
| Everything else | Network-only (browser default) | Passthrough |

**Lifecycle**:
- **install**: Fetch `/sw-precache.json` → `caches.addAll(urls)` → `skipWaiting()`
- **activate**: Delete non-current caches → `clients.claim()`
- **push**: JSON payload `{ title, body, url }` → `registration.showNotification()`
- **notificationclick**: Focus existing client or open new window to target URL

**Cache versioning**: `hamafx-shell-v{BUILD_ID}` — versioned per build so new deploys get a fresh cache.

### SW Registration

Location: `components/providers/sw-register.tsx`

Defers registration until browser idle (`requestIdleCallback` with setTimeout fallback at 200ms). Fire-and-forget — failures are `console.warn`'d, never thrown.

**Conditions**: `'serviceWorker' in navigator`, `window.isSecureContext`

### Icons

- `/icons/icon-192.png` — 192×192
- `/icons/icon-512.png` — 512×512
- `/icons/icon-maskable-512.png` — 512×512 with `purpose: 'maskable'`
- `/icons/apple-touch-icon-180.png` — 180×180 Apple touch icon
- `/icons/apple-splash-1179x2556.png` — iPhone 15 Pro splash

### Security Headers

Set via `next.config.mjs` `headers()`:

| Header | Value |
|---|---|
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(self), geolocation=() |
| Cache-Control (sw.js only) | no-cache, no-store, must-revalidate |
| Service-Worker-Allowed (sw.js only) | / |

**CSRF Protection**: Double-submit cookie pattern. Edge middleware sets `hfx_csrf` cookie; state-changing requests must include `X-CSRF-Token` header matching the cookie value.

**Auth Gate**: Edge middleware validates the NextAuth JWT session cookie. Exempt paths: `/login`, `/register`, `/api/auth/*`, `/api/health`, `/api/cron/*`, `/api/telegram/*`, `/share/*`, static files.

---

## Key Dependencies

| Package | Usage |
|---|---|
| `@ai-sdk/react` / `ai` v5 | `useChat` hook, `DefaultChatTransport`, `UIMessage` types |
| `@tanstack/react-query` v5 | Primary data fetching, caching, polling |
| `lightweight-charts` v5 | Candlestick + indicator charts (dynamic import) |
| `next-view-transitions` | Animated page transitions via View Transition API |
| `nuqs` v2 | URL search param state (`?tf=`) |
| `vaul` | Drawer primitive for NavDrawer |
| `motion` (framer-motion) | Composer button morph, layout animations |
| `sonner` | Toast notifications |
| `lucide-react` | Icon library |
| `tailwindcss` v4 | Styling framework |