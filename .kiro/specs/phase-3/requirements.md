# Requirements Document

## Introduction

Phase 3 takes the deeply-grounded Phase 2 product and adds **multimodal + breadth** — the user can drop a chart screenshot and get analysis, see cross-pair correlation and a DXY proxy, view the chart in a TradingView Advanced Charting Widget when they want pro tooling, ingest CFTC Commitment-of-Traders weekly, share a single analysis snapshot via a private signed link, and receive web-push notifications as a second alert channel — all without breaking the project's hard rules: personal-mode (single user, single `APP_PASSWORD`, no `user_id`, no RLS), single Vercel deploy (no `apps/worker/`), schemas in `packages/shared/src/schemas` first, no `any`, no `enum`, no deep cross-package imports, supported symbols `XAUUSD | EURUSD | GBPUSD`. The roadmap's Phase 3 ends when the user drops chart screenshots and gets useful analysis without typing.

The work spans `packages/ai`, `packages/data`, `packages/db`, `packages/shared`, `apps/web`, `.github/workflows`, and `docs/`. Two additive DB migrations are needed (`shared_snapshots` table for shareable analysis links; `cot_reports` for CFTC data); the existing `chat_messages` schema gains no new columns because the AI SDK already encodes image parts in the `parts` JSONB. Phase 3 closes when the agent answers a screenshot prompt with grounded analysis, the share link round-trips, the cross-pair correlation tool produces a value, the CFTC cron writes a row, the optional Pro chart toggle works, and web-push delivery completes a real alert.

Items out of scope: anything beyond `XAUUSD | EURUSD | GBPUSD`, multi-user features, an `apps/worker/`, an Expo native app, a backtest UI, a public marketing surface. These remain explicit non-goals through Phase 3.

## Glossary

- **System** — the HamaFX-Ai application as deployed on Vercel.
- **AI_Agent** — `packages/ai/src/agent.ts#runChat`, the per-turn entrypoint.
- **Vision_Pipeline** — the path that lets a user attach a chart screenshot to a chat turn; the message reaches the model as a multimodal `image` part and the model can choose to call `analyze_chart_image`.
- **Analyze_Chart_Image_Tool** — `analyze_chart_image`, an AI tool whose input is a chat-attached image part and whose output is a structured technical readout (trend, levels, structure, suggested overlays).
- **Correlation_Tool** — `get_correlation`, an AI tool that returns a rolling-window correlation matrix for the supported symbols plus a derived USD-strength proxy ("DXY proxy") computed from the FX legs.
- **DXY_Proxy** — a synthetic USD-strength index computed from EURUSD and GBPUSD (since those are the only USD-leg FX pairs we hold) using a rolling-window weighted geometric mean. Not a true DXY (no JPY, CAD, SEK, CHF), labelled clearly as a proxy in the UI and the tool description.
- **Pro_Chart_Mode** — an optional alternate chart route at `/chart/[symbol]/pro` that renders the TradingView Advanced Charting Widget instead of the bundled `lightweight-charts` view; gated by a config flag in `packages/shared/src/env.ts` and a runtime opt-in.
- **CoT_Report** — a row in the `cot_reports` table summarising the latest CFTC Commitment-of-Traders report for one symbol.
- **CoT_Cron** — `/api/cron/cot`, the cron handler that pulls the latest CFTC release and upserts `cot_reports`.
- **Shared_Snapshot** — a row in the `shared_snapshots` table representing one read-only analysis artifact reachable via a signed `/share/[id]` link.
- **Share_Link** — a URL of the form `/share/<id>?t=<token>` where `id` is the snapshot row id and `token` is an HMAC-signed expiry payload; the route is bypassed by the password gate but verified by `token`.
- **Web_Push_Channel** — the third alert delivery channel (after Resend email and Telegram) that pushes notifications to a registered service worker subscription.
- **Push_Subscription** — a row in the `push_subscriptions` table holding the single user's browser-issued `endpoint`, `p256dh`, and `auth` keys.
- **VAPID_Pair** — the public/private key pair used to authenticate web-push messages to the user's push service. Stored as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` env vars.
- **Daily_Budget_Guardrail** — the existing per-day token-spend cap from Phase 1 (`MAX_DAILY_USD`).

## Requirements

### Requirement 1: Vision input on chat

**User Story:** As the single user, I want to attach a chart screenshot to a chat message and have the agent reason about it, so I can get analysis without typing every level by hand.

#### Acceptance Criteria

