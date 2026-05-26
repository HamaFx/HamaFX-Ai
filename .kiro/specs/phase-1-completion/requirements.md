# Requirements Document

## Introduction

This spec closes out the remaining checklist items in **Phase 1** of HamaFX-Ai (per `docs/10-roadmap.md` and `docs/09a-phase-0-deployed-state.md`). Phase 0, 1a, 1b, 1c, 1d, and 1e have shipped; what remains are seven concrete deliverables that move the product from "feature-complete" to "real-world acceptance":

1. Auto-titled chat threads (Phase 1b leftover).
2. Per-tool bespoke chat parts replacing the generic `ToolCard` for the 8 already-wired tools.
3. A runnable harness for the 10 acceptance prompts from `docs/00-overview.md`.
4. Mobile Lighthouse measurement (perf ≥ 90, a11y ≥ 95) with regression fixes.
5. PWA install + offline shell (service worker, iOS install assets).
6. A chosen-and-implemented cron triggering strategy with documented cadences.
7. End-to-end Resend integration verification with a "send test email" admin action.

The work is constrained by the project's hard rules: personal-mode (single user, single `APP_PASSWORD`, no `user_id`, no RLS), single Vercel deploy (no `apps/worker/`), schemas in `packages/shared/src/schemas` first, no `any`, no `enum`, no deep cross-package imports, and supported symbols limited to `XAUUSD | EURUSD | GBPUSD`.

Item 8 from the source request ("you start using it daily") is a tracking concern, not code, and is explicitly out of scope.

## Glossary

- **System**: The HamaFX-Ai application as deployed on Vercel.
- **Title_Generator**: Server-side helper that calls `AI_TITLE_MODEL` via AI Gateway to produce a short title for a new chat thread on its first turn.
- **Chat_Thread**: A row in `chat_threads` representing one persisted conversation.
- **Chat_Part_Renderer**: A React component under `apps/web/src/components/chat/parts/<name>.tsx` that renders one specific tool's tool-call result in the chat stream.
- **Tool_Card_Generic**: The current single fallback renderer used today for every tool result; remains as the unknown-tool fallback after this spec.
- **Tool_Part_Registry**: A typed map of tool name → `Chat_Part_Renderer` that the chat stream uses to dispatch tool results to bespoke renderers.
- **Eval_Harness**: A local, non-CI script (`pnpm --filter ai eval` or equivalent) that POSTs each of the 10 acceptance prompts to `/api/chat`, records streamed output and tool calls, and writes a markdown report.
- **Eval_Prompts_File**: `packages/ai/src/eval/prompts.json` — the source of truth for the 10 acceptance prompts.
- **Eval_Report**: Markdown file produced by `Eval_Harness`, written to `docs/eval/<timestamp>.md`.
- **Lighthouse_Runner**: Script that runs Google Lighthouse against the production-built app on a fixed list of routes with the mobile preset.
- **Lighthouse_Targets**: The route set `/chat`, `/chart/XAUUSD`, `/news`, `/calendar`, `/alerts`, `/journal`, `/settings`, `/settings/usage`.
- **App_Shell**: The minimal HTML, CSS, JS, and icons required to render the navigation chrome offline with a clear "no network" state.
- **Service_Worker**: The PWA service worker registered at `/sw.js` (or framework-equivalent path) that caches the `App_Shell` and serves it when the network is unavailable.
- **PWA_Manifest**: The web app manifest produced by `apps/web/src/app/manifest.ts`.
- **Cron_Endpoint**: One of `/api/cron/news`, `/api/cron/calendar`, `/api/cron/embedding-backfill`, `/api/cron/alerts`.
- **Cron_Scheduler**: The chosen mechanism (Vercel Pro `crons` block, external scheduler such as cron-job.org or GitHub Actions, or documented manual) that fires `Cron_Endpoint` calls on a cadence.
- **Cron_Cadences**: news every 5 minutes, embedding-backfill every 30 minutes, calendar every 15 minutes, alerts every 1 to 2 minutes.
- **Resend**: The transactional email provider already wired into the alert delivery path.
- **Email_Tester**: A new admin endpoint and a Settings UI control that triggers a single test email via `Resend` using the configured `ALERT_FROM_EMAIL` and `ALERT_TO_EMAIL`.
- **Password_Cookie_Gate**: The existing HMAC-signed cookie middleware that authenticates the single user against `APP_PASSWORD`.
- **AI_Gateway**: The Vercel AI Gateway already wired via `AI_GATEWAY_API_KEY`.
- **Daily_Budget_Guardrail**: The existing per-day token-spend cap that can short-circuit AI calls.
- **Tool_Call**: A single invocation of one of the 8 wired AI tools (`get_price`, `get_candles`, `get_indicators`, `get_market_structure`, `get_news`, `get_calendar`, `set_alert`, `log_journal`).
- **Density_Tokens**: The mobile-first spacing, type-scale, and tap-target tokens defined in `docs/05-ui-ux.md` and enforced by `.kiro/steering/30-ui.md`.

