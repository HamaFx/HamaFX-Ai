# 02 — Tech Stack

> Every choice below has a **reason**, an **alternative considered**, and a **migration path** if we need to swap it later. Nothing is sacred — but defaults must be defended.

## At a glance

| Layer              | Choice                                                                            | Why (1-liner)                                                |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Framework          | **Next.js 15** (App Router, RSC)                                                  | Best-in-class DX, edge + node runtimes, native streaming.    |
| Language           | **TypeScript 5.x** strict                                                         | Required for AI-agent legibility and zod-based contracts.    |
| UI primitives      | **shadcn/ui** (Radix under the hood)                                              | Copy-paste, no runtime lock-in, fully themeable.             |
| Styling            | **Tailwind CSS v4** + `tailwind-variants` + `clsx`                                | Speed, consistency, agent-friendly class predictability.     |
| Icons              | **lucide-react**                                                                  | Pairs natively with shadcn; tree-shakable.                   |
| Animations         | **Framer Motion** (`motion`)                                                      | Industry standard; sparingly used.                           |
| Charts (financial) | **TradingView lightweight-charts** (Apache-2.0)                                   | Best-performing OHLC canvas lib, free, wide adoption.        |
| Charts (advanced)  | **TradingView Advanced Charting Widget** (free, self-hosted JS)                   | Optional pro view with full indicators; embedded as iframe.  |
| Charts (misc)      | **Recharts** for non-OHLC mini-stats                                              | Declarative React, fine for sparkline/sentiment bars.        |
| Server state       | **TanStack Query v5**                                                             | Best cache, refetch, dedupe; pairs with RSC fine.            |
| Client state       | **Zustand** + URL state (`nuqs`)                                                  | Minimal, no boilerplate; URL state for shareable views.      |
| Forms              | **react-hook-form** + **zod** + `@hookform/resolvers`                             | Schema-first; same zod schemas validate API + AI tools.      |
| AI SDK             | **Vercel AI SDK v5** (`ai`, `@ai-sdk/react`, `@ai-sdk/*`)                         | Standard streaming + tool calling + `ToolLoopAgent`.         |
| AI provider        | **Vercel AI Gateway** → OpenAI / Anthropic / Google                               | One key, observability, fallback routing.                    |
| Embeddings         | `text-embedding-3-small` (OpenAI) via Gateway                                     | Cheap, good for news RAG.                                    |
| DB                 | **Supabase Postgres** + `pgvector` (DB only — no Auth, no RLS)                    | Free tier, has `pgvector`, easy dashboard.                   |
| ORM                | **Drizzle ORM**                                                                   | Lightweight, edge-compatible, great TS inference.            |
| Cache              | **Next.js Data Cache** (`unstable_cache` + fetch-cache) behind `packages/data/src/cache` | Free, persists across invocations on Vercel, single-flight built-in. Redis swap is a one-file change. |
| Cron               | **systemd timers on the GCE VM** (heavy in-process jobs + light Vercel pokes)     | Single-user, two deploys; Vercel Hobby's 1-day cron floor doesn't apply. |
| Worker             | **Node service on a GCE `e2-medium` VM** (`apps/worker`)                          | Holds the BiQuote SignalR connection + runs heavy jobs the 60s Vercel ceiling can't fit. |
| Auth               | **Single `APP_PASSWORD`** + HMAC-signed cookie + middleware                       | Personal-mode; one user, one password.                       |
| Validation         | **Zod**                                                                           | Single schema source for API, AI tools, DB inputs.           |
| Testing            | **Vitest** + **Playwright** + **MSW**                                             | Vitest for unit, Playwright for e2e, MSW for provider mocks. |
| Lint / format      | **ESLint flat config** + **Prettier** + **`@ianvs/prettier-plugin-sort-imports`** | Deterministic ordering = better AI patches.                  |
| Monorepo           | **pnpm workspaces** + **Turborepo**                                               | Fast incremental builds, remote cache on Vercel.             |
| Logging            | `console.log` JSON-shaped → Vercel logs                                           | Personal-mode: keep it simple.                               |
| CI/CD              | GitHub Actions (`lint typecheck test`) + Vercel auto-deploy                       | Minimal — Vercel does the heavy lifting.                     |
| PWA                | `next-pwa` (or hand-rolled service worker)                                        | Installable, offline shell.                                  |

## Rationale per choice

### Why Next.js 15 (not TanStack Start, not Remix/RR7)

- **Vercel hosting is a hard requirement.** Next.js is the lowest-friction path on Vercel.
- React Server Components let us prefetch chart snapshots and chat threads server-side, then hydrate the interactive bits — fewer waterfalls on mobile.
- Streaming `Response` and `experimental_useObject` from the AI SDK plug in natively.
- **Migration path**: if Vercel becomes a constraint, the same React/TS code can move to TanStack Start with limited rewrite (mostly route handler signatures).

