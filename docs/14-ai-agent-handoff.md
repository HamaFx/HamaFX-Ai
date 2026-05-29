# 14 — AI Agent Handoff

> Written **for AI coding agents** that will scaffold and extend HamaFX-Ai (Kiro, Cursor, Claude Code, OpenAI Codex, etc.). Humans should follow `11-conventions.md` instead.
>
> Personal-mode reminders:
>
> - **Single user**, single password. No multi-tenant code.
> - **Two deployments only**: Vercel (`apps/web`) + one GCE VM (`apps/worker` — Phase 8). No third deployable, no Fly.io, no Railway.
> - **No `user_id` columns**, **no RLS**, **no per-user rate limit**.

## How to read this repo (in order)

1. `README.md`
2. `docs/00-overview.md`
3. `docs/01-architecture.md`
4. `docs/02-tech-stack.md`
5. `docs/03-project-structure.md`
6. `docs/05-ui-ux.md` — design tokens, primitives, surfaces
7. `docs/11-conventions.md`
8. The doc that matches the area you're touching (data, AI, UI, deploy…)

If a doc contradicts code, **update the doc in the same PR**. Docs are a hard contract.

## Golden rules

1. **Never invent file paths.** Place new files where `03-project-structure.md` says.
2. **Never invent prices, candles, or news.** Data only enters the model via tool calls.
3. **Never bypass the schemas in `packages/shared`.** Add a new schema there first, then use it.
4. **Never put secrets in code.** Use `process.env` validated by `apps/web/src/lib/env.ts`.
5. **Never break the layer rule** (UI → app → data → infra; never the other way).
6. **Never add a worker / second deployable unit** without explicitly checking with the owner.
7. **Never re-introduce multi-user concepts** (`user_id`, RLS, BYOK, OAuth).
8. **Never roll a new primitive when one of the canonical ones below already exists.**
9. **Always update `docs/`** if you change behaviour, structure, or an interface.
10. **Always use atomic patterns** for budget reservations, upserts, and multi-statement writes (see Phase 1 hardening patterns below).

## Reach for the canonical primitive first

Before writing a one-off button / drawer / segment / placeholder / confirm dialog, look here:

| Need                            | Use                                                |
| ------------------------------- | -------------------------------------------------- |
| Button                          | `<Button/>` (`primary | secondary | ghost | danger | success`, sizes `sm/md/lg`) |
| Text input                      | `<Input/>` (h-12, text-base — kills iOS auto-zoom) |
| Bottom sheet / context-shift    | `<Drawer/>` (vaul wrapper)                         |
| Destructive confirmation        | `<ConfirmDrawer/>` + `useConfirm()` — never `window.confirm()` |
| Floating action                 | `<Fab/>` (positions via `--fab-bottom`)            |
| Segmented control               | `<Segmented/>` — `gradient | solid | tone`         |
| Toggle                          | `<Switch/>`                                        |
| Tooltip on icon-only button     | `<Tooltip/>` (always pair with `aria-label`)       |
| Loading placeholder             | `<Skeleton/>` / `<SkeletonCard/>` — never `animate-pulse` |
| Empty / zero-data card          | `<EmptyState/>` — `tone="brand"` for CTA, `tone="muted"` for "no data" |
| Background-refetch state        | `<StaleIndicator/>` (steering rule §6)             |
| Numeric summary                 | `<StatCard/>` (with optional `<Sparkline/>`)       |
| Live-updating number            | `<AnimatedNumber/>` (spring with `restDelta`)      |
| Toast confirmation              | `toast.success()` / `toast.error()` via sonner    |
| Live timestamp ("2m ago")       | `<LiveTimestamp/>` from `components/news/` (renamed-friendly) |
| Page header                     | `<PageHeader/>` (suppress on /chat — use `<ChatTopBar/>`) |

Before adding a new icon, confirm `lucide-react` doesn't already have it. **No inline SVGs in components** — the only intentional exception is the SVG `feTurbulence` filter inside `<AmbientBackground intensity="vivid">` rendered once on `/login`.

## Standard tasks — recipes

### A. Add a new AI tool

