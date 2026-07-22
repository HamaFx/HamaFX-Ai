# HamaFX-Ai — Frontend Audit

Reviewer: senior frontend engineer / software architect.
Scope: `apps/web/` (Next.js 15 App Router + React 19). The `packages/*`
internal libraries are referenced only where they directly affect the
frontend.

The audit follows the evidence in the implementation. When documentation
and code disagree, the code is treated as the source of truth. The
report is deliberately selective — recommendations are included only
when they provide meaningful value.

---

## 1. Overview of the Frontend Architecture

HamaFX-Ai is a mobile-first, dark-only PWA trading copilot. The
frontend (`apps/web/`) is a Next.js 15 App Router app with the following
shape:

- **Routing**: App Router with three route groups — `(auth)` for
  login/register, `(app)` for the authenticated shell, and a public
  `share/[id]` page. 13 user-facing routes plus an `/admin` dashboard.
- **Render model**: Hybrid RSC. Server Components fetch from the
  `@hamafx/{ai,db,data}` packages, hydrate client islands for the
  interactive surfaces (`ChatScreen`, `ChartView`, `Composer`,
  `MessageList`, etc.).
- **State**:
  - TanStack Query v5 is the primary remote-data layer, with sensible
    per-timeframe polling intervals and adjacent-TF prefetching.
  - `nuqs` for URL state (only `?tf=` today).
  - React Context for two concerns: the global NavDrawer open/close
    state and the News bookmarks. Both are split into
    `StateCtx` / `ActionsCtx` providers — a deliberate perf pattern
    that prevents action-only consumers from re-rendering on state
    change.
  - `localStorage` for chart config, news bookmarks, AI prefs
    (client-side mirror of DB).
- **Auth/edge**: Edge middleware enforces the NextAuth JWT gate, mints
  the CSRF double-submit cookie, signs `x-user-id` (HMAC-SHA256) for a
  verified fast-path, and injects a per-request CSP nonce.
- **Chat**: `useChat` (AI SDK v5) for the single-agent stream, and a
  bespoke SSE parser (`useMultiAgentChat`) for committee deliberation
  plus background-job polling for the `full` mode.
- **Charts**: TradingView lightweight-charts v5 (dynamic import), with
  a TradingView Advanced Chart widget at `/chart/[symbol]` gated by
  `NEXT_PUBLIC_TRADINGVIEW_ENABLED`.
- **Design system**: Tailwind v4 `@theme` tokens (near-black canvas,
  orange brand `#F56E0F`, sharp 2px radii). A small set of shadcn/ui
  primitives (button, input, drawer via vaul, tooltip, switch) plus a
  library of bespoke UI components in `components/ui/`.
- **Tests**: 74 vitest files in `apps/web/test/` + 21 Playwright e2e
  specs in `apps/web/tests/e2e/`. Coverage focuses on hooks, helpers,
  middleware, and isolated components.

The architecture is intentionally mobile-first, mobile-only for several
surfaces (chat is full-bleed `fixed inset-0`), with desktop
accommodations (`xl:` breakpoint, `max-w-7xl` shell) added later.

---

## 2. Major Strengths

1. **Disciplined data layer.** `lib/api-client.ts` (`apiFetch` /
   `apiMutate`) is a genuinely well-designed typed wrapper: typed
   `ApiError` with `code`/`status`/`requestId`, AbortSignal composition
   with timeout, retry-with-backoff for transient network failures
   only, and a clean `json: false` escape hatch for blob endpoints.
   The standard error envelope is documented and the server side
   (`lib/api.ts`) implements it consistently.

2. **Performance-aware chat rendering.** The chat is the highest-stakes
   surface for streaming UX. The implementation makes several
   non-obvious, correct choices:
   - `Message` is `memo()`'d with a custom comparator that walks the
     `parts` array by reference (message.tsx:354-369).
   - `MessageList` is virtualized with `@tanstack/react-virtual` and
     `measureElement` so long threads don't blow up the DOM.
   - The multi-agent SSE parser throttles `setMessages` flushes to
     ~10/sec (`SSE_FLUSH_INTERVAL_MS = 100`) instead of per-token,
     reducing state updates by an order of magnitude
     (use-multi-agent-chat.ts:249).
   - The SSE reader is raced against a 2-minute per-chunk timeout so a
     hung server stream can't freeze the tab (STAB-01).
   - Auto-scroll only fires within 240px of the bottom — explicit
     decision not to "page-jump while reading".

