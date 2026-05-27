# Implementation Plan: Phase 3

## Overview

Convert the design into incremental code changes a coding agent can execute end-to-end. Ordering follows the dependency graph in `design.md`: DB migration first, then `@hamafx/shared` schemas, then library code in `packages/ai` and `packages/data`, then UI consumers in `apps/web`, then GitHub Actions workflow, finally docs. Each task references the requirement clauses it fulfils for traceability.

The hard rules from `00-project.md` and `14-ai-agent-handoff.md` apply: personal-mode (single user, single `APP_PASSWORD`, no `user_id`, no RLS), single Vercel deploy (no `apps/worker/`), schemas before code, no `any`, no `enum`, alias-only cross-package imports, supported symbols `XAUUSD | EURUSD | GBPUSD`. TypeScript throughout.

Tasks marked with `*` are optional (tests). Core implementation tasks are never optional.

## Tasks

- [x] 1. T1 — DB migration `0003_phase_3.sql`
  - Three additive tables — `cot_reports`, `shared_snapshots`, `push_subscriptions`. No behaviour change yet; downstream code switches over in subsequent tasks.
  - [x] 1.1 Add `cot_reports` schema
    - Create `packages/db/src/schema/cot.ts` per design §"Migration".
    - Re-export from `packages/db/src/schema/index.ts`.
    - _Requirements: 5.2_
    - Files: `packages/db/src/schema/cot.ts`, `packages/db/src/schema/index.ts`
  - [x] 1.2 Add `shared_snapshots` schema
    - Create `packages/db/src/schema/share.ts`.
    - _Requirements: 6.2_
    - Files: `packages/db/src/schema/share.ts`, `packages/db/src/schema/index.ts`
  - [x] 1.3 Add `push_subscriptions` schema
    - Create `packages/db/src/schema/push.ts`.
    - _Requirements: 7.1_
    - Files: `packages/db/src/schema/push.ts`, `packages/db/src/schema/index.ts`
  - [x] 1.4 Generate and commit migration `0003_phase_3.sql`
    - Run `pnpm --filter @hamafx/db migrate:gen`. If the auto-generated SQL diverges from the design's `CREATE TABLE` statements, hand-write `packages/db/drizzle/0003_phase_3.sql` matching the design.
    - Verify the migration applies cleanly against the production Supabase preview and is idempotent on re-run via the journal.
    - _Requirements: 5.2, 6.2, 7.1_
    - Files: `packages/db/drizzle/0003_phase_3.sql`, `packages/db/drizzle/meta/_journal.json`

- [x] 2. T2 — `@hamafx/shared` schemas (4 new tool output files + barrel exports)
  - Define every schema before any consumer imports it. Each schema goes in its own file following the existing per-tool convention; `tool-io.ts` declaration-merging makes `ToolOutput<'<name>'>` resolve to the right type.
  - [x] 2.1 `analyze-chart-image.ts`
    - Add `AnalyzeChartImageInputSchema`, `AnalyzedLevelSchema`, `AnalyzeChartImageOutputSchema` per design §"Schema additions".
    - Wire into `tool-io.ts` so `ToolOutput<'analyze_chart_image'>` resolves to the inferred output type.
    - Re-export from `packages/shared/src/index.ts`.
    - _Requirements: 2.7_
    - Files: `packages/shared/src/schemas/tool-outputs/analyze-chart-image.ts`, `packages/shared/src/ai/tool-io.ts`, `packages/shared/src/index.ts`
  - [x] 2.2 `get-correlation.ts`
    - Add `CorrelationCellSchema`, `GetCorrelationInputSchema`, `GetCorrelationOutputSchema`. Wire `tool-io.ts`. Re-export.
    - _Requirements: 3.7_
    - Files: `packages/shared/src/schemas/tool-outputs/get-correlation.ts`, `packages/shared/src/ai/tool-io.ts`, `packages/shared/src/index.ts`
  - [x] 2.3 `get-cot.ts`
    - Add `CoTSampleSchema`, `GetCoTInputSchema`, `GetCoTOutputSchema`. Wire `tool-io.ts`. Re-export.
    - _Requirements: 5.6_
    - Files: `packages/shared/src/schemas/tool-outputs/get-cot.ts`, `packages/shared/src/ai/tool-io.ts`, `packages/shared/src/index.ts`
  - [x] 2.4 `share-snapshot.ts`
    - Add `ShareSnapshotInputSchema`, `ShareSnapshotOutputSchema`. Wire `tool-io.ts`. Re-export.
    - _Requirements: 6.8_
    - Files: `packages/shared/src/schemas/tool-outputs/share-snapshot.ts`, `packages/shared/src/ai/tool-io.ts`, `packages/shared/src/index.ts`
  - [x] 2.5 Extend `TOOL_NAMES`
    - Add `'analyze_chart_image'`, `'get_correlation'`, `'get_cot'`, `'share_snapshot'` to `packages/shared/src/ai/tool-names.ts`.
    - _Requirements: 2.7, 3.7, 5.6, 6.8_
    - Files: `packages/shared/src/ai/tool-names.ts`
  - [ ]* 2.6 Fixture-parse tests for every new schema
    - Positive case + at least one negative case per schema in `packages/shared/test/schemas.test.ts` following the Phase 1/2 pattern.
    - _Requirements: 2.7, 3.7, 5.6, 6.8_
    - Files: `packages/shared/test/schemas.test.ts`

