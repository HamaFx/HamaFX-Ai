# Kestrel Improvement Plan — Observability, Training Loop, and Agent Refactor

> Status: **Plan (design-first)** — no code has been written yet.
> Audience: operator (non-developer) + implementing agent.
> Decisions locked in this session:
> - **Scope:** (1) Export metrics + SLOs, (2) Close the training loop, (3) Refactor `agent.ts`.
>   (Live-eval gating is explicitly out of scope for now.)
> - **Metrics backend:** Grafana Cloud (managed, free tier).
> - **Training depth:** design doc first — no fine-tuning, no new model credentials.
> - **Dataset location:** Backblaze B2 (private object store; uploaded via the existing
>   `rclone` pattern in `infra/cron-vm/scripts/` — same account as the deferred backups).
> - **Export trigger:** scheduled cron **plus** admin manual trigger.
> - **Negative feedback:** thumbs-down flags the record `needs_review` (never auto-`fail`).

---

## Plain-language summary (for the operator)

1. **Metrics + SLOs.** Your app already *counts* the right numbers internally (chat turns, tool calls, failures, cost, latency), but those counters are never sent anywhere and vanish on restart. We will send them to **Grafana Cloud** (a hosted service, free tier) and set up **alerts** so you get told when something breaks — e.g. "chat success dropped below 99%" or "the worker stopped seeing live prices." This is the one new outside account required.

2. **Training loop.** Your app already collects two valuable things: (a) thumbs-up/down feedback from users on each AI answer, and (b) automated "acceptance test" results for the AI. Today those two live in separate places and never meet. We will design a pipeline that merges them into a single, privacy-safe "training dataset" file that can later be used to improve or evaluate the AI. **This is design-only for now** — no AI is actually retrained.

3. **Refactor `agent.ts`.** The main AI "brain" file has grown to ~700 lines doing many jobs at once. We will split it into smaller, clearly-named files. This changes nothing the user sees; it just makes future changes safer and faster.

---

## Workstream A — Export metrics + SLOs (Grafana Cloud)

### Current state (verified in code)

- `packages/shared/src/metrics.ts` defines a dependency-free, in-process `MetricsRegistry`
  with typed counter/histogram names (`chat_turn_total`, `tool_call_total`,
  `provider_fallback_total`, `run_failed_total`, `ttft_ms`, `turn_cost_usd`, …) and a
  JSON-serializable `snapshot()`.
- **Gap:** the registry is referenced only by its own test (`shared/test/metrics.test.ts`).
  No production call site (`agent.ts`, `multi-agent/orchestrator.ts`, tools, worker) emits
  metrics. The numbers exist as ad-hoc log fields and DB telemetry rows, not as metrics.
- OpenTelemetry is already installed and initialized (`packages/ai/src/instrumentation.ts`,
  `NodeSDK` + `LangfuseSpanProcessor`). Adding a metrics export path is incremental, not a
  new framework.

### Target state

- A **metrics exporter** that pushes `MetricsRegistry` observations to Grafana Cloud over
  OTLP HTTP (push-based — works for both Vercel serverless and the GCE worker; no collector
  to self-host).
- **Call sites wired** at the same places that already emit telemetry:
  - `agent.ts` — `chat_request_total`, `chat_turn_total`, `ttft_ms`, `total_latency_ms`,
    `turn_cost_usd`, `run_failed_total`, `provider_fallback_total`.
  - `multi-agent/orchestrator.ts` — `agent_failed_total`, per-specialist latency/cost,
    `run_failed_total`.
  - tools (`with-telemetry.ts`) — `tool_call_total`, `tool_fail_total`.
  - `cost.ts` — `budget_reserved_total`, `budget_release_failed_total`.
  - worker (`apps/worker`) — tick freshness, flush failures, dropped ticks.
- **SLOs + alerts** defined in Grafana Cloud on top of those metrics.

### Proposed SLOs (defaults — operator-adjustable)

| SLO | Metric basis | Target | Why |
|-----|--------------|--------|-----|
| Chat turn success rate | `chat_turn_total` vs `run_failed_total` | ≥ 99% over 24h | Core user promise |
| Single-agent p95 latency | `total_latency_ms` | < 30s | Vercel route budget is 55s |
| Worker tick freshness | last_tick age | < 60s (already healthchecked) | Live-price integrity |
| Budget release failure rate | `budget_release_failed_total` / `budget_reserved_total` | ≈ 0 | Stranded spend = user-facing bug |
| AI daily cost per active user | `turn_cost_usd` | alert on anomaly (x3 baseline) | Cost surprise |

### Implementation steps