## Requirements

### Requirement 1: Auto-titled chat threads

**User Story:** As the single user, I want new chat threads to receive a short LLM-authored title after my first turn, so that I can find past conversations in the sidebar without titling them by hand.

#### Acceptance Criteria

1. WHEN a `Chat_Thread` is created and the first user turn completes, THE Title_Generator SHALL request a title from `AI_TITLE_MODEL` via `AI_Gateway` using only the first user message and the first assistant response as input.
2. WHEN the Title_Generator returns a non-empty string, THE System SHALL persist the trimmed string truncated to 60 characters into `chat_threads.title` for that `Chat_Thread`.
3. WHEN `chat_threads.title` is set by the Title_Generator from a successful LLM response, THE System SHALL display that title in the chat thread list and sidebar in place of the previous placeholder.
4. IF the Title_Generator request fails, THEN THE System SHALL persist a deterministic fallback title derived from the first user message, truncated to 60 characters with a trailing ellipsis when truncated, and SHALL render the existing untitled placeholder in the sidebar instead of the fallback title.
5. IF the `Daily_Budget_Guardrail` blocks the title request, THEN THE System SHALL skip the LLM call, persist the deterministic fallback title, render the existing untitled placeholder in the sidebar, and record one telemetry event with `kind = "title_skipped_budget"`.
6. THE Title_Generator SHALL only run on the first assistant turn of a `Chat_Thread`; once `chat_threads.title` is non-null, the System SHALL NOT regenerate it automatically.
7. WHEN the Title_Generator completes successfully, THE System SHALL record one row in `chat_telemetry` attributing the tokens, model, latency, and estimated cost to the originating `Chat_Thread`.

### Requirement 2: Per-tool bespoke chat parts

**User Story:** As the single user, I want each tool result in the chat stream rendered with a layout tailored to that tool, so that I can read prices, candles, indicators, news, calendar entries, alerts, journal logs, and market structure at a glance on mobile.

#### Acceptance Criteria