- [x] 3. T3 — `analyze_chart_image` tool + bespoke chat part
  - Implements Requirement 2 end-to-end.
  - [x] 3.1 Tool body
    - Implement `analyzeChartImageTool` per design §1. The tool reads the most recent user `file` part with a `mediaType` starting with `image/` from the agent's request context (passed in via `runChat`'s tool-execution scope), hashes the bytes for the `sourceImageRef`, and calls `generateText` with `experimental_output` configured against `AnalyzeChartImageOutputSchema`.
    - When no image is present, return the no-image fast-path output without calling the model.
    - Register in `packages/ai/src/tools/index.ts`.
    - _Requirements: 2.1, 2.2, 2.3, 2.6_
    - Files: `packages/ai/src/tools/analyze-chart-image.ts`, `packages/ai/src/tools/index.ts`
  - [x] 3.2 Bespoke chat part
    - Server component at `apps/web/src/components/chat/parts/analyze-chart-image.tsx` per design §1.
    - Levels list, observed text, deep link to `/chart/<symbol>?tf=<tf>&overlays=<comma-list>` when overlay is present.
    - Add to `parts/registry.tsx` and `partSchemas`.
    - _Requirements: 2.5_
    - Files: `apps/web/src/components/chat/parts/analyze-chart-image.tsx`, `apps/web/src/components/chat/parts/registry.tsx`
  - [ ]* 3.3 Unit test for `analyze_chart_image`
    - Mock the AI SDK structured-output call. Cases: no image → fast-path, valid image → schema parse passes, malformed model output → `observed: 'parse failed'` and null fields.
    - _Requirements: 2.1, 2.2, 2.3_
    - Files: `packages/ai/test/analyze-chart-image.test.ts`

- [x] 4. T4 — Vision input on chat composer + `/api/chat` plumbing
  - Implements Requirement 1.
  - [x] 4.1 Image-attach button + thumbnails in composer
    - Modify `apps/web/src/components/chat/composer.tsx` to render a 44×44 image-attach button alongside the mic, open the platform file picker filtered to `image/*`, and render thumbnails above the textarea with a remove control on each.
    - Reject files > 5 MB; reject non-image types. Cap at 4 images per turn.
    - _Requirements: 1.1, 1.2, 1.3, 1.8_
    - Files: `apps/web/src/components/chat/composer.tsx`
  - [x] 4.2 Forward image parts on submit
    - Modify the chat surface (`apps/web/src/components/chat/chat-surface.tsx` if separate, otherwise the composer) so that on submit the parts array contains one `text` part plus one `file` part per attached image (`{ type: 'file', mediaType, url }` where `url` is a base64 data URL).
    - _Requirements: 1.4_
    - Files: `apps/web/src/components/chat/chat-surface.tsx` (or wherever `useChat` is wired)
  - [x] 4.3 Confirm `/api/chat` accepts multimodal parts unchanged
    - Audit `apps/web/src/app/api/chat/route.ts`. The body schema already declares `parts: z.array(z.unknown()).default([])`; verify no validation tightening regressed this in Phase 2.
    - _Requirements: 1.5_
    - Files: `apps/web/src/app/api/chat/route.ts` (audit only)
  - [x] 4.4 Confirm `runChat` passes parts through to the model
    - Audit `packages/ai/src/agent.ts`'s `convertToModelMessages` step. The AI SDK already understands `file`/`image` parts; we need to make sure no Phase 2 message remapping stripped non-text parts.
    - _Requirements: 1.6_
    - Files: `packages/ai/src/agent.ts` (audit only)
  - [x] 4.5 Add `AI_VISION_MODEL` to env validation
    - Add `AI_VISION_MODEL: z.string().default('google-vertex/gemini-2.5-pro')` to `packages/shared/src/env.ts`. Document in `.env.example`.
    - _Requirements: 2.2_
    - Files: `packages/shared/src/env.ts`, `.env.example`