1. THE chat composer at `apps/web/src/components/chat/composer.tsx` SHALL render an image-attach control at the textarea's right edge with a ≥ 44×44 tap target and a visible focus ring, alongside the existing voice input control.
2. WHEN the image-attach control is pressed, THE composer SHALL open the platform file picker filtered to `image/*` and accept up to 4 images per turn.
3. WHEN images are selected, THE composer SHALL render thumbnails above the textarea with a remove control on each thumbnail, ≥ 44×44 tap target, before submission.
4. WHEN the user submits a turn that includes images, THE chat surface SHALL forward each image as a `file` UIMessage part with `mediaType` set to the image MIME and the binary as a base64 data URL or remote URL, per the AI SDK v5 multimodal contract.
5. THE `/api/chat` route SHALL accept multimodal `parts` arrays in the message envelope without rejecting unknown part types, validating only the `threadId`, `id`, and `role` fields it already parses.
6. THE `runChat` agent SHALL pass the multimodal parts through to the model unchanged so the underlying provider (Gemini via Vertex / direct, OpenAI / Anthropic via gateway) can consume them; tool selection remains the model's job.
7. THE attached image part SHALL be persisted as part of the user `chat_messages.parts` JSON so the chat history page can re-render it later, and the image bytes SHALL NOT be re-uploaded on resume.
8. IF an attached image exceeds 5 MB (post-resize) or is not an `image/*` type, THE composer SHALL reject the file before submission and render a one-line inline error.

### Requirement 2: `analyze_chart_image` AI tool

**User Story:** As the single user, I want the agent to extract structured analysis from a chart screenshot — symbol, timeframe, trend, key levels, structure events, an overlay set the chart UI can render — so the screenshot becomes actionable, not just visible.

#### Acceptance Criteria

1. THE System SHALL provide an AI tool `analyze_chart_image` whose input zod schema accepts `{ symbolHint?: Symbol, timeframeHint?: Timeframe }` and whose output schema returns `{ symbol: Symbol | null, tf: Timeframe | null, trend: 'up' | 'down' | 'range' | null, bias: 'bullish' | 'bearish' | 'neutral' | null, levels: Array<{ price: number, label: string }>, observed: string, overlay: AnnotateChartOutput | null, sourceImageRef: string }`.
2. WHEN invoked, THE tool SHALL receive the most recent user-attached image part on the same turn and SHALL call the chat model with a vision-capable model id (`AI_VISION_MODEL` env, defaulting to `google-vertex/gemini-2.5-pro`) using a structured-output schema so the response shape matches the output schema.
3. IF the most recent user turn has no image part, THE tool SHALL return `{ ... null fields ..., observed: 'no image attached' }` and SHALL NOT call the model.
4. THE tool's prompt SHALL instruct the model to identify symbol/timeframe from the image, list the labelled price levels visible on the chart, and (when confident) emit a typed `OverlaySet` matching the existing `AnnotateChartOutput` shape so the chart UI can re-render the levels via the existing overlay machinery.
5. THE System SHALL render `analyze_chart_image` results in chat via a bespoke `Chat_Part_Renderer` at `apps/web/src/components/chat/parts/analyze-chart-image.tsx` that lists the levels, names the observed structure, and (when overlay is present) provides a deep link to `/chart/<symbol>?tf=<tf>&overlays=<comma-list>`.
6. THE tool SHALL NOT cross the `Daily_Budget_Guardrail`; one vision call per invocation.
7. THE input/output schemas SHALL be added to `packages/shared/src/schemas/tool-outputs/analyze-chart-image.ts` and re-exported from the package barrel.

### Requirement 3: Cross-pair correlation + DXY proxy

**User Story:** As the single user, I want one tool that returns the rolling correlation matrix for `XAUUSD/EURUSD/GBPUSD` and a derived USD-strength proxy, so I can answer "are EUR and GBP both selling off?" in one prompt.

#### Acceptance Criteria

1. THE System SHALL provide an AI tool `get_correlation` whose input is `{ tf?: Timeframe (default '1h'), windowBars?: number (20..500, default 100) }` and whose output is `{ tf, windowBars, asOf, matrix: Array<{ a: Symbol, b: Symbol, r: number }>, dxyProxy: { value: number, change24h: number, samples: number, formula: string } }`.
2. THE rolling correlation SHALL be Pearson correlation over the last `windowBars` returns (close-to-close), computed across pairs of symbols.
3. WHEN any symbol's candle window has fewer than `windowBars + 1` closed bars, THE tool SHALL skip that pair from the matrix rather than emit a noisy correlation, and SHALL note the skipped pair in `dxyProxy.formula` if it affects the proxy.
4. THE `dxyProxy.value` SHALL be computed as `100 / (EURUSD^wEUR * GBPUSD^wGBP)` with `wEUR = 0.5` and `wGBP = 0.5` (50/50 weights since we only hold two USD-leg FX pairs); `change24h` SHALL be the percent change of that value across the most recent 24 hours of bars.
5. THE `dxyProxy.formula` field SHALL state the formula and weights inline so any agent answer can cite the source verbatim.
6. THE System SHALL render `get_correlation` results in chat via a bespoke `Chat_Part_Renderer` at `apps/web/src/components/chat/parts/get-correlation.tsx` that shows the correlation matrix as a 3×3 table (with `text-bull` / `text-bear` cells) and a small DXY proxy strip with the value and 24h change.
7. THE input/output schemas SHALL be added to `packages/shared/src/schemas/tool-outputs/get-correlation.ts` and re-exported from the package barrel.

