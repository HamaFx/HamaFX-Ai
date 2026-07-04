# 04 — Frontend & UX Architecture

> **Version:** 2026-07-04 · **Verified against:** commit `1803c17` (main)
> **Cross-references:** [01-architecture.md](./01-architecture.md) · [03-backend-api.md](./03-backend-api.md)

---

## 1. Overview

The HamaFX-Ai frontend is a Next.js 15 App Router application (`apps/web/`) using React 19, Tailwind CSS v4, and shadcn/ui-style primitives (Radix). It is a multi-tenant PWA — mobile-first, installable to the home screen, protected by a NextAuth session gate in Edge middleware.

All source lives under `apps/web/src/`:

```
apps/web/src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout (fonts, providers, metadata)
│   ├── page.tsx            # / → redirects to /chat
│   ├── globals.css         # Design tokens, glass utilities, keyframes
│   ├── manifest.ts         # PWA manifest (standalone, portrait, black)
│   ├── not-found.tsx       # 404 page
│   ├── error.tsx           # Error boundary
│   ├── global-error.tsx    # Global error boundary
│   ├── (auth)/             # Auth route group (no layout shell)
│   ├── (app)/              # Authenticated route group (app shell)
│   ├── onboarding/         # Onboarding flow
│   ├── share/[id]/         # Public share page (HMAC-verified)
│   ├── debug/              # Debug route
│   └── api/                # API routes (78 route files)
├── auth.ts                 # NextAuth v5 full config (Node runtime)
├── auth.config.ts          # NextAuth v5 Edge-safe config
├── middleware.ts           # Edge middleware (auth, CSRF, request-id)
├── components/             # Shared components
│   ├── calendar/           # Calendar event card
│   ├── chart/              # Chart engine (TradingView + lightweight-charts)
│   ├── chat/               # Chat UI (screen, composer, messages, tool parts)
│   └── layout/             # Layout components (TopBar, NavDrawer, etc.)
├── hooks/                  # Custom React hooks
├── lib/                    # Server-side utilities (api, auth, env, csrf, etc.)
├── instrumentation.ts     # Sentry server init
├── instrumentation-client.ts  # Sentry client init
├── sentry.server.config.ts
└── sentry.edge.config.ts
```

---

## 2. Route Map (29 Pages)

### 2.1 Auth Routes `(auth)/` — No App Shell

| Path | Source | Purpose |
|------|--------|---------|
| `/login` | `(auth)/login/page.tsx` | Login form (email + password + 2FA) |
| `/register` | `(auth)/register/page.tsx` | Registration form (gated by `MULTI_USER_ENABLED`) |
| `/forgot-password` | `(auth)/forgot-password/page.tsx` | Password reset request |
| `/reset-password` | `(auth)/reset-password/page.tsx` | Password reset form (token-based) |

### 2.2 App Routes `(app)/` — Full App Shell

| Path | Source | Purpose |
|------|--------|---------|
| `/chat` | `(app)/chat/page.tsx` | Chat home (new thread) |
| `/chat/[threadId]` | `(app)/chat/[threadId]/page.tsx` | Chat thread view |
| `/chart/[symbol]` | `(app)/chart/[symbol]/page.tsx` | TradingView Pro chart |
| `/chart/[symbol]/structure` | `(app)/chart/[symbol]/structure/page.tsx` | Lightweight-charts SMC overlay |
| `/dashboard` | `(app)/dashboard/page.tsx` | Dashboard with 10 widgets |
| `/alerts` | `(app)/alerts/page.tsx` | Alert management |
| `/journal` | `(app)/journal/page.tsx` | Trading journal |
| `/news` | `(app)/news/page.tsx` | News feed with sentiment |
| `/calendar` | `(app)/calendar/page.tsx` | Economic calendar |
| `/signals` | `(app)/signals/page.tsx` | Decision signals dashboard |
| `/settings` | `(app)/settings/page.tsx` | Settings home |
| `/settings/agent` | `(app)/settings/agent/page.tsx` | Agent config (model override, analysis mode, disabled tools) |
| `/settings/api-keys` | `(app)/settings/api-keys/page.tsx` | BYOK API key management |
| `/settings/billing` | `(app)/settings/billing/page.tsx` | Billing plans + subscription status |
| `/settings/models` | `(app)/settings/models/page.tsx` | Model picker + fallback chain |
| `/settings/portfolio` | `(app)/settings/portfolio/page.tsx` | Portfolio settings |
| `/settings/profile` | `(app)/settings/profile/page.tsx` | Profile settings |
| `/settings/symbols` | `(app)/settings/symbols/page.tsx` | Symbol management |
| `/settings/telegram` | `(app)/settings/telegram/page.tsx` | Telegram linking |
| `/settings/track-record` | `(app)/settings/track-record/page.tsx` | Signal feedback / track record |
| `/settings/usage` | `(app)/settings/usage/page.tsx` | Usage limits |
| `/offline` | `(app)/offline/page.tsx` | Offline fallback page |

