# 03 — Project Structure

> The folder layout is itself a piece of documentation. An AI agent that reads this file should be able to **place a new feature in the correct location without asking**.
>
> Personal-mode note: there is **no `apps/worker/`** at MVP. We have a single Next.js deploy. If we ever add a worker, it slots in under `apps/worker/` cleanly.

## Top-level layout (pnpm workspace)

```
HamaFX-Ai/
├── apps/
│   └── web/                 # Next.js 15 app — the only deployable unit
│
├── packages/
│   ├── shared/              # Zod schemas, TS types, domain constants
│   ├── ai/                  # Agent definition, tools, prompts
│   ├── data/                # Provider adapters (Twelve Data, Finnhub, ...)
│   ├── indicators/          # Pure-function technical analysis (RSI, MACD, SMC...)
│   ├── db/                  # Drizzle schema, migrations, query helpers
│   └── config/              # ESLint, TS, Tailwind, Prettier presets
│
├── docs/                    # ← you are here
├── infra/                   # GCE cron VM scripts (`cron-vm/`)
├── .kiro/                   # Steering files for AI coding agents
├── .github/workflows/       # CI: lint + typecheck + vitest, plus cron fallbacks
├── .vscode/                 # Editor settings
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json             # private root, scripts only
├── tsconfig.base.json
├── README.md
└── .env.example
```

> Note: `packages/ui/` was planned in Phase 0 but the design system lives entirely under `apps/web/src/components/` since we have a single consumer. We promote to a shared package only if a second consumer ever exists.

## `apps/web/` (Next.js 15)

