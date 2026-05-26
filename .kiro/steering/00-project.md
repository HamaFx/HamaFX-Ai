---
inclusion: always
---

# HamaFX-Ai — Always-on steering

This is the **AI trading copilot** for **XAUUSD (primary), EURUSD, GBPUSD only**.

- Stack: Next.js 15 + Tailwind v4 + shadcn/ui on Vercel.
- Worker: Hono on Fly.io / Railway.
- DB: Supabase Postgres + pgvector.
- Cache / RL: Upstash Redis.
- AI: Vercel AI SDK v5 via AI Gateway.
- Monorepo: pnpm workspaces + Turborepo.

## Hard rules (do not violate)

1. Read `docs/14-ai-agent-handoff.md` before any non-trivial change.
2. Schemas before code: define zod in `packages/shared/src/schemas` first.
3. UI never calls a provider directly — always via `packages/data` or an API route.
4. No `any`. No `enum`. No deep imports across packages — use aliases (`@shared/*`, `@ai/*`, `@data/*`, `@db/*`, `@ui/*`, `@/*`).
5. Numbers spoken by the agent must come from a tool call. Never invent prices, candles, or news.
6. Update `docs/**` in the same PR as behaviour changes.
7. The 3 supported symbols are `"XAUUSD" | "EURUSD" | "GBPUSD"` — exported as `Symbol` from `@shared`.

## File placement quick map

| New thing                | Goes in                                              |
| ------------------------ | ---------------------------------------------------- |
| AI tool                  | `packages/ai/src/tools/<name>.ts`                    |
| Indicator                | `packages/indicators/src/<name>.ts`                  |
| Provider adapter         | `packages/data/src/providers/<name>/`                |
| DB table + migration     | `packages/db/src/schema/<name>.ts`                   |
| Page                     | `apps/web/src/app/(app)/<route>/page.tsx`            |
| Shared schema / type     | `packages/shared/src/schemas/<name>.ts`              |
| Worker cron              | `apps/worker/src/ingest/<name>.ts`                   |

## Naming

- Files: `kebab-case.ts(x)`, components `PascalCase`, hooks `use-foo.ts → useFoo`.
- Schemas: `XSchema` + `type X = z.infer<typeof XSchema>`.
- One component / one concept per file.

## Commits

Conventional Commits: `<type>(<scope>): <subject>` — scopes are `web | worker | ai | data | db | ui | shared | infra | docs`.