### 2.3 Other Routes

| Path | Source | Purpose |
|------|--------|---------|
| `/` | `page.tsx` | Redirects to `/chat` |
| `/onboarding` | `onboarding/page.tsx` | New user onboarding flow |
| `/share/[id]` | `share/[id]/page.tsx` | Public snapshot share (HMAC-verified, no auth) |

---

## 3. Chart Engine

Two charting modes, toggleable on the fly:

### 3.1 TradingView Pro Widget

- **Source:** `apps/web/src/components/chart/tradingview-widget.tsx` (in `(app)/chart/[symbol]/_components/`)
- **Toggle:** `NEXT_PUBLIC_TRADINGVIEW_ENABLED` env var (set to `"1"` to enable)
- **Embed:** TradingView widget via `s3.tradingview.com` script (CSP-whitelisted in `next.config.mjs`)

### 3.2 Lightweight-charts SMC

- **Source:** `apps/web/src/components/chart/` — `chart.tsx`, `chart-canvas.tsx`, `use-lightweight-charts.ts`, `use-sub-pane-chart.ts`
- **Library:** `lightweight-charts` v5
- **SMC overlays:** `apps/web/src/components/chart/overlays.ts` — order blocks, FVG, liquidity, swings, Asian range, PDH/PDL
- **Indicators:** `chart-rsi.tsx`, `chart-macd.tsx`, `chart-atr.tsx` (sub-pane charts)
- **Settings:** `chart-settings-drawer.tsx`, `chart-themes.ts`, `chart-colors.ts`, `chart-types.ts`
- **Symbol picker:** `symbol-picker.tsx`
- **Timeframe picker:** `timeframe-picker.tsx`
- **Pin to chat:** `pin-to-chat.tsx` — sends chart snapshot to AI chat

---

## 4. Chat UI

### 4.1 Core Components

| Component | Source | Purpose |
|-----------|--------|---------|
| ChatScreen | `components/chat/chat-screen.tsx` | Main chat container (message list + composer) |
| ChatTopBar | `components/chat/chat-top-bar.tsx` | Thread title, model picker, actions |
| Composer | `components/chat/composer.tsx` | Message input with voice, presets, symbol pinning |
| MessageList | `components/chat/message-list.tsx` | Virtualized message list |
| Message | `components/chat/message.tsx` | Message bubble with actions (copy, regenerate, fork) |
| NavTrigger | `components/chat/nav-trigger.tsx` | Navigation drawer trigger |

### 4.2 Tool UI Parts (39)

Every AI tool has a corresponding React component that renders its output in the chat stream. Registered in `components/chat/parts/registry.tsx`.

| Tool Part | Source | Tool |
|-----------|--------|------|
| `get-price.tsx` | | `get_price` |
| `get-candles.tsx` | | `get_candles` |
| `get-indicators.tsx` | | `get_indicators` |
| `get-market-structure.tsx` | | `get_market_structure` |
| `get-news.tsx` | | `get_news` |
| `get-calendar.tsx` | | `get_calendar` |
| `set-alert.tsx` | | `set_alert` |
| `log-journal.tsx` | | `log_journal` |
| `search-knowledge.tsx` | | `search_knowledge` |
| `analyze-technical.tsx` | | `analyze_technical` |
| `analyze-fundamental.tsx` | | `analyze_fundamental` |
| `get-journal-stats.tsx` | | `get_journal_stats` |
| `annotate-chart.tsx` | | `annotate_chart` |
| `analyze-chart-image.tsx` | | `analyze_chart_image` |
| `get-correlation.tsx` | | `get_correlation` |
| `get-cot.tsx` | | `get_cot` |
| `share-snapshot.tsx` | | `share_snapshot` |
| `compute-risk.tsx` | | `compute_risk` |
| `get-session-levels.tsx` | | `get_session_levels` |
| `get-intermarket.tsx` | | `get_intermarket` |
| `forecast-volatility.tsx` | | `forecast_volatility` |
| `get-seasonality.tsx` | | `get_seasonality` |
| `compute-position-health.tsx` | | `compute_position_health` |
| `replay-setup.tsx` | | `replay_setup` |
| `summarize-thread.tsx` | | `summarize_thread` |
| `verify-call.tsx` | | `verify_call` |
| `convene-committee.tsx` | | `convene_committee` |
| `get-intermarket-resonance.tsx` | | `get_intermarket_resonance` |
| `get-system-diagnostics.tsx` | | `get_system_diagnostics` |
| `run-system-action.tsx` | | `run_system_action` |
| `get-portfolio-snapshot.tsx` | | `get_portfolio_snapshot` |
| `get-social-sentiment.tsx` | | `get_social_sentiment` |
| `agent-deliberation.tsx` | | Multi-agent committee opinions |
| `plan.tsx` | | Plan-then-act "Thinking" pill |
| `citation-warning.tsx` | | Citation enforcement warning |
| `fallback.tsx` | | Stream error fallback |
| `text.tsx` | | Text message rendering (markdown, streaming) |
| `tool-card.tsx` | | Generic tool card wrapper |
| `registry.tsx` | | Tool part registry (maps tool names to components) |