1. ~~Add `@opentelemetry/exporter-metrics-otlp-http`~~ → **Done differently:** the exporter is
   `packages/shared/src/metrics-export.ts` and is **dependency-free** — a single `fetch` POST
   of OTLP/JSON. No new package, matches the registry's vendor-neutral design, and works in
   both Vercel serverless and the worker.
2. **Done** — `metrics-export.ts` reads `GRAFANA_CLOUD_OTLP_ENDPOINT` +
   `GRAFANA_CLOUD_API_KEY` lazily, converts `metrics.snapshot()` to OTLP JSON, and is
   disabled silently when env vars are absent (fail-closed, same contract as `initLangfuse`).
   Exposed as `@kestrel/shared/metrics-export` (server-only subpath, not re-exported from the
   client barrel).
3. **Done** — `metrics.increment(...)` / `metrics.observe(...)` wired into tools, agent, and
   multi-agent call sites. `flushMetrics()` is called at stream end in `chat/stream-callbacks.ts`
   (serverless path).
4. **Done** — worker `metrics-flush` job (every minute): records `worker_flush_total` +
   `worker_tick_freshness_ms` (age of the newest `live_ticks` row) and pushes via
   `flushMetrics()`. Transport failures increment `metrics_flush_failed_total` so the flush
   SLI can surface outages.
5. Grafana Cloud: stack created, token provisioned, exporter verified end-to-end
   (2026-08-17). Next: alert rules + SLOs + dashboards via `gcx`.

### Working configuration (verified 2026-08-17)

**Known platform issue:** this stack's OTLP gateway rejects the `metrics:write` token with
`401 legacy auth cannot be upgraded because the host is not found` — a Grafana-side
provisioning bug for newly created stacks (community thread, Grafana staff: "open a support
ticket"). **Workaround:** push over the Prometheus **remote-write** door (`/api/prom/push`)
instead, using the same token with **Basic auth** (username = metrics instance ID). This is
implemented as a second transport in `metrics-export.ts` and was verified live: a test metric
was pushed and queried back via `gcx`.

### Env vars required (from operator)

- `GRAFANA_CLOUD_RW_ENDPOINT` — the stack's remote-write URL, e.g.
  `https://prometheus-prod-65-prod-eu-west-2.grafana.net/api/prom/push` (from the stack's
  **Prometheus** tile → "Remote write endpoint").
- `GRAFANA_CLOUD_METRICS_INSTANCE_ID` — the Hosted-Metrics instance ID (Basic auth username;
  shown next to the push endpoint in the Prometheus tile).
- `GRAFANA_CLOUD_API_KEY` — the `glc_…` Cloud API key with `metrics:write` scope
  (stack-realm access policy; `Authorization: Basic base64(instanceId:key)`).
- *(Optional, for stacks where OTLP works)* `GRAFANA_CLOUD_OTLP_ENDPOINT` — OTLP HTTP base
  endpoint (ends in `/otlp`); the exporter posts to both transports when both are set.

### Secure setup checklist (operator, plain steps)

**Grafana Cloud**
1. grafana.com → free account → create a stack.
2. Create a **stack-realm** access policy with `metrics:write` (inside the stack:
   **Administration → Cloud access policies → Create access policy → metrics:write →
   Add token**) and copy the `glc_…` token.
3. Find the **remote-write endpoint + instance ID** in the stack's Prometheus tile (or via
   `gcx datasources list` — the `grafanacloud-prom` URL host, and the instance ID in the
   `-cardinality-management` datasource URL `/usage/v1/metrics/<id>`).
4. Set the three vars in **Vercel** (project → Settings → Environment Variables) and on the
   **worker VM** in `/opt/kestrel/.env`:
   ```
   GRAFANA_CLOUD_RW_ENDPOINT=https://prometheus-prod-…-….grafana.net/api/prom/push
   GRAFANA_CLOUD_METRICS_INSTANCE_ID=<instance id>
   GRAFANA_CLOUD_API_KEY=<glc_… token>
   ```

**Backblaze B2 (dataset + backups)**
1. backblaze.com → free account → create a **private** bucket (e.g. `kestrel-data`).
2. Create an **Application Key scoped to that bucket only** — never the Master key.
3. On the worker VM, add to `/opt/kestrel/.env` (same names the backup scripts already read):
   ```
   BACKUP_PROVIDER=b2
   B2_BUCKET=kestrel-data
   B2_KEY_ID=<scoped key id>
   B2_APPLICATION_KEY=<scoped key>
   ```
4. Install `rclone` on the VM (`sudo apt-get install -y rclone`). Credentials stay in-memory
   via `RCLONE_CONFIG_KESTREL_*` — they are never written to disk.