1. Define input/output zod schemas in `packages/shared/src/schemas/tool-outputs/<name>.ts`.
2. Implement the tool in `packages/ai/src/tools/<name>.ts` using `tool()` from the AI SDK.
3. Register it in `packages/ai/src/tools/index.ts` and `packages/shared/src/ai/tool-names.ts`.
4. Create a UI part in `apps/web/src/components/chat/parts/<name>.tsx`.
5. Register the part in `chat/parts/registry.tsx` (TypeScript will refuse to compile if you forget).
6. Add an example to `packages/ai/src/eval/prompts.json`.
7. Update `docs/04-features.md` and `docs/07-ai-agent.md`.

### B. Add a new data provider

1. Create `packages/data/src/providers/<name>/{rest,map}.ts`.
2. Wire it into the relevant adapter in `packages/data/src/adapters/`.
3. Add provider key env var to `.env.example` and `apps/web/src/lib/env.ts`.
4. Add it to the failover order in `packages/data/src/failover.ts`.
5. Update `docs/06-data-sources.md` matrix.
6. Add MSW mocks in tests.

### C. Add a new indicator

1. Implement as a pure function in `packages/indicators/src/<name>.ts`.
2. Export from `packages/indicators/src/index.ts`.
3. Add a Vitest test with golden values from a known source.
4. If user-facing, add an option in `apps/web/src/components/chart/`.
5. If the agent should know, list it in the `get_indicators` tool's enum.

### D. Add a new page

1. Create `apps/web/src/app/(app)/<route>/page.tsx`. Server component by default.
2. Page-local components go in the page's `_components/` folder.
3. Use server components by default; only mark `"use client"` where you need state, events, or browser-only APIs.
4. Add the route to `<NavDrawer/>` (in `components/layout/nav-drawer.tsx`) — pick Markets or Personal section.
5. Define `loading.tsx` (use `<Skeleton/>` / `<SkeletonCard/>`).
6. Define `<EmptyState/>` for the empty case.
7. Surface `<StaleIndicator/>` if the page is query-driven.
8. Sticky in-page headers should reference `var(--topbar-h)` for offset.

### E. Add a new DB table

1. Create `packages/db/src/schema/<name>.ts` with Drizzle.
2. Generate migration: `pnpm --filter db migrate:gen`.
3. Apply locally with `pnpm --filter db migrate:apply`.
4. **No `user_id` column** unless we've explicitly migrated to multi-user.
5. Add a zod schema in `packages/shared/src/schemas/<name>.ts`.
6. Update `docs/08-backend-and-api.md` if a route is added.

### F. Add a new cron job

Phase 8 split scheduled work into two homes:

- **Heavy / scheduled work** lives on the worker as a oneshot systemd unit. Add the run function in `apps/worker/src/jobs/<name>.ts`, register it in `apps/worker/src/jobs/index.ts` + `JobName` in `types.ts` + the resolveHcUuid switch in `runner/cli.ts`. Drop a `infra/cron-vm/units/hamafx-job-<name>.{service,timer}` pair next to the others.
- **Light Vercel-poke crons** stay as `apps/web/src/app/api/cron/<name>/route.ts`. Wrap with `withCronAuth(req, fn)` from `apps/web/src/lib/cron.ts`. Drop a `infra/cron-vm/units/hamafx-light-<name>.{service,timer}` pair so a systemd timer pokes the route on schedule.

For both:

1. Keep handlers **idempotent** and **fast**.
2. Each route / job gets its own `HC_*_UUID` env var. The runner pings start/success/fail; the light unit's `ExecStartPost` pings success after the curl exits 0.
3. Update `infra/cron-vm/README.md` schedule table.
4. Update `docs/08-backend-and-api.md` § Cron.

Heavy jobs should also keep a sibling `apps/web/src/app/api/cron/<name>/route.ts` as a manual-fallback path so an operator can hand-trigger via `curl -H "Authorization: Bearer $CRON_SECRET" …` during a worker outage.

### G. Touch the design tokens

If you change `--color-bg` family, `--color-fg` family, brand, or layout heights:

1. Update `apps/web/src/app/globals.css` only. Components reference these via custom-property `var(--…)` names, never inline OKLCH stops.
2. If you bump `--topbar-h`, every sticky element re-aligns automatically.
3. Update `docs/05-ui-ux.md` § Design tokens.

### H. Add a new local-storage preference

