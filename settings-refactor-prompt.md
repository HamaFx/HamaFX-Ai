# HamaFX-AI — Settings Section Cleanup, Restructure & Hardening

**Role:** You are a senior full-stack engineer working in the `hamafx-ai` monorepo. Your task is to
clean up, restructure, de-duplicate, fix bugs in, and polish the **Settings** section of the web app
**without breaking any existing functionality**. Everything must keep working, stay stable, and pass
typecheck + lint + build + tests.

Treat this as a careful refactor, not a rewrite. Preserve all data flows, server actions, DB reads,
and API calls. Change structure, layout, wording, and styling — not behavior.

---

## 0. Repo facts you must know before touching anything

- **Framework:** Next.js 15 (App Router, React Server Components + Client Components), TypeScript.
- **Monorepo:** pnpm workspaces + Turbo. Web app lives in `apps/web`.
- **Settings root:** `apps/web/src/app/(app)/settings/`
  - `layout.tsx` — shared layout: renders a global `<PageHeader title="Settings">` + `<SettingsNav/>` sidebar + `{children}`.
  - `page.tsx` — the "General" mega-page (a long vertical scroll of grouped cards).
  - `actions.ts` — **all server actions** (`'use server'`). ~1221 lines. **Do not change signatures or behavior.**
  - `_components/` — cards used by the General page and shared helpers (`settings-section.tsx`, `settings-row.tsx`, `settings-nav.tsx`).
  - Subpages, each a folder with `page.tsx` (+ its own `_components/`, `loading.tsx`, sometimes `error.tsx`):
    `profile/`, `api-keys/`, `models/`, `agent/`, `symbols/`, `usage/`, `track-record/`, `portfolio/`, `telegram/`, `billing/`.
- **Design tokens (Tailwind v4 `@utility` + CSS vars in `apps/web/src/app/globals.css`):**
  - Colors: `bg`, `bg-elev-1`, `bg-elev-2`, `bg-elev-3`, `border`, `divider`, `fg`, `fg-muted`, `fg-subtle`,
    `brand`, `success`, `warn`, `danger`, `info`, `bull`, `bear`.
  - Utilities: `surface-panel` (= `bg-bg-elev-1` + `1px border`, **no radius, no padding**),
    `surface-elevated` (= `bg-bg-elev-2` + border).
  - Radius convention across the app is `rounded-sm`.
  - Typography helpers seen in use: `text-display-lg`, `text-body-sm`, `text-caption`.
- **Shared UI primitives:** `@/components/ui/button` (`Button`), `input`, `switch` (`Switch`),
  `segmented` (`Segmented`), `empty-state` (`EmptyState`), `confirm-drawer` (`useConfirm`), and
  `@/components/layout/page-header` (`PageHeader`). Reuse these — do not reinvent them.
- **Icons:** `@tabler/icons-react`.
- **Toasts:** `sonner` (`toast`).
- **Commands (run from repo root):**
  - Typecheck: `pnpm turbo run typecheck` (or `pnpm --filter web typecheck`)
  - Lint: `pnpm turbo run lint`
  - Build: `pnpm turbo run build`
  - Tests: `pnpm turbo run test`

---

## 1. Non-negotiable constraints (READ TWICE)

1. **Do not break functionality.** Every button, form, toggle, link, and data read that works today
   must work after your change. The user explicitly wants everything connected and stable.
2. **Do not modify `actions.ts` behavior.** You may not rename, delete, or change the signatures of any
   of these exported server actions (all still consumed by the UI):
   `clearChatHistoryAction, updateProfileAction, addSymbolAction, removeSymbolAction,
   updateUsageSettingsAction, updateMarketDataProviderAction, updateApiKeysAction, exportKeysAction,
   importKeysAction, deleteAccountAction, updateAiPrefsAction, updateUIPrefsAction, listSessionsAction,
   revokeSessionAction, signOutEverywhereAction, updateDisabledToolsAction, updateNotificationPrefsAction,
   setupTwoFactorAction, verifyTwoFactorAction, disableTwoFactorAction, updateLocaleAction,
   exportDataAction, changePasswordAction`.
   Keep all DB reads/writes, encryption, auth checks, and `revalidate` exports intact.