> The Gravity Index install guidance uses `GRAFANA_CLOUD_URL` / `GRAFANA_CLOUD_API_KEY` and a
> Prometheus remote-write path via a collector. For this project's serverless + VM split, the
> **OTLP HTTP push** variant is simpler (no collector); the concrete endpoint format is set
> from the stack's "OTLP" config in the Grafana Cloud UI.

### Risks / notes

- **Do not** add the exporter to the request proxy — the proxy stays DB-free and lightweight.
- Metrics must remain **redacted** (no userId/threadId in labels; use hashed ids, matching the
  existing `privacyId` approach in `telemetry.ts`).
- Free tier limits: keep metric cardinality low (no per-user labels; use per-user *aggregates*
  only).

---

## Workstream B — Close the training loop (DESIGN ONLY)

### Current state (verified in code)

- **Eval side:** `packages/ai/src/eval/runner.ts` produces `PromptResult[]` (text, tool calls,
  agent progress, timings, assertion failures, citation score). `eval/training-export.ts`
  converts them into a vendor-neutral JSONL dataset + sidecar manifest with:
  - hashes (prompt/answer SHA-256), tool names, terminal status, transport ok, assertion kinds,
    TTFT/latency/cost;
  - governance guards: refuses raw text unless `approvedBy` is set, refuses records missing an
    explicit `pass|fail|needs_review` label when `requireApprovedAnnotations`, and scans for
    PII/credentials.
- **Feedback side:** `ai_message_feedback` table (migration `0078_ai_message_feedback.sql`)
  stores per-message user rating (`positive|negative`) + note + `traceId`, with an admin
  **reviewer workflow** (`unreviewed → in_review → reviewed|rejected`, `reviewerLabel`
  `pass|fail|needs_review`, `issueCodes`). Query layer in `db/src/queries/ai-feedback.ts`.
- **Signal side:** `decision_signal*` tables track call outcomes for win/loss analysis.
- **Gap:** these three worlds never meet. `buildTrainingRecords` takes a **hand-authored**
  `annotations` map keyed by eval case id; real user feedback and reviewer labels are not
  merged in, and nothing automates the export.

### Proposed design (for review before any code)

**Goal:** a repeatable, privacy-safe pipeline that turns *reviewer-approved* feedback + eval
runs into a governed dataset, without ever shipping raw prompts/answers by default.

1. **Annotation resolver** (new, in `packages/ai/src/eval/` or `db/src/queries/`):
   - Input: a set of case/message identifiers.
   - Resolves each identifier to an `EvaluationAnnotation` by consulting, in order:
     1. explicit reviewer label + issue codes from `ai_message_feedback` (authoritative);
     2. user rating as a *hint* only (positive → candidate `pass`, negative → candidate
        `needs_review`), never auto-promoted to `pass` without a reviewer;
     3. eval assertion outcome as the fallback (pass when ok && no assertions).
2. **Dataset assembly job** (worker, cron-scheduled — fits the existing scheduler):
   - Pulls the latest eval JSON report(s) and/or a feedback review batch.
   - Runs `buildTrainingRecords(..., { requireApprovedAnnotations: true })`.
   - Writes JSONL + `.manifest.json` to a versioned path (e.g. `datasets/<version>/`), with
     `splitByCaseId` for deterministic train/validation/test splits.
   - (Optional, already referenced in recent commits) publish the same records as a **Langfuse
     dataset** for model eval; keep the local JSONL as the vendor-neutral source of truth.
3. **Governance invariants (unchanged, enforced by existing code):**
   - No assistant text unless `approvedBy` + `includeAssistantText` both set.
   - Every exported record must have an explicit approved label.
   - PII/credential scan blocks export on a match.
4. **Out of scope (explicitly):** fine-tuning / SFT / DPO, reward models, checkpoint registry,
   automatic retraining. The dataset is the deliverable; consumption is a future workstream.

### Implementation status (2026-08-17)

- **Done** — annotation resolver + dataset assembly (`eval/annotation-resolver.ts`,
  `eval/assemble-dataset.ts`), reviewer feedback query
  (`db/queries/training-dataset.ts`, PGlite-tested), eval runner now records
  `assistantMessageId` so cases link back to real feedback rows.
- **Done** — worker `dataset-export` job (daily 03:30): folds the latest eval JSON reports +
  reviewer-approved feedback → resolves annotations → filters to `pass|fail` → writes
  `DATASETS_DIR/<version>/dataset.jsonl` + manifest → registers the content-addressed
  version in `eval_datasets` (createdBy = first admin user) → uploads to B2 via rclone when
  configured (fail-open). Env: `DATASETS_DIR`, `EVAL_REPORTS_DIR` (defaults under
  `/opt/kestrel/datasets`).