1. THE System SHALL provide one `Chat_Part_Renderer` per tool at `apps/web/src/components/chat/parts/<tool-name>.tsx` for the tools `get_price`, `get_candles`, `get_indicators`, `get_market_structure`, `get_news`, `get_calendar`, `set_alert`, and `log_journal`.
2. THE System SHALL define a `Tool_Part_Registry` typed by the tool-name union exported from `@shared` and SHALL dispatch each tool result in the chat stream to the matching `Chat_Part_Renderer`.
3. WHEN the chat stream emits a tool result whose tool name is not present in the `Tool_Part_Registry`, THE System SHALL render that result with `Tool_Card_Generic` as a fallback.
4. THE `Chat_Part_Renderer` for `get_price`, `get_candles`, `get_indicators`, and `get_market_structure` SHALL render numeric values using the `.tabular-nums` utility and the `text-bull` or `text-bear` semantic token to indicate sign.
5. THE `Chat_Part_Renderer` for `get_news` and `get_calendar` SHALL render each item with its title, source or country, timestamp, and impact or sentiment indicator, and SHALL link to the corresponding row on `/news` or `/calendar`.
6. THE `Chat_Part_Renderer` for `set_alert` SHALL render the rule, the symbol, the threshold, and a link to `/alerts` filtered to the new rule's id.
7. THE `Chat_Part_Renderer` for `log_journal` SHALL render side, symbol, entry, stop, take-profit, R-multiple if computable, and a link to `/journal` filtered to the new entry's id.
8. THE `Chat_Part_Renderer` set SHALL honour the `Density_Tokens` from `docs/05-ui-ux.md` and the rules in `.kiro/steering/30-ui.md`, including ≥ 44×44 tap targets and visible focus rings.
9. THE `Chat_Part_Renderer` set SHALL be implemented as server components by default and SHALL only declare `"use client"` on parts that require state, events, or browser-only APIs.
10. THE Zod schemas describing each tool's result payload SHALL be defined in `packages/shared/src/schemas` before any `Chat_Part_Renderer` consumes them.
11. THE `Chat_Part_Renderer` set SHALL NOT use `any` and SHALL NOT use `enum`, and SHALL NOT import across packages except via the configured aliases (`@shared/*`, `@ai/*`, `@data/*`, `@db/*`, `@ui/*`, `@/*`).

### Requirement 3: Eval harness for the 10 acceptance prompts

**User Story:** As the single user, I want a one-command harness that runs the 10 acceptance prompts against my local app and writes a diffable markdown report, so that I can compare prompt behaviour across changes without setting up CI gates.

#### Acceptance Criteria

