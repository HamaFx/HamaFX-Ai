---
inclusion: always
---

# HamaFX-Ai — Always-on steering

This is a **personal** AI trading copilot for **XAUUSD (primary), EURUSD, GBPUSD only** — single user, single deploy.

- Stack: Next.js 15 + Tailwind v4 + shadcn/ui. Two deployments: **Vercel** (`apps/web`) + one **GCE VM** (`apps/worker`, e2-medium in `us-central1-a`).
- Cron: **systemd timers on the VM** — heavy jobs run in-process inside `hamafx-worker.service`; light crons curl `/api/cron/*` on Vercel with `Authorization: Bearer ${CRON_SECRET}`. The `.github/workflows/cron-*.yml` workflows were retired in Phase 8 PR-21.
- DB: **Supabase Postgres + pgvector** (used as a plain DB — Auth and RLS are **off**).
- Cache: **Next.js Data Cache** (`unstable_cache` + fetch-cache) behind a `Cache` interface in `packages/data/src/cache`.
- AI: Vercel AI SDK v5 via AI Gateway.
- Auth: **single `APP_PASSWORD`** + HMAC-signed cookie + middleware.
- Monorepo: pnpm workspaces + Turborepo.

## Hard rules (do not violate)

1. Read `docs/14-ai-agent-handoff.md` before any non-trivial change.
2. Schemas before code: define zod in `packages/shared/src/schemas` first.
3. UI never calls a provider directly — always via `packages/data` or an API route.
4. No `any`. No `enum`. No deep imports across packages — use aliases (`@shared/*`, `@ai/*`, `@data/*`, `@db/*`, `@ui/*`, `@/*`).
5. Numbers spoken by the agent must come from a tool call. Never invent prices, candles, or news.
6. Update `docs/**` in the same PR as behaviour changes.
7. The 3 supported symbols are `"XAUUSD" | "EURUSD" | "GBPUSD"` — exported as `Symbol` from `@shared`.
8. **No multi-user code**. No `user_id` columns. No RLS. No Supabase Auth / OAuth / magic links. No BYOK UI. No per-user rate limits.
9. **`apps/worker/` exists** (Phase 8). Heavy scheduled work lives there as systemd timers; light Vercel-poke crons remain at `apps/web/src/app/api/cron/<name>/route.ts`. See `docs/14-ai-agent-handoff.md` § F for placement rules.
10. Cron handlers verify `Authorization: Bearer ${CRON_SECRET}` and skip the password gate. Worker jobs run in-process and don't need this.

## File placement quick map

| New thing            | Goes in                                                     |
| -------------------- | ----------------------------------------------------------- |
| AI tool              | `packages/ai/src/tools/<name>.ts`                           |
| Indicator            | `packages/indicators/src/<name>.ts`                         |
| Provider adapter     | `packages/data/src/providers/<name>/`                       |
| DB table + migration | `packages/db/src/schema/<name>.ts`                          |
| Page                 | `apps/web/src/app/(app)/<route>/page.tsx`                   |
| Shared schema / type | `packages/shared/src/schemas/<name>.ts`                     |
| **Heavy** cron job   | `apps/worker/src/jobs/<name>.ts` + register in `jobs/index.ts` + `infra/cron-vm/units/hamafx-job-<name>.{service,timer}` |
| **Light** cron job   | `apps/web/src/app/api/cron/<name>/route.ts` + `infra/cron-vm/units/hamafx-light-<name>.{service,timer}` |

## Naming

- Files: `kebab-case.ts(x)`, components `PascalCase`, hooks `use-foo.ts → useFoo`.
- Schemas: `XSchema` + `type X = z.infer<typeof XSchema>`.
- One component / one concept per file.

## Commits

Conventional Commits: `<type>(<scope>): <subject>` — scopes are `web | ai | data | db | ui | shared | infra | docs`.
