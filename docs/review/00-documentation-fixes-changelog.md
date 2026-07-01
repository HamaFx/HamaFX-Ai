# Documentation & Config Fixes — Changelog

Date: 2026-07-01

This changelog catalogs every correction made during the documentation drift audit,
plus open questions left for human judgment.

---

## Changes Applied

### README.md (7 corrections)
1. AGENTS.md link: `./docs/AGENTS.md` → `./AGENTS.md`
2. Self-hosting link: `./docs/10-self-hosting.md` → `./docs/11-self-hosting.md`
3. Security link: `./docs/12-security.md` → `./docs/10-security.md`
4. First-Run Setup link: `./docs/14-first-run-setup.md` → `./docs/13-first-run-setup.md`
5. Contributing Guide link: removed (file does not exist — was `./docs/11-contributing-guide.md`)
6. Roadmap link: `./docs/13-roadmap.md` → `./docs/12-roadmap.md`
7. Added: `./docs/15-debugging-and-tracing.md` entry
8. Motion Conventions link: `./docs/15-motion-conventions.md` → `./docs/14-motion-conventions.md` (number was off by one)

### AGENTS.md (5 corrections)
1. AUTH_FIX_PLAN.md link path: `../AUTH_FIX_PLAN.md` → `./AUTH_FIX_PLAN.md` (was pointing outside repo)
2. Added "(not yet written)" note to all 3 AUTH_FIX_PLAN.md references
3. Table count: "27 tables" → "40 tables" in both tree diagram and doc index
4. Added 15-debugging-and-tracing.md to doc index
5. Doc index link paths fixed: all `./filename.md` → `./docs/filename.md` (were resolving to repo root, not docs/)

### .env.example (8 corrections)
1. Added 15 missing env vars used by code:
   | Variable | Source |
   |---|---|
   | `AUTH_SECRET` | packages/shared/src/env.ts:41 |
   | `AUTH_MODE` | apps/web/src/auth.config.ts:41 |
   | `AUTH_COOKIE_SECRET` | packages/shared/src/env.ts:43 |
   | `DEPLOYED_SHA` | apps/web/src/app/api/health/route.ts:127 |
   | `POSTGRES_URL` | packages/db/src/client.ts:98 |
   | `DB_POOL_MAX` | packages/db/src/client.ts:59 |
   | `WORKER_DB_POOL_MAX` | packages/db/src/client.ts:58 |
   | `AI_CHAT_RATE_LIMIT` | apps/web/src/app/api/chat/route.ts:33 |
   | `MAX_JSON_BODY_BYTES` | apps/web/src/lib/api.ts:171 |
   | `LOG_LEVEL` | packages/shared/src/logger.ts:23 |
   | `THROTTLE_BACKEND` | packages/data/src/cache/throttle.ts:80 |
   | `MULTI_USER_ENABLED` | packages/shared/src/env.ts:205 |
   | `BYOK_ENABLED` | packages/shared/src/env.ts:208 |
   | `PER_USER_BRIEFINGS` | packages/shared/src/env.ts:214 |
   | `UNLIMITED_SYMBOLS` | packages/shared/src/env.ts:211 |
   | `ENABLE_DEV_LOGIN` | apps/web/src/app/api/dev/login/route.ts:14 |
   | `NEXT_PUBLIC_ENABLE_DEV_LOGIN` | apps/web/src/app/(auth)/login/page.tsx:150 |
   | `NEXT_PUBLIC_BUILD_ID` | apps/web/scripts/set-build-id.mjs:11 |
   | `HAMAFX_RUNTIME` | packages/db/src/client.ts:56 |
2. Removed duplicate `SENTRY_DSN` (appeared at line 204 and 252)
3. Fixed NEXTAUTH_URL comment: "REQUIRED" → "Recommended ... Inferred from VERCEL_URL when unset"
4. Fixed ENCRYPTION_SECRET comment: "REQUIRED for multi-user" → "Required when BYOK_ENABLED=1"
5. Updated DATABASE_URL comment to mention POSTGRES_URL as valid alternative
6. Updated Upstash section: marked as LEGACY (no longer used for caching)

### docs/01-architecture.md (1 correction)
1. Removed dangling reference to `docs/superpowers/specs/2026-05-27-...` (directory does not exist)