1. THE System SHALL provide an `Eval_Prompts_File` at `packages/ai/src/eval/prompts.json` containing the 10 prompts from `docs/00-overview.md` in their listed order, each with an `id` and `prompt` field.
2. THE System SHALL provide an `Eval_Harness` invocable as `pnpm --filter @hamafx/ai eval` (or the equivalent command for the package's actual name) that reads `Eval_Prompts_File` and POSTs each prompt to `http://localhost:3000/api/chat` with the `Password_Cookie_Gate` cookie supplied via env var or CLI flag.
3. WHEN the Eval_Harness POSTs a prompt, THE Eval_Harness SHALL capture the streamed assistant output, every `Tool_Call` name and arguments, every tool result summary, the total wall-clock duration in milliseconds, and the time-to-first-token in milliseconds.
4. WHEN all 10 prompts have completed, THE Eval_Harness SHALL write an `Eval_Report` to `docs/eval/<UTC-timestamp>.md` containing one section per prompt with the prompt text, the captured output, the tool-call list, and the timing metrics.
5. IF any single prompt request fails or times out after 120 seconds, THEN THE Eval_Harness SHALL record the failure in the `Eval_Report` for that prompt, continue with the remaining prompts, and exit with a non-zero status code only when the failure has been successfully recorded in the report.
6. WHEN every prompt completes without an explicit failure or timeout, THE Eval_Harness SHALL exit with status code 0 regardless of response quality.
7. THE Eval_Harness SHALL NOT call any LLM-as-judge logic and SHALL NOT gate any CI workflow.
8. THE Eval_Harness SHALL emit progress to stdout including the index, the prompt id, and the duration as each prompt finishes.

### Requirement 4: Mobile Lighthouse measurement

**User Story:** As the single user, I want a measurement script that runs Lighthouse against my deployed app on every key route and tells me whether mobile performance and accessibility meet the MVP targets, so that regressions are visible and fixable.

#### Acceptance Criteria

1. THE System SHALL provide a `Lighthouse_Runner` script invocable from the repository root that runs Lighthouse with the mobile preset against each route in `Lighthouse_Targets`.
2. THE Lighthouse_Runner SHALL accept a base URL via CLI flag or env var so it can run against a local production build (`next start`) or against the deployed Vercel production URL.
3. WHEN the Lighthouse_Runner finishes a route, THE Lighthouse_Runner SHALL attempt to write both a per-route JSON report and a summary markdown entry under `docs/lighthouse/<UTC-timestamp>/`, and IF writing one report type fails, THEN THE Lighthouse_Runner SHALL continue writing the other type and complete the run successfully.
4. THE Lighthouse_Runner SHALL evaluate each route against a performance threshold of ≥ 90 and an accessibility threshold of ≥ 95.
5. WHEN any route falls below either threshold, THE Lighthouse_Runner SHALL exit with a non-zero status code and SHALL list each failing route, score, and category in stdout.
6. THE Lighthouse_Runner SHALL NOT be wired into a CI workflow that blocks merges.
7. WHEN the first run identifies routes that fail the thresholds, THE System SHALL fix the regressions in `apps/web` until each route in `Lighthouse_Targets` reaches ≥ 90 performance and ≥ 95 accessibility, or SHALL document each unreachable target as a waiver in `docs/lighthouse/waivers.md` with a one-paragraph justification per waived route-and-category pair.
8. WHILE any route in `Lighthouse_Targets` is below threshold and not covered by a waiver in `docs/lighthouse/waivers.md`, THE Phase 1 completion checklist SHALL remain blocked, and the spec SHALL NOT be considered complete.

### Requirement 5: PWA install and offline shell

**User Story:** As the single user, I want to install HamaFX-Ai as a PWA on Android and iOS and see a useful offline shell when I open it without network, so that the app feels like a real installable client and never falls back to the browser's default offline page.

#### Acceptance Criteria

1. THE System SHALL register a `Service_Worker` from the web app's root scope on the first authenticated page load, and the `Service_Worker` SHALL be served from a path within `apps/web` that Next.js exposes at the site root.
2. THE Service_Worker SHALL precache the `App_Shell` assets, including the root document for `/chat`, the global stylesheet, the app icons, and any fonts loaded by the shell, on its `install` event.
3. WHEN the network is unavailable and the user opens an installed PWA window, THE Service_Worker SHALL respond to the navigation request with the precached `App_Shell` instead of allowing the browser's default offline page to render.
4. WHILE the network is unavailable, THE App_Shell SHALL display a clearly visible "no network" state with the bottom navigation rendered and a retry control, and WHILE the network is available, THE System SHALL NOT display the "no network" state or its retry control even when the user is viewing cached content.
5. THE Service_Worker SHALL use a cache-first strategy for static assets fingerprinted by Next.js and SHALL use a network-first strategy with a precached document fallback for HTML navigation requests.
6. THE Service_Worker SHALL bump its cache version identifier on each release and SHALL delete caches whose version identifier does not match the current version on its `activate` event.
7. THE PWA_Manifest SHALL declare `name`, `short_name`, `start_url = "/chat"`, `display = "standalone"`, `background_color`, `theme_color`, and an icon set that includes 192×192 and 512×512 PNGs and a maskable variant; IF any single field is absent at install time, THEN the browser SHALL be allowed to proceed with its default for that field rather than blocking installation.
8. THE System SHALL provide an `apple-touch-icon` link tag of at least 180×180 in the root `<head>` and SHALL provide iOS splash-screen `<link rel="apple-touch-startup-image">` entries for at least one current iPhone viewport size.
9. WHEN the user triggers "Add to Home Screen" on Android Chrome and on iOS Safari, THE PWA SHALL install with the configured name and icon and SHALL launch into the `App_Shell`.
10. WHERE the Service_Worker caches `/api/market/*` GET responses, THE Service_Worker SHALL use a stale-while-revalidate strategy with a maximum age of 60 seconds; this caching is optional and the spec author SHALL confirm whether to include it before implementation.
11. THE Service_Worker SHALL NOT cache any response from `/api/auth/*`, `/api/cron/*`, or `/api/chat`.

### Requirement 6: Cron triggering strategy

**User Story:** As the single user, I want one chosen mechanism that fires the four `Cron_Endpoint` routes at the documented cadences, so that news, embeddings, calendar, and alerts stay fresh without me hitting curl by hand.

#### Acceptance Criteria

1. THE System SHALL document a single chosen Cron_Scheduler strategy in `docs/09a-phase-0-deployed-state.md`, replacing the current "three options" section, and the chosen strategy SHALL be one of: Vercel Pro `crons` block, external scheduler (cron-job.org or GitHub Actions), or explicit "stay manual".
2. WHERE the chosen strategy is the Vercel Pro `crons` block, THE System SHALL update `vercel.json` with one `crons` entry per `Cron_Endpoint` whose `schedule` matches the `Cron_Cadences`.
3. WHERE the chosen strategy is an external scheduler, THE System SHALL commit configuration sufficient to reproduce the schedule (a GitHub Actions workflow file under `.github/workflows/` or a checked-in `cron-job.org` job export) targeting the four `Cron_Endpoint` URLs at the `Cron_Cadences`.
4. WHERE the chosen strategy is "stay manual", THE System SHALL document the curl commands and the expected cadence in `docs/09a-phase-0-deployed-state.md` and SHALL keep the in-app empty-state curl recipes already shown on `/news`, `/calendar`, and `/alerts`.
5. THE Cron_Scheduler SHALL include the header `Authorization: Bearer ${CRON_SECRET}` on every request to a `Cron_Endpoint`.
6. THE four `Cron_Endpoint` routes SHALL continue to reject any request that does not present a valid `Authorization: Bearer ${CRON_SECRET}` with HTTP status 401.
7. WHEN the chosen Cron_Scheduler runs against a deployed environment for one full hour, THE alerts cron SHALL have fired at least 30 times, the news cron at least 10 times, the calendar cron at least 3 times, and the embedding-backfill cron at least once.
8. IF a `Cron_Endpoint` returns a non-2xx response, THEN the chosen Cron_Scheduler SHALL log or surface the failure in a place reachable by the single user (Vercel function logs, GitHub Actions run history, or the external scheduler's UI), and the System SHALL document where to find those logs in `docs/09a-phase-0-deployed-state.md`.

### Requirement 7: Resend integration end-to-end verification

**User Story:** As the single user, I want a one-click way to send a test alert email via Resend and confirm a real alert produces an inbox email, so that I trust the alerts pipeline before I rely on it.

#### Acceptance Criteria

1. THE System SHALL provide an Email_Tester admin endpoint at `/api/admin/test-alert-email` that accepts POST requests, is gated by the `Password_Cookie_Gate`, and SHALL reject all unauthenticated requests with HTTP status 401.
2. WHEN the Email_Tester admin endpoint receives an authenticated POST and `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, and `ALERT_TO_EMAIL` are all present, THE System SHALL send one test email through Resend with a clearly-labelled "[HamaFX-Ai] Test alert email" subject and SHALL respond 200 with the Resend message id.
3. IF any of `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, or `ALERT_TO_EMAIL` is missing or empty, THEN the Email_Tester admin endpoint SHALL respond with HTTP status 503 and a JSON body identifying the missing variable names without revealing any secret values.
4. THE Settings page at `/settings` SHALL include a "Send test alert email" control that POSTs to the Email_Tester admin endpoint and SHALL display the resulting success message with the message id, the 503 missing-variable list, or the error text.
5. WHEN a real alert rule's condition is satisfied during a `/api/cron/alerts` execution and Resend env vars are configured, THE alerts delivery path SHALL send one email per fired rule to `ALERT_TO_EMAIL` and SHALL mark the rule fired only after Resend returns a 2xx response.
6. IF Resend returns a non-2xx response while delivering a real alert, THEN the System SHALL leave the alert un-marked-as-fired so the next cron tick retries, and SHALL log the Resend error code and message.
7. THE Email_Tester admin endpoint and Settings control SHALL be reachable only by the single user and SHALL NOT introduce any `user_id` column, RLS policy, or per-user identifier.