```
apps/web/
├── src/
│   ├── app/
│   │   ├── login/
│   │   │   ├── page.tsx                    # password gate (single APP_PASSWORD)
│   │   │   └── _components/
│   │   │       └── login-form.tsx
│   │   │
│   │   ├── (app)/                          # gated app (route group)
│   │   │   ├── layout.tsx                  # mobile shell: TopBar + main + Toaster
│   │   │   ├── error.tsx                   # per-segment error boundary
│   │   │   ├── chat/
│   │   │   │   ├── layout.tsx              # passthrough; chat is full-bleed
│   │   │   │   ├── page.tsx                # /chat → redirect to most recent thread
│   │   │   │   └── [threadId]/page.tsx     # full-screen ChatScreen
│   │   │   ├── chart/[symbol]/
│   │   │   │   ├── page.tsx                # server wrapper
│   │   │   │   ├── loading.tsx
│   │   │   │   ├── pro/page.tsx            # TradingView Advanced widget (env-gated)
│   │   │   │   └── _components/
│   │   │   │       ├── chart-view.tsx      # client orchestration
│   │   │   │       ├── chart-skeleton.tsx
│   │   │   │       ├── chart-empty.tsx
│   │   │   │       ├── chart-error.tsx
│   │   │   │       └── overlay-sheet.tsx
│   │   │   ├── news/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── loading.tsx
│   │   │   │   └── _components/
│   │   │   │       ├── news-view.tsx
│   │   │   │       ├── news-toolbar.tsx
│   │   │   │       ├── sentiment-summary.tsx
│   │   │   │       └── refresh-button.tsx
│   │   │   ├── calendar/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── loading.tsx
│   │   │   │   └── _components/
│   │   │   │       ├── calendar-view.tsx
│   │   │   │       ├── calendar-toolbar.tsx
│   │   │   │       └── calendar-hero.tsx
│   │   │   ├── alerts/
│   │   │   │   ├── page.tsx
│   │   │   │   └── _components/
│   │   │   │       ├── alert-list.tsx
│   │   │   │       └── alert-form.tsx
│   │   │   ├── journal/
│   │   │   │   ├── page.tsx
│   │   │   │   └── _components/
│   │   │   │       ├── journal-view.tsx
│   │   │   │       ├── entry-form.tsx
│   │   │   │       ├── entry-list.tsx
│   │   │   │       └── stats-summary.tsx
│   │   │   └── settings/
│   │   │       ├── page.tsx
│   │   │       ├── usage/
│   │   │       │   ├── page.tsx
│   │   │       │   └── loading.tsx
│   │   │       └── _components/
│   │   │           ├── system-status-card.tsx
│   │   │           ├── usage-glance.tsx
│   │   │           ├── notifications-card.tsx
│   │   │           ├── preferences-card.tsx
│   │   │           ├── data-card.tsx
│   │   │           ├── about-card.tsx
│   │   │           ├── settings-row.tsx
│   │   │           ├── enable-web-push-button.tsx
│   │   │           ├── test-email-button.tsx
│   │   │           ├── test-telegram-button.tsx
│   │   │           └── logout-button.tsx
│   │   │
│   │   ├── share/[id]/page.tsx             # public signed-link snapshot view
│   │   ├── offline/page.tsx                # service-worker fallback
│   │   │
│   │   ├── api/
│   │   │   ├── auth/{login,logout}/route.ts
│   │   │   ├── chat/route.ts               # POST: AI chat (streaming)
│   │   │   ├── chat/threads/route.ts
│   │   │   ├── chat/threads/[id]/route.ts
│   │   │   ├── market/{price,candles,indicators,structure}/route.ts
│   │   │   ├── alerts/route.ts
│   │   │   ├── alerts/[id]/route.ts
│   │   │   ├── journal/route.ts
│   │   │   ├── journal/[id]/route.ts
│   │   │   ├── push/{subscribe,unsubscribe}/route.ts
│   │   │   ├── admin/{test-alert-email,test-telegram}/route.ts
│   │   │   └── cron/                       # Vercel Cron / GCE-VM targets
│   │   │       ├── alerts/route.ts
│   │   │       ├── briefings/route.ts
│   │   │       ├── calendar/route.ts
│   │   │       ├── cot/route.ts
│   │   │       ├── embedding-backfill/route.ts
│   │   │       ├── fred-actuals/route.ts
│   │   │       ├── news/route.ts
│   │   │       ├── snapshots/route.ts
│   │   │       └── weekly-review/route.ts
│   │   │
│   │   ├── globals.css                     # Tailwind v4 @theme + utilities + tokens
│   │   ├── layout.tsx                      # root layout (fonts, metadata, viewport)
│   │   └── manifest.ts                     # PWA manifest
│   │
│   ├── components/
│   │   ├── ui/                             # shared primitives
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── drawer.tsx                  # vaul wrapper
│   │   │   ├── confirm-drawer.tsx          # ConfirmDrawer + useConfirm()
│   │   │   ├── tooltip.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── segmented.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── empty-state.tsx
│   │   │   ├── stale-indicator.tsx
│   │   │   ├── stat-card.tsx
│   │   │   ├── sparkline.tsx
│   │   │   ├── animated-number.tsx
│   │   │   ├── motion-config.tsx
│   │   │   ├── toaster.tsx                 # sonner wrapper
│   │   │   └── fab.tsx
│   │   ├── layout/
│   │   │   ├── top-bar.tsx                 # global TopBar (suppressed on /chat)
│   │   │   ├── nav-trigger.tsx             # hamburger button
│   │   │   ├── nav-drawer.tsx              # single global instance
│   │   │   ├── nav-drawer-context.tsx      # state provider for the drawer
│   │   │   ├── ambient-background.tsx      # subtle warm orb (vivid on /login)
│   │   │   ├── offline-banner.tsx
│   │   │   ├── page-header.tsx
│   │   │   └── skip-to-content.tsx
│   │   ├── chat/
│   │   │   ├── chat-screen.tsx
│   │   │   ├── chat-top-bar.tsx
│   │   │   ├── composer.tsx
│   │   │   ├── message-list.tsx
│   │   │   ├── message.tsx
│   │   │   ├── quick-prompts.tsx
│   │   │   └── parts/                      # tool-part renderers
│   │   │       ├── registry.tsx            # typed dispatch
│   │   │       ├── text.tsx                # light Markdown
│   │   │       └── <one file per tool>.tsx
│   │   ├── chart/
│   │   │   ├── chart.tsx                   # lightweight-charts wrapper
│   │   │   ├── symbol-picker.tsx
│   │   │   ├── timeframe-picker.tsx
│   │   │   ├── overlay-toggle.tsx
│   │   │   ├── overlays.ts
│   │   │   └── price-tag.tsx
│   │   ├── news/
│   │   │   ├── article-card.tsx
│   │   │   ├── live-timestamp.tsx
│   │   │   └── use-bookmarks.tsx           # localStorage hook
│   │   ├── calendar/
│   │   │   └── event-card.tsx              # with RemindButton inside
│   │   └── providers/
│   │       ├── index.tsx                   # NuqsAdapter + QueryProvider
│   │       ├── query-provider.tsx
│   │       └── sw-register.tsx
│   │
│   ├── hooks/
│   │   ├── use-prices.ts
│   │   ├── use-candles.ts
│   │   ├── use-structure.ts
│   │   ├── use-tf.ts                       # nuqs
│   │   └── use-voice-input.ts
│   │
│   ├── lib/
│   │   ├── cn.ts                           # tailwind-merge + clsx
│   │   ├── env.ts                          # zod-validated env
│   │   ├── auth.ts                         # password cookie helpers
│   │   ├── api.ts                          # error envelope helpers
│   │   ├── cron.ts                         # withCronAuth(req, fn)
│   │   └── market-client.ts                # fetchPrices/fetchCandles wrappers
│   │
│   ├── middleware.ts                       # checks auth cookie, redirects to /login
│   └── next-env.d.ts
│
├── public/
│   ├── icons/                              # PWA icons + apple splash
│   ├── sw.js                               # generated from scripts/sw.template.js
│   └── sw-precache.json                    # generated
│
├── scripts/
│   ├── generate-icons.mjs
│   ├── generate-sw.mjs
│   ├── set-build-id.mjs                    # writes apps/web/.build-id (used by AboutCard)
│   └── sw.template.js
│
├── eslint.config.js
├── next.config.mjs
├── postcss.config.mjs
└── package.json
```