1. Use the `hamafx:` key prefix.
2. Wrap reads/writes in a tiny `useX()` hook colocated with the consumer (see `components/news/use-bookmarks.tsx` for the pattern — `read()` / `write()` helpers + cross-tab `storage` listener).
3. Add a row to the Preferences card in `apps/web/src/app/(app)/settings/_components/preferences-card.tsx`.
4. Surface a "clear" affordance in `data-card.tsx` so the user can reset.

## Anti-patterns to refuse

When asked to do any of the following, push back:

- "Add Supabase Auth / Clerk / NextAuth." — we use a single password gate.
- "Add `user_id` columns." — there's one user.
- "Add per-user rate limiting." — only the global cost cap exists.
- "Spin up a Fly.io / Railway service." — the GCE VM (`apps/worker`) covers what Vercel can't. Don't add a third deployable.
- "Add LLM-as-judge in CI." — manual eval only.
- "Use `any`." — no.
- "Drop zod, it's overkill." — no.
- "Add a global Redux store." — context + nuqs is enough.
- "Cache AI responses keyed only by the user message" (without context hash).
- "Bring back the bottom navigation." — Phase 6 retired it; `<NavDrawer/>` replaces it.
- "Use `window.confirm()`." — `<ConfirmDrawer/>` exists for a reason.
- "Inline an `<svg>` in a component." — `lucide-react` only.
- "Roll a new segmented control / drawer / button." — see the canonical primitive table above.

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
- If you find yourself rolling a new "primitive" — drawer, button, segmented control, empty state, skeleton — stop and use the canonical one. Adding a thirteenth one-off button variant is the fastest way to fragment the design system.

## When in doubt

- Read the doc.
- Ask the user.
- Prefer reversible, additive changes over invasive rewrites.
- If you must rewrite, leave the old code path behind a feature flag for one release.

## Known gotchas (write your tripwires here)

Bugs we've hit twice. Read this BEFORE adding a schema column or a Drizzle SQL template:

