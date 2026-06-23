# Multi-User Migration — Phased Completion Plan

> **For Hermes:** Execute phase by phase. Complete each phase fully (tests + typecheck + build green), commit, then move to the next. Report after each phase.

**Total estimated work:** ~50-60 hours. Each phase = 1 focused session.

---

## Phase A — Foundation completion (Plan 02: DB Schema)

**Goal:** Schema migration works end-to-end on PGlite; remaining persistence files audited; NOT NULL enforcement in place.

**Tasks:**
1. Fix migration `0009_phase_a_multi_user.sql` — add `--> statement-breakpoint` markers between statements (currently PGlite silently creates zero tables)
2. Verify all migrations apply cleanly on a fresh PGlite DB
3. Run full test gate (tests + typecheck + build)
4. Audit remaining 5 persistence files (`alerts`, `briefings`, `journal`, `push`, `share`) — confirm `userId` is on every read/write
5. Add `userId NOT NULL` enforcement migration (separate migration 0010)

## Phase B — Core Multi-Tenancy (Plans 03 + 04)

**Goal:** API routes fully scoped, AI agent per-user context complete.

**Tasks:**
1. Add `withUserScope(table, userId)` helper to `@hamafx/db`
2. Audit + auth-gate the 4 market routes (`/api/market/{price,candles,indicators,structure}`)
3. Add Postgres-backed per-user rate-limit helper (using `provider_throttle` table)
4. Finish BYOK per-user model resolution in `packages/ai/src/model.ts` (use decrypted keys to pick provider)
5. Wire per-user committee model selection (`packages/ai/src/committee.ts`)
6. Personalize system prompt (inject `user.name` and `userSettings.defaultSymbol` + `timezone`)
7. Verify Telegram webhook `chat_id` → `user_id` reverse lookup end-to-end
8. Standardize user settings into `getToolContext()` so tools read them uniformly

## Phase C — User Experience (Plan 05)

**Goal:** Frontend chrome updated for multi-user identity; branding realigned.

**Tasks:**
1. NavDrawer: user avatar + name/email + logout button using `signOut()`
2. TopBar: user dropdown menu (Profile, Settings, Logout)
3. Remove all remaining "personal" copy
4. Global symbol picker component (TopBar slot, reads user's `user_symbols`)
5. PWA manifest + service worker update
6. Lighthouse pass

## Phase D — Infrastructure (Plan 06)

**Goal:** Worker correctly handles per-user tenants; instance-level monitoring.

**Tasks:**
1. Verify per-user Telegram bot multiplexing in `apps/worker/src/jobs/telegram.ts` + webhook
2. Per-user aggregation metrics for `healthchecks.io` (user count, active symbols)
3. Document `WORKER_MODE=docker` vs systemd tradeoffs

## Phase E — Quality & Polish (Plans 07 + 08 + 09)

**Goal:** Multi-user isolation proven by tests; OSS-ready repo; cleanup complete.

**Tasks:**
1. **Plan 09 cleanup first** (lowest risk, biggest cleanup):
   - Delete empty stubs: `packages/web3`, `packages/worker-core`, `contracts/`
   - Pino structured logging with `userId` context
   - PII redaction middleware
   - Statement timeouts
   - Audit log table
2. **Plan 08 OSS**:
   - Add Apache 2.0 LICENSE + CONTRIBUTING + CODE_OF_CONDUCT + SECURITY
   - GitHub templates (issue + PR) + CODEOWNERS
   - Dependabot + CodeQL workflows
   - Flip `private: true` → Apache-2.0 in all 8 package.json
   - Sanitize `.env.example` (remove `hamafx-78845` leak)
3. **Plan 07 testing**:
   - Multi-user isolation tests for budgets, memory/RAG, alerts, tool context
   - Cross-user route isolation tests (alerts, journal, push)
   - Playwright E2E setup + 3 critical flows (register, login, chat)

## Phase F — Langfuse (mostly done)

**Goal:** Tracing verified end-to-end.

**Tasks:**
1. Manual E2E test: boot docker compose, send a chat turn, verify it lands in Langfuse dashboard

## Phase G — Migration & Rollout (Plan 10)

**Goal:** Smooth upgrade path for existing self-hosters.

**Tasks:**
1. `AUTH_MODE=*** env flag (legacy | nextauth)
2. `MIGRATION_V2.md` upgrade guide
3. Default-user backfill script for existing prod DBs
4. changesets for versioning
5. `v1.x` maintenance branch + rollback docs

---