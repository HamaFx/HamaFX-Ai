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
│   ├── ui/                  # shadcn components + design tokens (optional split)
│   └── config/              # ESLint, TS, Tailwind, Prettier presets
│
├── docs/                    # ← you are here
├── .kiro/                   # Steering files for AI coding agents
├── .github/workflows/       # CI: just lint + typecheck + vitest
├── .vscode/                 # Editor settings
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json             # private root, scripts only
├── tsconfig.base.json
├── README.md
└── .env.example
```

## `apps/web/` (Next.js)

```
apps/web/
├── src/
│   ├── app/
│   │   ├── login/page.tsx                    # password gate (single APP_PASSWORD)
│   │   │
│   │   ├── (app)/                            # gated app (route group)
│   │   │   ├── layout.tsx                    # mobile shell: bottom nav + top bar
│   │   │   ├── page.tsx                      # default → /chat
│   │   │   ├── chat/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [threadId]/page.tsx
│   │   │   │   └── _components/              # underscore = local-only
│   │   │   ├── chart/[symbol]/page.tsx
│   │   │   ├── news/page.tsx
│   │   │   ├── calendar/page.tsx
│   │   │   ├── alerts/page.tsx
│   │   │   ├── journal/page.tsx
│   │   │   └── settings/
│   │   │       ├── page.tsx
│   │   │       └── usage/page.tsx            # cost / token usage
│   │   │
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts            # POST { password } → set cookie
│   │   │   │   └── logout/route.ts
│   │   │   ├── chat/route.ts                 # POST: AI chat (streaming)
│   │   │   ├── chat/threads/route.ts
│   │   │   ├── chat/threads/[id]/route.ts
│   │   │   ├── market/
│   │   │   │   ├── price/route.ts
│   │   │   │   ├── candles/route.ts
│   │   │   │   └── indicators/route.ts
│   │   │   ├── news/route.ts
│   │   │   ├── calendar/route.ts
│   │   │   ├── alerts/route.ts
│   │   │   ├── journal/route.ts
│   │   │   └── cron/                         # Vercel Cron targets
│   │   │       ├── news/route.ts
│   │   │       ├── calendar/route.ts
│   │   │       └── alerts/route.ts           # evaluator
│   │   │
│   │   ├── globals.css
│   │   └── manifest.ts                       # PWA manifest
│   │
│   ├── components/
│   │   ├── ui/                               # shadcn primitives
│   │   ├── chat/                             # chat surface widgets
│   │   ├── chart/                            # chart wrappers + overlays
│   │   ├── market/                           # price tile, watchlist row
│   │   ├── news/                             # article card, sentiment chip
│   │   ├── calendar/                         # event row, impact badge
│   │   └── layout/                           # nav, drawer, command palette
│   │
│   ├── features/                             # vertical slices (UI + hooks + types)
│   │   ├── chat/
│   │   ├── chart/
│   │   ├── alerts/
│   │   ├── journal/
│   │   └── settings/
│   │
│   ├── lib/
│   │   ├── api-client.ts                     # typed fetch wrapper
│   │   ├── format.ts                         # number, date, %, pip helpers
│   │   ├── pip.ts                            # pip math per symbol
│   │   ├── auth.ts                           # password cookie helpers
│   │   └── env.ts                            # zod-validated env
│   │
│   ├── hooks/
│   │   ├── use-prices.ts                     # TanStack Query polling
│   │   ├── use-candles.ts
│   │   ├── use-chat-thread.ts
│   │   └── use-symbol.ts                     # selected symbol via nuqs
│   │
│   ├── styles/
│   │   └── tokens.css                        # CSS variables (colors, spacing)
│   │
│   └── middleware.ts                         # checks auth cookie, redirects to /login
│
├── public/
│   └── icons/                                # PWA icons
│
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.js
└── package.json
```

### Why the `(app)` route group + `_components` underscore?

- `(app)` keeps every authenticated page under one shared mobile shell layout, separate from `/login`.
- A folder prefixed with `_` in the App Router is **opted-out of routing**, so we use it for page-local components without polluting the route tree.

### `components/` vs `features/`

- `components/` = reusable UI building blocks, presentational.
- `features/` = vertical slices that own state, data fetching, and orchestration.
  Rule of thumb: a `feature` may import a `component`, never the other way around.

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
│   │   └── journal.ts
│   ├── ai/
│   │   ├── tool-names.ts         # const ToolName
│   │   └── tool-io.ts            # ToolInput<T>, ToolOutput<T>
│   ├── env.ts                    # shared env zod schema
│   └── index.ts
└── package.json
```

## `packages/ai/`