### Why TradingView lightweight-charts (not Recharts/Highcharts/ECharts for OHLC)

- Purpose-built for finance: candles, areas, volume, time-axis tick marks, crosshair sync — all out of the box.
- Apache-2.0 license, ~45kb gzipped, no runtime telemetry.
- Easy to programmatically annotate (markers, price lines, drawings) — required so the agent can "draw on the chart".
- The full **TradingView Advanced Charting Widget** is offered as an optional pro view but is not on the critical path because access requires an application/agreement for the redistributable library.

### Why Vercel AI SDK v5 (not LangChain/Mastra/raw OpenAI)

- Tightest integration with Next.js streaming + `useChat` + `tool()` definitions.
- v5 introduced first-class agent loop (`ToolLoopAgent`) and a stable streaming wire format with tool-call lifecycles — exactly what we need for "show the tool call in the UI" UX.
- Provider-agnostic via AI Gateway → swap models without code changes.
- LangChain considered: too much abstraction churn, awkward in Next edge runtime.
- Mastra considered: promising, but smaller ecosystem; revisit at v2.

### Why Supabase + Drizzle (not raw Postgres + Prisma)

- Free tier covers a personal app comfortably (500 MB DB, daily backups).
- `pgvector` is built in for our news RAG.
- We use Supabase **only as a Postgres host** — Auth and RLS stay off (single user). The Supabase dashboard is a nice bonus for inspecting tables.
- Drizzle (instead of Prisma) because: (a) edge-compatible, (b) zero codegen step in CI, (c) AI agents read Drizzle schemas more accurately than Prisma's DSL.
- Migration path: Supabase is just Postgres — we can lift-and-shift to Neon if needed.

### Why a worker on a single GCE VM (Phase 8)

The original "no worker" rule held until two needs forced our hand: a persistent BiQuote SignalR connection (sub-second prices, free tier, no auth) and heavy scheduled jobs that don't fit Vercel Hobby's 60s function ceiling. A single `e2-medium` VM in `us-central1-a` gives us both for ~$8/mo, vs. the $20/mo Vercel Pro upgrade plus a separate hosting bill for a worker. Fly.io / Railway were considered and rejected — adding a third deployable for one user buys nothing the existing GCE tenancy doesn't already cover.

### Why Next.js Data Cache (not Vercel KV / Upstash / DragonflyDB)

- Free, no extra service, persists across invocations on Vercel.
- Built-in single-flight via `unstable_cache` — duplicate concurrent fetches collapse to one upstream call.
- Tag-based invalidation works with our existing `packages/data/src/cache` interface.
- The `Cache` interface in `packages/data/src/cache/` keeps the door open: a Redis-backed implementation is a one-file change if cross-region consistency ever matters.

### Why Zustand + nuqs (not Redux / Jotai)

- Trading UIs have a lot of "this small bit of UI state should be shareable via URL" (selected symbol, timeframe, indicator overlay). `nuqs` does that with type safety.
- Local UI state (open drawers, chart hover state) lives in tiny Zustand stores per feature.

### Why pnpm + Turborepo

- pnpm: strict dependency graph (good for monorepos).
- Turborepo: pipeline caching, free remote cache on Vercel, AI agents can run `turbo run test --filter=...` on a single package without booting the whole repo.

## Versions (target at scaffold time)

```
node: >=20.11
pnpm: >=9.0
next: ^15
react: ^19
typescript: ^5.5
tailwindcss: ^4
ai: ^5
@ai-sdk/react: ^2
@ai-sdk/openai: ^2
@ai-sdk/anthropic: ^2
drizzle-orm: latest
zod: ^3.23
@tanstack/react-query: ^5
zustand: ^5
nuqs: latest
@upstash/redis: latest
@supabase/supabase-js: ^2  # only used if we ever need Storage; not for auth
```

(Pin exact versions in `package.json` at scaffold time and lock with `pnpm-lock.yaml`.)

## What we deliberately did **not** pick

| Tool                  | Why not                                                              |
| --------------------- | -------------------------------------------------------------------- |
| Redux Toolkit         | Too much boilerplate for our state shape.                            |
| Prisma                | Edge limitations + codegen step; Drizzle is the better fit.          |
| Material UI / Chakra  | Heavier runtime, harder to tailor; shadcn wins for AI-friendly code. |
| Apollo / GraphQL      | Overkill — REST + zod is enough; we don't have third-party clients.  |
| Highcharts / AG-Grid  | Licensing, weight, not needed at MVP scope.                          |
| FastAPI / NestJS      | We want a single TS codebase end to end.                             |
| OpenAI Assistants API | Vendor lock-in, weaker streaming UX than AI SDK.                     |