3. **Hybrid RSC + streaming done right.** The `(app)/layout.tsx`
   wraps `{children}` in a Suspense boundary with a shimmer fallback,
   the root layout lazy-loads `SwRegister` and the `(app)` layout
   lazy-loads `CommandPalette`/`InstallNudge` via `lazy-chrome.tsx`.
   Charts are dynamic-imported with `ssr: false`. The `force-dynamic`
   vs `revalidate` choices are per-route and deliberate (e.g. news
   uses `revalidate = 300`, settings uses 60s, chat is force-dynamic).

4. **CSP and CSRF are real, not decorative.** Middleware generates a
   per-request nonce, sets a strict CSP with `'strict-dynamic'`, and
   the CSRF double-submit cookie uses `__Host-` prefixing in
   production. The `x-user-id` header is HMAC-signed so a spoofed
   header falls through to the `auth()` slow path — this is a
   genuinely good defense-in-depth pattern.

5. **Memoized chart with a custom comparator.** `ChartCanvas` uses
   `areCanvasPropsEqual` that only checks the last candle's OHLC
   rather than deep-comparing the array (chart-canvas.tsx:70-82) —
   correct for the live-tick merge case where only the last bar
   mutates.

6. **Accessibility is treated as a first-class concern.** Skip link,
   `id="main-content"` with `tabIndex={-1}`, `aria-live` regions for
   streamed assistant text and the typing indicator, `aria-activedescendant`
   on the composer's slash-command textarea, `aria-pressed` on the mic
   toggle, and per-request reduced-motion handling via the
   `TimeProvider`-driven `data-reduce-motion` attribute.

7. **Clear file-name conventions.** `kebab-case.ts` for modules,
   `PascalCase.tsx` for components, `_components/` and `_actions.ts`
   co-location — the codebase is genuinely easy to navigate.

8. **Strong test posture for an early-stage project.** 74 vitest
   files plus 21 Playwright specs, including an accessibility spec,
   service-worker spec, multi-agent spec, and a
   `middleware-to-ai.integration.test.ts` — i.e. the integration
   boundaries are tested, not just units.

---

## 3. Areas That Could Become Future Problems

### 3.1 Two parallel chat transports with duplicated logic — `useChat` vs `useMultiAgentChat`

`ChatScreen` carries two mutually exclusive send paths:
- `sendMessage` from `useChat` (AI SDK v5, single-agent)
- `sendMultiAgentMessage` from `useMultiAgentChat` (bespoke SSE parser
  + job-polling)

Every action (`onSubmit`, `handleEdit`, `handleRegenerate`, the
auto-submit effect, the error-retry button) branches on
`analysisMode !== 'single'` and re-implements the same UX in two
places. The multi-agent path manually synthesizes user/assistant
`UIMessage` objects with `crypto.randomUUID()` and casts via
`as unknown as UIMessage` (use-multi-agent-chat.ts:89-100).

**Why it matters**: every new chat affordance (citations, file uploads,
tool parts, branching) has to be wired twice. The two paths will drift
— the multi-agent path already doesn't propagate `metadata.model` to
the `MessageFooter`, and doesn't surface AI SDK tool parts (it only
parses `text` and `data-agent-progress` SSE events). The `analysisMode`
default is `'auto'`, which routes to the multi-agent path for most
turns, so this is the common path, not the edge case.

**Refactor opportunity**: unify on the AI SDK v5 transport. The
`DefaultChatTransport.prepareSendMessagesRequest` already lets you
send `analysisMode` in the body (chat-screen.tsx:114-142); the server
can emit standard AI SDK v5 stream parts for the committee case
(`data-agent-progress` is already a data part, and the final text can
flow as a normal `text` part). That eliminates the bespoke SSE parser,
the `crypto.randomUUID()` synthesis, and the dual-send branching in
`ChatScreen`.

### 3.2 Inconsistent fetch wrapper adoption