### Why the `(app)` route group + `_components` underscore?

- `(app)` keeps every authenticated page under one shared mobile shell layout, separate from `/login`.
- A folder prefixed with `_` in the App Router is **opted-out of routing**, so we use it for page-local components without polluting the route tree.

### `components/` is not split into `components/` vs `features/`

Phase 0 planned a `features/` directory for vertical slices but we never needed one. Pages own their orchestration via their own `_components/` folder; the shared design system lives in `components/`. If a vertical slice grows (e.g. a future "backtesting" feature), it can graduate to `features/<name>/`.

## `packages/shared/`

```
packages/shared/
├── src/
│   ├── symbols.ts                # SYMBOLS, isSymbol(), pipSize()
│   ├── timeframes.ts             # TIMEFRAMES, msPerTimeframe()
│   ├── schemas/
│   │   ├── candle.ts
│   │   ├── tick.ts
│   │   ├── news.ts
│   │   ├── calendar.ts
│   │   ├── indicator.ts
│   │   ├── chat.ts
│   │   ├── alerts.ts
│   │   ├── journal.ts
│   │   └── tool-outputs/         # one file per AI tool's output schema
│   ├── ai/
│   │   ├── tool-names.ts
│   │   └── tool-io.ts
│   ├── env.ts
│   └── index.ts
└── package.json
```

## `packages/ai/`

```
packages/ai/
├── src/
│   ├── agent.ts                  # createTradingAgent()
│   ├── prompts/{system,tools,refusals}.md
│   ├── tools/
│   │   ├── get-price.ts
│   │   ├── get-candles.ts
│   │   ├── get-indicators.ts
│   │   ├── get-news.ts
│   │   ├── get-calendar.ts
│   │   ├── get-market-structure.ts
│   │   ├── get-correlation.ts
│   │   ├── get-cot.ts
│   │   ├── get-journal-stats.ts
│   │   ├── analyze-technical.ts
│   │   ├── analyze-fundamental.ts
│   │   ├── analyze-chart-image.ts
│   │   ├── annotate-chart.ts
│   │   ├── search-knowledge.ts
│   │   ├── set-alert.ts
│   │   ├── log-journal.ts
│   │   ├── share-snapshot.ts
│   │   └── index.ts
│   ├── briefings/                # pre/post event LLM briefings
│   ├── snapshots/                # daily HLOC / pivots / ATR
│   ├── push/                     # Web Push delivery
│   ├── memory/{thread,retrieval}.ts
│   ├── usage.ts                  # computeUsage / listTelemetry
│   ├── cost.ts                   # daily budget cap
│   ├── eval/{prompts.json,runner.ts}
│   └── index.ts
└── package.json
```

## `packages/data/`

