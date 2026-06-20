HamaFX-Ai UX Upgrade Plan
============================

A sequential, carefully-scoped plan to ship the UX improvements
identified in the analysis session. Each item below is self-contained:
problem, goal, scope, implementation steps, edge cases, tests,
acceptance criteria, and explicit out-of-scope notes.

STATUS (as of 2026-06-20)
-------------------------

  Phase A (items 1–7)   ✅ DONE — commit 237969b
  Phase B (items 8–15)  ✅ DONE — commit 52d189a
  Phase C (items 16–19) ✅ DONE — commits a9c7b15 (16+18),
                                          205b632 (17),
                                          694ffb5 (19)

  Deferred (20–22)      📋 parked — not scheduled
  Not doing (23–25)     🚫 out of scope — see end of doc

  Test count grew 451 → 561 (+110 across 4 packages) over the
  three phases. See `docs/USER_FLOW.md` section 7 for the
  resulting flows.

  Items remaining as a follow-up:
    - Item 8 popover UI extension (dynamic provider tabs from
      /api/me/keys — backend `resolveOverrideModel` is shipped,
      the popover itself is still a hardcoded REGEN_MODELS list).
    - Item 20: email verification
    - Item 21: bulk journal import (CSV)
    - Item 22: thread-level public share (read-only HMAC)