`apiFetch` / `apiMutate` is the canonical client, but ~19 raw `fetch()`
call sites remain in `app/(app)/settings/_components/`, `components/`,
and `hooks/use-thread-title.ts` / `use-multi-agent-chat.ts`. These
re-implement error parsing (`errBody?.error?.message ?? HTTP ${res.status}`)
and CSRF injection ad-hoc, and — critically — none of them surface
`requestId` in the error toast, defeating the traceability design.

The pattern is most concentrated in `symbols-form.tsx` (8 raw fetches)
and `api-key-card.tsx` / `market-data-config.tsx` / `bulk-test-button.tsx`
/ `fallback-chain-picker.tsx` / `test-{email,telegram}-button.tsx`.

**Refactor opportunity**: route all of these through `apiMutate`. The
`requestId`-in-toast behavior comes for free, and the typed `ApiError`
lets callers branch on `err.code` (e.g. `VALIDATION`) rather than
parsing strings. The multi-agent hook can keep its raw `fetch` (it
needs streaming) but should at least reuse `parseErrorBody` for the
non-2xx branch.

### 3.3 `as unknown as` casts on AI SDK v5 parts

`components/chat/message.tsx` alone has 8 `as unknown as` casts
(message.tsx:119, 337, 409, 422, 426, 438, 452) plus more in
`message-footer.tsx:75`. These are bridging the SDK's
`UIMessage['parts'][number]` (a discriminated union) to bespoke
renderer prop types.

**Why it matters**: the casts disable the compiler at the exact
boundary where shape drift is most likely — between the server-side
`streamText` output, the persisted Postgres parts, and the client
renderers. A schema change on the server will compile cleanly and
crash at runtime in the renderer.

**Refactor opportunity**: the codebase already has `@hamafx/shared` Zod
schemas for every tool output (registry.tsx:23-58). Add a
`UIMessagePartSchema` (or per-type schemas for `data-plan`,
`data-citation-warning`, `data-verify-warning`, `data-fallback`) and
`safeParse` at the boundary in `renderPart`, falling back to
`FallbackPartView` on parse failure — the same pattern the tool
registry already uses for tool outputs.

### 3.4 `ChartCanvas` has 9 `eslint-disable` lines and heavy SDK typing gymnastics

`components/chart/chart-canvas.tsx` (478 LOC) is the single highest
concentration of `eslint-disable` (9 lines) and `as unknown as` / `as any`
casts in the frontend. The lightweight-charts v5 API surface is large
and the typing is partially inferred — the file casts through
`unknown` to reach `chart.markers`, `series.setMarkers`,
`basisData`/`upperData`/`lowerData` for Bollinger bands, etc.

**Why it matters**: these aren't cosmetic. The casts mean the file's
contract with `lightweight-charts` is unverified by the compiler.
When the chart library cuts a major release (it's at v5.x already,
v6 will land) this file is where the breakage will hide.

**Refactor opportunity**: extract a small typed adapter module
(`chart/lc-adapter.ts`) that wraps the handful of imperative calls
the codebase actually uses (`createChart`, `addCandlestickSeries`,
`markers`, `createPriceLine`, `removePriceLine`, sub-pane `addLineSeries`)
and exports them with hand-written types. `ChartCanvas` then imports
from the adapter and the `as any` stays inside one 100-LOC file
instead of leaking across 478.

### 3.5 Chat screen declares an `xl:grid xl:grid-cols-12` but only one child has a column span

`chat-screen.tsx:331` switches to `xl:grid xl:grid-cols-12` on wide
viewports, but the only child with a `col-span` is the message scroll
area (`xl:col-span-6`). `ChatTopBar` and the Composer wrapper have no
column spans, so on `xl` they fall into implicit grid tracks. The
declared 12-column layout implies a sidebar (thread list?) was planned
but never wired.

**Why it matters**: today the layout degrades to "6-column message
area on the left, 6-column hole on the right" on desktop. The
`ThreadSwitcher` is rendered as a vaul drawer triggered from
`ChatTopBar`, so the right-hand column is empty. Either the layout
intent is unfinished or the grid classes are dead code.

**Action**: confirm intent. If a persistent thread sidebar is planned,
wire it into `col-span-3` / `col-span-6` / `col-span-3`. If not,
remove the `xl:grid xl:grid-cols-12` declaration — the flex column
layout works fine for the current single-pane UX.

