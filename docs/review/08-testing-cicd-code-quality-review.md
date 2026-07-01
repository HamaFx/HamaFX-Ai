# 08 — Testing, CI/CD & Code-Quality Review — Implementation Handoff

Date: 2026-07-01
Audit type: **READ-ONLY** (no code was run, modified, or executed; the repo was cloned
locally for static inspection and Git-history/GitHub-API queries only)
Repo: `HamaFx/HamaFX-Ai` @ `main` (`fcbc4b7`, 381 commits)
Reviewer output: this file only.

> **Note on scope drift discovered during the audit:** two files named in the review
> brief — root-level `test-endpoints.js` and `test-env2.js` — **no longer exist on `main`**.
> They (and `apps/web/test-env.ts`) were removed in June 2026. They are still assessed
> in Part 3 §5 from their Git history so the finding is grounded, not assumed.

---

## Part 1 — Mission & Role (for the implementing agent)

You are a senior platform/DevEx engineer picking up this audit. Your job is to turn the
findings below into landed changes that make CI a **real merge gate**, wire the AI eval
suite into automation as a **regression detector**, and close the **specific** test-coverage
holes on money/safety-critical paths — without regressing the parts of this codebase that
are already good (and several are). Work through Part 5 tasks in priority order. Respect the
guardrails in Part 6. Prove each change against the acceptance criteria in Part 7.

This is a genuinely well-organized monorepo (strict TS, ~130 test files, coverage thresholds
present, near-zero dead comments, `any` banned-with-documented-suppressions). Do **not**
"rewrite everything." The problems are concentrated and specific.

---

## Part 2 — Context & Current State (verified facts)

**Stack:** Turborepo + pnpm@9.15.4 workspace. Apps: `apps/web` (Next.js 15, `@hamafx/web`),
`apps/worker` (`@hamafx/worker`). Packages: `ai`, `config`, `data`, `db`, `indicators`,
`shared`, `test-utils`. Test runner: Vitest 2.x (workspace config at `vitest.workspace.ts`).
E2E: Playwright (`apps/web/tests/e2e`).

**Root scripts (`package.json`):** `build/dev/lint/typecheck/test` all delegate to `turbo run`.
`test` = `turbo run test -- --run`. Extra: `test:empty-guard` → `node scripts/check-test-files.mjs`.

**turbo.json tasks:** `build`, `dev`, `lint`, `typecheck`, `test`, `clean`. `lint/typecheck/test`
each `dependsOn: ["^build"]`. **There is no `eval` task and no explicit `build` gate task used by CI.**

**TypeScript (`tsconfig.base.json`):** strict, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Strong config.

**Lint (`packages/config/eslint/index.js`, extended by every workspace):**
`@typescript-eslint/no-explicit-any: error`, `no-console: warn` (allows `warn`/`error`/`info`),
`no-unused-vars: error`, `consistent-type-imports: error`, `no-restricted-imports` blocks deep
relative paths. Flat config ignores `**/*.config.{js,mjs,ts}`.

**Test inventory (test/spec files):** `packages/ai` ~49, `apps/web` 32 (+6 e2e),
`apps/worker` 18, `packages/data` 17, `packages/indicators` 12, `packages/db` 12,
`packages/shared` 7. **0 skipped/`.todo` tests** across the repo.

**CI systems present (TWO, in parallel):**
- **GitHub Actions** — `ci-fast.yml`, `ci-slow.yml`, `codeql.yml`, `release.yml`,
  `docker-publish.yml`, `pr-labeler.yml`, `stale.yml`.
- **GitLab CI** — `.gitlab-ci.yml` (mirrors lint/typecheck/test/e2e/eval + container scanning).

**What could NOT be fully verified from the repo alone:** exact branch-protection *rulesets*
(the newer GitHub "rules" API) require org/repo settings access. However, the classic
Branch Protection API **was** queryable and is reported in §1. Failing-job root-cause logs
are past GitHub's retention window (fetch returned HTTP 404 `BlobNotFound`), so the
root cause in §1 is inferred from job timing, not confirmed from logs.

---

## Part 3 — Findings (by investigation area)

### §1 — CI enforcement: does CI actually gate merges? **No — and CI is 100% red right now.**

