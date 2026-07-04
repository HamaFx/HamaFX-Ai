# HamaFX-Ai — Production Readiness Audit Prompt Pack

## How to use this

- 12 prompts (00–11), one per domain. Each is fully self-contained — copy everything
  between one ` ``` ` fence and the next, paste it whole into a fresh AI coding agent
  session (Claude Code, Cursor, etc.) with read access to the repo and web search enabled.
- **Run each in a separate, new session.** Don't chain them in one conversation — each
  needs full attention on one domain, and mixing them dilutes the analysis and blows
  context budgets.
- Suggested order: **00 first** (it maps what's real vs. documented, which the others
  lean on). Then 01–08 in any order — they're mostly independent. Then **09** (open-core
  refactor), since it needs findings from 01–08. **10** (billing) can run anytime in
  parallel. **11** (legal) last, since it references 01, 09, and 10.
- Prompts 01–11 are **read-only**: no edits, no `git commit`, no destructive commands,
  no running migrations. If one of those agents starts "helpfully" fixing things
  mid-review, stop it — that's a different job. **Prompt 00 is the one exception** —
  it's scoped to documentation and config files only, low-risk enough to investigate
  and fix directly in one session instead of a separate review-then-implement handoff.
- Each prompt tells the agent to save its findings to `docs/review/NN-name-review.md`.
  Once all 12 are done, you'll have a stack of implementation-ready specs. Feed them to
  an implementation agent one file at a time, starting with Critical-severity items, and
  review every diff before merging. Re-run the matching audit prompt after a fix lands to
  confirm it's actually closed.
- These prompts surface technical and structural findings. They are not legal or
  financial advice — get an actual lawyer to review anything billing- or
  disclaimer-related before you charge money, especially for a trading-adjacent product.

---

## PROMPT 00 — Documentation & Reality Drift Audit (fix directly, same session)

Unlike every other prompt in this pack, this one is not read-only. Documentation drift
is low-risk to fix directly — it's markdown and config, not business logic — so this
agent investigates AND corrects what it finds in a single pass, instead of producing a
review file for a separate implementation agent.

```
You are working on the HamaFX-Ai repository (a personal AI trading copilot for
XAUUSD/EURUSD/GBPUSD, Next.js 15 + TypeScript pnpm monorepo, currently single-user,
being converted into a hybrid open-core + hosted SaaS product with 2Checkout/Verifone
billing). Your job is to find and directly fix documentation/config drift — places
where /docs, the root README, or .env.example no longer match the actual code. This is
NOT a read-only audit: you are authorized to edit and create files directly. You are
NOT authorized to change any application logic, business code, or runtime behavior —
scope every edit to markdown files (/docs/**, README.md, any *.md), .env.example, and
code comments. Do not run destructive git commands (no force-push, no branch deletion,
no history rewrite, no push to any remote). If git is available, leave your edits as
normal commits or uncommitted changes for the owner to review.

INVESTIGATE:
1. For each numbered doc the README links to (00 through 14 in the Documentation Map),
   confirm the file actually exists at that path. For any that are missing, renamed, or
   moved, fix the README's link to the correct path, or — if the doc was simply never
   written — create a short stub noting it's planned but not yet written. Do not invent
   detailed content for a doc that doesn't exist yet.
2. For every doc that does exist, extract concrete factual claims — tech choices, file
   paths, env var names, "Phase X shipped" statements, architecture decisions — and
   verify each against the current code. Correct anything stale or contradicted so the
   doc matches reality. If a claim is ambiguous or you can't confirm it either way from
   the code, do NOT guess — leave it unchanged and note it in the changelog instead.
3. Identify code or features that exist but appear nowhere in /docs. Add a brief,
   accurate mention to the most relevant existing doc — a short, correct addition is
   better than a long speculative one.
4. Check the root README's phase/roadmap claims against docs/10-roadmap.md and the
   actual code. Correct any roadmap item marked done that's actually partial or
   stubbed, and vice versa.
5. Diff .env.example against every environment variable actually referenced in code
   (grep all `process.env.*` usages). Add any missing variable to .env.example with a
   short comment on what it's for. For variables in .env.example that appear unused in
   the code you searched, do not delete them yourself — note them in the changelog
   instead, since removal could break something outside the paths you checked (e.g. an
   infra script).
6. Check .kiro/steering/ (or equivalent agent-instruction files) for guidance that
   contradicts what you now know to be true from the code, and correct it.

CONSTRAINTS:
- Every edit must be traceable to something you actually verified in the code — never
  fabricate file paths, env var names, or feature descriptions.
- When in doubt, leave the doc as-is and log it as an open question rather than editing
  on a guess.
- Keep edits minimal and factual. This is a correction pass, not a rewrite of the
  project's documentation style or tone.

OUTPUT: After making your direct fixes, produce one summary file:
docs/review/00-documentation-fixes-changelog.md

Structure it as a plain changelog for the human owner, not a handoff prompt for another
agent, since the work is already done:
1. Summary — one paragraph on what was checked and fixed.
2. Fixes applied — every file you changed, with a one-line description of what was
   wrong and what you changed it to.
3. Items flagged but NOT changed — anything ambiguous you deliberately left alone, and
   why, so the owner can resolve it manually.
4. Suggested follow-up — anything bigger than a doc fix that surfaced during this pass
   (e.g. "apps/worker has a heavy job with no corresponding doc section at all — worth a
   dedicated writeup, not just a one-line mention").
```

---

## PROMPT 01 — Authentication & Multi-Tenant Security Readiness

```
You are auditing the HamaFX-Ai repository (Next.js 15 + TypeScript pnpm monorepo).
Today it is single-user: one shared APP_PASSWORD env var gates access via middleware
with an HMAC-signed cookie. It is being converted to a hybrid product: an open-source
self-hostable core (keeps the simple password gate) plus a hosted multi-tenant SaaS
edition (needs real per-user auth, session management, and data isolation). This is a
READ-ONLY audit. Do not modify, refactor, run, or execute any code.

SCOPE: The auth middleware and everything it touches (cookie signing, session handling),
all API route handlers under apps/web, any RBAC/permission logic, secrets handling
(how API keys for BiQuote/Finnhub/FRED/Vertex AI/Supabase are stored and accessed),
and docs/12-security-and-config.md if it exists.

INVESTIGATE:
1. Exactly how the current password gate works end to end — cookie contents, signing
   key source, expiry, rotation, what happens on a leaked cookie or leaked APP_PASSWORD.
2. Every place in the codebase that assumes "there is exactly one user" — hardcoded
   IDs, absent user_id/tenant_id columns, singleton config objects, global caches keyed
   without a tenant dimension.
3. Secrets management: are provider API keys (BiQuote, Finnhub, Marketaux, FRED,
   Trading Economics, Vertex AI/AI Gateway, Supabase service role key) ever exposed to
   the client bundle, logged, or committed anywhere in history? Check .env.example
   against actual usage.
4. Session security: token expiry, refresh handling, logout behavior, CSRF exposure on
   any state-changing route.
5. What would break, silently or loudly, if two different real users hit this app
   concurrently today.

RESEARCH: Web search for current (2026) guidance on: Next.js 15 App Router
authentication patterns for multi-tenant SaaS; Supabase Auth vs Clerk vs NextAuth/Auth.js
for a Next.js + Supabase Postgres stack specifically (this app already uses Supabase, so
weigh that integration cost); Supabase Row Level Security patterns combined with Drizzle
ORM; secrets management best practices for Vercel + a separate GCE worker VM sharing the
same secrets. Cite what you find with sources.

OUTPUT: Produce exactly one file: docs/review/01-authentication-security-review.md

Structure it as an implementation-ready handoff prompt for a different AI coding agent,
not a report for a human:
1. Context — what auth looks like today and the target end state (open-core self-host
   keeps simple gate; hosted SaaS needs real per-user auth + isolation).
2. Findings — numbered, each with severity, exact file path(s)/line numbers, the
   problem, and why it matters for security or for the multi-tenant migration.
3. Root cause — for Critical/High findings, briefly explain the underlying cause.
4. Recommended fix — concrete and specific: name the library/pattern to use, how it
   plugs into the existing middleware and layered architecture (L1 UI / L2 application /
   L3 data access / L4 infra) without breaking the "layer may only import from below"
   rule described in docs/01-architecture.md.
5. Step-by-step implementation plan — ordered checklist, second-person imperative.
6. Acceptance criteria — concrete tests/checks to confirm the fix works and that
   self-host mode still functions with just APP_PASSWORD.
7. Open questions for the human owner — e.g. whether social login is wanted, whether
   self-host users should ever get an upgrade path to real auth.

Do not fabricate findings. If uncertain, say so as an open question.
```

---

## PROMPT 02 — Database Schema, Row-Level Security & Data Layer Scalability

```
You are auditing the HamaFX-Ai repository. It uses Supabase Postgres (currently free
tier) with pgvector, Drizzle ORM, and no Row Level Security today — it's a single-user
app being converted into a multi-tenant hosted SaaS (plus a self-hostable open-core
edition that stays single-tenant per install). This is a READ-ONLY audit. Do not modify,
refactor, run, or execute any code. Do not run any migration, seed, or destructive
database command.

SCOPE: All Drizzle schema files, the migrations folder, packages/db (or wherever the DB
package lives), the live_ticks and candles_1m writer logic, the nightly backup +
weekly-verify-restore jobs, and docs/06-data-sources.md if it exists.

INVESTIGATE:
1. Full schema inventory: every table, its columns, indexes, and foreign keys. Flag any
   table that has no obvious way to scope rows to a single user/tenant if this became
   multi-tenant tomorrow.
2. Index coverage: are the columns used in WHERE/JOIN/ORDER BY on hot paths (chat
   history load, live tick reads, search_knowledge hybrid search, journal queries)
   actually indexed? Check pgvector index type/params for the embeddings table.
3. Connection handling: is Drizzle configured against a pooled (pgBouncer/Supavisor)
   connection string or a direct one? What happens under concurrent load from both the
   Vercel serverless functions and the always-on GCE worker hitting the same database?
4. Supabase free-tier limits (connections, storage, egress) — how close is current usage,
   and what breaks first under multi-tenant growth?
5. Backup/restore: read infra/cron-vm/RECOVERY.md and the backup scripts. Confirm the
   nightly pg_dump + weekly verified-restore process is understood correctly, and assess
   whether it's tenant-aware or would need changes for per-tenant export/delete
   (relevant later for GDPR-style requests).
6. Migration history hygiene: are migrations linear and reproducible from scratch, or is
   there evidence of manual, undocumented schema drift?

RESEARCH: Web search for current (2026) guidance on: Supabase Row Level Security design
patterns for multi-tenant SaaS with Drizzle ORM; Postgres connection pooling with
Supabase Supavisor/pgBouncer under mixed serverless + long-running-worker workloads;
pgvector index tuning (HNSW vs IVFFlat) at growing row counts; Supabase paid tier
scaling thresholds. Cite sources.

OUTPUT: Produce exactly one file: docs/review/02-database-rls-scalability-review.md

Structure as an implementation-ready handoff prompt for another agent:
1. Context — current single-tenant schema, target multi-tenant + open-core split.
2. Findings — numbered, severity, exact file/table/column references, problem, impact.
3. Root cause for Critical/High items.
4. Recommended fix — concrete schema changes (exact column names/types to add, e.g.
   tenant_id/user_id + RLS policy shape), index additions, pooling config changes.
5. Step-by-step implementation plan, ordered, second-person imperative, including
   migration sequencing (additive/backward-compatible steps first).
6. Acceptance criteria — how to verify RLS actually blocks cross-tenant reads, how to
   verify indexes are used (EXPLAIN ANALYZE expectations), how to verify backups still
   restore cleanly after schema changes.
7. Open questions for the human owner — e.g. data retention policy, whether to shard
   later, budget for a paid Supabase tier.

Do not fabricate findings; mark anything uncertain as an open question.
```

---

## PROMPT 03 — Backend API Architecture & Route Handlers

```
You are auditing the HamaFX-Ai repository's Next.js 15 App Router backend — API route
handlers, middleware, cron endpoints, and the boundary between the Vercel deployment and
the always-on GCE worker. This is a READ-ONLY audit. Do not modify, refactor, run, or
execute any code.

SCOPE: All route handlers under apps/web/src/app/api/**, the middleware, the /api/cron/*
light pokers and how they authenticate against the CRON_SECRET, and docs/08-backend-and-api.md
if it exists.

INVESTIGATE:
1. Input validation: does every route handler validate its inputs with the zod schemas
   from packages/shared, or are any routes trusting raw request bodies/query params?
2. Error handling consistency: do routes return consistent error shapes/status codes, or
   is it ad hoc per route? Are internal errors (stack traces, provider error bodies)
   ever leaked to the client response?
3. Rate limiting: confirm the README's claim of "no per-user rate limiting" — is there
   ANY rate limiting anywhere (IP-based, global)? What's the actual exposure if this
   were opened to public signups tomorrow — could one user exhaust AI Gateway spend or
   provider API quota for everyone?
4. Idempotency: are the /api/cron/* routes safe to call twice in quick succession (e.g.
   if a systemd timer retries after a slow response)? Check for duplicate-write risk.
5. Vercel Hobby/Pro function timeout ceiling (60s referenced in docs/01-architecture.md)
   — are there any routes at risk of hitting this under realistic load, beyond the
   heavy jobs already moved to the worker?
6. Layering compliance: per docs/01-architecture.md's rule that a layer may only import
   from layers below it, are there any route handlers calling external providers
   directly instead of going through packages/data adapters?

RESEARCH: Web search for current (2026) best practices on: Next.js App Router route
handler security and validation patterns; rate limiting Next.js on Vercel with Upstash
Redis (sliding window vs token bucket) for a mixed free/paid-tier product; idempotency
key patterns for webhook/cron-triggered endpoints. Cite sources.

OUTPUT: Produce exactly one file: docs/review/03-api-architecture-review.md

Structure as an implementation-ready handoff prompt for another agent, using the same
7-part structure as previous prompts (Context, Findings with severity/file refs, Root
cause, Recommended fix, Step-by-step implementation plan, Acceptance criteria, Open
questions). Write the implementation plan directly to the next agent in imperative voice.
Do not fabricate findings.
```

---

## PROMPT 04 — AI Agent, Tools, Prompt Safety & Cost Control

```
You are auditing the HamaFX-Ai repository's AI agent layer — the 26 tools, per-domain
model routing, the plan-then-act "Thinking" flow, the verify_call geometry/liquidity
checker, the post-finish citation enforcer, and the memory/RAG system (search_knowledge
over news/journal/briefings with pgvector + Postgres FTS). This is a READ-ONLY audit.
Do not modify, refactor, run, or execute any code, and do not make any real calls to
paid AI providers.

SCOPE: packages/ai in full (agent definition, tool implementations, model router config,
verifier, citation enforcer, memory/RAG code), the chat_telemetry cost-tracking table
and how it's populated, and docs/07-ai-agent.md if it exists.

INVESTIGATE:
1. Prompt injection surface: which tools ingest untrusted external content (news
   articles, calendar data, chart images via analyze_chart_image) directly into the
   model's context? Could a malicious or compromised news source inject instructions
   that alter agent behavior, leak the system prompt, or trigger unintended tool calls
   (e.g. log_journal, set_alert, share_snapshot)?
2. Tool safety: for every mutation tool (set_alert, log_journal, share_snapshot), what
   validates the inputs before they hit the database? Could the model be induced to call
   these with attacker-controlled or malformed data?
3. Cost control: is there ANY per-request or per-day cap on tool calls, model calls, or
   token spend per session? What currently stops one chat session from looping tool
   calls indefinitely or making excessively long context calls to the most expensive
   model tier (gemini-2.5-pro)?
4. verify_call and the citation enforcer: read their actual logic. Do they meaningfully
   catch ungrounded price/event claims, or are they superficial checks? What's the
   failure mode if they miss something — does a wrong price ever reach the user framed
   as verified?
5. Model routing table: is it hardcoded, and does it make sense cost/quality-wise for
   each turn type given current (2026) model pricing and capability?
6. chat_telemetry: confirm it currently aggregates cost, not per-user. Note what's
   needed to make this per-tenant for future usage-based billing tiers.

RESEARCH: Web search for current (2026) guidance on: prompt injection mitigation for
AI agents that ingest external untrusted content (news/RAG); tool-use safety patterns
and confirmation/guardrail design for AI agents that can write to a database; Vercel AI
SDK v5 production patterns for cost metering and per-user rate limiting on LLM calls;
current pricing and recommended use cases for Gemini 2.5 Pro/Flash/Flash-Lite via
Vertex AI. Also compare this app's verification approach against how other AI financial/
trading assistants publicly describe handling hallucination risk. Cite sources.

OUTPUT: Produce exactly one file: docs/review/04-ai-agent-safety-cost-review.md

Structure as an implementation-ready handoff prompt for another agent, same 7-part
structure as previous prompts. Be specific about exact tool names and file paths in
every finding. Do not fabricate findings — if you can't verify a claim from the code,
say so as an open question rather than assuming.
```

---

## PROMPT 05 — Worker, Cron & Infrastructure Reliability

```
You are auditing the HamaFX-Ai repository's infrastructure layer: the always-on GCE
worker VM (hamafx-cron, e2-medium) that holds the persistent BiQuote SignalR connection,
runs six heavy jobs via systemd timers, and self-updates via git pull. This is a
READ-ONLY audit. Do not modify, refactor, run, or execute any code, and do not connect
to or issue commands against any live infrastructure.

SCOPE: apps/worker in full, infra/cron-vm (setup script, systemd unit files, crontab,
README, RECOVERY.md), and docs/09-deployment.md if it exists.

INVESTIGATE:
1. Single point of failure analysis: the entire live-price pipeline depends on one VM.
   What happens on VM crash, reboot, network partition, or a bad self-update (git pull
   pulling broken code)? Is there any automatic rollback if update.sh deploys code that
   fails to start?
2. SignalR consumer resilience: reconnect/backoff logic on disconnect — is it bounded
   (exponential backoff with a cap) or could it hammer BiQuote's servers on an outage?
   What happens to live_ticks freshness during a reconnect gap, and does the REST
   fallback path actually kick in correctly (per the sequence diagram in
   docs/01-architecture.md)?
3. Heavy job idempotency and failure handling: for each of the six heavy jobs
   (embedding-backfill, briefings, snapshots, cot, fred-actuals, weekly-review), what
   happens if a job crashes mid-run — does it leave partial/corrupt state, and does it
   retry safely or need manual intervention?
4. healthchecks.io coverage: read RECOVERY.md's UUID list against what's actually pinged
   in the worker code. Is every critical process actually monitored, or are there silent
   gaps?
5. Backup/DR: verify (by reading, not running) that the nightly pg_dump + GCS upload +
   weekly hamafx-verify-restore.timer flow is complete and that a stale
   last-success.txt genuinely pages via healthchecks.io.
6. Scale implications: if this moves to multi-tenant with more users generating more
   journal entries, alerts, and chat volume, which of the six heavy jobs would need to
   change from "single global pass" to "per-tenant aware," and where would the VM's
   e2-medium sizing likely become a bottleneck first?

RESEARCH: Web search for current (2026) best practices on: systemd service reliability
patterns (Restart=, WatchdogSec, failure isolation); SignalR/WebSocket client
reconnection strategies with exponential backoff and jitter; single-VM vs
managed-instance-group tradeoffs for a workload like this on GCP; safe self-updating
deployment patterns (blue/green or health-checked rollback) for a VM that git-pulls its
own code. Cite sources.

OUTPUT: Produce exactly one file: docs/review/05-worker-infra-reliability-review.md

Structure as an implementation-ready handoff prompt for another agent, same 7-part
structure as previous prompts. Do not fabricate findings; note anything you can't verify
from static code alone (e.g. actual VM uptime history) as an open question requiring the
owner to check their own monitoring dashboards.
```

---

## PROMPT 06 — Frontend, Mobile UX, Performance & Accessibility

```
You are auditing the HamaFX-Ai repository's frontend: Next.js 15 + React 19 + Tailwind
v4 + shadcn/ui, TradingView lightweight-charts, a mobile-first chat-driven interface.
This is a READ-ONLY audit. Do not modify, refactor, run, or execute any code.

SCOPE: apps/web/src/app (pages/routes), apps/web/src/components, styling/theming config,
the PWA manifest if one exists, and docs/05-ui-ux.md if it exists.

INVESTIGATE:
1. Loading and error states: for each major view (chat, charts, journal, alerts,
   settings/usage), does the UI have explicit loading and error states, or does
   anything fail silently or show a blank/broken screen on slow network or API failure?
2. Mobile-first claims vs. reality: spot-check the actual responsive behavior in the
   component code (breakpoints, touch targets, viewport handling) against the
   mobile-first claim in the README and docs/05-ui-ux.md.
3. Accessibility: keyboard navigation, ARIA labeling on interactive elements (especially
   chat input, tool-result cards, chart controls), color contrast in the theme, focus
   management on modal/dialog components from shadcn/ui.
4. Chart performance: how lightweight-charts is configured for the live 1.5s polling /
   sub-second worker-fed updates — any obvious re-render or memory-leak risks (e.g.
   recreating chart instances on every tick instead of updating series data).
5. PWA correctness: if a manifest/service worker exists, confirm it's actually
   registered and functional, not a stale scaffold.
6. Bundle/performance basics: obvious large unoptimized dependencies, missing
   next/image usage where raw <img> tags are used, unnecessary client-side rendering of
   content that could be server-rendered.

RESEARCH: Web search for current (2026) guidance on: Next.js 15 / React 19 Core Web
Vitals optimization; TradingView lightweight-charts performance patterns for
high-frequency updates; PWA best practices for a mobile-first data-dense app;
accessibility standards (WCAG 2.2) for financial/data-dashboard interfaces. Cite
sources.

OUTPUT: Produce exactly one file: docs/review/06-frontend-ux-performance-review.md

Structure as an implementation-ready handoff prompt for another agent, same 7-part
structure as previous prompts. Do not fabricate findings.
```

---

## PROMPT 07 — Observability, Logging, Monitoring & Alerting

```
You are auditing the HamaFX-Ai repository's observability stack: Sentry (server-only,
shared DSN across apps/web and apps/worker), healthchecks.io pings, journald logging on
the VM, Vercel logs, and the chat_telemetry cost table. This is a READ-ONLY audit. Do
not modify, refactor, run, or execute any code.

SCOPE: All Sentry configuration and capture calls in both apps/web and apps/worker, all
healthchecks.io ping calls, the chat_telemetry table and its read path
(/settings/usage), and any structured logging helpers shared across the monorepo.

INVESTIGATE:
1. Sentry coverage: is every route handler, tool call, and worker job actually wrapped
   so failures reach Sentry, or are there silent catch blocks that swallow errors?
2. Logging consistency: is the JSON log shape ({level, msg, ...meta}) actually applied
   uniformly, or does it vary by file/author (a common vibecoded-project symptom)?
3. Alerting gaps: for a solo founder about to have paying customers, what currently has
   NO alerting path — e.g. would a billing webhook failure, a spike in AI Gateway spend,
   or a silent auth bypass go unnoticed until a user complains?
4. Cost visibility: chat_telemetry currently aggregates globally per the earlier
   architecture review — confirm this and note exactly what schema/query changes would
   be needed for per-tenant cost dashboards and for alerting on anomalous per-user spend
   (relevant for abuse prevention once this is public).
5. Incident response readiness: is there anything resembling a runbook beyond
   infra/cron-vm/RECOVERY.md? What's missing for "customer-facing outage" scenarios
   specifically (status page, incident comms), which didn't matter in single-user mode.

RESEARCH: Web search for current (2026) best practices on: Sentry configuration for
Next.js 15 monorepos with a shared worker process; structured logging standards for
small SaaS teams; lightweight status-page and alerting tooling suitable for a solo
founder (e.g. options beyond healthchecks.io for paging on-call). Cite sources.

OUTPUT: Produce exactly one file: docs/review/07-observability-monitoring-review.md

Structure as an implementation-ready handoff prompt for another agent, same 7-part
structure as previous prompts. Do not fabricate findings.
```

---

## PROMPT 08 — Testing, CI/CD & Code Quality

```
You are auditing the HamaFX-Ai repository's testing and CI setup: Turborepo scripts for
typecheck/test/lint, a 15-case manual eval suite for the AI agent (pnpm --filter ai eval),
and GitHub Actions workflows. This is a READ-ONLY audit. Do not modify, refactor, run, or
execute any code (you may read test files and CI config, but do not run tests or
workflows).

SCOPE: .github/workflows/**, turbo.json, every package's test directory, the eval suite
under packages/ai, root-level loose files (test-endpoints.js, test-env2.js — assess
whether these look like abandoned debug scripts vs. real tests), tsconfig.base.json,
.prettierrc.json, and any ESLint config.

INVESTIGATE:
1. CI enforcement: do the GitHub Actions workflows actually gate merges on
   typecheck/test/lint passing, or do they only run informationally? Check branch
   protection assumptions (note if you can't verify branch protection rules from the
   repo alone — that requires GitHub settings access).
2. Test coverage gaps on critical paths: auth/middleware, risk computation
   (compute_risk, compute_position_health), the verify_call verifier, and — looking
   ahead — anywhere billing logic will land. Which of these currently have zero
   automated tests?
3. Eval suite scope: what do the 15 cases actually assert (tool-trace correctness,
   output quality, both)? How would you know if a code change silently broke agent
   behavior without manually running this?
4. Vibecoded-project code smells: search for dead code (unused exports, unreferenced
   files), duplicated logic across apps/web and apps/worker that should be in
   packages/shared, TODO/FIXME/HACK comments left unresolved, `any` types or
   `@ts-ignore`/`@ts-expect-error` suppressions, and console.log debug statements left
   in production code paths.
5. Root-level test-endpoints.js and test-env2.js specifically: determine what they do,
   whether they're still relevant, and whether they belong in a proper test directory,
   a scripts folder, or should be deleted.
6. Dependency hygiene: any obviously outdated or duplicate-purpose dependencies (check
   package.json across the monorepo), and whether `pnpm audit` findings would be
   worth a dedicated follow-up (note this as a recommendation, do not run it yourself
   if execution isn't available to you — if it is, running a read-only audit command is
   fine, but do not install/update anything).

RESEARCH: Web search for current (2026) best practices on: CI/CD gating strategies for
TypeScript monorepos with Turborepo; eval frameworks and regression-testing patterns for
LLM agent behavior (beyond ad hoc manual eval scripts); code quality/dead-code detection
tooling for large AI-assisted ("vibecoded") codebases specifically. Cite sources.

OUTPUT: Produce exactly one file: docs/review/08-testing-cicd-code-quality-review.md

Structure as an implementation-ready handoff prompt for another agent, same 7-part
structure as previous prompts. Do not fabricate findings.
```

---

## PROMPT 09 — Open-Core / Hybrid Architecture Refactor Readiness

```
You are auditing the HamaFX-Ai repository to plan its conversion from a single-tenant
personal app into a hybrid open-core product: an open-source, self-hostable core
(current single-password-gate model, unchanged for self-hosters) plus a hosted
multi-tenant SaaS edition with real auth, billing (2Checkout/Verifone), and per-tenant
data isolation — as ONE codebase with config/feature-flag boundaries, not two forks.
This is a READ-ONLY audit. Do not modify, refactor, run, or execute any code. Assume the
findings from prompts 01 (auth), 02 (database), 03 (API), and 04 (AI agent/cost) already
exist as separate review files under docs/review/ — read them if present, but do not
duplicate their detailed findings here; reference them by filename instead.

SCOPE: The entire repo, at an architectural level. Focus especially on
docs/01-architecture.md's layering rules, packages/shared, and every place a
single-tenant assumption is hardcoded (search broadly: APP_PASSWORD references,
absence of tenant/user scoping, singleton config objects, global in-memory caches).

INVESTIGATE:
1. Produce a complete inventory of every single-tenant assumption in the codebase, by
   file, with a one-line description of what would need to change for multi-tenancy.
2. Propose where the config/feature-flag boundary should live so self-host and hosted
   editions ship from the same release without diverging forks — e.g. a HAMAFX_EDITION
   or similar env var, and which specific modules/packages should branch on it.
3. Propose exactly which parts of the system should remain fully open-source (core
   agent, tools, indicators, chart UI) vs. which should be hosted-only / not required
   for self-host (billing integration, multi-tenant auth, usage dashboards, admin
   tooling) — and whether the hosted-only parts should live in the same public repo
   behind a flag, or in a separate private package/repo that imports the public core as
   a dependency.
4. Assess whether the current monorepo structure (pnpm workspaces + Turborepo,
   packages/shared, apps/web, apps/worker) is a good foundation for this split or needs
   restructuring first — be specific about any new packages to introduce (e.g.
   packages/billing, packages/tenancy).
5. Flag any licensing consideration: what open-source license (if any) is currently set,
   and whether it's appropriate for an open-core strategy where the hosted edition adds
   proprietary value (common choices worth researching: MIT, Apache 2.0, or a
   source-available license like BSL/FSL that converts to open after a time delay).

RESEARCH: Web search for current (2026) guidance and concrete examples of open-core
architecture from products with a similar shape to this one — specifically look at how
Supabase, PostHog, Plausible, and/or similar single-repo open-core SaaS products
structure the self-host/cloud boundary in code (feature flags vs. separate packages vs.
license-key gating), and what license each uses and why. Cite sources with specifics,
not just "some companies do open core."

OUTPUT: Produce exactly one file: docs/review/09-open-core-architecture-review.md

Structure as an implementation-ready handoff prompt for another agent:
1. Context — current single-tenant state and the target hybrid end state.
2. Findings — the single-tenant-assumption inventory, each with file path and what
   needs to change.
3. Proposed architecture — the config/flag boundary design, package restructuring,
   and open-vs-hosted-only split, justified against the researched examples.
4. Step-by-step implementation plan — ordered, second-person imperative, sequenced so
   the app keeps working for the existing self-host use case at every step (no
   big-bang rewrite).
5. Acceptance criteria — how to verify self-host mode still works unchanged, and how to
   verify hosted mode correctly isolates tenants once 01/02/03/04's fixes land.
6. Open questions for the human owner — especially the license choice and the
   private-package-vs-flag decision, since those are business calls, not technical ones.

Do not fabricate findings.
```

---

## PROMPT 10 — Billing & Payments Integration Readiness (2Checkout / Verifone)

```
You are auditing the HamaFX-Ai repository to plan a NEW subscription billing
integration using 2Checkout, now branded Verifone (developer docs at
verifone.cloud/docs/2checkout), chosen because Stripe does not support merchants based
in Iraq. No billing code exists in this repo today — this is a gap analysis and
integration plan, not a review of existing broken code. This is a READ-ONLY audit. Do
not modify, refactor, run, or execute any code, and do not create any real
merchant/sandbox account or make any live API calls.

SCOPE: The whole repo, to identify integration points: the database schema (for new
subscription/plan tables), the future multi-tenant auth layer (from prompt 01/09
findings, read if present), the chat_telemetry cost-tracking table (from prompt 04
findings, read if present, since usage-based tiers need to reconcile against it), and
any existing pricing/plan references in docs or code (likely none — confirm).

INVESTIGATE / RESEARCH (this prompt is research-heavy since nothing exists yet):
1. Research the current 2Checkout/Verifone developer documentation directly at
   verifone.cloud/docs/2checkout. Document: how subscription/recurring billing works
   (their "2Monetize"/"ConvertPlus" or current-equivalent product), how webhooks/IPN
   notifications work and what events they cover (payment success, failure, renewal,
   cancellation, refund, chargeback), sandbox/test-mode availability, and the exact
   auth mechanism for their API (API key, signature, etc.).
2. Explicitly verify current merchant eligibility for a business based in Iraq — search
   for 2Checkout/Verifone's supported merchant countries list and any Iraq-specific
   restrictions or requirements (e.g. entity type, banking requirements). This is a
   critical open question the plan depends on; do not assume the answer.
3. Research PCI DSS scope reduction options: using a hosted checkout page/redirect flow
   vs. any API that touches raw card data, and recommend the lower-scope option.
4. Design the subscription lifecycle states this app's database will need
   (trial/active/past_due/canceled/refunded etc.) and how they map to Verifone's
   webhook events.
5. Design how a webhook handler route should be structured for reliability: signature
   verification, idempotent processing (a webhook may be delivered more than once),
   and what happens if the handler fails (retry expectations from Verifone's side).
6. Design how usage-based components (if any pricing tier ties to AI token/cost usage
   from chat_telemetry) would reconcile with Verifone's billing cycle — this may require
   metered billing support or a manual reconciliation job; research whether Verifone
   supports usage-based/metered billing natively or whether this needs to be built as a
   periodic job that adjusts the next invoice.
7. Tax/VAT handling: research whether Verifone acts as merchant of record and handles
   tax/VAT compliance for digital goods automatically (this significantly reduces scope
   if true) versus requiring the business to handle it.
8. As a sanity check only, briefly research 1–2 alternative processors that also serve
   Iraq-based merchants (e.g. Paddle, Lemon Squeezy, or others found via research) and
   note, in one short section, whether anything about them would have been clearly
   better — without recommending a switch unless you find something that would block
   the 2Checkout/Verifone plan entirely (e.g. if Iraq turns out not to be supported).

OUTPUT: Produce exactly one file: docs/review/10-billing-verifone-integration-plan.md

Structure as an implementation-ready handoff prompt for another agent:
1. Context — why 2Checkout/Verifone was chosen, and what's true about it as of your
   research (with sources).
2. Findings — the eligibility/feasibility verification (Critical if anything blocks the
   plan), and a summary of the relevant API/webhook capabilities.
3. Proposed schema — exact new tables/columns needed (plans, subscriptions,
   invoices/webhook-event-log) with types.
4. Proposed integration design — webhook handler design, signature verification,
   idempotency approach, checkout flow (hosted redirect recommended unless research
   says otherwise), and how it plugs into the auth/tenancy layer from prompt 01/09.
5. Step-by-step implementation plan — ordered, second-person imperative, starting with
   sandbox integration before anything touches production.
6. Acceptance criteria — how to verify a test subscription can be created, renewed,
   canceled, and refunded end to end in sandbox, and that webhook replay doesn't
   double-process.
7. Open questions for the human owner — pricing tiers/amounts, trial length, refund
   policy, and the Iraq-eligibility question if your research couldn't fully confirm it
   (in which case, recommend contacting Verifone sales/support directly to confirm
   before building).

Cite every factual claim about Verifone's capabilities with a source. Do not fabricate
API details — if documentation is unclear or you couldn't access it, say so explicitly
rather than guessing at endpoint names or parameters.
```

---

## PROMPT 11 — Legal, Compliance & Regulatory Exposure

```
You are auditing the HamaFX-Ai repository and its product surface for legal/compliance
gaps ahead of converting it from a personal tool into a paid product for the public,
covering an AI-generated trading-analysis assistant. This is a READ-ONLY audit and is
explicitly NOT legal advice — your output should surface issues and open questions for
the owner to take to an actual lawyer, not resolve them. Do not modify, refactor, run,
or execute any code.

SCOPE: Any existing Terms of Service, Privacy Policy, or disclaimer text anywhere in the
repo (search thoroughly — check the UI/pages and /docs), the AI agent's actual output
patterns around trading calls (read docs/07-ai-agent.md and the verify_call/citation
enforcer logic if present, and prior review files 01/04/09/10 if present), and any
mention of user data handling, retention, or export.

INVESTIGATE:
1. Confirm whether any Terms of Service, Privacy Policy, or "not financial advice"
   disclaimer currently exists anywhere in the product (UI, footer, onboarding, or
   docs). If none exists, treat this as a Critical gap given the product gives
   AI-generated trading analysis and will soon charge money for it.
2. Assess how the AI agent's output currently frames its analysis — does anything in
   the tool/prompt design present outputs as guaranteed, advice-like, or without
   appropriate uncertainty framing? (Read-only assessment of prompt/tool text, not a
   live model test.)
3. Data handling: what personal/financial-adjacent data does the app store (journal
   entries, chat history, alerts) and is there currently any way for a user to export
   or delete their own data? Note this becomes relevant under GDPR/CCPA-style
   frameworks once there are real signups, especially any from the EU/UK/California.
4. Payment-related terms: once 2Checkout/Verifone billing lands (see prompt 10), what
   refund/cancellation policy text will be required, and does Verifone impose any
   required disclosure language on merchants (research this).
5. Jurisdictional considerations: the business is based in Iraq and the product will
   likely have international users. Note, as open questions rather than conclusions,
   what categories of consideration typically apply here (e.g. where the ToS should
   designate governing law/dispute resolution, whether any target markets have specific
   rules for AI-generated financial-analysis tools) — flag these as "consult a lawyer
   on X" items rather than attempting to resolve them yourself.

RESEARCH: Web search for: what disclaimer language other AI-assisted trading/market-
analysis tools publicly use (survey a few examples, describe patterns in your own
words, do not reproduce their text verbatim); general categories of regulation that
apply to tools providing automated market analysis/signals in major markets (US, EU,
UK) at a high level; standard GDPR-style data subject rights (access/export/delete)
that a SaaS handling EU users typically needs to support. Cite sources.

OUTPUT: Produce exactly one file: docs/review/11-legal-compliance-review.md

Structure as an implementation-ready handoff prompt for another agent for the
TECHNICAL parts (e.g. "add a data export endpoint", "add a disclaimer banner component
that renders X text once legal approves it"), while clearly separating out a distinct
section of open legal questions that explicitly require a lawyer and should NOT be
resolved by an implementing coding agent:
1. Context.
2. Findings — technical/product gaps only (missing disclaimer UI, missing data
   export/delete capability, missing ToS acceptance flow), each with severity and file
   references where relevant.
3. Recommended technical fix for each finding above (UI components, endpoints, consent-
   tracking schema) — implementable by a coding agent.
4. Step-by-step implementation plan for the technical items only.
5. Acceptance criteria for the technical items.
6. Legal questions requiring a lawyer — a clearly separated list, explicitly marked as
   NOT for a coding agent to resolve, covering disclaimer wording, jurisdiction/governing
   law, and any regulatory classification questions.

Do not draft actual legal disclaimer or ToS text yourself — flag where it's needed and
what it needs to cover, and leave the wording to the owner's lawyer.
```