### 3.6 `exactOptionalPropertyTypes` produces a `...(x ? {} : {})` spread idiom that hides intent

Under the project's `exactOptionalPropertyTypes` setting, optional
props must not be set to `undefined`. Throughout the codebase this is
worked around with conditional spreads:

```tsx
{...(isStreaming ? { isStreaming } : {})}
{...(onRegenerate && m.id === lastAssistantId && !isStreaming
  ? { onRegenerate } : {})}
{...(pinnedSymbol !== undefined ? { pinnedSymbol } : {})}
```

(chat-screen.tsx, message-list.tsx, quick-prompts.tsx, etc.)

This is correct TypeScript but it's actively hostile to readability,
and it makes the prop-passing logic harder to audit than a plain
`isStreaming={isStreaming}`. It's also inconsistent: some call sites
use the conditional spread, others pass `undefined` directly and
accept the type-narrowing noise.

**Refactor opportunity**: this is a config-level decision, not a
per-file one. If the team finds the idiom costly (the codebase has
~40+ instances), consider relaxing `exactOptionalPropertyTypes` for
the `apps/web` tsconfig only. The cost-benefit of that flag is
highest in library code, lowest in app code where props are almost
always "present or absent".

---

## 4. Architectural Observations

### 4.1 Route group boundaries are clean

The `(auth)` / `(app)` / `share/` split is correct and minimal.
`force-dynamic` is applied to chat and chart (where every render
depends on the authenticated user and live data), `revalidate` is
used for news (300s) and settings (60s), and `force-static` is used
for `/offline`. This is the right matrix.

### 4.2 Server Actions are scoped correctly

`app/(app)/settings/_actions-*.ts` co-locate server actions next to
their page, with a shared `_actions-shared.ts` for the `ActionResult`
type and rate-limit constants. Actions are properly authenticated
(`auth()` + `withRateLimit`), use `revalidatePath`, and return typed
results. `useActionState` is used in `profile-form.tsx` and
`change-password-card.tsx`. This is the correct modern Next.js
pattern.

### 4.3 Context splitting is intentional

`NavDrawerContext` and `BookmarksContext` both split into separate
`StateCtx` / `ActionsCtx` providers. This is the documented pattern
for preventing action-only consumers from re-rendering on state
change. The `NavDrawerContext` is a single global instance for a
reason: the app renders two top bars (TopBar for non-chat,
ChatTopBar for chat) and a shared context avoids stale vaul
instances. The doc comment is explicit about why. Good.

### 4.4 The `(app)/layout.tsx` does too much in one async function

`AppLayout` does: session check, onboarding redirect, admin check,
user data fetch, and renders the entire chrome tree. The
`getOnboardingStatus` is `cache()`'d which is correct, but the layout
blocks the entire authenticated shell on `auth()` + `getUserWithSettings()`
+ `checkIsAdmin()` sequentially (not in parallel). For a layout that
wraps every authenticated route, this is on the critical path of
every navigation.

**Observation, not a recommendation**: the calls aren't parallelizable
as written because `checkIsAdmin` depends on the session, but
`getUserWithSettings` and `checkIsAdmin` could be `Promise.all`'d.
This is a small win that compounds across every page load.

### 4.5 The `apiFetch`/`apiMutate` split is good but the boundary is unclear at call sites

`apiMutate` is `apiFetch` with `skipCsrf: false` forced. Since
`apiFetch` defaults to `skipCsrf: false` already, the only behavioral
difference is intent-signaling. This is fine, but the docs comment
says "mutations always need CSRF" — which is also true for `apiFetch`.
The two-function API could be collapsed into one without loss, or
`apiMutate` could enforce `method !== 'GET'` to make the distinction
meaningful.

---

## 5. Performance Observations

### 5.1 Polling strategy is well-tuned

- Price polling: 3s, paused when tab hidden/offline, paused when
  chart container scrolls out of view (IntersectionObserver, 128px
  root margin). Good.
- Per-timeframe candle polling: 5s for 1m, 30s for 5m-4h, 5min for
  1d/1w, with `staleTime = refetchInterval / 2` so cached data is
  always considered fresh within a poll window. Good.
- Adjacent-TF prefetch is debounced 2s to avoid racing on rapid TF
  switches. Good.