- **Worker SignalR manual reconnect (Phase 2 hardening §1)**: `@microsoft/signalr` gives up after exhausting `withAutomaticReconnect`'s schedule and fires `onclose`. Without our manual rebuild loop the worker process keeps running with no SignalR connection and tick ingestion is silently dead. The consumer schedules a jittered backoff rebuild; pair with `Type=notify` + `WatchdogSec=120` in `hamafx-worker.service` so a hard hang is detected within two minutes.
- **Pinned providers + `ProviderEmptyError` (Phase 2 hardening §2)**: live-ticks / candles-1m must be `pinned: true` in their adapter attempts so a transient empty result during worker restart doesn't permanently demote the SignalR pipeline below the BiQuote REST fallback. Use `ProviderEmptyError` (not `ProviderError`) for "no fresh data" to bypass the health-failure write entirely.
- **Live-tick freshness (Phase 2 hardening §3)**: `MAX_AGE_MS` is 5 s, not 60 s. The price route surfaces `ageMs` per tick so the chat tools can refuse to quote a stale value as live.
- **DB pool sizing (Phase 2 hardening §4)**: web defaults to `max=5`, worker to `max=3`. Override per env (`DB_POOL_MAX` / `WORKER_DB_POOL_MAX`). Worker units MUST set `Environment="HAMAFX_RUNTIME=worker"` so `getDb()` picks the worker defaults; the web runtime infers from the absence of that env.
- **Cache SWR is single-layer now (Phase 2 hardening §7)**: `MemoryCache` owns SWR + single-flight; `NextjsCache` is a thin facade for `revalidateTag` propagation. Don't reintroduce the dual-mirror pattern — it had two bugs (mirror TTL elapsing during stable windows, in-flight callers not seeing the SWR fallback). Both callers riding the same producer now get the SWR fallback when it rejects.
- **`waitUntil` for slow tail work (Phase 2 hardening §8)**: auto-title and other 1-3 s LLM calls in `onFinish` go through `waitUntil()` from `packages/ai/src/wait-until.ts`. The shim resolves to `@vercel/functions/waitUntil` on Vercel and falls back to fire-and-forget elsewhere. Don't `await` slow work inside `onFinish` — the response stream stays open until it completes and the user sees stuck loading dots.
- **Atomic budget reservation (Phase 1 hardening §7)**: chat turns reserve their estimated cost via `tryReserveBudget()` against `daily_ai_spend.total_usd_cents` BEFORE invoking the model. The reconciliation in `applyBudgetDelta()` runs in `onFinish` so the running counter stays close to the audit `SUM(est_cost_usd)` from `chat_telemetry`. Don't go back to `enforceDailyBudget()` for the chat path — that read-then-decide pattern lets two concurrent calls both pass at 99% of the cap.
- **Transactional persistence (Phase 1 hardening §9)**: any helper that does INSERT + UPDATE (or INSERT + INSERT) MUST wrap the pair in `db.transaction(...)`. `appendUserMessage`, `appendAssistantMessage`, `getOrCreateBriefingsThread`, and `upsertSnapshot` already follow this. A connection failure between the two statements used to leave messages persisted while sidebar sort broke, or duplicate snapshot rows for the same `(symbol, kind, asOf)`.
- **`memory_embeddings` upsert (Phase 1 hardening §8)**: use `INSERT … ON CONFLICT (kind, source_id) DO UPDATE` (see `memory-index.ts`). The legacy `DELETE + INSERT` pair could leave rows missing forever after a crash between the two statements. The unique constraint that backs this is `memory_embeddings_kind_source_uk` from migration 0006.
- **Briefings idempotency (Phase 1 hardening §10)**: don't write `briefings_emitted` when the LLM returned an empty body. The PK enforces one row per `(eventId, kind)`, so an empty stub burns the slot forever. The generator gates on `summary.trim().length >= 50` and lets the next cron tick retry.
- **Drizzle `$onUpdate` for timestamps**: use `() => new Date()`, NOT `() => sql\`now()\``. drizzle-orm 0.38.4 mis-binds the SQL fragment through the timestamp column's `mapToDriverValue`, which expects a Date and crashes with `value.toISOString is not a function`. Bit us on every UPDATE to `chat_threads` and `journal_entries` until Phase 8 cleanup.
- **Drizzle `sql` template + timestamp params**: pass a `Date` directly into a parameter slot, never `date.toISOString()`. The same `mapToDriverValue` blows up. ✅ `sql\`${col} >= ${date}\`` ❌ `sql\`${col} >= ${date.toISOString()}\``.
- **postgres-js + Supabase pooler**: always pass `prepare: false`. The transaction-mode pooler doesn't support prepared statements. Already encoded in `packages/db/src/client.ts` — don't override.
- **Vercel CLI `vercel env pull` redacts encrypted values**: it returns `KEY=""` for everything user-encrypted. To migrate secrets to the VM, paste from the Vercel dashboard or use a short-lived authenticated route on the deployed app (then delete the route). `vc env pull` is fine for system bindings (`POSTGRES_*`, `VERCEL_*`) only.
- **Worker bundle externalization**: `apps/worker/scripts/build.mjs` externalizes `@sentry/node` and `@opentelemetry/*` so OTel transports can resolve at runtime. Anything that statically imports `@opentelemetry/api` (e.g. the upstream `ai` SDK) MUST be declared as a worker dep, otherwise heavy jobs crash with `ERR_MODULE_NOT_FOUND`.
- **Underscore-prefixed App Router folders are private**: `apps/web/src/app/api/cron/_foo/` will 404. Either drop the underscore or move the helpers somewhere else.
- **`parseJsonBody` body cap (Phase 1 hardening §6)**: reject early via the `Content-Length` header AND a streamed byte counter. `req.json()` alone buffers the whole payload before zod sees it; a 27 MB chat attachment would OOM the function.
- **Auth cookie base64url (Phase 1 hardening §1)**: the encoder must replace `+` → `-` AND `/` → `_` (the legacy code targeted `_` in the second call, which is a no-op). Tokens with raw `/` aren't URL-safe and break any future Authorization-header reuse. The fix invalidates every active session — bumping `AUTH_COOKIE_SECRET` is also a clean way to roll out changes here.

## Steering files

`.kiro/steering/` contains short, area-specific rules that AI agents should load when working on those areas:

- `00-project.md` — always-on: stack, hard rules, file placement.
- `30-ui.md` — auto-included when working in `apps/web/**`. Keeps in sync with `docs/05-ui-ux.md`.

If you change rule structure in either file, change the other.