### docs/02-codebase.md (3 corrections)
1. Shared package tree: `registry.ts` → `ai/` directory (file moved to `packages/shared/src/ai/tool-names.ts`)
2. Tool registration step: `packages/shared/src/registry.ts` → `packages/shared/src/ai/tool-names.ts`
3. Tool count in ToolName claim: "30" → "32"

### docs/03-ai-agent.md (2 corrections)
1. Domain→Model routing table: removed `AI_FUNDAMENTAL_MODEL` / `AI_TECHNICAL_MODEL` / `AI_SUMMARY_MODEL` / `AI_VISION_MODEL` env var names (removed from code in Phase D2)
2. Summary compaction step: removed `AI_SUMMARY_MODEL` reference

### docs/04-data-layer.md (2 corrections)
1. Table count: "20 Tables" → "40 Tables" (actual pgTable calls)
2. Migration count: "9 migrations (0000–0008)" → "35 migrations (0000–0034)"

### docs/05-api-routes.md (1 correction)
1. Auth file path: `apps/web/src/lib/auth.ts` → `apps/web/src/auth.ts`

### docs/07-worker.md (5 corrections)
1. Job count: "The 7 jobs" → "The 8 jobs"
2. Added `alerts` job to job table (missing — exists in jobs registry)
3. live-ticks.ts line count: 82 → 98
4. candles-1m.ts line count: 41 → 57
5. jobs/index.ts line count: 50 → 71

### docs/08-deployment.md (2 corrections)
1. H1 title: "09 — Deployment" → "08 — Deployment"
2. Removed AI_FUNDAMENTAL/TECHNICAL/SUMMARY/VISION_MODEL env var declarations (removed from code)

### docs/10-security.md (2 corrections)
1. AUTH_FIX_PLAN.md reference: added "(planned, not yet written)" note
2. BUG-03 reference: added "(plan not yet written)" note

### docs/12-roadmap.md (1 correction)
1. AUTH_FIX_PLAN.md reference: added "(Not yet written — planned.)" note

### docs/15-debugging-and-tracing.md (1 correction)
1. Renamed from `09-debugging-and-tracing.md` → `15-debugging-and-tracing.md` to resolve number collision with `09-testing.md`
2. H1: "09 — Debugging & Tracing" → "15 — Debugging & Tracing"

---

## Open Questions / Ambiguities Left Unchanged

1. **02-codebase.md categorized tool table** lists tool names like `getCandles`, `getSMA`, `getRSI`, `getSpread`, etc. that do not match the actual 32 tool files in `packages/ai/src/tools/`. The table appears to describe a previous generation of tools. Full rewrite deferred — may be intentional conceptual mapping, not a file listing.

2. **02-codebase.md packages/ai tool file tree** says `│   ├── tools/    # 32 AI tool implementations` — this is now accurate (was "30"). However, the file tree may omit some tool subdirectories introduced since the tree was written (e.g., `bot/`, `alerts/`, `multi-agent/`, `evaluations/`). Minor structural omission.

3. **.env.example contains `ALPHAVANTAGE_API_KEY`, `TRADING_ECONOMICS_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`** — all appear unused in the code paths checked. Not removed per audit policy (may be used by external infra scripts or reserved for future use). Recommend manual review.

4. **README LOC numbers** updated to reflect current source-only counts. Approximate nature acknowledged — values will drift again.

5. **No `contributing-guide.md` exists** — README previously linked to `./docs/11-contributing-guide.md`. The root `CONTRIBUTING.md` is present. If a dedicated doc-onboarding file is desired, it would need a new number (e.g., 16).

6. **No `AUTH_FIX_PLAN.md` exists** anywhere in the repository. Referenced from AGENTS.md and 10-security.md. All links note "not yet written."

7. **README architecture diagram border characters** are box-drawing Unicode (─ │ ┌ ┬ ┐). These display correctly in most terminals but may render as `?` or misalign in some plain-text viewers.

---

## Post-Audit Housekeeping

The following docs were deleted per maintainer request:

| File | Reason |
|------|--------|
| `docs/UX_UPGRADE_PLAN.md` | Agent planning artifact, not user-facing doc |
| `docs/USER_FLOW.md` | Agent planning artifact, not user-facing doc |
| `docs/12-roadmap.md` | Outdated roadmap, not user-facing doc |
| `docs/14-motion-conventions.md` | Outdated motion conventions reference |

Corresponding entries removed from README.md and AGENTS.md doc indexes.