### 5.2 `useChartData` retry: 3 with 8s cap

`useChartData` sets `retry: 3` with exponential backoff capped at 8s.
The default QueryClient has `retry: 2`. The higher retry count is
reasonable for market data (transient provider failures are common),
but combined with the 2s debounce on adjacent-TF prefetch, a flaky
provider can stack 3 retries × 8s + prefetch attempts and saturate
the connection. Worth monitoring but not a problem today.

### 5.3 The `Message` memo comparator compares `parts[i]` by reference

`message.tsx:366` checks `prev.message.parts[i] !== next.message.parts[i]`.
This is correct **only** if the AI SDK v5 mutates `parts` immutably
(replacing the part object on each token). It does — `useChat` returns
new part objects per stream tick — but the multi-agent path
(`use-multi-agent-chat.ts`) rebuilds the assistant message's `parts`
array with `[{ type: 'text', text }]` on every flush, which is a new
array and a new part object each time. So the memo busts on every
flush (correct, since the text changed), but the comparator's
assumption about immutability is implicit, not enforced. Worth a
comment in the comparator.

### 5.4 No bundle analysis in CI

`package.json` has an `analyze` script (`ANALYZE=true next build` with
`@next/bundle-analyzer`) but it's not wired into any CI workflow I
could find. The `lightweight-charts` dynamic import is good, but
there's no guard against a future import bloating the initial bundle.

**Action**: add a bundle-size check to CI (even a simple
`next build` + `bundlesize` config on the static chunks).

---

## 6. UX and Accessibility Observations

### 6.1 Dark-only, no theme toggle

The design system is dark-only (`color-scheme: dark` in the root
layout, no light theme tokens). There's an
`app/(app)/settings/appearance/page.tsx` (46 LOC) — worth confirming
whether it's a stub for a future light theme or just a locale picker.
For a trading terminal, dark-only is a defensible choice; the
observation is that the appearance settings page exists but the
theme can't actually change.

### 6.2 `max-scale=5` on the viewport

`app/layout.tsx:57` sets `maximumScale: 5`. This is better than the
WCAG-failing `maximumScale=1`, but it still allows zoom — good. No
accessibility concern here.

### 6.3 Chat action row is hover-only on `sm:` and up

`message.tsx:251` — `opacity-100 sm:opacity-0 sm:group-hover:opacity-100
sm:focus-within:opacity-100`. The `focus-within` fallback is correct
for keyboard users. On mobile (`<sm`) the actions are always visible,
which is the right call for touch.

### 6.4 The "Regenerate with…" menu uses the native Popover API with a fallback

`message.tsx:82-103` detects `'popover' in HTMLElement.prototype` and
falls back to a manual `document.click` listener for outside-click
dismissal. The fallback cleans up its listener on unmount. This is a
good progressive-enhancement pattern.

One issue: the fallback's outside-click handler checks
`target.closest('#regen-menu-${message.id}')` and the trigger's
`data-action` attribute, but not other regen menus in the thread. If
two menus were somehow open simultaneously (shouldn't happen with the
native API, but could with the fallback), the older one wouldn't
close. Low-risk; not worth fixing unless the fallback path sees real
usage.

### 6.5 `StreamingLiveRegion` mirrors the full streamed text

`message-list.tsx:29-35` renders an `sr-only` `aria-live="polite"`
region with the **entire** streamed assistant text on every render
(it's not throttled — the `MessageList` re-renders on every
`setMessages` flush, ~10/sec). Screen readers may announce this
frequently. The throttle is on `setMessages`, not on the live region,
so the region updates at the same 10Hz as the visual.

**Observation**: this is the correct tradeoff for sighted users
(smooth streaming) but may be noisy for SR users. Consider debouncing
the live region separately (e.g. flush every 1s or on sentence
boundaries). Low priority — the region is `polite`, not `assertive`.

---

## 7. Maintainability and Scalability Assessment

### 7.1 The chat `parts/` registry is exemplary

`components/chat/parts/registry.tsx` is a `{ [K in ToolName]: ... }`
map, so adding a new tool to `TOOL_NAMES` without wiring a part is a
compile error. Each tool has a bespoke renderer with Zod-validated
output. This is the right pattern and scales well.