Plan conventions
----------------

  Scope tags:
    [BE]      backend (API routes, server actions, packages/* logic)
    [FE]      frontend (components, pages, hooks)
    [DB]      schema change + migration
    [CRON]    worker / scheduled job change
    [TEST]    new tests required

  Phase tags:
    [A]       Quick win   — small diff, low risk, fast feedback
    [B]       Medium lift — multi-file, needs review
    [C]       Bigger lift — schema or agent-internal change

  Risk tags:
    [R0]      greenfield, no existing behaviour to break
    [R1]      touches one component, reversible
    [R2]      touches contract (API or schema), needs migration plan
    [R3]      touches the agent runtime, requires runChat test sweep

Working order — phases are sequential; within a phase, items are
independent unless noted. Do not parallelise items in different
phases — earlier items may expose preconditions later items rely on.

  Phase A — Quick wins     (items  1 –  7)
  Phase B — Medium lifts   (items  8 – 15)
  Phase C — Bigger lifts   (items 16 – 19)

  Deferred (parking lot) — items 20 – 22
  Not doing — items 23 – 25


====================================================================
PHASE A — Quick wins
====================================================================


--------------------------------------------------------------------
1. Pin / unpin symbol UI on chart and chat
--------------------------------------------------------------------

Phase:    A
Risk:     R1
Tags:     [FE] [BE]

Problem
  The `chat_threads.pinnedSymbol` column already exists. ChatTopBar
  reads `pinnedSymbol` and renders the chip; the chat deep-link
  `?prompt=…` flow auto-creates a thread with `pinnedSymbol` when
  invoked from a chart-aware surface. But there is no UI to set or
  clear a pin from inside the chat or chart surfaces — the column
  is effectively write-only today.

Goal
  User can pin / unpin a symbol from the chart view, and the pin
  persists across sessions and devices. The chat composer
  placeholder updates accordingly.

Scope
  Modify:
    apps/web/src/app/api/chat/threads/route.ts
      — POST already accepts `pinnedSymbol`. Add PATCH on
        /api/chat/threads/[id] (or extend existing) to update
        `pinnedSymbol` after creation.
    apps/web/src/app/api/chat/threads/[id]/route.ts
      — Add PATCH handler that validates the symbol against
        `SymbolSchema` and updates the row scoped by userId.
    apps/web/src/app/(app)/chart/[symbol]/_components/chart-view.tsx
      — Add a "Pin to chat" button next to SymbolPicker. Tap
        creates a fresh thread with pinnedSymbol=symbol and
        navigates to /chat/[id]?prompt=Ask+about+{symbol}.
    apps/web/src/components/chat/chat-top-bar.tsx
      — Add an unpin affordance to the existing symbol chip
        (small ✕ icon visible on hover/tap). Calls PATCH with
        pinnedSymbol=null and refreshes the thread state.
  Add:
    apps/web/src/components/ui/symbol-chip.tsx
      — Reusable chip with optional onClear callback, used by
        ChatTopBar and ChartView.
    apps/web/src/app/api/chat/threads/[id]/route.test.ts
      — Verify PATCH: happy path, invalid symbol, IDOR (other
        user's thread returns 404).

Implementation steps
  1. Read SymbolSchema in @hamafx/shared (already exists).
  2. Implement PATCH handler. Zod body: { pinnedSymbol: SymbolSchema
     | null }. SQL: UPDATE chat_threads SET pinnedSymbol = ? WHERE
     id = ? AND userId = ?. Return updated thread.
  3. Export SymbolChip from new file. Style matches existing chip
     in ChatTopBar (brand/15 background, ring-brand/30, caption font).
  4. In ChartView, render a small IconButton (Pin / PinOff from
     lucide-react) beside SymbolPicker. Disabled while pending.
     Tap → POST /api/chat/threads { pinnedSymbol } → router.push.
  5. In ChatTopBar, when pinnedSymbol is set, the existing chip
     becomes a button with onClear. On clear → PATCH null → router
     refresh to repaint.
  6. Update ThreadSummary interface in chat-top-bar.tsx so the
     server component re-passes the updated pinnedSymbol.

Edge cases
  - User pins while a thread is streaming: PATCH does not cancel
    the stream; only updates the title-bar chip on next render.
  - User clears pin mid-conversation: subsequent messages are no
    longer symbol-scoped; quick prompts switch to the un-pinned
    variant.
  - Network failure on PATCH: button re-enables, toast.error.
  - Symbol not in SYMBOLS: server returns 400, UI ignores.

Tests
  - Unit: PATCH route — happy path, bad symbol, IDOR, missing
    auth.
  - Component: SymbolChip renders both states, onClear fires.
  - Component: ChatTopBar unpin button calls PATCH with null.

Acceptance criteria
  - User can pin any symbol from /chart/[symbol] in ≤ 2 taps.
  - Pin survives page reload.
  - Unpin removes the chip and updates composer placeholder
    within one render.
  - All existing chat tests still pass.

Out of scope
  - Multi-symbol pinning (one pin per thread).
  - Auto-pin based on chart activity.
  - Pinning from /news or /calendar (separate follow-up).


--------------------------------------------------------------------
2. Char count visible on composer at all times
--------------------------------------------------------------------

Phase:    A
Risk:     R0
Tags:     [FE]

Problem
  apps/web/src/components/chat/composer.tsx has a hard cap of 8000
  chars (MAX_TEXT_CHARS) and a soft warning at 7500
  (SOFT_LIMIT_CHARS), but the count is not shown until near the
  cap. Users hit the limit and don't know how much room is left.

Goal
  Composer displays "1234 / 8000" in the meta row always. Color
  shifts to amber at 7500, red at 8000. No layout shift — meta
  row already exists.

Scope
  Modify:
    apps/web/src/components/chat/composer.tsx
      — Render count in the existing meta row (currently empty /
        shows "Enter to send" hint on desktop focus only).
  No API changes.

Implementation steps
  1. Compute `count = value.length` once per render.
  2. Render `${count.toLocaleString()} / 8000` in the meta row,
     right-aligned, text-caption, fg-subtle by default.
  3. At count ≥ 7500: text-amber-400, font-medium.
  4. At count ≥ 8000: text-bear, font-semibold.
  5. When `focused && !isTouch && count < 7500`, the existing
     "Enter to send · Shift+Enter for new line" hint stays; the
     count lives on the right of the same flex row, separated by
     `ml-auto`.

Edge cases
  - IME composition (CJK, emoji): use `value.length` not bytes.
    Count is characters not graphemes — acceptable since the
    cap is a UX guard, not a storage limit.
  - Pasting 10000 chars: composer already clamps to max; count
    shows the clamped value.
  - Voice input: counts update incrementally as the Web Speech
    result appends.

Tests
  - Component: renders "0 / 8000" initially; updates on type;
    color shifts at thresholds.

Acceptance criteria
  - Count visible on every render of the composer.
  - No layout shift between states.
  - Color thresholds match the existing SOFT_LIMIT_CHARS and
    MAX_TEXT_CHARS constants.

Out of scope
  - Per-byte budgets (would need different cap model).
  - Token estimate (would need tokenizer — too expensive in
    client).


--------------------------------------------------------------------
3. Context-aware quick prompts (incl. time-of-day)
--------------------------------------------------------------------

Phase:    A
Risk:     R1
Tags:     [FE]

Problem
  apps/web/src/components/chat/quick-prompts.tsx renders 5 hard-
  coded chips. They don't change based on time, pinned symbol,
  recent tool usage, or weekday. Two users opening the same
  empty state at NY open and Asian close see identical prompts.

Goal
  QuickPrompts adapt to (a) pinned symbol, (b) current trading
  session (Asian / London / NY / overlap / closed), (c) weekday.
  Two-line change for chip text, no API call.

Scope
  Modify:
    apps/web/src/components/chat/quick-prompts.tsx
      — Accept optional `pinnedSymbol` and `tz` props (already
        in EmptyChatState; pass them down).
      — Build a small session helper inline or in
        apps/web/src/lib/session.ts (new file).
  Add:
    apps/web/src/lib/session.ts
      — `getSessionInfo(d: Date, tz: string): SessionInfo` returning
        { session: 'asian'|'london'|'ny'|'overlap'|'closed',
          weekday: 0..6,
          label: 'Asian'|'London'|'NY'|... }.
      — Cutoffs (UTC):
          Asian  : 00:00 – 07:00
          London : 07:00 – 12:00
          NY     : 12:00 – 17:00
          Overlap: 12:00 – 16:00 (NY open during London) — fold
                   into NY for prompt text
          Closed : Fri 22:00 – Sun 22:00 (weekend) — label
                   "Weekend"
      — Pure function, no I/O. Vitest unit tests.

Implementation steps
  1. Create session.ts with the helper and a constant list of
     prompt templates keyed by (session, hasPin).
  2. Define a small PromptSpec[] = { icon, text }[]. Variants:
       no-pin / asian      → "What's moving in Asia today?"
       no-pin / london     → "London open — bias on majors?"
       no-pin / ny         → "NY session plan for XAUUSD"
       no-pin / weekend    → "Weekly bias — what's your read?"
       pin=XAUUSD / london → "London reaction on XAU?"
       pin=XAUUSD / ny     → "NY open plan for XAUUSD?"
       pin=EURUSD / ...    → analogous
       pin=GBPUSD / ...    → analogous
  3. In QuickPrompts, take props { pinnedSymbol?: Symbol|null,
     tz?: string }. If absent, default to no-pin / session
     derived from `new Date()`.
  4. Slice to first 5. Keep existing chip layout and onSelect.

Edge cases
  - User changes tz in settings but cache holds old one — always
    read from userSettings on the server (pass tz as prop) so
    no client clock skew.
  - DST: session.ts uses Date methods on a Date constructed with
    the user tz; verify with a vitest parametrised test across
    DST boundaries.
  - Pinned symbol is one not in SYMBOLS (legacy data): fall
    back to no-pin.

Tests
  - session.ts: hour boundary cases, weekend detection, DST.
  - QuickPrompts: renders 5 chips, picks correct variant for
    pinnedSymbol × session combos.

Acceptance criteria
  - Prompts change when user crosses a session boundary (visible
    if they leave the tab open across 07:00 / 12:00 / 17:00 UTC).
  - Prompts change when pinnedSymbol changes.
  - No regression in existing QuickPrompts onSelect behavior.

Out of scope
  - Localised prompt text (English only for now).
  - News-driven prompts ("Fed decision in 2h — risk on gold?").
    Requires news signal in client state — separate item.


--------------------------------------------------------------------
4. Auto-redirect to /settings/api-keys on missing provider
--------------------------------------------------------------------

Phase:    A
Risk:     R1
Tags:     [FE] [BE]

Problem
  Onboarding's step 3 has a "Skip for now" link. If the user
  skips, `userSettings.aiApiKeys` is null. The first chat turn
  fails with a generic 503 / providerUnavailable error. Users
  don't know what happened or where to fix it.

Goal
  When a logged-in user lands on /chat with no AI provider key
  configured, redirect them to /settings/api-keys with a one-line
  banner explaining what to do.

Scope
  Modify:
    apps/web/src/app/(app)/chat/page.tsx
      — After auth check, query userSettings.aiApiKeys. If null
        or empty after decrypt, redirect /settings/api-keys?from=chat.
    apps/web/src/app/(app)/settings/api-keys/page.tsx
      — Accept searchParams.from and render a DismissibleBanner
        at the top: "No AI provider is configured. Add a key to
        start chatting."

Implementation steps
  1. In chat/page.tsx, do a single SELECT aiApiKeys FROM
     userSettings WHERE userId = ?. Use the existing decryptByok
     helper. If decrypt result is empty object, redirect.
  2. Pass searchParams in api-keys/page.tsx; conditionally
     render <Banner> at the top of the form.
  3. Banner component: existing /components/ui/banner.tsx (if
     not present, create as a one-shot). Dismissible via local-
     Storage key `hfx_banner_dismissed:api-keys-from-chat`.
  4. Do NOT touch /onboarding flow — that already handles the
     first-run case explicitly.

Edge cases
  - User has key but it's invalid (Test Connection failed):
    we cannot detect this from chat/page.tsx cheaply. Out of
    scope here — let the 503 surface as today.
  - User is mid-streaming in another tab: redirecting will
    not abort the other stream (separate tab has its own
    state).
  - User dismissed the banner once; the redirect still happens
    but they don't see the banner. Acceptable.

Tests
  - chat/page.tsx redirect: missing key → /settings/api-keys;
    valid key → /chat/[latest].
  - api-keys page: banner renders when ?from=chat and not
    dismissed.

Acceptance criteria
  - First-time skip-onboarding users land on /settings/api-keys
    automatically on their first /chat visit.
  - Returning users with keys still land on /chat/[latest].
  - Banner is dismissible and not shown again after dismissal.

Out of scope
  - Validating the key (Test Connection) before redirecting.
  - Linking directly to a specific provider card.


--------------------------------------------------------------------
5. Bulk delete threads
--------------------------------------------------------------------

Phase:    A
Risk:     R1
Tags:     [FE] [BE]

Problem
  ThreadSwitcher in ChatTopBar shows a list and per-thread delete
  via the ⋯ menu. For users with many threads, deleting one at a
  time is painful.

Goal
  In ThreadSwitcher, when there are >5 threads, surface a "select
  mode" toggle. User can tap multiple threads, then "Delete
  selected" with a confirm drawer.

Scope
  Modify:
    apps/web/src/components/chat/chat-top-bar.tsx
      — ThreadSwitcher accepts `selectMode` boolean state.
      — Each list row renders a checkbox in selectMode.
      — Footer bar appears with "Delete selected (N)" + Cancel.
    apps/web/src/app/api/chat/threads/[id]/route.ts
      — Already has DELETE. Add a new POST
        /api/chat/threads/bulk-delete accepting { ids: string[] }
        with max 50 ids per request. Delete in a single SQL
        statement scoped by userId; return deleted count.
  Add:
    apps/web/src/app/api/chat/threads/bulk-delete/route.ts
    apps/web/src/app/api/chat/threads/bulk-delete/route.test.ts

Implementation steps
  1. Add the bulk route handler. Body zod schema:
     { ids: z.array(z.string().uuid()).min(1).max(50) }.
     DELETE FROM chat_threads WHERE userId = ? AND id = ANY(?).
     Return { deleted: number }.
  2. In ThreadSwitcher, add "Select" toggle (visible when
     threads.length > 5). State: selectedIds: Set<string>.
  3. Each row: on tap in selectMode → toggle id in set; on tap
     not in selectMode → existing push behavior.
  4. Footer: "Delete selected (N)" disabled when N === 0.
     On tap → confirm drawer → fetchCsrf POST bulk-delete →
     router.refresh + toast.
  5. Cancel button clears set and exits selectMode.

Edge cases
  - User deletes current thread via bulk: handle by routing to
    /chat (which will redirect to next-most-recent or create a
    new one).
  - 50-id cap: error → toast with "Select 50 or fewer".
  - Some ids belong to another user: silently skipped (scoped
    by userId in WHERE). deleted count reflects only owned rows.
  - Confirm drawer already covers accidental delete.

Tests
  - bulk-delete route: happy path, cap, IDOR, missing ids.
  - ThreadSwitcher select mode: toggle, footer count, delete
    flow.

Acceptance criteria
  - Bulk delete works for 1-50 selected threads.
  - Other-user threads in the selection are silently skipped.
  - UI returns to clean state on success or cancel.
  - All existing single-delete behavior unchanged.

Out of scope
  - Bulk archive (vs delete). Archive would need a new column.
  - Bulk export — separate thread export item.


--------------------------------------------------------------------
6. Custom instructions presets on AIPrefsCard
--------------------------------------------------------------------

Phase:    A
Risk:     R0
Tags:     [FE]

Problem
  AIPrefsCard lets users write free-text custom instructions for
  the agent. Most users won't know what to write. Empty input is
  common.

Goal
  Below the textarea, render 5 preset chips. Clicking populates
  the textarea (still editable). Presets cover common personas.

Scope
  Modify:
    apps/web/src/app/(app)/settings/_components/ai-prefs-card.tsx
      — Add chip row above or below the textarea.

Implementation steps
  1. Define PRESETS: const array of { id, label, prompt }:
       { id: 'concise', label: 'Be concise',
         prompt: 'Reply in 2-3 sentences max. Lead with the answer.' },
       { id: 'technical', label: 'Be technical',
         prompt: 'Use precise terminology. Cite indicator names and ' +
                 'timeframes explicitly. Show your reasoning.' },
       { id: 'challenge', label: 'Challenge my bias',
         prompt: 'When I state a directional view, give me the ' +
                 'strongest counter-argument before agreeing.' },
       { id: 'sources', label: 'Cite sources inline',
         prompt: 'After every factual claim, cite the tool or data ' +
                 'point that supports it.' },
       { id: 'risk', label: 'Risk-first',
         prompt: 'For any trade idea, lead with position sizing, ' +
                 'stop placement, and R:R. Bias toward capital ' +
                 'preservation.' },
  2. Render chips in a flex-wrap row. Click → setLocalStorage
     'hamafx:ai-prefs' customInstructions = preset.prompt +
     (existing append logic preserved). Visual: same chip style
     as QuickPrompts.
  3. "Clear" button removes preset text. Reset to empty.

Edge cases
  - User already has custom text: prompt before overwrite
    ("Replace existing instructions?"). Single confirm.
  - User clicks preset twice: idempotent.
  - Presets can be combined (click multiple → join with newline).
    Decision: each preset click replaces; "Append" button (small)
    appends to existing.

Tests
  - Component: chip click populates textarea; Clear empties.
  - localStorage round-trip: write → reload → read.

Acceptance criteria
  - 5 presets visible.
  - Clicking one writes to the same storage key the chat already
    reads from (hamafx:ai-prefs).
  - Existing free-text editing still works.

Out of scope
  - User-defined custom presets (would need a presets table).
  - Syncing presets across devices (localStorage is per-device).


--------------------------------------------------------------------
7. Provider health badge on api-keys page
--------------------------------------------------------------------

Phase:    A
Risk:     R1
Tags:     [FE] [BE]

Problem
  /settings/api-keys lists 8 provider cards. User can't tell at a
  glance which key is currently working, which is stale, which
  is invalid.

Goal
  Each provider card shows a small colored dot:
    green  — last test <24h ago and passed
    yellow — last test 24-168h ago and passed
    red    — last test failed (any time)
    grey   — never tested

Scope
  Modify:
    apps/web/src/app/(app)/settings/api-keys/page.tsx
      — Read last test status from a new column.
    apps/web/src/app/api/settings/test-provider/route.ts
      — On test, write the result + timestamp to user_settings
        (or a new user_provider_tests table).
  Add:
    packages/db migration adding user_provider_tests
      (userId, providerId, ok, error?, testedAt).
  Add:
    apps/web/src/app/(app)/settings/api-keys/_components/api-key-card.tsx
      — Render <HealthBadge> in the card header.

Implementation steps
  1. Migration: CREATE TABLE user_provider_tests (
        userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        providerId TEXT NOT NULL,
        ok BOOLEAN NOT NULL,
        error TEXT,
        testedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (userId, providerId)
     );
  2. After test-provider returns, upsert the row.
  3. api-keys page loads the latest row per provider for the user
     and passes `health` to each ApiKeyCard.
  4. HealthBadge component: 8px circle, color as above. Tooltip
     shows last tested time + error message if any.

Edge cases
  - User has key but never tested: grey dot. Tooltip "Not yet
    tested — click Test to verify."
  - Test fails because of network (not bad key): yellow with
    tooltip "Network error — retry".

Tests
  - test-provider route: writes upsert; idempotent on rerun.
  - api-keys page: badge color matches stored state.

Acceptance criteria
  - Dot updates within one render of a Test action.
  - No background cron needed (lazy: test on user demand).

Out of scope
  - Automatic background re-test. Would require a worker job
    and is overkill for v1.


====================================================================
PHASE B — Medium lifts
====================================================================


--------------------------------------------------------------------
8. Regenerate with different provider
--------------------------------------------------------------------

Phase:    B
Risk:     R2
Tags:     [FE] [BE]

Problem
  The message-hover popover offers three model tiers (Lite /
  Flash / Pro — all Gemini per docs/06-frontend.md). Users with
  Claude or GPT-4o keys can't regenerate with those models.

Goal
  When the user has BYOK keys for other providers, the popover
  surfaces a submenu per provider showing that provider's
  default models. Picking one sets modelOverride accordingly.

Scope
  Modify:
    apps/web/src/components/chat/message.tsx
      — Extend the popover. Pull list of providers with valid
        keys from localStorage mirror (or new /api/me/keys).
    apps/web/src/app/api/chat/route.ts
      — Already accepts modelOverride as a string. No change.
    packages/ai/src/agent.ts
      — In resolveModel, when modelOverride is set, also accept
        "provider:model" syntax (e.g. "anthropic:claude-sonnet-4-
        20250514"). Look up BYOK_PROVIDERS[id] and call factory.
  Add:
    apps/web/src/app/api/me/keys/route.ts
      — GET → list providers the user has a key for, no key
        values returned. Cached 60s on client.

Implementation steps
  1. Add /api/me/keys. Server reads user_settings.aiApiKeys,
     decryptByok, returns list of present provider ids.
  2. Client caches the result in React Query (5min staleTime).
  3. Message popover: above the existing model tier buttons,
     if more than one provider is available, show provider
     tabs (Google / Anthropic / OpenAI ...). Each tab shows
     that provider's defaultModels keys.
  4. Pick → modelOverrideRef.current =
     `${providerId}:${modelId}` (or empty string for default
     domain model).
  5. resolveModel: parse modelOverride. If "provider:model",
     load BYOK key from session, factory(modelId). Cache the
     resolved LanguageModel per (provider, model, keyHash).
  6. If provider has no key at request time, fall back to
     default domain model (covered by item 15 — auto-fallback).

Edge cases
  - User picks Claude but Anthropic key is invalid: same path
    as item 15 (auto-fallback). Popover shows a yellow toast:
    "Override unavailable, used <default>."
  - modelOverride for vision-only model on a text question:
    falls back to technical model (existing behavior).
  - User has 8 keys: popover is long. Use a 2-column grid for
    provider tabs on sm+.

Tests
  - /api/me/keys: empty key, single key, all 8 keys.
  - resolveModel: parses "provider:model", rejects unknown
    provider, falls back when key missing.
  - Component: popover renders N tabs when N providers present.

Acceptance criteria
  - User with 2+ providers can regenerate with each.
  - Model override round-trips through /api/chat and back into
    useChat without a re-render storm.

Out of scope
  - Per-message model pinning (would need a column on
    chat_messages).
  - BYOK provider health check from this popover (separate
    item).


--------------------------------------------------------------------
9. Inline citation drill-down
--------------------------------------------------------------------

Phase:    B
Risk:     R2
Tags:     [FE] [BE]

Problem
  CitationWarning part renders when enforceCitations() flags a
  claim without a supporting tool call. The user sees "Claim X
  is not supported" but cannot see WHY or WHICH data was
  missing.

Goal
  The warning card becomes expandable. Expanded view lists the
  claims flagged, the tool calls that were made, and which
  specific claim has no matching tool.

Scope
  Modify:
    apps/web/src/components/chat/parts/citation-warning.tsx
      — Already renders warning text. Add collapsible body.
    packages/ai/src/verification.ts
      — Currently returns a boolean / warning text. Extend to
        return structured findings:
        { claims: Array<{ text, supported: boolean,
                          supportingToolCallId?: string }> }
  Add:
    apps/web/src/components/chat/parts/citation-warning-details.tsx
      — Render the findings list.

Implementation steps
  1. Refactor enforceCitations() to return structured output.
    Backward compat: still produces a textual warning, but now
    also stores the findings array in the part's data payload.
  2. CitationWarningPartView reads the structured findings. If
    `claims.length > 0`, show "Details ▾" toggle.
  3. Expanded view: bullet list of claims; supported ones in
    fg-muted with the tool call id in monospace, unsupported
    ones in bear color.
  4. Click a supported claim → scroll to the corresponding tool
    card (if rendered above).
  5. Persist the structured payload in chat_messages.parts JSON
    — backward-compatible (old parts render fine without it).

Edge cases
  - Warning fires but no claims array (legacy data): fallback
    to existing plain text view.
  - Many claims (>20): collapse to "Show first 10" with
    expand-all button.
  - User disabled citation enforcement (env flag): no part
    emitted; nothing to render.

Tests
  - verification.test.ts: returns findings for fabricated
    numbers, empty findings for clean answers.
  - Component: toggle expands and collapses; click claim
    scrolls.

Acceptance criteria
  - Citation warnings are actionable: user can see what's wrong.
  - No regression for users on legacy warning parts.

Out of scope
  - LLM self-correction: re-running the turn to fix unsupported
    claims. That's an agent-level behavior change.


--------------------------------------------------------------------
10. Alert preview ("would this have fired?")
--------------------------------------------------------------------

Phase:    B
Risk:     R2
Tags:     [FE] [BE] [CRON]

Problem
  AlertForm has no historical signal. Users set thresholds blind.
  "Alert me when XAUUSD crosses 2400" — would that have fired
  3 times last month? 30 times? Never?

Goal
  When the user fills in a rule in AlertForm, the form displays
  a live preview: "This rule would have fired N times in the
  last 90 days. Average hold: Xh."

Scope
  Modify:
    apps/web/src/app/(app)/alerts/_components/alert-form.tsx
      — After rule is valid, debounce-fetch the preview.
    apps/web/src/app/api/alerts/preview/route.ts (new)
      — Accepts rule, scans historical candles/ticks for the
        symbol × tf, returns counts.
  Add:
    packages/ai/src/tools/set-alert.ts
      — Expose a pure `simulateRule(rule, lookbackDays)` function
        for the route to call.

Implementation steps
  1. Implement simulateRule(rule, lookback=90) in packages/ai
     (or packages/data — pick whichever already owns the
     historical fetch). Pure function: takes a rule, returns
     { fires: Array<{ at: ISO, price: number }>, count: number }.
  2. POST /api/alerts/preview. Body: AlertRuleSchema + optional
     lookbackDays (default 90, max 365). Validates user auth.
     Calls simulateRule. Returns { fires, count, avgHoldMs }.
  3. AlertForm subscribes to rule changes; debounces 400ms; GETs
     the preview. Renders below the rule inputs:
       "Would have fired N times in last 90 days.
        Average hold: Xh Ym."
     Empty state: "No historical fires."
  4. Cache by (userId, ruleHash) for 5min — same rule re-typed
     shouldn't re-fetch.

Edge cases
  - User picks a tf with no history (e.g. 1w on a new symbol):
    return count: 0, no error.
  - Network slow: debounce hides preview; show "..." until
    response.
  - Rule references an indicator not in COMMON_INDICATORS:
    preview returns null; UI shows "Preview unavailable for
    this rule."

Tests
  - simulateRule unit: known fixture → known fires.
  - /api/alerts/preview: auth, validation, rate-limit (10/min).
  - AlertForm: preview renders, debounces, updates on rule edit.

Acceptance criteria
  - Preview is visible for at least priceCross and candleClose
    rule types. indicatorCross: best-effort.
  - Preview never blocks form submission.

Out of scope
  - Visualisation of fire times (chart with markers). Would
    require chart embedding in the form drawer.


--------------------------------------------------------------------
11. Keyboard shortcut palette (cmd-K)
--------------------------------------------------------------------

Phase:    B
Risk:     R1
Tags:     [FE]

Problem
  No global keyboard map. Power users on desktop have to click
  around. Mobile users get nothing.

Goal
  Press ⌘K / Ctrl-K → open a vaul-based command palette. Type
  to fuzzy-search. Enter to navigate. Esc to close. Mobile gets
  a floating "Quick switch" button instead.

Scope
  Modify:
    apps/web/src/app/(app)/layout.tsx
      — Add <CommandPalette> at the same level as <NavDrawer>.
    apps/web/src/components/layout/command-palette.tsx (new)
      — Cmd-K listener via useEffect. Renders Drawer with input
        + results list.
  Add:
    apps/web/src/components/layout/command-palette-registry.ts
      — Static list of commands: navigate, new chat, new alert,
        new trade, settings deep links. Each command has { id,
        label, group, shortcut?, action }.

Implementation steps
  1. Define ~25 commands. Group: Navigation, Create, Settings,
     Recent threads (last 5 from localStorage cache).
  2. Use cmdk (npm package, already popular for this) — small
     dep. Or roll a simple fuzzy match (fuse.js already in
     tree? check). Decision: use cmdk for accessibility and
     keyboard nav out of the box.
  3. Listener: window.addEventListener('keydown', e => (e.metaKey
     || e.ctrlKey) && e.key === 'k'). Prevent default. Toggle.
  4. Drawer mounted in (app) layout. Focused input on open.
  5. Mobile fallback: floating button bottom-right (above
     Composer on /chat) that opens the same palette.

Edge cases
  - User typing in an input field: ⌘K still works (global),
    but does not steal the keystroke from the input.
  - /chat page: ⌘K conflicts with browser ⌘K (focus URL bar)?
    No — ⌘K is reserved for the palette here; if browser
    intercepts, accept that (Safari macOS does this).
  - Palette open during streaming: not blocked — streaming
    continues, palette floats above.

Tests
  - Listener registers / deregisters on mount.
  - Fuzzy match ranks commands correctly.
  - Enter triggers action and closes palette.
  - Esc closes without action.

Acceptance criteria
  - ⌘K opens palette from any authenticated route.
  - Search filters in <16ms for typical queries.
  - Mobile users get the floating button instead.

Out of scope
  - Custom user commands (would need a settings UI).
  - Palette-driven model selection (covered by item 8).


--------------------------------------------------------------------
12. PWA install nudge
--------------------------------------------------------------------

Phase:    B
Risk:     R1
Tags:     [FE]

Problem
  PWA manifest exists; SwRegister registers the service worker.
  But the user is never told they can install. iOS users in
  particular don't know to tap Share → Add to Home Screen.

Goal
  Detect the beforeinstallprompt event (Chrome / Edge / Android).
  Render a one-time nudge in NavDrawer footer. iOS: detect via
  standalone mode false and show a small banner with instructions.

Scope
  Modify:
    apps/web/src/components/layout/nav-drawer.tsx
      — Add <InstallNudge> at footer, above the Sign out button.
  Add:
    apps/web/src/components/layout/install-nudge.tsx
      — Listens for beforeinstallprompt, holds the deferred
        prompt, renders a button. Tracks dismissed state in
        localStorage `hfx_install_dismissed`.

Implementation steps
  1. Component mounts, attaches window 'beforeinstallprompt'
     listener, calls preventDefault, stashes the event.
  2. If event fired AND not dismissed AND not already
     standalone → render card with "Install HamaFX-Ai" button.
  3. Button tap → event.prompt() → await userChoice → if
     accepted, hide forever; if dismissed, set localStorage
     flag and hide.
  4. iOS detection: navigator.userAgent includes iPhone|iPad
     AND !window.matchMedia('(display-mode: standalone)').matches
     → render text-only hint "Tap Share → Add to Home Screen".
  5. SSR-safe: all checks in useEffect.

Edge cases
  - Already installed: window.matchMedia('(display-mode:
    standalone)').matches → no nudge.
  - Event never fires (Safari): no nudge on desktop Safari.
  - User dismissed 3 times: don't show again (cap in
    localStorage count).

Tests
  - Component: shows on simulated beforeinstallprompt, hides
    after dismiss.

Acceptance criteria
  - Chrome on Android: nudge appears within 5s of first visit.
  - iOS Safari: instruction banner appears.
  - After install or dismiss, no re-show.

Out of scope
  - iOS native install prompt (Apple doesn't ship one).


--------------------------------------------------------------------
13. Stats depth on /journal
--------------------------------------------------------------------

Phase:    B
Risk:     R2
Tags:     [FE] [BE]

Problem
  Journal view shows win rate, R-multiple, expectancy. Missing:
  max drawdown, longest win/loss streak, profit factor, avg hold
  time, expectancy by day-of-week.

Goal
  Add 6 stat tiles below the existing summary. Backed by a single
  SQL aggregation query (or 6 small ones if simpler).

Scope
  Modify:
    apps/web/src/app/(app)/journal/_components/journal-view.tsx
      — Render 6 new <StatTile> components.
    apps/web/src/app/api/journal/stats/route.ts (new)
      — GET → returns the 6 stats + per-day-of-week breakdown.

Implementation steps
  1. Define the SQL (Postgres):
       - max_drawdown: window over R-multiples, max(loss
         accumulation) vs peak.
       - longest_win_streak / longest_loss_streak: window
         function over win boolean.
       - profit_factor: sum(winning R) / abs(sum(losing R)).
       - avg_hold_minutes: AVG(EXTRACT EPOCH (closedAt -
         openedAt)) / 60.
       - per_dow: GROUP BY EXTRACT(DOW FROM openedAt).
  2. PGlite note: EXTRACT and window functions work in PGlite.
     No pgvector needed.
  3. Route returns JSON. Cache-Control: private, max-age=60.
  4. Frontend: 6 tiles in a 2-column grid on mobile, 3-column
     on sm+. Each tile: label, value, helper text.
  5. Per-DOW bar chart: 7 bars, monochrome, height-proportional
     to expectancy per day.

Edge cases
  - 0 closed trades: all tiles show "—" not "0".
  - All wins / all losses: profit_factor is Infinity or 0; show
    "—" instead.
  - Time zone: openedAt stored as UTC; convert to user tz before
    grouping by DOW.

Tests
  - SQL: known fixture of 10 trades → known stats.
  - Component: empty state, partial data.

Acceptance criteria
  - 6 stats render for any user with ≥1 closed trade.
  - Empty state is graceful.
  - Query runs in <100ms for users with up to 1000 trades
    (add index on userId, openedAt).

Out of scope
  - Equity curve chart (would need a charting dep here).
  - Export stats to CSV.


--------------------------------------------------------------------
14. Thread export (markdown)
--------------------------------------------------------------------

Phase:    B
Risk:     R1
Tags:     [FE] [BE]

Problem
  Users build long investigations over weeks. No way to back up
  or move them.

Goal
  ThreadSwitcher ⋯ menu adds "Export as Markdown". Server returns
  a .md file with the full conversation including tool parts
  rendered as code blocks.

Scope
  Add:
    apps/web/src/app/api/chat/threads/[id]/export/route.ts
      — GET ?format=md (default) → returns text/markdown with
        Content-Disposition: attachment.
  Modify:
    apps/web/src/components/chat/chat-top-bar.tsx
      — ThreadSwitcher ⋯ menu adds the export item.

Implementation steps
  1. Server fetches thread + messages scoped by userId.
  2. Renders markdown:
       # <thread title>
       _Exported YYYY-MM-DD HH:mm UTC from HamaFX-Ai_

       ## <user message>
       <text or code>

       ## Assistant · <model> · <timestamp>
       <text>
       > tool: get_price
       > XAUUSD @ 2398.42
       ...
  3. Tool parts render as fenced code blocks with their JSON
     output.
  4. Citations / warnings render as blockquotes.
  5. Filename: `hamafx-<thread-id-slug>-YYYYMMDD.md`.

Edge cases
  - Thread with 1000+ messages: stream the response (chunked
    transfer) or paginate. Decision: hard-cap at 500 messages,
    include note "(truncated to 500)".
  - User without access to thread (other user's): 404.
  - Special chars in messages: escape markdown metachars
    (use a small escape function, not a full lib).

Tests
  - Route: auth, ownership, format.
  - Component: button click triggers download.

Acceptance criteria
  - One-click export of any thread the user owns.
  - Markdown is valid and renders cleanly in any MD viewer.

Out of scope
  - JSON export, PDF export.
  - Re-import (would need a thread-from-markup parser).


--------------------------------------------------------------------
15. Auto-fallback when model override unavailable
--------------------------------------------------------------------

Phase:    B
Risk:     R3
Tags:     [BE]

Problem
  Item 8 lets users pick a provider/model for regenerate. If
  the chosen model's API key is invalid or rate-limited, the
  whole turn fails — the user sees a generic 503 and has to
  retry manually.

Goal
  When a modelOverride fails (provider 4xx/5xx, rate limit, or
  invalid key), agent automatically retries with the default
  domain model. Surfaces a yellow note in the stream indicating
  the fallback happened.

Scope
  Modify:
    packages/ai/src/agent.ts
      — In streamText wrapper, catch known provider errors.
      If the error is recoverable (rate limit, 5xx, auth),
      retry once with the resolved default model for the
      classified domain.
  Add:
    packages/ai/src/fallback.ts
      — Pure function: shouldFallback(err): { fallback: boolean,
       reason?: string }. Encodes the retry policy.

Implementation steps
  1. Define the retry policy:
       - 429 (rate limit) → fallback.
       - 401/403 (auth)   → fallback (and surface "invalid key"
         in the yellow note).
       - 5xx               → fallback.
       - 400 (bad request) → do NOT fallback; surface error.
       - Network timeout   → fallback (one retry).
  2. Agent runChat wraps the streamText call:
       try { stream with override }
       catch (err) {
         if (shouldFallback(err)) {
           const defaultModel = resolveModel({ domain: ... })
           yield a transient part: { kind: 'data-fallback',
             reason: err.reason, fallbackTo: defaultModel }
           stream with defaultModel
         } else throw
       }
  3. New part type data-fallback. Render in ChatScreen with
     yellow tone: "Override unavailable, used <default>."
  4. After fallback, do NOT retry the override again this turn
     (avoid double-billing). Persist a marker in chat_messages
     so audit log captures it.

Edge cases
  - Override AND default both fail: surface the second error
    as today.
  - Fallback also over budget: BudgetExceededError propagates
    as today.
  - Stream had partial output before failure: persist what
    arrived, mark turn as incomplete, attach fallback note.

Tests
  - fallback.ts unit: maps each error type to correct decision.
  - agent.ts integration: mocked provider returns 429 →
    fallback fires, part emitted, default model used.
  - Component: data-fallback part renders.

Acceptance criteria
  - User with broken override gets an answer, not an error.
  - Fallback is visible (yellow note) so user knows to fix
    their key.
  - No double-billing on the override attempt.

Out of scope
  - Multi-step fallback chains (override → default → another
    provider). One fallback only.


====================================================================
PHASE C — Bigger lifts
====================================================================


--------------------------------------------------------------------
16. Onboarding tooltips on provider cards
--------------------------------------------------------------------

Phase:    C
Risk:     R0
Tags:     [FE]

Problem
  Provider cards in the onboarding wizard show displayName +
  description (from BYOK_PROVIDERS_LIST). The description is
  one line and dense. Users skip without understanding the
  tradeoff.

Goal
  Each provider card renders a small info icon (ⓘ). Hover/tap
  opens a tooltip with: pricing detail, vision support,
  embedding support, a one-line "best for" tag.

Scope
  Modify:
    apps/web/src/components/onboarding/wizard.tsx
      — Card button now contains a small ⓘ at top-right.
    apps/web/src/components/ui/info-tooltip.tsx (new)
      — Radix Tooltip wrapper styled to match design system.
  Modify:
    packages/shared/src/byok.ts
      — ProviderMeta: add `bestFor: string` and `supports:
        { vision: boolean, embedding: boolean }`.

Implementation steps
  1. Extend ByokProviderSpec with bestFor (e.g. "Long context",
     "Open-source", "Low cost") and supports (vision, embedding)
     flags. Update each of the 8 specs.
  2. Update toClientMeta in onboarding/page.tsx to project the
     new fields.
  3. InfoTooltip: Radix Tooltip with side="top", max-width 240,
     glass-subtle style.
  4. Card layout: ⓘ icon absolutely positioned, button still
     receives the click for selection.
  5. Tooltip content: "Best for: <bestFor>. Vision: yes/no.
     Embeddings: yes/no."

Edge cases
  - Touch devices: tap toggles the tooltip (Radix supports
    this); tap outside dismisses.
  - Reduced-motion: tooltip transitions respect preference.

Tests
  - ProviderMeta projection: round-trips.
  - Component: ⓘ tap opens tooltip; selection still works.

Acceptance criteria
  - Each provider card surfaces the tooltip affordance.
  - Tooltip never blocks the card selection click.

Out of scope
  - Per-provider detailed comparison page.


--------------------------------------------------------------------
17. Alert snooze
--------------------------------------------------------------------

Phase:    C
Risk:     R2
Tags:     [FE] [BE] [DB] [CRON]

Problem
  Alerts fire and notify. No way to say "if not triggered in
  the next 4h, ping me again." Users either delete the alert
  or get noise.

Goal
  AlertForm has a snooze field: "If unfired after Xh, re-notify
  once." Stored on the alert row. Cron evaluates the snooze.

Scope
  Modify:
    apps/web/src/app/(app)/alerts/_components/alert-form.tsx
      — Add a snooze field. Default 0 (off).
    packages/shared/src/schemas.ts
      — Extend AlertRuleSchema (or wrap it) with snoozeHours:
        integer 0..168.
  Add:
    DB migration: ALTER TABLE alerts ADD COLUMN snooze_hours
      INTEGER NOT NULL DEFAULT 0.
    apps/web/src/app/api/cron/alerts/route.ts
      — Existing scan. Add: after first fire, if
        snooze_hours > 0, set next_check_at = now() +
        interval '...'. On second fire, mark fired=true and
        stop.

Implementation steps
  1. Migration (drizzle-kit generate + apply).
  2. UI: number input "Snooze re-notify (hours, 0 = off)" with
     helper text.
  3. Cron /api/cron/alerts/route.ts: query alerts where
     active=true AND (last_fired_at IS NULL OR
     last_fired_at + (snooze_hours * interval '1 hour') <
     now()). Same evaluation logic. On fire: bump
     last_fired_at, dispatch, persist.
  4. AlertList view: show "Snoozed: 4h" badge on affected
     alerts.

Edge cases
  - snooze_hours=0: behaves exactly as today.
  - User edits snooze after alert fires: takes effect on next
     cron tick (acceptable).
  - snooze_hours very large (max 168 = 1 week): sane cap.

Tests
  - Migration: idempotent on re-run.
  - Cron: known fixture → fires once, snoozes, fires again at
    correct time.
  - Component: form saves snooze; list shows badge.

Acceptance criteria
  - Snooze field saves and persists.
  - Cron respects the snooze interval.
  - Existing alerts (no snooze column on legacy rows) default
    to snooze=0.

Out of scope
  - Multiple snooze cycles (alert re-arms). One re-fire only.


--------------------------------------------------------------------
18. Reduced-motion audit
--------------------------------------------------------------------

Phase:    C
Risk:     R0
Tags:     [FE]

Problem
  docs/06-frontend.md line 435 says reduced-motion is respected,
  but I did not see explicit handling for streaming message
  enter animations, the new-chat pulse, or the dynamic island
  on ChatTopBar.

Goal
  Audit every motion/framer-motion use in the frontend. Add
  `motion-reduce:animate-none` or equivalent guards where
  missing. Document the convention.

Scope
  Audit:
    apps/web/src/components/chat/chat-screen.tsx (auto-scroll
      smooth behavior)
    apps/web/src/components/chat/chat-top-bar.tsx (dynamic island
      transitions)
    apps/web/src/components/onboarding/wizard.tsx
      (animate-in fade-in slide-in-from-right-4)
    apps/web/src/components/chat/composer.tsx (mic-pulse,
      button morph)
    apps/web/src/components/layout/* (nav drawer slide,
      ambient background)
  Convention doc:
    docs/15-motion-conventions.md (new)

Implementation steps
  1. Grep `animate-in`, `animate-pulse`, `motion.` across
     apps/web/src. Build a list.
  2. For each usage, decide:
       a) Decorative-only → wrap in motion-reduce:animate-none.
       b) Functional (e.g. send button morph) → keep but add
          prefers-reduced-motion check at the parent level.
  3. Write the convention doc: "All decorative animation must
     use the motion-reduce variant. Functional animation must
     guard with useReducedMotion() from motion/react and
     short-circuit to instant."
  4. Add an eslint rule (custom or via eslint-plugin-jsx-a11y
     extension) flagging animate-* without motion-reduce:*
     counterpart. Mark warn, not error.

Edge cases
  - OS pref off + manual override (data-reduce-motion="force"
    on html): both must be respected.
  - Initial mount animations: still allowed (one-shot) but
    should respect reduce.

Tests
  - Visual snapshot: with reduce-motion on, the chat top-bar
    dynamic island does not transition; just snaps.

Acceptance criteria
  - No decorative animation runs under prefers-reduced-motion.
  - Convention doc published.

Out of scope
  - Removing the animation system entirely.


--------------------------------------------------------------------
19. Edit-in-place thread message (fork semantics)
--------------------------------------------------------------------

Phase:    C
Risk:     R2
Tags:     [FE] [BE]

Problem
  Composer can edit the last user message but truncates
  everything after. For long threads, this destroys useful
  context.

Goal
  Editing a non-last user message forks the thread at that
  point. The new branch keeps the original thread intact (now
  in history), and the user continues in a fresh thread that
  starts with all messages up to and including the edit.

Scope
  Add:
    apps/web/src/app/api/chat/threads/fork/route.ts
      — POST body: { sourceThreadId, atMessageId, newText }.
        Validates the user owns sourceThreadId. Reads all
        messages up to atMessageId. Creates a new thread
        (cloned title + pinnedSymbol). Copies messages into
        the new thread with the user message at atMessageId
        replaced by newText. Returns the new thread id.
  Modify:
    apps/web/src/components/chat/message.tsx
      — Edit affordance on user messages. If message is not
        last, calls the fork endpoint instead of in-place
        truncate.
    apps/web/src/components/chat/chat-screen.tsx
      — onEdit branch: check if it's the last message;
        otherwise POST /api/chat/threads/fork and router.push
        to the new thread.

Implementation steps
  1. Implement fork endpoint. Zod schema for the body. Atomic
     transaction: insert new thread + clone messages.
  2. Source thread is unchanged. New thread gets title
     prefixed "[Fork] " for visibility.
  3. Component: edit affordance always shows a tiny popover
     "Edit in place" (last message) vs "Fork from here"
     (any other). On fork: confirm dialog "This will create a
     new conversation starting from your edit. Original
     preserved."
  4. ChatScreen onEdit: existing in-place path stays for the
     last message; new fork path for any other.
  5. ThreadSwitcher: forked threads get a small "fork" icon
     next to the title.

Edge cases
  - User edits message at index 0 (first message): creates a
    fresh thread with just the edited first message.
  - User forks a thread with 200 messages: copy is bounded
    (max 200, like listMessages).
  - Source thread deleted between confirm and submit: 404,
    toast.

Tests
  - Fork route: auth, ownership, message-copy fidelity, new
    thread title.
  - Component: popover differentiates last vs not-last
    message; confirm flow.

Acceptance criteria
  - Edit on non-last message preserves original thread.
  - New thread starts with up-to-and-including the edit.
  - User can compare two branches side by side via the thread
    switcher.

Out of scope
  - Three-way merge of branches.
  - Visual diff between source and fork.


====================================================================
DEFERRED — Parking lot
====================================================================


--------------------------------------------------------------------
20. Email verification on registration
--------------------------------------------------------------------

Why deferred
  Needs email infra beyond the existing Resend alerts sender.
  Magic-link or 6-digit code flow. Adds 1-2 weeks. Real users
  on a self-hosted OSS install don't need this. Revisit if
  HamaFX-Ai ever runs as a hosted SaaS.

Sketch (do not implement now)
  - Register sends 6-digit code to email.
  - /verify page accepts code; sets user.verified_at.
  - Middleware: if !verified and not on /verify, redirect.
  - Code TTL: 15min, 5 attempts/hour/email.
  - Resend: 60s cooldown.


--------------------------------------------------------------------
21. Bulk journal import
--------------------------------------------------------------------

Why deferred
  Needs schema for tag dictionaries + broker-CSV shape
  detection (MT4/MT5/cTrader/TradingView exports differ).
  Real value for power users but not for first-pass UX.

Sketch (do not implement now)
  - /journal "+" menu gains "Import CSV".
  - Upload, detect shape, preview, confirm.
  - Map CSV columns → journal fields.
  - Save in transaction.


--------------------------------------------------------------------
22. Thread-level public share (HMAC, like snapshot)
--------------------------------------------------------------------

Why deferred
  Current share_snapshot covers the high-value 80% case. Thread
  share is longer-form and has more sensitive content (user
  prompts can include account numbers, strategy details). Needs
  separate access control: scoped redaction, expiry options,
  redaction of tool outputs. 1-2 weeks on its own.

Sketch (do not implement now)
  - /api/chat/threads/[id]/share → POST creates a share record.
  - /share/thread/[id]?t= → reads, renders thread read-only.
  - Redaction: user picks which messages to include.
  - Reuses the HMAC sign/verify helpers from
    packages/ai/src/share/.


====================================================================
NOT DOING
====================================================================


23. Drag-to-reorder watchlist
    Nice-to-have. /settings/symbols exists; if reorder is
    needed, lift the existing hfx_chart_config localStorage
    pattern. Low impact.

24. Multi-symbol chart overlay
    Complex (multiple data series, different precisions, scale
    modes). The /chart/[symbol]/pro TradingView widget already
    gives power users this. Skip.

25. Telegram deep-link outbound
    Telegram webhook is inbound-only today. Outbound deep-link
    requires either a Telegram bot session or a public bot
    username scheme. Auth implications. Skip for now.


====================================================================
Sequencing summary
====================================================================

  Week 1   Phase A in full (items 1-7). All small, all
           independent. Land as 7 PRs or batch into 2-3.

  Week 2   Phase B, items 8-11. (8 and 11 unlock two big
           power-user flows.) Item 9 (citation drill-down)
           and 10 (alert preview) need their own day.

  Week 3   Phase B continued: 12, 13, 14, 15. Items 14 and
           15 are good candidates for shipping together —
           they both touch the chat header / chat top bar
           surface area and share the same review.

  Week 4   Phase C: 16, 17, 18. Item 19 (fork semantics) is
           its own thing — schedule a focused week for it
           after the rest of Phase C lands.

  Week 5+  Deferred items (20-22) and ongoing polish.

Cross-cutting test strategy
---------------------------
  Every item that ships must add:
    - 1 unit test file at minimum (Vitest).
    - 1 component test if a new component is introduced.
    - 1 integration test if a new route is added.
  Existing baseline: 350+ tests. Aim: keep that ratio.

Definition of done (per item)
-----------------------------
  [ ] All files in "Scope" modified or added.
  [ ] New tests passing.
  [ ] No regression in existing test suite.
  [ ] Manually verified on Chrome desktop + iPhone Safari.
  [ ] Docs/USER_FLOW.md updated to reflect the new behavior.
  [ ] Commit message references this plan item by number
      (e.g. "feat(ux): item 4 - auto-redirect to api-keys").
  [ ] PR description includes: problem, screenshots/clip,
      tests run, follow-ups parked.

Risk register
------------
  Item 8 (regenerate-with-provider): touches agent runtime.
    → Run full agent test sweep before merge. Schedule a
      smoke against the live /api/chat endpoint if possible.

  Item 9 (citation drill-down): changes part payload schema.
    → Verify old parts still render (backward compat path).

  Item 15 (auto-fallback): introduces retry logic.
    → Cap retries at 1. Never retry on 4xx-other-than-401/403/429.

  Item 17 (alert snooze): schema migration. Run on a copy of
    production data before deploying.

  Item 19 (fork semantics): data model change. Verify no
    orphaned message references. Audit FK constraints.

End of plan.