- [x] 5. T5 — `get_correlation` tool + bespoke chat part
  - Implements Requirement 3.
  - [x] 5.1 Pearson + DXY proxy helpers
    - Pure functions in `packages/ai/src/tools/get-correlation.ts`. Pearson per design §2; DXY proxy `100 / (EUR^0.5 * GBP^0.5)`; `change24h` via lookup of the bar 24 h prior.
    - _Requirements: 3.2, 3.4, 3.5_
    - Files: `packages/ai/src/tools/get-correlation.ts`
  - [x] 5.2 Tool body
    - Implement `getCorrelationTool`. Pull `windowBars + 1` candles per symbol via the existing `getCandles` adapter, compute returns, build matrix + DXY proxy, return.
    - Skip pairs where either symbol has fewer than `windowBars + 1` bars; note skipped pairs in `dxyProxy.formula`.
    - Register in `tools/index.ts`.
    - _Requirements: 3.1, 3.3_
    - Files: `packages/ai/src/tools/get-correlation.ts`, `packages/ai/src/tools/index.ts`
  - [x] 5.3 Bespoke chat part
    - Server component at `apps/web/src/components/chat/parts/get-correlation.tsx`. 3×3 correlation table with `text-bull`/`text-bear` cells; small DXY proxy strip with the value and 24h change.
    - Add to `parts/registry.tsx` and `partSchemas`.
    - _Requirements: 3.6_
    - Files: `apps/web/src/components/chat/parts/get-correlation.tsx`, `apps/web/src/components/chat/parts/registry.tsx`
  - [ ]* 5.4 Unit test for `get_correlation`
    - Deterministic returns fixture; assert Pearson math (e.g. perfectly correlated returns → r ≈ 1) and DXY proxy formula.
    - _Requirements: 3.2, 3.4, 3.5_
    - Files: `packages/ai/test/get-correlation.test.ts`

- [x] 6. T6 — TradingView Pro chart route
  - Implements Requirement 4.
  - [x] 6.1 Pro chart page + widget
    - Create `apps/web/src/app/(app)/chart/[symbol]/pro/page.tsx`. Use Next.js `next/script` with strategy `afterInteractive` to load `https://s3.tradingview.com/tv.js`, then construct the widget in a `'use client'` component reading the `?tf=<tf>` URL state.
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6_
    - Files: `apps/web/src/app/(app)/chart/[symbol]/pro/page.tsx`, `apps/web/src/app/(app)/chart/[symbol]/pro/_components/tradingview-widget.tsx`
  - [x] 6.2 "Pro" link from main chart route
    - Add a small "Pro" link in `chart-view.tsx` (or wherever the chart header lives) gated by `process.env.NEXT_PUBLIC_TRADINGVIEW_ENABLED === '1'`.
    - _Requirements: 4.2_
    - Files: `apps/web/src/app/(app)/chart/[symbol]/_components/chart-view.tsx`
  - [x] 6.3 Network-blocked fallback
    - On the Pro page, render a graceful error message + back link if `tv.js` failed to load (e.g. `window.TradingView` is undefined after a generous timeout).
    - _Requirements: 4.7_
    - Files: `apps/web/src/app/(app)/chart/[symbol]/pro/_components/tradingview-widget.tsx`
  - [x] 6.4 Add `NEXT_PUBLIC_TRADINGVIEW_ENABLED` env entry
    - Document in `.env.example`. No env-validation entry needed since `NEXT_PUBLIC_*` is read directly.
    - _Requirements: 4.2_
    - Files: `.env.example`