3. **Do not touch API route handlers** used by the settings client components
   (`/api/bot/status`, `/api/bot/link-code`, `/api/bot/unlink`, `/api/notifications/noise-config`,
   `/api/alerts/preview-digest`, `/api/admin/onboarding/reset`) except where a bug fix explicitly
   requires it (call it out).
4. **Preserve server/client component boundaries.** RSC pages stay server components; anything using
   hooks/`useState`/`useEffect`/browser APIs stays `'use client'`. Do not add `'use client'` to a page
   that reads the DB.
5. **Keep the Apache license header** at the top of every file that currently has one.
6. **Preserve accessibility that already exists** (aria labels, `aria-current`, roles) and improve it.
7. After every meaningful change, run typecheck + lint. The final deliverable must pass all four commands.
8. **Scope = the Settings section only.** Do not refactor unrelated app areas. If a shared component
   (e.g. `PageHeader`) needs a change, make the minimal change and verify no other caller breaks.

---

## 2. The core problem (why settings feels confusing and messy)

The Settings section runs **two competing information architectures at once**, and they overlap and
duplicate each other:

- **(A) A giant "General" scroll page** (`page.tsx`) that stacks: System status, Usage glance, a
  "Security" section, a "Notifications" section, an "AI & Agent" section, a "Data" section, an "About"
  section, an "Admin" section, and then a floating "Appearance" card at the very bottom.
- **(B) A left sidebar** (`settings-nav.tsx`) of dedicated subpages: General, Profile, API Keys, Models,
  Agent, Symbols, Usage, Track Record, Portfolio, Telegram, Billing.

The two overlap heavily, which is the root cause of the "messy/confusing" feeling:

- **Usage** appears as `UsageGlance` on General **and** as a full `/settings/usage` page.
- **Agent** appears as `AgentCard` on General (links to `/settings/agent`) **and** as `/settings/agent`.
- **Notification channel readiness** is shown by **both** `SystemStatusCard` **and** `NotificationsCard`
  on the same General page (two widgets telling you Email/Telegram/Web-push status).
- **Symbols/watchlist** is managed by `PreferencesCard` (default symbol from the watchlist) on General
  **and** by the full `/settings/symbols` page.
- **Telegram** test/link appears in the General `NotificationsCard` **and** on `/settings/telegram`.
- **Models** is linked to from both `AgentCard`/`AIPrefsCard` and exists as `/settings/models`.
- The left nav does **not** list the General page's embedded sections (Security, Notifications,
  Appearance, Data), so those settings are only reachable by scrolling the General page — undiscoverable.

Additionally, each subpage was clearly built at a different time and they **do not share a consistent
page/card/heading pattern** (details in §4).

---

## 3. BUGS TO FIX (functional + visible) — highest priority

### 3.1 Clobbered UI text from a botched icon-rename find/replace (P0, embarrassing, user-visible)
An automated rename that added the `Icon` prefix to `@tabler/icons-react` imports (e.g. `Bot`→`IconRobot`,
`Link`→`IconLink`, `Settings`→`IconSettings`, `ArrowRight`→`IconArrowRight`, `Key`→`IconKey`) was applied
too broadly and **replaced plain words inside visible strings and comments**. Fix every occurrence by
restoring the intended human word. Do **not** change actual icon component usages/imports.

Confirmed occurrences (search the whole settings tree to catch any others):

| File | Line (approx) | Current (wrong) | Should read |
|---|---|---|---|
| `_components/telegram-link-card.tsx` | 221, 252, 306 | `Open HamaFX IconRobot on Telegram` | `Open HamaFX Bot on Telegram` |
| `_components/telegram-link-card.tsx` | 242 | `IconLink your Telegram to control HamaFX…` | `Link your Telegram to control HamaFX…` |
| `_components/telegram-link-card.tsx` | 295 | `IconArrowRight{' '}` (before `/link {code}`) | Restore the intended word/glyph, e.g. `Send{' '}` (so it reads "Send `/link CODE` to the HamaFX bot on Telegram"). Use a real send/arrow icon component if an icon was intended, but the visible text must be a word, not `IconArrowRight`. |
| `_components/telegram-link-card.tsx` | 19, 20 | `// IconSettings island …` / `// … IconSettings & Polish.` | `// Settings island …` / `// … Settings & Polish.` |
| `portfolio/page.tsx` | 256, 258 | `{/* Account IconSettings */}` and `<h3>Account IconSettings</h3>` | `Account Settings` (comment + heading) |
| `usage/_components/usage-limits-form.tsx` | 131 | `Alerts via Telegram IconRobot` | `Alerts via Telegram bot` |
| `usage/_components/usage-limits-form.tsx` | 128 | `<IconArrowRight … />` sitting next to "Telegram Alerts" | Use a semantically correct icon (`IconBrandTelegram` / `IconSend`), not a right-arrow. |
| `models/_components/model-picker.tsx` | 241 | `IconSettings → API Keys` (link text) | `Settings → API Keys` |
| `api-keys/_components/export-import-keys.tsx` | 93 | `Backup & IconKey Migration` | `Backup & Key Migration` |
| `_components/noise-control-card.tsx` | 19 | `// F4 — Noise Control IconSettings Card` | `// F4 — Noise Control Settings Card` |
| `_components/test-email-button.tsx` | 19 | `// IconSettings island for Resend email test…` | `// Settings island for Resend email test…` |
| `_components/test-telegram-button.tsx` | 19 | `// IconSettings island for Telegram test message…` | `// Settings island for Telegram test message…` |