### 4.3 Plan-Then-Act UI

When the agent enters analytical mode, a "Thinking" pill renders the plan-then-act workflow:
- Cheap model generates JSON execution plan
- Plan persisted as system message
- UI shows chronological execution stages before tool calls
- Source: `components/chat/parts/plan.tsx`

### 4.4 Streaming

Chat uses Vercel AI SDK v5's `useChat()` hook with UI-message streaming. The stream carries typed parts (text, tool-call, tool-result, data) that the client renders incrementally.

---

## 5. State Management

| Library | Usage |
|---------|-------|
| TanStack Query | Server state (API data fetching, mutations, caching) |
| SWR | Lightweight local query caching for hot paths |
| TanStack Virtual | Virtualized lists (message list, news feed) |
| React Context | App-level state (NavDrawer, theme, user session) |
| Local Storage | User preferences (via `use-local-storage.ts` hook) |

**Key hooks:**
| Hook | Source | Purpose |
|------|--------|---------|
| `use-candles.ts` | `hooks/use-candles.ts` | Fetch candle data |
| `use-chart-data.ts` | `hooks/use-chart-data.ts` | Chart data management |
| `use-price-stream.ts` | `hooks/use-price-stream.ts` | SSE live price stream |
| `use-prices.ts` | `hooks/use-prices.ts` | Price polling |
| `use-structure.ts` | `hooks/use-structure.ts` | Market structure data |
| `use-tf.ts` | `hooks/use-tf.ts` | Timeframe state |
| `use-voice-input.ts` | `hooks/use-voice-input.ts` | Voice input for chat |
| `use-copied.ts` | `hooks/use-copied.ts` | Copy-to-clipboard state |
| `use-local-storage.ts` | `hooks/use-local-storage.ts` | Persistent local state |

---

## 6. Dashboard Widgets (10)

| Widget | Source | Purpose |
|--------|--------|---------|
| `today-glance-widget.tsx` | | Today's market overview |
| `watchlist-widget.tsx` | | User's symbol watchlist |
| `alerts-widget.tsx` | | Active alerts summary |
| `calendar-widget.tsx` | | Upcoming economic events |
| `news-pulse-widget.tsx` | | News sentiment pulse |
| `briefing-widget.tsx` | | Latest AI briefing |
| `equity-curve-widget.tsx` | | Portfolio equity curve |
| `pnl-heatmap-widget.tsx` | | P&L heatmap by symbol/time |
| `open-positions-widget.tsx` | | Open positions summary |
| `stats-widget.tsx` | | Trading statistics |

Widget types defined in `dashboard/_components/widget-types.ts`. Canvas layout in `dashboard-canvas.tsx`.

---

## 7. Settings Pages