- [x] 7. T7 — CFTC ingestion + `get_cot` tool
  - Implements Requirement 5.
  - [x] 7.1 CFTC provider adapter
    - `packages/data/src/providers/cftc/rest.ts`: thin GET against the Socrata Disaggregated dataset endpoint with a `where` filter for the commodity name.
    - `packages/data/src/providers/cftc/map.ts`: symbol → commodity-name mapping (`XAUUSD` → "GOLD", `EURUSD` → "EURO FX", `GBPUSD` → "BRITISH POUND").
    - _Requirements: 5.1_
    - Files: `packages/data/src/providers/cftc/rest.ts`, `packages/data/src/providers/cftc/map.ts`, `packages/data/src/providers/cftc/index.ts`
  - [x] 7.2 Persistence
    - `packages/ai/src/cot/persistence.ts`: `upsertCoTReport`, `listCoTSamples({symbol, weeks})`, `parseCoTId(id)`. Idempotent upsert on `(id)` PK.
    - Re-export from `packages/ai/src/index.ts`.
    - _Requirements: 5.3_
    - Files: `packages/ai/src/cot/persistence.ts`, `packages/ai/src/index.ts`
  - [x] 7.3 Cron route
    - `apps/web/src/app/api/cron/cot/route.ts` — for each supported symbol, fetch the latest report row, upsert; tolerate per-symbol failures (log + continue).
    - Validate `Authorization: Bearer ${CRON_SECRET}` via `withCronAuth`.
    - _Requirements: 5.4_
    - Files: `apps/web/src/app/api/cron/cot/route.ts`
  - [x] 7.4 Tool body
    - Implement `getCoTTool` calling `listCoTSamples`. Empty table → `pipelinePending: true`. Templated summary string (no LLM second pass).
    - Register in `tools/index.ts`.
    - _Requirements: 5.6, 5.8_
    - Files: `packages/ai/src/tools/get-cot.ts`, `packages/ai/src/tools/index.ts`
  - [x] 7.5 Bespoke chat part
    - Server component at `apps/web/src/components/chat/parts/get-cot.tsx`. Compact bar/line of net positioning over the last N weeks; `.tabular-nums`; `text-bull`/`text-bear` colouring.
    - Add to `parts/registry.tsx` and `partSchemas`.
    - _Requirements: 5.7_
    - Files: `apps/web/src/components/chat/parts/get-cot.tsx`, `apps/web/src/components/chat/parts/registry.tsx`
  - [ ]* 7.6 Idempotent upsert test
    - Insert one fake CFTC row twice; assert exactly one DB row.
    - _Requirements: 5.3_
    - Files: `packages/ai/test/cot.test.ts`

- [x] 8. Checkpoint — Phase 3 tools complete
  - Run `pnpm typecheck` and `pnpm test` and confirm all green. Run a manual chat session against local dev hitting each new tool to confirm the bespoke parts render. Stop and ask the user if any tool's UX is rough before moving to share + push.

- [x] 9. T8 — Sharable snapshots
  - Implements Requirement 6.
  - [x] 9.1 Share-token sign + verify
    - Pure HMAC-SHA-256 helpers at `packages/ai/src/share/sign.ts`. Mirror the auth-cookie scheme (`packages/web/src/lib/auth.ts`) — base64url payload + signature.
    - _Requirements: 6.3_
    - Files: `packages/ai/src/share/sign.ts`
  - [x] 9.2 Share persistence
    - `packages/ai/src/share/persistence.ts`: `createSnapshot`, `getSnapshot(id)`, `getActiveSnapshot(id)` (filters by `expires_at > now()`).
    - _Requirements: 6.2, 6.5_
    - Files: `packages/ai/src/share/persistence.ts`, `packages/ai/src/index.ts`
  - [x] 9.3 Tool body
    - Implement `shareSnapshotTool`: persist → sign → return `{id, url, expiresAt}`. URL host pulls from `NEXT_PUBLIC_APP_URL`.
    - Register in `tools/index.ts`.
    - _Requirements: 6.1, 6.3_
    - Files: `packages/ai/src/tools/share-snapshot.ts`, `packages/ai/src/tools/index.ts`
  - [x] 9.4 Public read route at `/share/[id]`
    - `apps/web/src/app/share/[id]/page.tsx` — server component. Reads `?t=<token>`, verifies signature against `AUTH_COOKIE_SECRET`, looks up the row, renders title/body/overlay.
    - 410 on expired, 404 on missing, 401 on bad/missing token.
    - _Requirements: 6.4, 6.5_
    - Files: `apps/web/src/app/share/[id]/page.tsx`
  - [x] 9.5 Middleware bypass
    - Update `apps/web/src/middleware.ts` so `/share/*` skips the password gate. Other admin/api routes stay gated.
    - _Requirements: 6.6_
    - Files: `apps/web/src/middleware.ts`
  - [x] 9.6 Bespoke chat part
    - Server component at `apps/web/src/components/chat/parts/share-snapshot.tsx`. Title + copy-to-clipboard control for the URL, ≥ 44×44 tap target.
    - Add to `parts/registry.tsx` and `partSchemas`.
    - _Requirements: 6.7_
    - Files: `apps/web/src/components/chat/parts/share-snapshot.tsx`, `apps/web/src/components/chat/parts/registry.tsx`
  - [ ]* 9.7 Property test for share-token round-trip
    - Use `fast-check` with arbitrary `(uuid, expiresAt)` payloads. Assert verify(sign(p)) === p, and that any one-byte mutation fails verification.
    - _Requirements: 6.3_
    - Files: `packages/ai/test/share-sign.test.ts`