- **Done** — admin manual export: `POST /api/admin/eval-datasets/export` + **Export now**
  button on the /admin Evaluation Datasets card (feedback-only assembly, same governance).
- **Known gotcha (fixed):** a feedback-only result whose id *is* the assistant message id
  resolves its reviewer label by identity — without that, `needs_review` rows would wrongly
  fall back to the eval outcome (`pass`). Covered by a regression test.

### Operator decisions (locked)

1. **Dataset lives in Backblaze B2** (private object store), uploaded with the existing
   `rclone` pattern from `infra/cron-vm/scripts/backup-storage.sh`. B2 is the same account
   the deferred backups use, so dataset storage + backups share one place.
2. **Export is scheduled + manual** — a cron-scheduled job, plus an admin button.
3. **Negative user feedback flags for human review** (`needs_review`) — it is never
   auto-promoted to `fail` or `pass`. Only a reviewer's explicit label can mark a record
   `pass`/`fail`.

---

## Workstream C — Refactor `agent.ts`

### Current state (verified in code)

`packages/ai/src/agent.ts` is ~700 lines. `runChatInner` already delegates to extracted
helpers (`chat/retry-loop` via `chat-retry-loop.ts`, `budget-reservation.ts`,
`chat/resolve-model.ts`, `chat/helpers.ts`, `chat/auto-title.ts`), but the stream `onFinish` /
`onError` closures and prompt/tool assembly still live inline, making the file hard to reason
about and test in isolation.

### Proposed split (behavior-preserving, no user-visible change)

| New module (under `chat/`) | Extracted responsibility |
|----------------------------|--------------------------|
| `chat/system-prompt.ts` | Base system prompt + compaction extra + custom instructions + context-warning/truncation |
| `chat/tools.ts` | `domainToolFilter` + plan-tier gating + non-essential trimming + Vertex `googleSearch` wiring |
| `chat/on-finish.ts` | Citation enforcement → append assistant → rate-limit note → flush tool telemetry → `recordTelemetry` → budget reconcile → `persistDiagnosticContext` → `flushLangfuse` |
| `chat/on-error.ts` | Stream failure handling: terminal-state guard, release reservation, telemetry, persist trace, flush |
| `chat/stream-args.ts` (optional) | Build the `streamText` options object |

`runChatInner` becomes a thin orchestrator: setup → reserve → persist → load → route → resolve
→ plan → assemble → stream (with extracted callbacks) → reconcile.

### Safety constraints

- `onFinish`/`onError` close over a lot of per-turn state; extract them with an explicit
  `context` parameter object rather than relying on nested closures.
- Keep the `streamTerminal` state machine and the single-reconcile/single-release guarantee
  exactly as-is (it protects against double spend on stream failure).
- Existing tests are the regression net: `chat-retry-loop.test.ts`, `model-resolution.test.ts`,
  `planner.test.ts`, `chat-helpers.test.ts`, `cost.test.ts`, `budget-reservation.test.ts`,
  `verification.test.ts`. All must stay green; run
  `pnpm --filter @kestrel/ai test -- --run` after each extraction.
- Do **not** change `runChat`'s public signature or the `RunChatArgs` type.

### Sequence

Refactor in small, test-after-each-step commits, in dependency order:
`system-prompt` → `tools` → `stream-args` → `on-error` → `on-finish` → thin out `runChatInner`.

---

## Phased sequencing (suggested order of implementation)

1. **Phase 0 — credentials & setup (blocking):** operator creates the Grafana Cloud stack and
   supplies `GRAFANA_CLOUD_OTLP_ENDPOINT` + `GRAFANA_CLOUD_API_KEY`.
2. **Phase 1 — Workstream A (metrics wiring + exporter).** Smallest risk, high value, no
   behavior change to the AI. Includes tests for the exporter.
3. **Phase 2 — Workstream C (refactor `agent.ts`).** Pure refactor, test-gated.
4. **Phase 3 — Workstream B (training loop design review, then implementation).** Begin with
   the three open questions above; implement the annotation resolver + export job after the
   operator answers them.

## Risks & guardrails (global)

- Never add DB or exporter work to the request proxy (`apps/web/src/proxy.ts`).
- Metrics labels must be pseudonymous (hash userId/threadId) to match the existing Langfuse
  privacy posture.
- Every exporter/init function must fail-closed (log + continue) when credentials are absent,
  matching `initLangfuse`.
- Migrations (if any) follow the AGENTS.md rules: idempotent, new file, direct connection.