### Requirement 4: TradingView Advanced Charting Widget — opt-in Pro mode

**User Story:** As the single user, when I want pro chart tooling for an in-depth read, I want to switch to the TradingView Advanced Charting Widget on a per-route basis, so the bundled `lightweight-charts` view stays the default but I can flip when needed.

#### Acceptance Criteria

1. THE System SHALL provide a Pro chart route at `apps/web/src/app/(app)/chart/[symbol]/pro/page.tsx` that renders the TradingView Advanced Charting Widget for the matching symbol.
2. THE Pro chart route SHALL be reachable from the main chart page via a small "Pro" link/button in the chart header that points to `/chart/<symbol>/pro?tf=<tf>`; the link SHALL be hidden when `NEXT_PUBLIC_TRADINGVIEW_ENABLED !== '1'`.
3. THE TradingView widget SHALL be loaded via the official `tv.js` script and configured per the [Advanced Charts widget docs](https://www.tradingview.com/widget/advanced-chart/) using the symbols `OANDA:XAUUSD`, `OANDA:EURUSD`, `OANDA:GBPUSD`.
4. THE Pro chart route SHALL accept the same `?tf=<tf>` URL state as the main chart route and SHALL pre-select the matching TradingView interval on load.
5. THE Pro chart route SHALL render with the existing `(app)` layout (TopBar + BottomNav) so navigation stays consistent.
6. THE Pro chart route SHALL render a clearly labelled "Powered by TradingView" attribution per the widget terms.
7. WHERE the user's network blocks `tradingview.com`, THE page SHALL render a graceful error message linking back to `/chart/<symbol>` so the user is never stranded.

### Requirement 5: Commitment of Traders (CFTC) ingestion

**User Story:** As the single user, I want the latest CFTC Commitment-of-Traders report ingested weekly so the agent can reference net positioning trend on gold and the dollar in fundamental answers.

#### Acceptance Criteria

1. THE System SHALL implement a cron handler `/api/cron/cot` that fetches the most recent CFTC TFF (Traders in Financial Futures) and Disaggregated reports for the supported symbols (`GC` for XAUUSD, `6E` for EURUSD, `6B` for GBPUSD).
2. THE migration SHALL add a new `cot_reports` table with columns `(id text PRIMARY KEY, symbol text NOT NULL, report_date timestamp with time zone NOT NULL, dealer_long int, dealer_short int, asset_long int, asset_short int, leveraged_long int, leveraged_short int, other_long int, other_short int, source text NOT NULL, raw jsonb, created_at timestamp default now())`. `id` is a deterministic `cftc:<symbol>:<YYYY-MM-DD>` so re-runs are idempotent.
3. THE cron handler SHALL upsert with `ON CONFLICT (id) DO UPDATE SET ...` so a delayed CFTC release lands on a re-run without duplicate rows.
4. THE cron handler SHALL validate `Authorization: Bearer ${CRON_SECRET}` via the existing `withCronAuth` helper.
5. THE System SHALL register the cron in `.github/workflows/cron-cot.yml` to fire weekly at `0 22 * * 5` UTC (Friday 22:00 UTC, after the CFTC weekly release window).
6. THE System SHALL provide an AI tool `get_cot` whose input is `{ symbol?: Symbol, weeks?: number (1..52, default 8) }` and whose output is `{ symbol: Symbol, samples: Array<CoTSample>, summary: string }` where each sample is one upserted row.
7. THE `get_cot` tool SHALL render in chat via a bespoke `Chat_Part_Renderer` showing a small bar/line of net positioning over the last N weeks with `.tabular-nums` and `text-bull`/`text-bear` for the net direction.
8. WHEN the table is empty (cron hasn't run yet), THE tool SHALL return `{ samples: [], summary: 'CoT pipeline pending' }` and the chat part SHALL render a quiet status line.

### Requirement 6: Sharable analysis snapshots

**User Story:** As the single user, I want to share a one-off analysis snapshot via a private signed link, so I can paste a chart + summary into a Telegram conversation without giving away my password.

#### Acceptance Criteria

1. THE System SHALL provide an AI tool `share_snapshot` whose input is `{ title: string, body: string, overlay?: AnnotateChartOutput, symbol?: Symbol, tf?: Timeframe, ttlMinutes?: number (5..43200, default 10080 = 7 days) }` and whose output is `{ id: string, url: string, expiresAt: number }`.
2. THE migration SHALL add a `shared_snapshots` table with columns `(id uuid PRIMARY KEY, title text NOT NULL, body text NOT NULL, overlay jsonb, symbol text, tf text, expires_at timestamp with time zone NOT NULL, created_at timestamp default now())`.
3. THE `share_snapshot` tool SHALL persist the row, sign an HMAC token of `{id, expiresAt}` using `AUTH_COOKIE_SECRET`, and return the URL `https://<host>/share/<id>?t=<token>`.
4. THE System SHALL provide a public read route at `apps/web/src/app/share/[id]/page.tsx` that validates the `?t=` token, looks up the row, and renders the title, body, and the overlay (when present) on a read-only `lightweight-charts` instance — without requiring the password cookie.
5. THE share route SHALL respond `410 Gone` when `expires_at` is in the past and SHALL respond `404` when the row is missing.
6. THE middleware SHALL bypass the password gate for `/share/*` URLs but SHALL NOT bypass any other admin/api routes.
7. THE System SHALL render `share_snapshot` results in chat via a bespoke `Chat_Part_Renderer` showing the title and a copy-to-clipboard control for the URL with a ≥ 44×44 tap target.
8. THE input/output schemas SHALL be added to `packages/shared/src/schemas/tool-outputs/share-snapshot.ts` and re-exported from the package barrel.

### Requirement 7: Web Push as a 2nd alert channel

**User Story:** As the single user, I want web-push notifications when an alert fires, so I get instant pings without needing my phone to be on the Telegram app.

#### Acceptance Criteria

1. THE migration SHALL add a `push_subscriptions` table with columns `(id uuid PRIMARY KEY, endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL, user_agent text, created_at timestamp default now())`.
2. THE Settings page at `/settings` SHALL include an "Enable web push" control that requests notification permission, subscribes the active service worker via `pushManager.subscribe`, and POSTs the subscription to `/api/push/subscribe`.
3. THE `/api/push/subscribe` route SHALL accept a `PushSubscription` payload, persist it to `push_subscriptions`, and return `200 { id }`. It SHALL be gated by the password cookie middleware.
4. THE `/api/push/unsubscribe` route SHALL accept `{ endpoint }` and delete the matching row.
5. THE alerts evaluator SHALL extend `EvaluatorEnv` with `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` and SHALL implement web-push delivery in `packages/ai/src/alerts/delivery.ts` so the `'web-push'` channel POSTs an authenticated push to every active subscription using the [Web Push protocol](https://datatracker.ietf.org/doc/html/rfc8030) (or the `web-push` library if it can run on Node 24 in Vercel functions without extra build flags).
6. THE delivery path SHALL `markFired` only after every active subscription returned 2xx (or all returned 410 Gone, in which case the subscriptions are removed and the alert is still marked fired).
7. WHEN any subscription returns 410 (Gone) or 404, THE delivery path SHALL delete that subscription row.
8. THE service worker at `apps/web/public/sw.js` SHALL register a `push` listener that displays the notification with a `title`, `body`, and a `notificationclick` handler that focuses or opens `/alerts`.
9. THE System SHALL document `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in `.env.example`; the public key MUST be exposed as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for the browser-side `pushManager.subscribe` call.

### Requirement 8: Roadmap, deployed-state, and steering doc updates

**User Story:** As another agent picking up the repo after Phase 3, I want the docs to reflect what shipped so I don't re-do work or break a hard rule by mistake.

#### Acceptance Criteria

1. `docs/10-roadmap.md` SHALL move every checked Phase 3 box to ✅ and SHALL update the "Stretch / parking lot" header.
2. `docs/09a-phase-0-deployed-state.md` SHALL gain a "Phase 3" subsection listing the new env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_TRADINGVIEW_ENABLED`, `AI_VISION_MODEL`), the new cron workflow `cron-cot.yml`, and the migrations applied.
3. `docs/04-features.md` SHALL flip the catalog symbols for the items shipped (`C-09 Voice output (TTS)` is intentionally **left unshipped**, but `Chart 📈 — TradingView Advanced Widget view (CH-10)` and `Chart 📈 — Snapshot share (CH-11)` and `Cross-pair correlation (M-05)` and `DXY proxy panel (M-06)` and any vision items SHALL be shipped).
4. `.kiro/steering/10-ai-tools.md` SHALL list the new tools (`analyze_chart_image`, `get_correlation`, `get_cot`, `share_snapshot`) under "Tools" so future agents see the complete registry.
5. `.kiro/steering/00-project.md` SHALL stay unchanged — the hard rules don't move.
6. WHEN any Phase 3 commit changes behaviour, the matching doc SHALL be updated in the same PR.