| Page | Key Components | Purpose |
|------|---------------|---------|
| `/settings` | `settings-nav.tsx`, `profile-form.tsx`, `appearance-card.tsx`, `preferences-card.tsx`, `about-card.tsx` | General settings |
| `/settings/agent` | `agent-model-override-form.tsx`, `analysis-mode-form.tsx`, `disabled-tools-form.tsx` | AI agent configuration |
| `/settings/api-keys` | `api-key-card.tsx`, `bulk-test-button.tsx`, `export-import-keys.tsx`, `market-data-config.tsx`, `save-bar.tsx` | BYOK API key management |
| `/settings/billing` | `billing-plans.tsx`, `subscription-status.tsx`, `payment-history.tsx` | NOWPayments billing |
| `/settings/models` | `model-picker.tsx`, `fallback-chain-picker.tsx` | LLM model selection |
| `/settings/portfolio` | — | Portfolio settings (account balance, risk) |
| `/settings/profile` | — | Profile (name, email, password, 2FA) |
| `/settings/symbols` | `symbols-form.tsx` | Symbol watchlist management |
| `/settings/telegram` | `telegram-link-card.tsx`, `test-telegram-button.tsx` | Telegram bot linking |
| `/settings/track-record` | `signal-feedback.tsx` | Decision signal feedback |
| `/settings/usage` | `usage-limits-form.tsx`, `usage-glance.tsx` | Usage limits + AI spend |

**Settings sub-components:** `settings-nav.tsx`, `settings-row.tsx`, `settings-section.tsx`, `change-password-card.tsx`, `two-factor-setup.tsx`, `sessions-card.tsx`, `notifications-card.tsx`, `notification-prefs-card.tsx`, `noise-control-card.tsx`, `data-card.tsx`, `system-status-card.tsx`, `enable-web-push-button.tsx`, `test-email-button.tsx`, `ai-prefs-card.tsx`, `agent-card.tsx`, `logout-button.tsx`

---

## 8. Onboarding Flow

- **Route:** `/onboarding` (`onboarding/page.tsx`, `onboarding/layout.tsx`, `onboarding/actions.ts`)
- **Progress saving:** `POST /api/onboarding/save-progress` — saves to `user_settings.onboardingProgress` (jsonb)
- **Steps:** Connect AI API keys (BYOK), select symbols, set preferences, optional Telegram linking
- **First-run secrets:** In dev (`NODE_ENV !== 'production'`), `AUTH_SECRET`, `ENCRYPTION_SECRET`, `CRON_SECRET` auto-generate to `.hamafx/dev-secrets.json`

---

## 9. PWA Configuration

### 9.1 Manifest

`apps/web/src/app/manifest.ts`:
- `display: 'standalone'`
- `orientation: 'portrait'`
- `theme_color: '#000000'` (black)
- Icons: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon-180.png`, `apple-splash-1179x2556.png`
- Generated by `apps/web/scripts/generate-icons.mjs`

### 9.2 Service Worker

- **Template:** `apps/web/scripts/sw.template.js`
- **Generator:** `apps/web/scripts/generate-sw.mjs`
- **Headers** (`next.config.mjs`): `Cache-Control: no-cache, no-store, must-revalidate`, `Service-Worker-Allowed: /`

### 9.3 Web Push

- **Subscribe:** `POST /api/push/subscribe` — stores subscription in `push_subscriptions` table
- **Unsubscribe:** `POST /api/push/unsubscribe`
- **Enable button:** `settings/_components/enable-web-push-button.tsx`
- **VAPID keys:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (must equal `VAPID_PUBLIC_KEY`)

---

## 10. Security Headers

From `apps/web/next.config.mjs` → `headers()`:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=()` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://s3.tradingview.com; style-src 'self' 'unsafe-inline' https://s3.tradingview.com; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' wss: https:;` |

---

## 11. Build Configuration

| Property | Value | Source |
|----------|-------|--------|
| Output mode | `standalone` (when not Vercel) | `next.config.mjs` |
| React strict mode | `true` | `next.config.mjs` |
| Transpile packages | `@hamafx/shared`, `@hamafx/db`, `@hamafx/data`, `@hamafx/indicators`, `@hamafx/ai`, `@hamafx/config` | `next.config.mjs` |
| TypeScript | `ignoreBuildErrors: false` | `next.config.mjs` |
| ESLint | `ignoreDuringBuilds: false` | `next.config.mjs` |
| Server actions body limit | `2mb` | `next.config.mjs` |
| Sentry | `withSentryConfig()` wrapper | `next.config.mjs` |
| Bundle analyzer | `@next/bundle-analyzer` (enabled when `ANALYZE=true`) | `next.config.mjs` |
| Build ID | Set by `scripts/set-build-id.mjs` | `NEXT_PUBLIC_BUILD_ID` |
| Vercel build | `node ../../scripts/predeploy-migrate.mjs && npx turbo run build --filter=@hamafx/web` | `vercel.json` |