> Action: grep the settings tree for `Icon[A-Z]` occurrences that are **not** import statements, JSX
> `<Icon.../>`, `icon={...}` props, or `typeof Icon...` type refs. Any such match inside a string
> literal, JSX text node, `aria-label`, `title`, `placeholder`, or comment is a clobbered word — fix it.

### 3.2 Double page header on `/settings/telegram` (P0 layout bug)
`layout.tsx` already renders a global `<PageHeader title="Settings" …>` for **every** settings route.
`telegram/page.tsx` renders a **second** `<PageHeader title="Telegram Bot" …>`, so the page shows two
stacked page headers and two `<h1>`s (a11y violation). Remove the extra `PageHeader` from
`telegram/page.tsx` and use the same in-page section heading pattern as the other subpages (see §5).
Audit all subpages to guarantee exactly **one** `<h1>` per route (the layout's).

### 3.3 `agent/page.tsx` uses a rogue page shell (P1)
It wraps content in `<main className="mx-auto … max-w-2xl px-4 py-4">` with its own `<h1>`. This nests a
`<main>` inside the app layout, adds duplicate padding/centering, and creates a second `<h1>`. Convert it
to the shared subpage pattern (a `<div className="flex flex-col gap-6 max-w-2xl">` with an `<h2>` heading),
matching `models/`, `symbols/`, `profile/`. Keep the telemetry/roll-up content identical.

### 3.4 `ChangePasswordCard` uses the wrong card wrapper (P1 visual bug)
`change-password-card.tsx` uses `className="surface-panel p-4"`. `surface-panel` has **no border radius
and no flex/gap**, so this card renders with sharp corners and cramped spacing while every sibling card
uses `border border-border bg-bg-elev-1 rounded-sm … p-4` with `flex flex-col gap-*`. Also its title is
`text-sm font-semibold` vs the sibling standard. Normalize it to the canonical card pattern (§5) and
remove the stale `// Reset success state when dialog unmounts/remounts` comment (it is not a dialog).

### 3.5 `NotificationsCard` wrong/misleading links + nested interactive elements (P0/P1)
In `_components/notifications-card.tsx` each channel row is a `SettingsRow` (which contains a **Test**
`<button>`) wrapped inside a Next `<Link>`:
- The **Email** row links to `/settings/usage` (wrong destination).
- The **Web push** row links to `/settings` (links to the page it is already on — a no-op).
- Only the **Telegram** row link (`/settings/telegram`) is sensible.
- Wrapping a `SettingsRow` that contains a real `<button>` inside an `<a>` nests interactive elements
  (invalid HTML + a11y bug; clicking Test can also trigger navigation).

Fix: **Do not wrap the whole row in a link.** Keep the Test action button as the row's action. If a
"manage this channel" affordance is desired, add a small, separate, correctly-targeted link/`IconChevronRight`
inside the row (Email → no dedicated page today, so no link or link to the notifications section anchor;
Telegram → `/settings/telegram`; Web push → stays on the notifications settings area). Ensure every link
points somewhere real and never to its own current page.

### 3.6 `NoiseControlCard` save + preview effects (P1 correctness/perf)
In `_components/noise-control-card.tsx`:
- The debounced save `useEffect` starts with `if (savingRef.current) return;`. If config changes again
  while a save is in flight, the effect **returns early and never schedules the trailing save**, so the
  last edit can be silently dropped. Rework so the latest config is always persisted (proper debounce:
  clear the previous timer, schedule a new save; do not early-return on in-flight, or queue a trailing save).
- The preview `useEffect` fires `GET /api/alerts/preview-digest` on **every** config change (including
  each keystroke in the numeric cooldown/dedup inputs) with **no debounce**, and the endpoint takes no
  config params so the preview does not reflect unsaved edits and races the PUT. Debounce the preview
  fetch and only refetch after a successful save (or clearly label it as "based on saved settings").
- Cancel in-flight/last timers on unmount.

### 3.7 Division-by-zero in usage budget gauge (P2)
`usage/page.tsx` `BudgetCard` computes `pct = Math.min(100, (stats.todayUsd / maxDailyUsd) * 100)`
without guarding `maxDailyUsd > 0` (note: `UsageGlance` already guards this). Guard against
`maxDailyUsd <= 0` to avoid `NaN`/`Infinity` widths.

### 3.8 Portfolio empty state is a dead end (P2 UX bug)
`portfolio/page.tsx` empty state says "Add a position to start tracking…" but there is **no** add-position
control anywhere, and account settings are read-only ("Account Settings" panel just prints values). Either
(a) wire an "Add position" / "Set account balance" affordance if the supporting action/API exists, or
(b) reword the empty state and the read-only panel so they don't promise an action that isn't there.
Do not fabricate a backend — verify what `@hamafx/ai` portfolio helpers support before adding UI.

---

## 4. STRUCTURE & CONSISTENCY PROBLEMS (the "messy" part)

### 4.1 Inconsistent subpage heading + width patterns
Current state (all different):
- `profile/` → `<h2 class="text-lg font-semibold">` inside `max-w-xl`.
- `symbols/`, `models/` → `<h2 class="text-lg font-semibold">` inside `max-w-2xl`.
- `usage/` → section headings use `text-fg-muted text-sm font-medium`, no page-level `<h2>`, no max-width.
- `track-record/`, `portfolio/` → `<h2 class="text-xl font-semibold">`, no max-width.
- `agent/` → `<h1 class="text-xl font-bold">` inside a rogue `<main>` (see §3.3).
- `billing/` → wraps everything in `SettingsSection` (meant for the General page grouping).

**Fix:** define ONE canonical subpage pattern (see §5) and apply it to every subpage.

### 4.2 Inconsistent card wrappers and section headers on the General page
Cards mix several patterns:
- Canonical: `border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-* p-4` (most cards).
- `surface-panel p-4` (change-password — see §3.4).
- Header variants: some use `<header>`, some `<div>`; heading sizes vary (`text-base font-semibold
  tracking-tight` vs `text-sm font-semibold` vs uppercase `text-caption`); some cards show a right-aligned
  uppercase meta pill ("Test channels", "Saved to account", "N sessions"), others don't.
- Two different divider helpers coexist: a local `RowDivider` (`border-t -mx-4`) and inline
  `<hr className="border-border my-*">`. Pick one.

**Fix:** normalize to the canonical Card + CardHeader + Divider (see §5).

### 4.3 Duplicated widgets / overlapping IA (decide and de-duplicate)
Resolve the A-vs-B overlap from §2. **Recommended target architecture** (implement this unless you find a
strong reason to deviate — if you deviate, document why):

- Keep the **sidebar-of-subpages** model as the primary IA. Make the left nav the single source of truth
  for "where things live."
- Reframe the **General page** (`/settings`) as a genuine **overview/dashboard**, not a dumping ground:
  - Keep `SystemStatusCard` (system health) and `UsageGlance` (deep-links to `/settings/usage`).
  - **Remove the duplication:** `NotificationsCard` currently repeats channel readiness already shown by
    `SystemStatusCard`. Collapse to a single source of truth — keep channel *readiness* in
    `SystemStatusCard`, and move channel *test buttons* to their natural homes (Telegram test →
    `/settings/telegram`, which already has it; Email/Web-push tests → a dedicated **Notifications**
    subpage, see below).
  - Move **Security** (`ChangePasswordCard`, `TwoFactorSetup`, `LinkedAccountsCard`, `SessionsCard`),
    **Notifications** (`NotificationsCard` test buttons, `NoiseControlCard`, `NotificationPrefsCard`),
    **Appearance** (`AppearanceCard`), and **Data** (`DataCard`, `PreferencesCard`) out of the single
    scroll and into discoverable destinations. Two acceptable options — pick one and be consistent:
    - **Option 1 (preferred): promote them to real subpages** with matching left-nav entries:
      `/settings/security`, `/settings/notifications`, `/settings/appearance`, `/settings/data`
      (or fold Appearance+Data into a `/settings/preferences` page). Then the General page becomes a
      short overview (status + usage glance + quick links).
    - **Option 2: keep them as sections on the General page** but add in-page anchor navigation and
      **add left-nav entries that scroll to those sections**, so nothing is undiscoverable. (Less clean.)
  - Whatever you choose, ensure **no setting is only reachable by blind scrolling**, and **no widget is
    duplicated** across two places showing the same data.
- The floating `AppearanceCard` rendered **outside** any `SettingsSection` at the bottom of `page.tsx`
  must no longer be an orphan — it goes into its chosen destination (Appearance subpage or a proper section).
- `AIPrefsCard` has two links to `/settings/models` in one small card (a header "Manage models →" link
  and a paragraph "Settings → Models" link). Keep one.
- Keep the **Admin** section (`OnboardingResetCard`) gated behind `checkIsAdmin()` exactly as today.

### 4.4 Left nav must match reality
Update `settings-nav.tsx` `NAV_ITEMS` so it reflects the final IA (add entries for any new subpages from
§4.3; keep icons consistent). Keep the existing active-state logic (`exact` for `/settings`, `startsWith`
for the rest), the breadcrumb, the mobile horizontal-scroll behavior, and `aria-current`.

---

## 5. CANONICAL PATTERNS TO INTRODUCE (single source of truth)

Create/normalize small shared building blocks in `_components/` and use them everywhere in settings. Keep
them dependency-light and server-render-friendly (no `'use client'` unless they need interactivity).

1. **Subpage shell** — every subpage body uses:
   ```tsx
   <div className="flex flex-col gap-6">
     <div className="flex flex-col gap-1">
       <h2 className="text-fg text-lg font-semibold tracking-tight">{Title}</h2>
       <p className="text-fg-subtle text-sm">{Description}</p>
     </div>
     {/* content */}
   </div>
   ```
   Pick ONE max-width policy for content-form subpages (recommend `max-w-2xl`) and apply consistently
   (dashboards like portfolio/usage/track-record may go full width — decide and document the rule).
   Never render a second `PageHeader`/`<h1>` (the layout owns the `<h1>`).

2. **Card** — canonical wrapper (replace `surface-panel` usage and ad-hoc variants):
   `className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-4"`.
   Consider extracting a `<SettingsCard title? metaLabel? children>` component so the header markup and
   the optional right-aligned uppercase meta label are defined once. Card title style:
   `text-fg text-base font-semibold tracking-tight`. Meta label style:
   `text-fg-subtle text-caption uppercase tracking-wider`.

3. **Divider** — one helper only. Standardize on the flush `RowDivider`
   (`<div className="border-border -mx-4 my-1 border-t" />`) and delete inline `<hr>` variants inside cards.

4. Keep using existing `SettingsSection` / `SettingsRow` where sections/rows are still used, but ensure
   their header styling matches the canonical Card header (or intentionally differs with a documented reason).

---

## 6. ACCESSIBILITY & POLISH (do these while you're in there)

- Exactly one `<h1>` per route (layout's `PageHeader`); everything below is `<h2>`/`<h3>` in order.
- Fix the nested `<a><button></a>` in `NotificationsCard` (§3.5).
- `NotificationPrefsCard` table columns are icon-only with `sr-only` text — add a visible, compact column
  label (or `title`/`aria` on the header cell) so sighted users know which column is Email/Push/Telegram.
- Ensure every icon-only button has an `aria-label` (most do; verify Test buttons, copy buttons, revoke).
- Keyboard focus states: keep `focus-visible:ring-*` on interactive elements; verify the segmented controls
  and `<details>` summaries are reachable and labeled.
- Dark/light: styles already use theme CSS vars; ensure any new markup uses tokens (`text-fg`, `bg-bg-elev-*`,
  `border-border`) rather than hard-coded colors. Note: several places use `text-white` on `bg-fg`
  (e.g. noise-control severity buttons, `text-black` in usage empty-state CTA) — keep them consistent with
  the rest of the app's button conventions (prefer the shared `Button` component where a button is intended).
- **Theme flash concern (investigate, fix only if real):** `AppearanceCard` sets
  `document.documentElement.dataset.theme` and writes to the DB via `updateUIPrefsAction`, but nothing
  else in settings writes the theme to a cookie/localStorage for the initial no-flash render. Confirm how
  the root layout bootstraps the theme; if the appearance selector doesn't persist in a way the initial
  render can read (causing a flash or cross-page reset), align it with the app's existing theme mechanism.
  Do not invent a new theme system.
- `about-card.tsx` hardcodes `Next.js 15 · Vercel deploy` and the card is titled "Session" while the
  General section that contains it is titled "About" — reconcile the naming and avoid hardcoded stack
  strings that will rot.

---

## 7. SUGGESTED EXECUTION ORDER

1. **Branch** off `main` (e.g. `feat/settings-cleanup`).
2. **Baseline:** run typecheck + lint + build + test and record current pass/fail so you can prove you
   didn't regress.
3. **Phase 1 — safe, mechanical bug fixes (no behavior change):** §3.1 clobbered strings, §3.2 double
   header, §3.3 agent shell, §3.4 card wrapper, §3.7 division guard, §6 easy a11y labels. Typecheck+lint.
4. **Phase 2 — targeted logic fixes:** §3.5 notifications links/nesting, §3.6 noise-control effects,
   §3.8 portfolio dead-end. Typecheck+lint+test after each.
5. **Phase 3 — consistency normalization:** introduce canonical Card/subpage/divider patterns (§5) and
   apply across `_components/` and all subpages (§4.1, §4.2). This is mostly className/markup edits.
6. **Phase 4 — IA restructure (§4.3, §4.4):** de-duplicate widgets, move sections into destinations,
   update `settings-nav.tsx`, add any new subpages (with `loading.tsx`, correct `auth()` guard +
   `redirect('/login')`, and `metadata`). Wire everything; verify no dead links.
7. **Final:** full typecheck + lint + build + test all green. Manually click through every settings route.

---

## 8. ACCEPTANCE CRITERIA (definition of done)

- [ ] No `Icon<Word>` text leaks anywhere in visible UI, `aria-label`s, `placeholder`s, `title`s, or
      comments in the settings tree (grep clean).
- [ ] Every settings route renders exactly one `<h1>` (from the layout). `/settings/telegram` and
      `/settings/agent` no longer render a second page header / rogue `<main>`.
- [ ] All cards in settings share one wrapper style (rounded, bordered, `bg-bg-elev-1`, consistent
      padding/gap); `surface-panel` is no longer used as a card in settings.
- [ ] One divider style; no stray `<hr>` inside cards.
- [ ] Every subpage uses the canonical subpage shell + heading style; consistent max-width policy.
- [ ] No widget shows the same data in two places on the same page; channel readiness has a single home.
- [ ] Every setting is reachable from the left nav (nothing hidden behind blind scroll); nav matches routes.
- [ ] Every link points to a real, correct destination; no link targets its own current page.
- [ ] `NotificationsCard` has no nested `<a><button>`; Test buttons work and don't navigate.
- [ ] Noise-control saves the final edit reliably; preview is debounced and not spammed per keystroke.
- [ ] Usage budget gauge never produces `NaN`/`Infinity` when `maxDailyUsd` is 0.
- [ ] Portfolio empty state / account panel no longer promises actions that don't exist (or the actions
      are wired if supported).
- [ ] All server actions in `actions.ts` unchanged in signature/behavior and still imported/used.
- [ ] `pnpm turbo run typecheck`, `lint`, `build`, and `test` all pass.
- [ ] Manual click-through of `/settings` and every subpage: all controls function; light + dark look right;
      layout works from ~400px up to desktop widths.

---

## 9. DELIVERABLES

1. The code changes described above, committed in logically grouped commits matching the phases in §7.
2. A short `SETTINGS_CLEANUP.md` (or PR description) summarizing: the final information architecture, the
   list of bugs fixed, the canonical patterns introduced, any IA decisions/deviations and why, and the
   before/after route map.
3. Confirmation output (or screenshots/log) that typecheck, lint, build, and test pass.

**Remember:** structure, wording, and styling may change freely; **behavior, data flow, and server
actions must not.** When in doubt, prefer the smaller, reversible change and keep everything working.