**a) No branch protection → CI is advisory, not a gate.**
The Branch Protection API reports for **both** branches:
```
main:                        "protected": false,
                             required_status_checks.enforcement_level: "off", contexts: []
frontend-improvement-plans:  "protected": false, ...
```
Nothing requires `lint`/`typecheck`/`test` to pass before merge. The workflows produce
pass/fail **statuses**, but no rule consumes them. *(Caveat: if the repo later adopts GitHub
Rulesets, that is not visible through this API — confirm in repo Settings → Rules.)*

**b) Every recent workflow run is failing.** Of the last 100 runs (GitHub API):

| Workflow | Recent runs | Conclusion |
|---|---|---|
| `ci-fast.yml` (PRs) | 6 | **6 failure / 0 success** |
| `ci-slow.yml` (push main + nightly) | 29 | **29 failure** |
| `codeql.yml` | 31 | **31 failure** |
| `release.yml` (changesets) | 25 | **25 failure** |
| `pr-labeler.yml` | 6 | 6 failure |
| `stale.yml` | 3 | 3 failure |

**c) The failures look like an early bootstrap failure, not real lint/test failures.**
Latest `ci-fast` run (`28400202063`): jobs *"Lint & Typecheck"* and *"Unit Tests (Fast)"*
both `failure`, each completing in **~3 seconds** (`20:21:49` → `20:21:52/53`). A job that
actually ran `pnpm install` + `turbo run lint` cannot finish in 3s. The nightly `ci`
(`28488489326`) shows all four jobs (Lint & Typecheck, Unit & Integration, E2E, **AI Eval
Harness**) failing in 2–4s. The `ci-fast` jobs need **no secrets** (pure lint/typecheck/unit),
yet still fail instantly — so this is an environment/setup fault, not missing API keys.
**Hypothesis to confirm (logs were 404/expired):** pnpm is double-specified —
`package.json` has `"packageManager": "pnpm@9.15.4"` **and** every workflow sets
`pnpm/action-setup@v4` `with: version: 9`. That combination commonly aborts with
*"Multiple versions of pnpm specified"* within seconds. Re-run once and read the fresh log.

Net: the repo's headline testing/CI investment is currently **not protecting `main` at all** —
checks are unenforced *and* uniformly failing.

**d) Dead CI step.** `ci-slow.yml` → job `unit-tests` → step *"Report Coverage"* is guarded
by `if: github.event_name == 'pull_request'`, but `ci-slow` only triggers on `push`/`schedule`.
That step can never run. (The coverage action belongs in `ci-fast`, where it already exists.)

**e) No build gate.** Neither GitHub workflow runs `turbo run build`. `lint`/`typecheck`
depend on `^build` (so *dependencies* build), but a broken `next build` in `apps/web` would
not be caught in CI — only later by Vercel. `.gitlab-ci.yml` declares a `build` stage but
defines **no** build job in it.

**f) Duplicate CI systems.** GitHub Actions and `.gitlab-ci.yml` both define lint/typecheck/
test/e2e/eval. Two definitions will drift; pick one as source of truth.

### §2 — Test-coverage gaps on critical paths

Overall coverage is **better than expected** — this is not an untested codebase. Verified
strong areas: `compute_risk` (`packages/ai/test/compute-risk.test.ts` — real numeric
assertions on sizing math / RR), the verification *engine* (`enforceCitations`,
`collectFindings` in `verification*.test.ts`), auth helpers (`csrf.test.ts`, `session.test.ts`,
`auth-flow.test.ts` bcrypt+zod, `nextauth-wiring.test.ts`), and most worker jobs / indicators.

**Confirmed gaps (zero or registration-only automated tests):**