### 7.2 The settings page has 13 sub-routes — approaching the limit of co-location

`app/(app)/settings/` has `agent`, `api-keys`, `appearance`, `billing`,
`data`, `models`, `notifications`, `portfolio`, `profile`, `security`,
`symbols`, `telegram`, `usage` — plus the index page and 5 `_actions-*.ts`
files. The `_components/` directory has 27 files. This is a lot for one
folder; the `_actions-*.ts` split is good (domain-scoped), but the
`_components/` directory is flat and would benefit from sub-folders
matching the route structure (`_components/api-keys/`, `_components/security/`,
etc.) as it grows.

### 7.3 The `chart/` component directory is well-factored

`components/chart/` is split into `chart-canvas.tsx` (main pane),
`chart-rsi.tsx`, `chart-macd.tsx`, `chart-atr.tsx` (sub-panes),
`use-sub-pane-chart.ts` (shared hook), `overlays.ts`, `chart-themes.ts`,
`chart-colors.ts`, `chart-types.ts`. This is a clean extraction from
what the comment calls "the 939-LOC chart.tsx monolith". Good
refactor; the remaining issue is the typing gymnastics in
`chart-canvas.tsx` (see 3.4).

### 7.4 Documentation is thorough but occasionally drifts from code

Examples:
- `docs/06-frontend.md` describes an `AmbientBackground` component in
  the app layout — the current layout (`app/(app)/layout.tsx`) has no
  such component; instead there's a `TickerTape` and `InstallNudge`.
- The doc lists the providers as `NuqsAdapter → QueryProvider`, but
  the actual order in `components/providers/index.tsx` is
  `QueryProvider → NuqsAdapter → TimeProvider`.
- The doc says `refetchOnWindowFocus: false` is for "Personal mode"
  — there's no longer a "personal mode" concept in the codebase
  (multi-tenant v2.0 shipped).

These are doc-rot issues, not code issues. The code is the source of
truth. Recommend a doc refresh pass.

### 7.5 The Apache header + 18-line license block on every file adds noise

Every `.tsx`/`.ts` file starts with an 18-line Apache 2.0 header.
For a 50-line hook this is ~36% of the file. This is a stylistic
choice, not a defect, but it does impact readability during review.
A `LICENSE` file at the repo root (which exists) plus a
`.editorconfig`/`prettier`-enforced single-line header would convey
the same legal coverage.

---

## 8. Important Findings (Ordered by Priority)

### P1 — Dual chat transport will drift (§3.1)
The `useChat` / `useMultiAgentChat` split forces every chat feature to
be implemented twice. The multi-agent path already doesn't surface
tool parts or model metadata. Unify on the AI SDK v5 transport.

### P2 — `as unknown as` casts at the AI SDK part boundary (§3.3)
8 casts in `message.tsx` disable the compiler exactly where shape
drift is most likely. Add Zod schemas for the custom data parts and
`safeParse` at the boundary.

### P3 — Inconsistent `fetch` wrapper adoption (§3.2)
19 raw `fetch()` call sites bypass `apiFetch`, losing `requestId`
traceability and typed errors. Migrate to `apiMutate`/`apiFetch`.

### P4 — `ChartCanvas` typing debt (§3.4)
9 `eslint-disable` lines + multiple `as any` casts in 478 LOC. Extract
a typed `lightweight-charts` adapter module to contain the damage.

### P5 — Chat screen `xl:grid-cols-12` layout is half-wired (§3.5)
Either wire the thread sidebar into the grid or remove the dead
column-span declaration.

### P6 — No bundle-size guard in CI (§5.4)
The `analyze` script exists but isn't enforced. Add a bundle-size
check to prevent regressions.

### P7 — Documentation drift (§7.4)
`docs/06-frontend.md` describes `AmbientBackground`, wrong provider
order, and "personal mode". Refresh against the current code.

### P8 — `StreamingLiveRegion` may be noisy for SR users (§6.5)
Consider debouncing the live region separately from the visual
stream. Low priority — `polite` region, not `assertive`.

---

## 9. Refactoring Opportunities (Where They Provide Real Value)

