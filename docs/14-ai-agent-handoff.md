# 14 — AI Agent Handoff

> Written **for AI coding agents** that will scaffold and extend HamaFX-Ai (Kiro, Cursor, Claude Code, OpenAI Codex, etc.). Humans should follow `11-conventions.md` instead.
>
> Personal-mode reminders:
> - **Single user**, single password. No multi-tenant code.
> - **Single Vercel deploy**. No `apps/worker/` at MVP.
> - **No `user_id` columns**, **no RLS**, **no per-user rate limit**.

## How to read this repo (in order)

1. `README.md`
2. `docs/00-overview.md`
3. `docs/01-architecture.md`
4. `docs/02-tech-stack.md`
5. `docs/03-project-structure.md`
6. `docs/11-conventions.md`
7. The doc that matches the area you're touching (data, AI, UI, deploy…)

If a doc contradicts code, **update the doc in the same PR**. Docs are a hard contract.

## Golden rules

1. **Never invent file paths.** Place new files where `03-project-structure.md` says.
2. **Never invent prices, candles, or news.** Data only enters the model via tool calls.
3. **Never bypass the schemas in `packages/shared`.** Add a new schema there first, then use it.
4. **Never put secrets in code.** Use `process.env` validated by `packages/shared/src/env.ts`.
5. **Never break the layer rule** (UI → app → data → infra; never the other way).
6. **Never add a worker / second deployable unit** without explicitly checking with the owner — the architecture intentionally avoids this for MVP.
7. **Never re-introduce multi-user concepts** (`user_id`, RLS, BYOK, OAuth). Personal-mode is a hard requirement.
8. **Always update `docs/`** if you change behaviour, structure, or an interface.

## Standard tasks — recipes

### A. Add a new AI tool

1. Define input/output zod schemas in `packages/shared/src/schemas/`.
2. Implement the tool in `packages/ai/src/tools/<name>.ts` using `tool()` from the AI SDK.
3. Register it in `packages/ai/src/tools/index.ts`.
4. Create a UI part in `apps/web/src/components/chat/parts/<name>.tsx`.
5. Register the part in the chat parts registry.
6. Add an example to `packages/ai/src/eval/prompts.json` (manual eval list).
7. Update `docs/07-ai-agent.md` § Tools (the table).

### B. Add a new data provider

1. Create `packages/data/src/providers/<name>/{rest,map}.ts`.
2. Wire it into the relevant adapter in `packages/data/src/adapters/`.
3. Add provider key env var to `.env.example` and `packages/shared/src/env.ts`.
4. Add it to the failover order in `packages/data/src/failover.ts`.
5. Update `docs/06-data-sources.md` matrix.
6. Add MSW mocks in tests.

### C. Add a new indicator

1. Implement as a pure function in `packages/indicators/src/<name>.ts`.
2. Export from `packages/indicators/src/index.ts`.
3. Add a Vitest test with golden values from a known source.
4. If user-facing, add an option in `apps/web/src/features/chart/`.
5. If the agent should know, list it in the `get_indicators` tool's enum.

### D. Add a new page

1. Create `apps/web/src/app/(app)/<route>/page.tsx`.
2. If the page has its own components, put them in the page's `_components/` folder.
3. Use server components by default; only mark `"use client"` where you need state or events.
4. Add the route to bottom nav / command palette if appropriate.
5. Define `loading.tsx`, `error.tsx`, and a sensible empty state.

### E. Add a new DB table

1. Create `packages/db/src/schema/<name>.ts` with Drizzle.
2. Generate migration: `pnpm --filter db migrate:gen`.
3. Apply locally with `pnpm --filter db migrate:apply`.
4. **No `user_id` column** unless we've explicitly migrated to multi-user.
5. Add a zod schema in `packages/shared/src/schemas/<name>.ts`.
6. Update `docs/08-backend-and-api.md` if a route is added.

### F. Add a new cron job

1. Create handler at `apps/web/src/app/api/cron/<name>/route.ts`.
2. Verify `Authorization: Bearer ${CRON_SECRET}` (timing-safe). Return 401 otherwise.
3. Keep handler **idempotent** and **fast** (≤ 60 s on Pro, ≤ 10 s on Hobby).
4. Register cadence in `vercel.json` `"crons"`.
5. Add it to `docs/08-backend-and-api.md` § Cron.

## Anti-patterns to refuse

When asked to do any of the following, push back:

- "Add Supabase Auth / Clerk / NextAuth." — we use a single password gate.
- "Add `user_id` columns." — there's one user.
- "Add per-user rate limiting." — only global cost cap exists.
- "Spin up a Fly.io / Railway service." — not for MVP.
- "Add LLM-as-judge in CI." — manual eval only.
- "Use `any`." — no.
- "Drop zod, it's overkill." — no.
- "Add a global Redux store." — Zustand + nuqs is enough.
- "Cache AI responses keyed only by the user message" (without context hash).

## Operating envelope when scaffolding

If you are the agent doing the **initial scaffold** (Phase 0):

- Use exact dependency names from `02-tech-stack.md` § Versions.
- Generate `tsconfig.base.json` paths exactly as in `03-project-structure.md`.
- Implement the password gate (`/api/auth/login` + middleware) and confirm it works on a preview deploy.
- Stop after `/login` works and the gated `/chat` shell renders. Do not start implementing tools yet.
- Open a PR titled `chore(infra): phase 0 scaffold`.

## Operating envelope when adding features

- Match the phase to a checklist item in `10-roadmap.md`.
- Don't combine multiple unrelated features in one PR.
- If a request looks like it belongs in a later phase, surface that and ask whether to defer.

## When in doubt

- Read the doc.
- Ask the user.
- Prefer reversible, additive changes over invasive rewrites.
- If you must rewrite, leave the old code path behind a feature flag for one release.

## Steering files

`.kiro/steering/` contains short, area-specific rules that AI agents should load when working on those areas. They mirror the long-form docs but are optimised for token economy. Keep them in sync.