| Critical path | Source | Test status |
|---|---|---|
| **`compute_position_health`** | `packages/ai/src/tools/compute-position-health.ts` | **Behavioral: none.** Only referenced as a registration/"is defined" check in `tools.test.ts:83` (the 32-tool list) and `multi-agent/agents/agents.test.ts:44`. Its health-computation logic is untested. |
| **`verify_call` tool** | `packages/ai/src/tools/verify-call.ts` (+ `verification/regex.ts`) | **Wrapper untested.** Pure deterministic geometry + structure-scan `execute()` is only registration-checked (`tools.test.ts:86`). The separate `verification.ts` module is well tested, but the tool's own entry+stop+target / opposing-liquidity logic is not. |
| **Edge middleware** | `apps/web/src/middleware.ts` | **No direct unit test** (grep of `apps/web/test` + `tests/` for `middleware` = 0 hits). It mints/enforces the CSRF double-submit cookie, injects `x-user-id` from the JWT (tenant-isolation critical), and has a `AUTH_MODE=legacy` dev bypass that sets `x-user-id: __system__`. Covered only indirectly by e2e (`auth.spec.ts`, `isolation.spec.ts`). `csrf.test.ts` tests the *client* helper (`lib/csrf`), not the middleware enforcement. |
| **Billing** | *(none — no payment/Stripe/invoice code exists)* | **Greenfield.** All `billing/subscription` grep hits are Web-Push subscriptions, not payments. Zero code ⇒ zero tests. Establish the test contract *before* the code lands. |

**Coverage thresholds exist but are weak and unevenly enforced.** Per-package
`vitest.config.ts` `coverage.thresholds`:

| Package | statements / branches / functions / lines | Notes |
|---|---|---|
| `apps/web` | 10 / 10 / 10 / 10 | Toothless. Also excludes all `page.tsx`, `layout.tsx`, `loading.tsx` from coverage. |
| `packages/ai` | 20 / 40 / 35 / 20 | Low for the agent core. |
| `apps/worker` | 40 / 70 / 80 / 40 | Mixed. |
| `packages/indicators` | 70 / 70 / 70 / 70 | The good example. |

Thresholds only bite when `--coverage` is passed → `ci-slow`/nightly + GitLab coverage job.
The **fast PR job runs `turbo run test` with no `--coverage`**, so a PR can tank real coverage
and still pass the PR check (when CI is green at all).

### §3 — Eval suite scope: what the 15 cases actually assert, and why a silent regression would slip through

**Mechanism (`packages/ai/src/eval/runner.ts`):** the harness POSTs each prompt to a **live**
`/api/chat` endpoint (creates a thread first; needs a running server, DB, auth cookie, and real
model credits), consumes the streamed UI-message stream, and captures assistant text + a
tool-call trace. Assertions (`evaluateAssertions`):
- `expectedTools[]` — each must appear in the trace (`missing_tool`).
- `forbiddenTools[]` — none may appear (`forbidden_tool`).
- `mustContainSubstrings[]` — each (case-insensitive) must appear in the streamed text.

`ok` is driven only by transport/parse failures; assertion failures are tracked separately as
"dirty". Exit code: `process.exit(failed > 0 || dirty > 0 ? 1 : 0)` — so assertion failures
**do** fail the process. Good bones.

**Two structural problems make it a near-no-op in practice:**

1. **The 15 assertion cases are not the ones that run.** There are two data files:
   - `cases.json` — **15** cases *with* assertions (this is the "15-case suite" the brief means).
   - `prompts.json` — **10** prompts with **no assertions at all** (just `id` + `prompt`).

   `defaultPromptsPath()` returns `./prompts.json`. Loading `cases.json` requires the
   `--cases` CLI flag. But **`packages/ai/package.json`'s `eval` script is bare**
   (`"eval": "tsx src/eval/runner.ts"`), and CI runs `pnpm turbo run eval` — **neither passes
   `--cases`.** So `pnpm --filter ai eval` and the nightly job both run the **10 assertion-free
   prompts**, which can only fail on transport/parse errors (server down, HTTP 500). The
   assertion-bearing regression suite is **orphaned** unless a human types `... eval --cases`.

2. **`turbo run eval` has no task.** `turbo.json` defines no `eval` task, so the nightly
   `turbo run eval` almost certainly errors at the Turbo layer (Turbo 2.x errors on unknown
   tasks) — consistent with the nightly "AI Eval Harness" job failing in ~3s. Even if fixed,
   see problem 1.

**What the 15 cases assert (from `cases.json`):** purely **tool-routing + coarse keyword**
checks. `expectedTools` is a single tool for 13/15 cases (p11 expects `compute_risk` +
`verify_call`; p14 expects `compute_position_health`). **`forbiddenTools` is empty for all 15.**
`mustContainSubstrings` is empty or a single instrument symbol (`XAUUSD`/`EURUSD`/`GBPUSD`).
There is **no** assertion on tool *arguments*, tool *ordering*, numeric correctness, citation
quality, or answer correctness.

