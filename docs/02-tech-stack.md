# 02 — Tech Stack

> Every choice below has a **reason**, an **alternative considered**, and a **migration path** if we need to swap it later. Nothing is sacred — but defaults must be defended.

## At a glance

| Layer              | Choice                                                          | Why (1-liner)                                                |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Framework          | **Next.js 15** (App Router, RSC)                                | Best-in-class DX, edge + node runtimes, native streaming.    |
| Language           | **TypeScript 5.x** strict                                       | Required for AI-agent legibility and zod-based contracts.    |
| UI primitives      | **shadcn/ui** (Radix under the hood)                            | Copy-paste, no runtime lock-in, fully themeable.             |
| Styling            | **Tailwind CSS v4** + `tailwind-variants` + `clsx`              | Speed, consistency, agent-friendly class predictability.     |
| Icons              | **lucide-react**                                                | Pairs natively with shadcn; tree-shakable.                   |
| Animations         | **Framer Motion** (`motion`)                                    | Industry standard; sparingly used.                           |
| Charts (financial) | **TradingView lightweight-charts** (Apache-2.0)                 | Best-performing OHLC canvas lib, free, wide adoption.        |
| Charts (advanced)  | **TradingView Advanced Charting Widget** (free, self-hosted JS) | Optional pro view with full indicators; embedded as iframe.  |
| Charts (misc)      | **Recharts** for non-OHLC mini-stats                            | Declarative React, fine for sparkline/sentiment bars.        |
| Server state       | **TanStack Query v5**                                           | Best cache, refetch, dedupe; pairs with RSC fine.            |
| Client state       | **Zustand** + URL state (`nuqs`)                                | Minimal, no boilerplate; URL state for shareable views.      |
| Forms              | **react-hook-form** + **zod** + `@hookform/resolvers`           | Schema-first; same zod schemas validate API + AI tools.      |
| AI SDK             | **Vercel AI SDK v5** (`ai`, `@ai-sdk/react`, `@ai-sdk/*`)       | Standard streaming + tool calling + `ToolLoopAgent`.         |
| AI provider        | **Vercel AI Gateway** → OpenAI / Anthropic / Google             | One key, observability, fallback routing.                    |
| Embeddings         | `text-embedding-3-small` (OpenAI) via Gateway                   | Cheap, good for news RAG.                                    |
| DB                 | **Supabase Postgres** + `pgvector`                              | Auth + Postgres + Realtime + storage in one.                 |
| ORM                | **Drizzle ORM**                                                 | Lightweight, edge-compatible, great TS inference.            |
| Cache / RL / Queue | **Upstash Redis** + `@upstash/ratelimit` + `@upstash/qstash`    | Serverless-friendly Redis; native rate-limit primitives.     |
| Worker framework   | **Hono** on Node 20 (Bun later)                                 | Tiny, fast, Web-Standards APIs, native WS helper.            |
| WebSocket          | `ws` on the worker, browser-native `WebSocket` on client        | Battle-tested.                                               |
| Auth               | **Supabase Auth** (email + OAuth) +  Next.js middleware         | Already in Supabase; magic-link for mobile-first.            |
| Validation         | **Zod**                                                         | Single schema source for API, AI tools, DB inputs.           |
| Testing            | **Vitest** + **Playwright** + **MSW**                           | Vitest for unit, Playwright for e2e, MSW for provider mocks. |
| Lint / format      | **ESLint flat config** + **Prettier** + **`@ianvs/prettier-plugin-sort-imports`** | Deterministic ordering = better AI patches.    |
| Monorepo           | **pnpm workspaces** + **Turborepo**                             | Fast incremental builds, remote cache on Vercel.             |
| Logging            | `pino` (worker), `next/log` (web), telemetry via OpenTelemetry  | One trace id end-to-end.                                     |
| Tracing            | **Axiom** (preferred) or **Better Stack**                       | Cheap, log + trace + metrics in one.                         |
| CI/CD              | GitHub Actions + Vercel + Fly/Railway                           | Standard.                                                    |
| PWA                | `next-pwa` (or hand-rolled service worker)                      | Installable, offline shell.                                  |

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

### Why Supabase + Drizzle (not Prisma + Neon)

- Auth + DB + storage + realtime in one console = less ops at MVP.
- `pgvector` is built in for our news RAG.
- Drizzle (instead of Prisma) because: (a) edge-compatible, (b) zero codegen step in CI, (c) AI agents read Drizzle schemas more accurately than Prisma's DSL.
- Migration path: Supabase is just Postgres — we can lift-and-shift to Neon if needed.

### Why a separate worker (Hono on Fly.io)

See `01-architecture.md` § "Why two deployable units?". Short version: persistent WS, long crons, in-memory price tape.

### Why Upstash Redis (not Vercel KV / DragonflyDB)

- Serverless, pay-per-request, free tier sufficient for MVP.
- `@upstash/ratelimit` is a one-liner production-grade rate limiter.
- `@upstash/qstash` gives us scheduled jobs without standing up a queue.

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
hono: ^4
ws: ^8
```

(Pin exact versions in `package.json` at scaffold time and lock with `pnpm-lock.yaml`.)

## What we deliberately did **not** pick

| Tool                  | Why not                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| Redux Toolkit         | Too much boilerplate for our state shape.                              |
| Prisma                | Edge limitations + codegen step; Drizzle is the better fit.            |
| Material UI / Chakra  | Heavier runtime, harder to tailor; shadcn wins for AI-friendly code.   |
| Apollo / GraphQL      | Overkill — REST + zod is enough; we don't have third-party clients.    |
| Highcharts / AG-Grid  | Licensing, weight, not needed at MVP scope.                            |
| FastAPI / NestJS      | We want a single TS codebase end to end.                               |
| OpenAI Assistants API | Vendor lock-in, weaker streaming UX than AI SDK.                       |