1. **Unify the chat transport** (P1). This is the single highest-value
   refactor. It eliminates ~150 LOC of duplicated send/edit/regenerate
   logic in `ChatScreen`, removes the bespoke SSE parser, and makes
   tool parts / citations / metadata work uniformly across modes.

2. **Type the AI SDK part boundary** (P2). Add
   `packages/shared/src/chat-parts.ts` with Zod schemas for
   `data-plan`, `data-citation-warning`, `data-verify-warning`,
   `data-fallback`. `safeParse` in `renderPart`; on failure, render
   `FallbackPartView`. ~100 LOC, eliminates 8+ casts, prevents
   silent runtime breakage on server schema changes.

3. **Extract `chart/lc-adapter.ts`** (P4). Contain the
   `lightweight-charts` typing debt in one ~100-LOC module.
   `ChartCanvas` and the sub-pane components import from it;
   `as any` stays inside the adapter.

4. **Migrate raw `fetch` call sites to `apiMutate`** (P3). Mechanical
   change, ~19 sites, each ~5 LOC. The win is `requestId` in error
   toasts and typed `ApiError` branching.

5. **Parallelize `(app)/layout.tsx` data fetches** (§4.4).
   `getUserWithSettings` and `checkIsAdmin` can be `Promise.all`'d.
   Small but on the critical path of every authenticated navigation.

---

## 10. Areas That Deserve Additional Investigation

1. **The `/api/chat` route handler** — not in scope for this frontend
   audit, but the multi-agent SSE protocol (`data-agent-progress`,
   `text`, `error`, `[DONE]`) is bespoke. If the route ever emits a
   part type the client doesn't parse, it's silently dropped
   (`use-multi-agent-chat.ts:316-320` catches JSON parse errors and
   `continue`s). Worth a separate review of the route + client
   protocol contract.

2. **Service worker caching strategy** — `public/sw.js` is generated
   from a template by `scripts/generate-sw.mjs`. The
   `sw-precache.json` approach is sound, but I didn't audit the
   generated output or the cache-versioning (`hamafx-shell-v{BUILD_ID}`)
   against actual deploy behavior. A separate SW audit would confirm
   the network-first fallback chain works under real deploy
   conditions.

3. **The `performance-chart.tsx` component** (230 LOC, in
   `components/chart/`) — not reviewed in detail. It appears to be a
   separate charting surface (portfolio equity curve?). Worth
   confirming whether it shares the `ChartCanvas` infrastructure or
   duplicates it.

4. **`apps/web/scripts/generate-sw.mjs` and `set-build-id.mjs`** —
   the build pipeline has custom prebuild/postbuild steps. I didn't
   audit failure modes (e.g. what happens if `generate-sw.mjs` fails
   — does the build fail, or does it ship without a SW?).

5. **The `use-popup-menu` hook** — used by `ChatTopBar` for the
   overflow and mode menus. I reviewed the API surface but not the
   focus-trap implementation. Given it's used for the analysis-mode
   picker (a safety-relevant control for trading decisions), the
   focus management deserves a focused a11y review.

---

## Self-Review

I challenged each finding against the code evidence:

- **Dropped**: an initial note that `composer.tsx`'s `onChange` only
  calls `handleSlashChange` (not `setValue`) was going to be flagged
  as a bug. It's not — `handleSlashChange` internally calls `setValue`.
  Removed.
- **Dropped**: a concern about `useChartData` retry:3 being too
  aggressive. On reflection, 3 retries with 8s cap for market data is
  reasonable; the prefetch debounce already mitigates stacking. Kept
  as an observation (§5.2) but not a finding.
- **Softened**: the `exactOptionalPropertyTypes` observation (§3.6)
  was initially a "finding". It's a config choice with real costs but
  also real benefits (catches `undefined` vs "absent" bugs in library
  boundaries). Demoted to an observation with a config-level
  recommendation, not a code change.
- **Verified**: the `xl:grid-cols-12` half-wired layout (§3.5) —
  confirmed `ChatTopBar` and the Composer wrapper have no `col-span`,
  so the grid declaration is either unfinished or dead code.
- **Verified**: the raw `fetch()` count (§3.2) — 19 call sites
  bypassing `apiFetch`, not 30+. The audit's `lib/api-client.ts`
  comment claims "30+ components" duplicated the pattern before the
  wrapper; today's count is the residual after partial migration.