**So: how would you know a code change silently broke agent behavior? Today, you wouldn't.**
- A subtle regression (wrong tool arguments, degraded reasoning, wrong risk numbers, missing
  caveats) passes: the default suite has no assertions, and even the `--cases` suite only checks
  "was the right tool called and was the symbol mentioned."
- It requires a human to (a) stand up a live server with credentials, (b) remember `--cases`,
  (c) eyeball the Markdown report. It is an **online smoke test**, not a **deterministic
  regression gate**, and it is not wired into PR CI.

### §4 — "Vibecoded" code smells: mostly clean, a few concrete items

This is the pleasant surprise. The usual AI-generated-codebase smells are largely **absent**:
- **TODO/FIXME/HACK/XXX in source: 0.** (Consistent with commit `474f766` "cleanup pass".)
- **`console.log` in production paths: 1** real occurrence — `packages/ai/src/telegram/webhook.ts:162`
  (duplicate-update debug line). Two other hits are inside a JSDoc example block in
  `packages/shared/src/env.ts`. `no-console` is only `warn`, so these don't fail lint anyway.
- **`any`:** ~45 occurrences, but `no-explicit-any` is an **error**, and ~**39 are explicit,
  documented suppressions** (`// eslint-disable-next-line @typescript-eslint/no-explicit-any`,
  mostly around third-party typing like `lightweight-charts` and NextAuth `TS2742` portability
  in `apps/web/src/auth.ts`). The ban is real; the escape hatches are annotated.
- **`@ts-ignore`/`@ts-expect-error`: ~0** real directives (the one grep hit in `auth.ts` is a
  *comment* describing history; the actual line uses an annotated `as any`).
- **Skipped tests: 0.**

**Concrete dead code / smells worth fixing:**
- **`@ui/*` alias points at a non-existent package.** `packages/ui` does not exist, yet `@ui/*`
  is declared in `tsconfig.base.json` `paths`, in `.prettierrc.json` `importOrder`, and named in
  the ESLint `no-restricted-imports` guidance message. Misleading dead config (tells devs to use
  an import root that doesn't exist).
- **`TEST_VAR`** listed in `turbo.json` `globalEnv` is referenced nowhere else — leftover.
- **Duplication across web/worker: low.** Cross-cutting logic already lives in
  `packages/{shared,data,db,indicators}`. The only shared *filename* is `env.ts`, and the
  worker's is **intentionally** divergent (its header explicitly documents *not* reusing
  `parseServerEnv` because the worker runtime needs a smaller env surface). Not a duplication bug.
- **`check-test-files.mjs` (empty-test guard)** is a nice touch (fails a package that declares a
  `test` script but has no test files) — but it only checks file **presence**, not that files
  contain real assertions, so an empty `describe` or all-`.skip` file would pass it.

### §5 — Root-level `test-endpoints.js` / `test-env2.js`: abandoned debug scripts, already deleted

These are **not on `main`.** Git history:

| File | Added | Removed | What it was |
|---|---|---|---|
| `test-endpoints.js` | `a180c06` (2026-05-29) | `dc79716` (2026-06-19) | Raw `fetch()` calls to `localhost:3000/api/market/candles` and `/api/chat`, `console.log`-ing status/body. **No test framework, no assertions.** |
| `test-env2.js` | `1838a50` (2026-05-29) | `dc79716` (2026-06-19) | Loads `.env.local`, calls `parseServerEnv`, prints `SUCCESS`/`ERROR`. Manual env-validation scratch script. |
| `apps/web/test-env.ts` | `1838a50` (2026-05-29) | `474f766` (2026-06-20) | Same idea via `getServerEnv()`. Manual scratch script. |

**Assessment:** all three were classic abandoned debug scripts (imperative, assertion-free,
run by hand with `node`). **They were the right thing to delete**, and the maintainers already
did. Action for the implementing agent is only: (1) confirm no local/uncommitted copies remain
in working trees; (2) if any equivalent scratch scripts are still wanted, they belong under
`scripts/scratch/` — which `.gitignore` already excludes — **not** at repo root and **not** in a
`test/` directory (their `test-*` names falsely imply Vitest coverage).

### §6 — Dependency hygiene

Generally healthy: `drizzle-orm`, `zod`, `react`, `typescript`, `vitest`, `eslint` are aligned
across all workspaces; `pnpm-workspace.yaml` pins `@opentelemetry/api` to dedupe a documented
Sentry/drizzle conflict. **No duplicate-purpose libraries** (no axios+got, no moment+dayjs, etc.).