```
packages/ai/
├── src/
│   ├── agent.ts                  # createTradingAgent()
│   ├── prompts/
│   │   ├── system.md             # main system prompt (markdown for legibility)
│   │   ├── tools.md
│   │   └── refusals.md
│   ├── tools/
│   │   ├── get-price.ts
│   │   ├── get-candles.ts
│   │   ├── get-indicators.ts
│   │   ├── get-news.ts
│   │   ├── get-calendar.ts
│   │   ├── analyze-technical.ts
│   │   ├── analyze-fundamental.ts
│   │   ├── search-knowledge.ts   # RAG over news + saved analyses
│   │   ├── annotate-chart.ts
│   │   ├── set-alert.ts
│   │   ├── log-journal.ts
│   │   └── index.ts
│   ├── memory/
│   │   ├── thread.ts
│   │   └── retrieval.ts
│   ├── eval/
│   │   ├── prompts.json          # 10 manual prompts from 00-overview
│   │   └── runner.ts             # local-only manual runner; not in CI
│   └── index.ts
└── package.json
```

## `packages/data/`

```
packages/data/
├── src/
│   ├── providers/
│   │   ├── twelve-data/
│   │   │   ├── rest.ts
│   │   │   └── map.ts            # raw → DTO normalisation
│   │   ├── finnhub/
│   │   ├── alpha-vantage/
│   │   ├── marketaux/
│   │   ├── trading-economics/
│   │   └── fred/
│   ├── adapters/                 # provider-agnostic facades
│   │   ├── price.ts
│   │   ├── candles.ts
│   │   ├── news.ts
│   │   └── calendar.ts
│   ├── cache/
│   │   ├── kv.ts                 # Upstash wrapper
│   │   └── ttl.ts                # per-resource TTL policy
│   ├── failover.ts               # primary/fallback strategy
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
│   ├── pivots.ts                 # daily / weekly / camarilla
│   ├── structure/                # SMC / ICT primitives
│   │   ├── swings.ts
│   │   ├── bos-choch.ts
│   │   ├── order-blocks.ts
│   │   ├── fvg.ts
│   │   └── liquidity.ts
│   ├── patterns/
│   │   ├── divergence.ts
│   │   ├── engulfing.ts
│   │   └── pin-bar.ts
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
│   │   ├── snapshots.ts
│   │   └── telemetry.ts          # chat_telemetry (token usage / cost)
│   ├── client.ts                 # drizzle client
│   └── migrations/               # generated SQL
└── drizzle.config.ts
```

> Personal-mode note: tables have **no `user_id` column**. There's only one user.

## `packages/ui/`

```
packages/ui/
├── src/
│   ├── primitives/               # shadcn-generated, lightly themed
│   ├── tokens/
│   │   ├── colors.ts
│   │   ├── radii.ts
│   │   └── motion.ts
│   ├── theme.css
│   └── index.ts
└── package.json
```

> Optional: at MVP scale this can live inside `apps/web/src/components/ui` and we promote to a package only if we ever add `apps/worker` or another consumer.

## `packages/config/`

```
packages/config/
├── eslint/index.js
├── prettier/index.js
├── tailwind/preset.ts
├── typescript/base.json
├── typescript/nextjs.json
└── typescript/node.json
```

## Naming conventions (strict)

| Scope                       | Convention                          | Example                          |
| --------------------------- | ----------------------------------- | -------------------------------- |
| Files (TS/TSX)              | `kebab-case.ts(x)`                  | `price-tile.tsx`                 |
| React components            | `PascalCase`                        | `PriceTile`                      |
| Hooks                       | `use-` prefix, file kebab           | `use-prices.ts` → `usePrices()`  |
| Zod schemas                 | `XSchema`, type `X`                 | `CandleSchema`, `Candle`         |
| Constants                   | `SCREAMING_SNAKE`                   | `DEFAULT_TIMEFRAME`              |
| Env vars                    | `SCREAMING_SNAKE`, prefixed         | `NEXT_PUBLIC_*`                  |
| Folder for vertical feature | singular noun                       | `chat/`, `journal/`              |
| Test files                  | colocated `.test.ts(x)` or `.e2e.ts`| `price-tile.test.tsx`            |

## Path aliases

In `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*":          ["apps/web/src/*"],
      "@ui/*":        ["packages/ui/src/*"],
      "@shared/*":    ["packages/shared/src/*"],
      "@ai/*":        ["packages/ai/src/*"],
      "@data/*":      ["packages/data/src/*"],
      "@indicators/*":["packages/indicators/src/*"],
      "@db/*":        ["packages/db/src/*"]
    }
  }
}
```

Rule: **never** import across packages with relative `../../`. Always use the alias. Enforced via ESLint `no-restricted-imports`.

## "Where do I put a new ___?" cheat sheet

| New thing                              | Goes in                                                |
| -------------------------------------- | ------------------------------------------------------ |
| New AI tool                            | `packages/ai/src/tools/<name>.ts` + register in index  |
| New indicator                          | `packages/indicators/src/<name>.ts`                    |
| New data provider                      | `packages/data/src/providers/<name>/`                  |
| New DB table                           | `packages/db/src/schema/<name>.ts` + migration         |
| New page                               | `apps/web/src/app/(app)/<route>/page.tsx`              |
| New shared zod schema / type           | `packages/shared/src/schemas/<name>.ts`                |
| New cron job                           | `apps/web/src/app/api/cron/<name>/route.ts` + register in `vercel.json` |
| Project-wide tailwind token            | `packages/ui/src/tokens/<group>.ts`                    |