- [x] 10. T9 — Web Push delivery
  - Implements Requirement 7.
  - [x] 10.1 Push persistence
    - `packages/ai/src/push/persistence.ts`: `listPushSubscriptions`, `savePushSubscription`, `deletePushSubscription(id)`, `deletePushSubscriptionByEndpoint(endpoint)`.
    - Re-export from `packages/ai/src/index.ts`.
    - _Requirements: 7.1, 7.7_
    - Files: `packages/ai/src/push/persistence.ts`, `packages/ai/src/index.ts`
  - [x] 10.2 Web-push client
    - `packages/ai/src/push/send.ts`: `sendWebPush(sub, payload, env)` returning `{ ok, status }`. Implement RFC-8030 directly using Node `crypto` (ES256 JWT) + `crypto.subtle` (ECDH P-256 + AES-128-GCM).
    - _Requirements: 7.5, 7.6_
    - Files: `packages/ai/src/push/send.ts`
  - [x] 10.3 Wire `web-push` channel in delivery
    - Modify `packages/ai/src/alerts/delivery.ts` to add `deliverWebPush` per design §6. `markFired` only after every active subscription returned 2xx (or all returned 410, in which case the subscriptions are removed and the alert is still marked fired).
    - Extend `EvaluatorEnv` with `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
    - _Requirements: 7.5, 7.6, 7.7_
    - Files: `packages/ai/src/alerts/delivery.ts`, `packages/ai/src/alerts/evaluator.ts`
  - [x] 10.4 `/api/push/subscribe` + `/api/push/unsubscribe` routes
    - Both Node-runtime, password-gated by middleware. Subscribe persists the row; unsubscribe deletes by endpoint.
    - _Requirements: 7.3, 7.4_
    - Files: `apps/web/src/app/api/push/subscribe/route.ts`, `apps/web/src/app/api/push/unsubscribe/route.ts`
  - [x] 10.5 Settings UI button
    - `'use client'` `EnableWebPushButton` in `_components/`. Calls `Notification.requestPermission` → `pushManager.subscribe({ applicationServerKey: <NEXT_PUBLIC_VAPID_PUBLIC_KEY> })` → POST to `/api/push/subscribe`.
    - Mount under the Notifications section in `apps/web/src/app/(app)/settings/page.tsx`.
    - _Requirements: 7.2_
    - Files: `apps/web/src/app/(app)/settings/_components/enable-web-push-button.tsx`, `apps/web/src/app/(app)/settings/page.tsx`
  - [x] 10.6 Service worker push listener
    - Modify `apps/web/public/sw.js` to add `push` and `notificationclick` listeners per design §6.
    - _Requirements: 7.8_
    - Files: `apps/web/public/sw.js`
  - [x] 10.7 Env vars
    - Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to `packages/shared/src/env.ts` (all optional; missing → push channel returns "not configured"). Document in `.env.example`.
    - _Requirements: 7.9_
    - Files: `packages/shared/src/env.ts`, `.env.example`
  - [ ]* 10.8 Unit test for push delivery + 410 cleanup
    - Mock `fetch` and persistence: 200 → `markFired` once; 410 → subscription deleted; 500 → no `markFired`, no deletion.
    - _Requirements: 7.5, 7.6, 7.7_
    - Files: `packages/ai/test/push-delivery.test.ts`

- [x] 11. Checkpoint — Share + push live
  - Run `pnpm typecheck` and `pnpm test`. Smoke-test the share route in production with a real signed link. Verify push subscribe + delivery on at least one device. Stop and confirm UX before continuing to docs.

- [x] 12. T10 — GitHub Actions cron workflow (`cron-cot.yml`)
  - Implements Requirement 5.5.
  - [x] 12.1 Author the workflow
    - Create `.github/workflows/cron-cot.yml` at `0 22 * * 5` UTC. Use the existing template: `permissions: { contents: read }`, `concurrency.group: cron-cot`, `cancel-in-progress: false`, `workflow_dispatch:`, `curl -fsS -X GET -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" "${{ secrets.PRODUCTION_URL }}/api/cron/cot"`.
    - _Requirements: 5.5_
    - Files: `.github/workflows/cron-cot.yml`

