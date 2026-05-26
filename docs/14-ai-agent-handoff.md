# 14 — AI Agent Handoff

> This document is written **for the AI coding agents** that will scaffold and extend HamaFX-Ai (Kiro, Cursor, Claude Code, OpenAI Codex, etc.). If you are a human, you can skim this — humans should follow `11-conventions.md` instead.

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

1. **Never invent file paths.** If a file doesn't exist yet, create it where `03-project-structure.md` says it should live.
2. **Never invent prices, candles, or news.** Data only enters the model via tool calls.
3. **Never bypass the schemas in `packages/shared`.** Add a new schema there first, then use it.
4. **Never put secrets in code.** Use `process.env` validated by `packages/shared/src/env.ts`.
5. **Never break the layer rule** (UI → app → data → infra; never the other way).
6. **Always update `docs/`** if you change behaviour, structure, or an interface.

## Standard tasks — recipes

### A. Add a new AI tool

1. Define input/output zod schemas in `packages/shared/src/schemas/`.
2. Implement the tool in `packages/ai/src/tools/<name>.ts` using `tool()` from the AI SDK.
3. Register it in `packages/ai/src/tools/index.ts`.
4. Create a UI part in `apps/web/src/components/chat/parts/<name>.tsx`.
5. Register the part in the chat parts registry.
6. Add an eval case in `packages/ai/src/eval/cases.json`.
7. Update `docs/07-ai-agent.md` § Tools (the table).

### B. Add a new data provider

1. Create `packages/data/src/providers/<name>/{rest,ws,map}.ts`.
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
5. If agent should know, list it in the `get_indicators` tool's enum.

### D. Add a new page

1. Create `apps/web/src/app/(app)/<route>/page.tsx`.
2. If the page has its own components, put them in `apps/web/src/app/(app)/<route>/_components/`.
3. Use server components by default; only mark `"use client"` where you need state or events.
4. Add the route to bottom nav / command palette if appropriate.
5. Define loading.tsx, error.tsx, and a sensible empty state.

### E. Add a new DB table

1. Create `packages/db/src/schema/<name>.ts` with Drizzle.
2. Generate migration: `pnpm --filter db migrate:gen`.
3. Add Supabase RLS policies if the table is user-scoped.
4. Add a zod schema in `packages/shared/src/schemas/<name>.ts` (do not reuse Drizzle types directly across boundaries).
5. Update `docs/08-backend-and-api.md` if a route is added.

## Anti-patterns to refuse

When asked to do any of the following, push back in plain language:

- "Just put the API key in the client code."
- "Drop zod, it's overkill."
- "Add a new instrument quickly without updating provider mappings."
- "Bypass rate-limit for testing in production."
- "Use any in this generic, it's fine."
- "Skip the AI eval suite for this PR."
- "Fork shadcn into a giant components mega-folder."
- "Add a global Redux store."
- "Cache AI responses keyed only by the user message" (without context hash).

## Operating envelope when scaffolding

If you are the agent doing the **initial scaffold** (Phase 0):

- Use exact dependency names from `02-tech-stack.md` § Versions.
- Generate `tsconfig.base.json` paths exactly as in `03-project-structure.md`.
- Stop after the worker `/v1/health` returns 200 and the web `/login` route renders. Do not start implementing tools yet.
- Open a PR titled `chore(infra): phase 0 scaffold` and link this document.

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