Items to review:
- **Beta on a security-critical path:** `next-auth@5.0.0-beta.31` (with `@auth/core@^0.34.3`).
  Beta churn risk on auth; track the v5 stable release and pin deliberately.
- **Possible major mismatches (verify against current registry):** `@next/bundle-analyzer@^16.2.9`
  while `next@^15.1.4`; `lucide-react@^1.16.0` (unusually high major for that package). Confirm
  these resolve to intended versions.
- **Minor drift:** `tsx` is `^4.19.2` (worker) / `^4.22.3` (ai) / `^4.22.4` (root, db). Align.
- **Exact pin oddity:** `@ai-sdk/google-vertex@3.0.139` (exact) vs caret ranges elsewhere —
  intentional? document why.
- **Vulnerabilities:** GitHub **Dependabot alerts = 0** (queried live). CodeQL workflow exists
  (but is currently failing — see §1). A dedicated **`pnpm audit --prod`** pass is recommended as
  a follow-up; it was **not run** in this audit (read-only, no install performed). It does not
  install anything and is safe to run in a throwaway CI step.

---

## Part 4 — 2026 Best-Practice Benchmarks (with sources)

### A. CI/CD gating for TypeScript + Turborepo monorepos
- **Gate on `--affected`, not "run everything."** Turborepo's own CI guidance recommends
  `turbo run <task> --affected` (and the newer `turbo query affected ... --exit-code`, which
  deprecates `turbo-ignore`) to run only tasks for changed packages, with structured JSON
  reasons for what changed. Crucially it **requires real Git history — avoid shallow clones**
  (`fetch-depth: 0` in `actions/checkout`), or every package is treated as changed.
  — Turborepo docs, *Constructing CI*: https://turborepo.dev/docs/crafting-your-repository/constructing-ci
  — Vercel Academy, *Filtering & Git-Based Filtering*: https://vercel.com/academy/production-monorepos/filtering-git-based
  — Turbo PR deprecating `turbo-ignore` for `turbo query affected`: https://github.com/vercel/turborepo/pull/12382
- **Make checks required.** Pair CI with GitHub **branch protection / rulesets** listing the
  status checks as *required*, so a red or missing check blocks merge. Pattern references for
  monorepo GH Actions gating: https://www.ugurkaval.com/blog/scaling-monorepo-cicd-github-actions

### B. LLM-agent eval & regression testing (beyond ad-hoc manual scripts)
- **Layer your evals:** fast deterministic regression checks in CI + deeper offline scored evals
  for sign-off + tracing for debugging.
  — 3-layer agent eval pipeline (LangSmith + Braintrust + DeepEval), 2026:
    https://www.bestaiweb.ai/how-to-build-an-agent-evaluation-pipeline-with-langsmith-braintrust-and-deepeval-in-2026/
  — Framework benchmark (DeepEval vs RAGAS vs Promptfoo vs Braintrust vs LangSmith), 2026:
    https://aiml.qa/llm-evaluation-framework-benchmark-2026/
  — LLM regression-testing guide for product teams, 2026: https://qaskills.sh/blog/llm-regression-testing-guide-2026
  — Braintrust vs Promptfoo vs DeepEval stack, 2026: https://aicraftguide.com/article/braintrust-vs-promptfoo-vs-deepeval-llm-eval-stack-2026
- **Recommended shape for this repo:** run **Promptfoo** (or a Vitest-based eval) in CI for fast,
  deterministic regression feedback with **recorded/mocked** model+tool responses (assert tool
  *args*, ordering, and numeric outputs — not just tool name + symbol substring); keep the
  live `/api/chat` harness for **Braintrust-style** scored offline runs (LLM/human judge,
  baseline tracking) on a schedule; use **LangSmith**-style tracing to localize failures.

### C. Dead-code / quality detection for large AI-assisted TS codebases
- **Knip is the current standard; `ts-prune` is deprecated/unmaintained.** Knip analyzes the
  whole module graph to find unused **files, exports, types, and dependencies** across
  monorepos/workspaces, with framework plugins (Next.js, Vitest, GitHub Actions, ESLint…),
  a `--fix`, and CI integration.
  — Knip: https://knip.dev/  ·  Unused exports: https://knip.dev/typescript/unused-exports
  — "Use knip to detect dead code" (ts-prune is obsolete): https://effectivetypescript.com/2023/07/29/knip/