- [x] 13. T11 — Documentation updates
  - Implements Requirement 8.
  - [x] 13.1 `docs/10-roadmap.md` Phase 3 status
    - Move every shipped Phase 3 item from `[ ]` to `[x]`.
    - Update the "Stretch / parking lot" header.
    - _Requirements: 8.1_
    - Files: `docs/10-roadmap.md`
  - [x] 13.2 `docs/09a-phase-0-deployed-state.md` Phase 3 subsection
    - List the new env vars (`AI_VISION_MODEL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_TRADINGVIEW_ENABLED`).
    - List the new cron workflow + cadence.
    - List the migration applied (`0003_phase_3.sql`).
    - _Requirements: 8.2_
    - Files: `docs/09a-phase-0-deployed-state.md`
  - [x] 13.3 `docs/04-features.md` flips
    - Mark `CH-10`, `CH-11`, `M-05`, `M-06`, and any vision items as shipped.
    - _Requirements: 8.3_
    - Files: `docs/04-features.md`
  - [x] 13.4 `.kiro/steering/10-ai-tools.md` tools list
    - Add the four new tools (`analyze_chart_image`, `get_correlation`, `get_cot`, `share_snapshot`) under "Tools".
    - _Requirements: 8.4_
    - Files: `.kiro/steering/10-ai-tools.md`

- [x] 14. T12 — Acceptance run
  - Re-run the eval harness against production after Phase 3 deploys. The 10 prompts SHALL still pass with the new tools available. Note any model-quality regressions as follow-up issues (out of scope here unless the harness itself crashes).
  - [x] 14.1 Execute against the deployed app
    - `pnpm --filter @hamafx/ai eval --base-url <production> --cookie <auth> --out docs/eval`.
    - Commit the new `docs/eval/<timestamp>.md`.
    - Optionally craft one additional prompt that attaches a chart screenshot to invoke `analyze_chart_image`.
    - _Requirements: -_
    - Files: `docs/eval/<UTC-timestamp>.md`

- [x] 15. Final checkpoint — Phase 3 done
  - All tests green; all docs updated; Phase 3 acceptance run committed; ask the user if any feature warrants a follow-up issue.

## Notes

- Tasks marked `*` are optional. Optional sub-tasks here are unit / property / integration tests; core implementation tasks are never optional.
- Property-based tests are limited to one universal property: the share-token round-trip.
- Each tool follows the same six-file change pattern (schema, tool, registry entry, part component, registry mapping, doc note).
- T8 and T11 are explicit checkpoints where the agent SHALL stop and confirm UX with the user before continuing.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 1, "tasks": ["1.4", "2.6"] },
    { "id": 2, "tasks": ["3.1", "5.1", "7.1", "7.2", "9.1", "9.2", "10.1", "10.2"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.1", "4.2", "4.3", "4.4", "4.5", "5.2", "5.3", "5.4", "6.1", "6.2", "6.3", "6.4", "7.3", "7.4", "7.5", "7.6", "9.3", "9.4", "9.5", "9.6", "9.7", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8"] },
    { "id": 4, "tasks": ["8"] },
    { "id": 5, "tasks": ["11"] },
    { "id": 6, "tasks": ["12.1"] },
    { "id": 7, "tasks": ["13.1", "13.2", "13.3", "13.4"] },
    { "id": 8, "tasks": ["14.1"] },
    { "id": 9, "tasks": ["15"] }
  ]
}
```