```
packages/data/
├── src/
│   ├── providers/
│   │   ├── twelve-data/
│   │   ├── finnhub/
│   │   ├── marketaux/
│   │   ├── fred/
│   │   └── …
│   ├── adapters/{price,candles,news,calendar}.ts
│   ├── cache/                    # Next Data Cache facade (Upstash optional, unused)
│   ├── failover.ts
│   └── index.ts
└── package.json
```

## `packages/indicators/`

```
packages/indicators/
├── src/
│   ├── moving-averages.ts
│   ├── rsi.ts
│   ├── macd.ts
│   ├── atr.ts
│   ├── bollinger.ts
│   ├── pivots.ts
│   ├── structure/                # SMC / ICT primitives
│   │   ├── swings.ts
│   │   ├── bos-choch.ts
│   │   ├── order-blocks.ts
│   │   ├── fvg.ts
│   │   └── liquidity.ts
│   └── index.ts
└── package.json
```

## `packages/db/`

```
packages/db/
├── src/
│   ├── schema/
│   │   ├── chat.ts
│   │   ├── alerts.ts
│   │   ├── journal.ts
│   │   ├── news.ts               # cached articles + embeddings
│   │   ├── calendar.ts
│   │   ├── snapshots.ts
│   │   ├── push-subscriptions.ts
│   │   ├── telemetry.ts          # chat_telemetry (token usage / cost)
│   │   └── briefings.ts
│   ├── client.ts
│   └── migrations/
└── drizzle.config.ts
```

> Personal-mode reminder: tables have **no `user_id` column**. There's only one user.

## `packages/config/`

```
packages/config/
├── eslint/index.js
├── prettier/index.js
├── tailwind/preset.ts
├── typescript/{base,nextjs,node}.json
```

## Naming conventions (strict)

| Scope                       | Convention                           | Example                         |
| --------------------------- | ------------------------------------ | ------------------------------- |
| Files (TS/TSX)              | `kebab-case.ts(x)`                   | `price-tile.tsx`                |
| React components            | `PascalCase`                         | `PriceTile`                     |
| Hooks                       | `use-` prefix, file kebab            | `use-prices.ts` → `usePrices()` |
| Zod schemas                 | `XSchema`, type `X`                  | `CandleSchema`, `Candle`        |
| Constants                   | `SCREAMING_SNAKE`                    | `DEFAULT_TIMEFRAME`             |
| Env vars                    | `SCREAMING_SNAKE`, prefixed          | `NEXT_PUBLIC_*`                 |
| Folder for vertical feature | singular noun                        | `chat/`, `journal/`             |
| Test files                  | colocated `.test.ts(x)` or `.e2e.ts` | `price-tile.test.tsx`           |

## Path aliases

In `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["apps/web/src/*"],
      "@shared/*": ["packages/shared/src/*"],
      "@ai/*": ["packages/ai/src/*"],
      "@data/*": ["packages/data/src/*"],
      "@indicators/*": ["packages/indicators/src/*"],
      "@db/*": ["packages/db/src/*"]
    }
  }
}
```

Rule: **never** import across packages with relative `../../`. Always use the alias. Enforced via ESLint `no-restricted-imports`.

## "Where do I put a new ___?" cheat sheet

| New thing                    | Goes in                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| New AI tool                  | `packages/ai/src/tools/<name>.ts` + register in `tools/index.ts`        |
| New tool-part renderer       | `apps/web/src/components/chat/parts/<name>.tsx` + register in registry  |
| New indicator                | `packages/indicators/src/<name>.ts`                                     |
| New data provider            | `packages/data/src/providers/<name>/`                                   |
| New DB table                 | `packages/db/src/schema/<name>.ts` + migration                          |
| New page                     | `apps/web/src/app/(app)/<route>/page.tsx`                               |
| New page-local component     | `apps/web/src/app/(app)/<route>/_components/<name>.tsx`                 |
| New shared zod schema / type | `packages/shared/src/schemas/<name>.ts`                                 |
| New cron job                 | `apps/web/src/app/api/cron/<name>/route.ts` + GCE-VM crontab + (optional) `vercel.json` |
| New shared UI primitive      | `apps/web/src/components/ui/<name>.tsx`                                 |
| New layout chrome component  | `apps/web/src/components/layout/<name>.tsx`                             |