- **Complement with `dependency-cruiser`** for structural/orphan/boundary rules (e.g. `no-orphans`,
  enforcing package boundaries) as a CI safety net.
  — https://github.com/stevekinney/stevekinney.net/blob/main/courses/self-testing-ai-agents/dead-code-detection.md

---

## Part 5 — Implementation Tasks (prioritized)

### P0 — Make CI trustworthy again (nothing else matters until this is done)
1. **Fix the instant CI failure.** Re-run any workflow, read the fresh job log, and fix the
   bootstrap error. Prime suspect: remove the pnpm double-spec — either drop `version: 9` from
   `pnpm/action-setup@v4` (let it read `packageManager`) **or** drop `packageManager` — in
   `ci-fast.yml`, `ci-slow.yml`, `release.yml`, and `.gitlab-ci.yml`. Confirm all workflows go green.
2. **Turn CI into a gate.** Enable branch protection (or a ruleset) on `main` requiring the
   `Lint & Typecheck` and `Unit Tests (Fast)` checks (and `CodeQL` once green) to pass, plus
   linear history / no direct pushes.
3. **Pick ONE CI system.** Keep GitHub Actions (repo is on GitHub) and delete `.gitlab-ci.yml`,
   or explicitly document GitLab as authoritative and delete the GH workflows. Do not maintain both.

### P1 — Make the eval suite an actual regression detector
4. **Wire the 15 assertion cases into automation.** Point the default at `cases.json` (or change
   the `eval` script to `tsx src/eval/runner.ts --cases`), and add an `eval` task to `turbo.json`
   so `turbo run eval` resolves. Decide clearly what runs in CI vs. what needs live credentials.
5. **Add a deterministic, offline eval that runs on PRs.** Record/mock model+tool fixtures (MSW is
   already a dependency) so the agent's tool-selection and tool-**arguments** are asserted without
   live API keys. Strengthen assertions: tool args, ordering, numeric outputs for `compute_risk`/
   `compute_position_health`, and non-empty `forbiddenTools` for cases where a tool must NOT fire.
   Keep the live `/api/chat` harness as a scheduled scored run.
6. **Enforce coverage on the PR path.** Run `test -- --coverage` in `ci-fast` (or add a
   coverage-diff gate). Move the misplaced "Report Coverage" step out of `ci-slow` (§1d).

### P1 — Close the specific coverage gaps (§2)
7. Add **behavioral** unit tests for `compute_position_health` (mirror `compute-risk.test.ts`:
   numeric health/PnL/exposure assertions).
8. Add unit tests for the **`verify_call` tool** `execute()` (geometry validation + opposing-
   liquidity detection inside entry→target), not just the `verification.ts` engine.
9. Add a **middleware** unit/integration test: CSRF mint+enforce on state-changing `/api/*`,
   `x-user-id` injection from JWT, and that the `AUTH_MODE=legacy` bypass is impossible when
   `NODE_ENV=production`.
10. **Billing (greenfield):** before code lands, write the test contract — auth/tenant scoping,
    idempotency, webhook signature verification, proration/dunning edge cases — so billing ships
    test-first.

### P2 — Housekeeping
11. Remove dead `@ui/*` config (or create `packages/ui` if intended) from `tsconfig.base.json`,
    `.prettierrc.json`, and the ESLint message; drop `TEST_VAR` from `turbo.json` `globalEnv`.
12. Adopt **Knip** (+ optional `dependency-cruiser`) as a `lint`-adjacent CI check for unused
    files/exports/deps.
13. Set `actions/checkout` `fetch-depth: 0` so a future `turbo --affected` gate detects changes.
14. Add a **build gate** (`turbo run build`) to CI, or document that Vercel is the only build check.
15. Dependency review (§6): align `tsx`; decide on `next-auth` beta pin; verify
    `@next/bundle-analyzer`/`lucide-react` majors; add a scheduled `pnpm audit --prod` step.
16. Strengthen `check-test-files.mjs` to also flag files with 0 `it/test` calls or all-`.skip`.
17. Confirm no local `test-endpoints.js`/`test-env2.js` copies remain; route any wanted scratch
    scripts to `scripts/scratch/` (already gitignored).

---

## Part 6 — Constraints & Guardrails
- **Do not weaken existing strictness** to make CI green (no disabling `strict`, no relaxing
  `no-explicit-any`, no blanket `eslint-disable`, no lowering coverage thresholds — only raise).
- **Fix root causes, not symptoms.** The CI failure is a bootstrap error; do not paper over it
  with `continue-on-error` or by deleting the failing job.
- **Eval keys:** never hardcode model/API credentials in workflows; use repo/environment secrets,
  and keep credentialed eval on `schedule`/manual, not on untrusted PRs.
- **Preserve the good parts:** the intentional web/worker `env.ts` split, the empty-test guard,
  and the documented `any` suppressions are features, not bugs.
- Land changes in small, reviewable PRs (one concern each) so the newly-required checks stay green.

## Part 7 — Acceptance Criteria & Verification
1. **CI green + gated:** latest `ci-fast` and `ci-slow` runs conclude `success`; PRs cannot merge
   with a failing/absent required check (verify by opening a PR that breaks a test and confirming
   the merge button is blocked).
2. **Single CI system:** only one of GitHub Actions / GitLab CI remains, or the authoritative one
   is documented.
3. **Eval is a gate:** `turbo run eval` resolves; the run exercises the **15 assertion cases**;
   a deliberately wrong tool selection / wrong `compute_risk` number makes the eval exit non-zero
   in CI without a human running it manually.
4. **Coverage gaps closed:** `compute_position_health`, `verify_call` tool, and `middleware.ts`
   each have behavioral tests; coverage runs on the PR path.
5. **Housekeeping verified:** `@ui/*` + `TEST_VAR` removed (or `packages/ui` created); Knip runs
   clean (or with justified ignores) in CI; `pnpm audit --prod` step exists.
6. **No regressions:** `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass locally and in CI with
   strictness unchanged.

---

## Appendix

**A. Evidence pointers (file:line / API):**
`turbo.json` (no `eval` task; `TEST_VAR`), `tsconfig.base.json` (`@ui/*`),
`.prettierrc.json` (`@ui`), `packages/config/eslint/index.js` (`no-explicit-any: error`,
`no-console: warn`, `@ui/` message), `.github/workflows/ci-fast.yml`, `.github/workflows/ci-slow.yml`
(dead PR-only coverage step; nightly `turbo run eval`), `.gitlab-ci.yml` (duplicate pipeline),
`packages/ai/src/eval/runner.ts` (`defaultPromptsPath()` → `prompts.json`; `--cases` flag ~line 659;
`evaluateAssertions` ~line 372; `process.exit(failed>0||dirty>0?1:0)`),
`packages/ai/src/eval/cases.json` (15 cases), `packages/ai/src/eval/prompts.json` (10, no asserts),
`packages/ai/test/compute-risk.test.ts`, `packages/ai/test/tools.test.ts:83,86` (registration list),
`packages/ai/src/tools/compute-position-health.ts`, `packages/ai/src/tools/verify-call.ts`,
`apps/web/src/middleware.ts`, `apps/web/src/auth.ts:43` (annotated `as any`),
`packages/ai/src/telegram/webhook.ts:162` (`console.log`), `scripts/check-test-files.mjs`.
GitHub API: Branch Protection (main `protected:false`), Workflow Runs (100% failure sample),
Workflow Jobs (2–4s failures), Dependabot alerts (0), Job logs (404 — retention expired).

**B. Open questions for a human:**
1. Are GitHub **Rulesets** in use (not visible via Branch Protection API)? Confirm in Settings → Rules.
2. Is GitLab CI actually used, or vestigial? Determines delete-vs-keep in Task 3.
3. Is the live `/api/chat` eval meant to run in CI (needs a running app + model credits + auth
   cookie), or only locally? Determines the split in Tasks 4–5.
4. Intended targets for `@next/bundle-analyzer@^16` / `lucide-react@^1.16.0` — correct as pinned?

**C. Sources:** see Part 4 (Turborepo CI docs, Vercel Academy, Turbo PRs; aiml.qa 2026 benchmark,
bestaiweb.ai 3-layer pipeline, qaskills.sh, aicraftguide; knip.dev, effectivetypescript.com,
dependency-cruiser dead-code guide).
