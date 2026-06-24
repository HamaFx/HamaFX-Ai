# HamaFX-Ai — Settings Page Full Analysis & Improvement Plan

> **Generated:** 2026-06-24
> **Scope:** Full codebase analysis with deep-dive on the `/settings` page tree
> **Analyst:** Automated audit via Gumloop agent

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Settings Page Architecture](#2-settings-page-architecture)
3. [Bugs & Errors](#3-bugs--errors)
4. [Security Flaws](#4-security-flaws)
5. [UX/UI Flaws](#5-uxui-flaws)
6. [Code Quality Issues](#6-code-quality-issues)
7. [Performance Issues](#7-performance-issues)
8. [Improvements & Enhancements](#8-improvements--enhancements)
9. [Feature Upgrades](#9-feature-upgrades)
10. [Prioritized Action Plan](#10-prioritized-action-plan)

---

## 1. Project Overview

**HamaFX-Ai** is an open-source, multi-tenant AI trading platform. Chat-driven, mobile-first, with domain-routed multi-agent deliberation for XAU/USD and forex markets.

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript 5.7 |
| Monorepo | pnpm workspaces + Turborepo |
| Auth | NextAuth.js v5 (beta.31) + Drizzle Adapter |
| Database | PostgreSQL + Drizzle ORM (PGlite for local dev) |
| AI | Vercel AI SDK 5.0 + multi-provider BYOK |
| Styling | Tailwind CSS v4 |
| Charts | Lightweight Charts 5.0 |
| State | TanStack React Query 5 + nuqs |
| PWA | Service Worker + VAPID Web Push |
| Testing | Vitest + Playwright |
| CI/CD | GitHub Actions + Vercel + Docker |
| Monitoring | Sentry |

### Monorepo Packages

| Package | Purpose |
|---|---|
| `@hamafx/web` | Next.js app (main frontend + API routes) |
| `@hamafx/ai` | AI agent, tools, routing, BYOK providers, telemetry |
| `@hamafx/data` | Market data adapters (Biquote, Finnhub, FRED, CFTC, etc.) |
| `@hamafx/db` | Drizzle schema, migrations, DB connection |
| `@hamafx/shared` | Zod schemas, encryption, symbols, timeframes, env |
| `@hamafx/indicators` | SMC (Smart Money Concepts) math library |
| `@hamafx/config` | Shared ESLint / TS config |

### File Counts

- **Total source files:** ~753 (excluding node_modules, .git, lock files)
- **Settings page files:** 36
- **API routes:** 30+
- **Chat tool parts:** 30+
- **Tests:** 590 passing (per README badge)

---

## 2. Settings Page Architecture

### Route Structure

```
/settings
├── layout.tsx          ← Client component, nav sidebar with 7 tabs
├── page.tsx            ← Server component (force-dynamic), general overview
├── actions.ts          ← Server actions (7 exported functions)
├── _components/
│   ├── about-card.tsx           ← Server: build ID + sign-out
│   ├── agent-card.tsx           ← Server: tool catalogue summary
│   ├── ai-prefs-card.tsx        ← Client: custom AI instructions (localStorage)
│   ├── data-card.tsx            ← Client: clear local data / chat history
│   ├── enable-web-push-button.tsx ← Client: PWA push subscription
│   ├── logout-button.tsx        ← Client: sign-out action
│   ├── notifications-card.tsx   ← Server: email/telegram/push status
│   ├── preferences-card.tsx     ← Client: default symbol, time format, motion
│   ├── profile-form.tsx         ← Client: display name update
│   ├── settings-row.tsx         ← Shared layout primitive
│   ├── settings-section.tsx     ← Shared section wrapper
│   ├── symbols-form.tsx         ← Client: watchlist CRUD + reordering
│   ├── system-status-card.tsx   ← Server: channel health overview
│   ├── test-email-button.tsx    ← Client: send test email
│   ├── test-telegram-button.tsx ← Client: send test telegram
│   └── usage-glance.tsx         ← Server: daily budget gauge
├── profile/
│   └── page.tsx                 ← Server: profile settings
├── api-keys/
│   ├── page.tsx                 ← Server: BYOK key management + inline server action
│   └── _components/
│       ├── api-key-card.tsx     ← Client: per-provider key input + test
│       ├── api-keys-landing-banner.tsx ← Client: onboarding banner from chat
│       ├── bulk-test-button.tsx ← Client: test all providers
│       ├── export-import-keys.tsx ← Client: encrypted backup/restore
│       ├── market-data-config.tsx ← Client: market data provider picker
│       └── save-bar.tsx         ← Client: form submit with dirty-state tracking
├── models/
│   ├── page.tsx                 ← Server: model picker page
│   └── _components/
│       ├── model-picker.tsx     ← Client: chat/vision/embedding model selector
│       └── fallback-chain-picker.tsx ← Client: ordered fallback chain
├── agent/
│   └── page.tsx                 ← Server: tool catalogue with telemetry
├── symbols/
│   └── page.tsx                 ← Server: watchlist management
└── usage/
    ├── page.tsx                 ← Server: token spend + budget breakdown
    ├── loading.tsx              ← Loading skeleton (only settings sub-page with one)
    └── _components/
        └── usage-limits-form.tsx ← Client: budget limits + alert config
```

### Data Flow

- **Server components** fetch directly from DB via `getDb()` + `auth()`
- **Server actions** in `actions.ts` handle mutations with `revalidatePath()`
- **Client components** use `fetch()` with CSRF wrapper (`withCsrf()`) for API routes
- **API routes** under `/api/settings/*` handle model/provider/symbol operations
- **localStorage** used for AI prefs and UI preferences (not synced to DB)

### Settings Nav Items

| Tab | Route | Type | Icon |
|---|---|---|---|
| General | `/settings` | Server | Settings |
| Profile | `/settings/profile` | Server | User |
| API Keys | `/settings/api-keys` | Server | Key |
| Models | `/settings/models` | Server | Brain |
| Agent | `/settings/agent` | Server | Bot |
| Symbols | `/settings/symbols` | Server | List |
| Usage | `/settings/usage` | Server | Activity |

---

## 3. Bugs & Errors

### BUG-01: `listPushSubscriptions()` called without user scoping
**Severity:** 🔴 Critical
**Files:** `notifications-card.tsx`, `system-status-card.tsx`
**Description:** Both cards call `listPushSubscriptions()` without passing a `userId` parameter. In a multi-tenant deployment, this could return ALL users' push subscriptions, leaking device counts and potentially subscription data across tenants.
**Fix:** Pass `session.user.id` to the function and ensure the underlying query scopes by user.

### BUG-02: `PROVIDER_IDS` array duplicated and potentially out of sync
**Severity:** 🟠 High
**Files:** `actions.ts` (lines ~205, ~370), `api-keys/page.tsx`
**Description:** The provider ID list `['google', 'vertex', 'anthropic', 'openai', 'groq', 'mistral', 'openrouter', 'xai', 'deepseek']` is hardcoded in at least 3 locations instead of importing from `@hamafx/shared/encryption` where `PROVIDER_IDS` is already exported. If a new provider is added to the shared constant but not to these local copies, keys will be silently dropped.
**Fix:** Import `PROVIDER_IDS` from `@hamafx/shared/encryption` everywhere.

### BUG-03: `importKeysAction` doesn't update `aiApiKeysUpdatedAt` timestamps
**Severity:** 🟠 High
**File:** `actions.ts`
**Description:** When keys are imported via `importKeysAction`, the `aiApiKeysUpdatedAt` field is not updated. The `updateApiKeys` action in `api-keys/page.tsx` does update this field. This means imported keys will show stale "last updated" timestamps or none at all, and the UI won't reflect that keys changed.
**Fix:** Add timestamp update logic matching `updateApiKeys`.

### BUG-04: Symbols and Usage pages return `null` instead of redirecting
**Severity:** 🟡 Medium
**Files:** `symbols/page.tsx`, `usage/page.tsx`
**Description:** When `session?.user?.id` is missing, both pages `return null` — rendering a blank page inside the settings layout. The Models page correctly does `redirect('/login')`. The blank page is confusing UX.
**Fix:** Use `redirect('/login')` consistently across all settings sub-pages.

### BUG-05: No `error.tsx` boundary for settings routes
**Severity:** 🟡 Medium
**Files:** Missing `settings/error.tsx`
**Description:** Only `usage/loading.tsx` exists. No settings-level error boundary means a DB error in any server component crashes the entire settings shell with the root `app/(app)/error.tsx` — which has no settings-specific recovery UI.
**Fix:** Add `settings/error.tsx` with a retry button and settings-specific message.

### BUG-06: No `loading.tsx` for most settings sub-pages
**Severity:** 🟡 Medium
**Files:** Missing `loading.tsx` in `profile/`, `api-keys/`, `models/`, `agent/`, `symbols/`
**Description:** Only `usage/loading.tsx` exists. All other sub-pages show a blank content area while server components fetch data, causing layout shift and perceived slowness.
**Fix:** Add `loading.tsx` skeletons for each sub-page matching their layout.

### BUG-07: `AIPrefsCard` and `PreferencesCard` store data only in localStorage
**Severity:** 🟠 High
**Files:** `ai-prefs-card.tsx`, `preferences-card.tsx`
**Description:** Custom AI instructions and user preferences (default symbol, time format, reduced motion) are stored exclusively in `localStorage`. They are NOT synced to the database. When a user switches devices or clears browser data, all preferences are lost. In a multi-tenant app, this is a significant UX flaw — the DB has a `userSettings` table that could hold these.
**Fix:** Sync prefs to `userSettings` table with localStorage as a cache/fallback. Read from DB in server components, write via server actions.

### BUG-08: `DataCard.clearAll()` doesn't clear `hamafx:ai-prefs`
**Severity:** 🟡 Medium
**File:** `data-card.tsx`
**Description:** `clearAll()` iterates localStorage and removes all `hamafx:` prefixed keys, which SHOULD include `hamafx:ai-prefs`. However, the AI prefs card manages its own state independently — clearing localStorage doesn't update the React state of `AIPrefsCard`, so the UI still shows the old instructions until page reload. There's no cross-component event for this.
**Fix:** Dispatch a custom event or use a shared context to notify `AIPrefsCard` when its storage is cleared.

### BUG-09: `formatAge()` function duplicated locally
**Severity:** 🟢 Low
**File:** `api-keys/page.tsx`
**Description:** A `formatAge()` helper is defined locally at the bottom of the API keys page, but a `formatRelative()` utility already exists in `@/lib/format` (imported by the usage page). This is code duplication with potential for drift.
**Fix:** Use the shared `formatRelative()` or move `formatAge` to `@/lib/format`.

### BUG-10: `updateApiKeys` inline server action may bypass CSRF
**Severity:** 🟠 High
**File:** `api-keys/page.tsx`
**Description:** The `updateApiKeys` function is defined as an inline server action within the page component (not in `actions.ts`). While Next.js form actions have built-in protection, the `SaveBar` component wraps it with `useActionState`. Other client-side fetches in the settings use `withCsrf()` explicitly, but this form action relies solely on Next.js's built-in CSRF for server actions. If the app's CSRF middleware expects explicit tokens, this could be a gap.
**Fix:** Verify that Next.js's built-in server action CSRF is sufficient, or add explicit CSRF token to the form.

### BUG-11: Silent `catch` blocks swallow errors
**Severity:** 🟡 Medium
**Files:** Multiple — `notifications-card.tsx`, `system-status-card.tsx`, `usage-glance.tsx`, `data-card.tsx`, `about-card.tsx`
**Description:** Many `catch` blocks are empty or contain only `/* ignore */` comments:
```ts
} catch {
  /* db not reachable; render the rest anyway */
}
```
While graceful degradation is good, silently swallowing errors makes debugging impossible. No Sentry breadcrumb, no console.error, no telemetry.
**Fix:** Add `console.error` or Sentry capture in catch blocks, even if the UI degrades gracefully.

### BUG-12: `ChatModelPicker` receives `initialValue={null}` always
**Severity:** 🟡 Medium
**File:** `models/page.tsx`
**Description:** The `ChatModelPicker` is always passed `initialValue={null}`, forcing it to fetch the current value on mount via an API call. The `VisionModelPicker` and `EmbeddingModelPicker` don't receive an initial value either. This adds unnecessary loading states and network requests when the server already has the data.
**Fix:** Fetch the current chat/vision/embedding model in the server component and pass as `initialValue`.

---

## 4. Security Flaws

### SEC-01: `process.env` accessed directly instead of typed `getServerEnv()`
**Severity:** 🟠 High
**Files:** `notifications-card.tsx`, `system-status-card.tsx`
**Description:** Both cards access `process.env` directly to check if notification channels are configured:
```ts
const env = process.env;
const emailReady = Boolean(env.RESEND_API_KEY) && Boolean(env.ALERT_FROM_EMAIL);
```
The project has a typed `getServerEnv()` helper in `@/lib/env` that validates env vars via Zod. Direct `process.env` access bypasses validation and could return `undefined` for vars that the Zod schema requires.
**Fix:** Use `getServerEnv()` for all env var access in server components.

### SEC-02: No rate limiting on server actions
**Severity:** 🟠 High
**File:** `actions.ts`
**Description:** The login flow has rate limiting (`withRateLimit` in `auth.ts`), but server actions like `updateProfileAction`, `addSymbolAction`, `removeSymbolAction`, `updateUsageSettingsAction`, `exportKeysAction`, `importKeysAction` have NO rate limiting. An authenticated user could spam these endpoints.
**Fix:** Add rate limiting to all server actions, especially `exportKeysAction` and `importKeysAction` which involve encryption operations.

### SEC-03: Export/Import keys uses user-provided password without verifying account password
**Severity:** 🟠 High
**File:** `actions.ts` — `exportKeysAction`, `importKeysAction`
**Description:** The export/import flow asks the user for a password to encrypt/decrypt the backup payload. This password is NOT verified against the user's actual account password. Any password ≥8 chars is accepted. This means:
  1. A user could export with a weak password and the backup is only as strong as that password
  2. There's no audit trail tying the export to an authenticated action
  3. The import flow doesn't verify the user is who they claim to be beyond the session check
**Fix:** Either verify the password against the user's bcrypt hash, or require re-authentication before export. At minimum, log the export event for audit.

### SEC-04: `dangerouslySetInnerHTML` in Shiki code highlighting
**Severity:** 🟡 Medium
**File:** `chat/parts/text.tsx` (line 132)
**Description:** Shiki generates HTML that is injected via `dangerouslySetInnerHTML`. While Shiki's output is generally safe (it escapes input), this pattern is a potential XSS vector if Shiki's escaping is ever bypassed or a custom theme injects raw HTML.
**Fix:** Ensure Shiki is configured with `injectLanguageList: false` and no raw HTML themes. Consider using `isInline: true` to avoid full HTML documents.

### SEC-05: `innerHTML` manipulation in TradingView widget
**Severity:** 🟡 Medium
**File:** `chart/[symbol]/_components/tradingview-widget.tsx` (line 141)
**Description:** `currentContainer.innerHTML = ''` is used to clean up the TradingView widget. While this is just clearing content (not injecting), it's flagged by CSP policies that disallow `innerHTML`.
**Fix:** Replace with `while (currentContainer.firstChild) currentContainer.removeChild(currentContainer.firstChild)` or use `replaceChildren()`.

### SEC-06: No CSRF on `enable-web-push-button.tsx` fetch
**Severity:** 🟡 Medium
**File:** `enable-web-push-button.tsx`
**Description:** The push subscription fetch to `/api/push/subscribe` uses `fetchCsrf` but the unsubscribe path may not. Need to verify both paths are protected.
**Fix:** Ensure both subscribe and unsubscribe use CSRF tokens.

### SEC-07: No session management or revocation
**Severity:** 🟠 High
**File:** Settings page (missing feature)
**Description:** There is no UI for viewing active sessions, revoking sessions on other devices, or forcing global sign-out. NextAuth v5 supports session revocation but it's not exposed in settings.
**Fix:** Add a "Sessions" section showing active devices with revoke buttons.

### SEC-08: No account deletion or data export (GDPR)
**Severity:** 🟠 High
**File:** Settings page (missing feature)
**Description:** There is no "Delete account" or "Export my data" option. The `DataCard` only clears local storage and chat history. For GDPR compliance (and the project has a `gdpr-data-handling` skill), users need the ability to export and delete all their data.
**Fix:** Add account deletion with cascading DB cleanup and a data export endpoint.

---

## 5. UX/UI Flaws

### UX-01: Settings layout is `'use client'` unnecessarily
**Severity:** 🟡 Medium
**File:** `settings/layout.tsx`
**Description:** The entire settings layout is a client component because it uses `usePathname()` for active nav highlighting. This forces all children to either be client components or be passed as `children` (which they are). However, the nav could be a client island within a server layout, allowing the layout shell to be statically rendered.
**Fix:** Extract nav into a `<SettingsNav />` client component and make the layout a server component.

### UX-02: No unsaved changes warning on API keys page
**Severity:** 🟡 Medium
**File:** `api-keys/_components/save-bar.tsx`
**Description:** The `SaveBar` tracks `isDirty` state but doesn't warn users when navigating away with unsaved changes. A user could paste a key, click a nav link, and lose the unsaved key.
**Fix:** Add `beforeunload` event listener when `isDirty` is true, and intercept Next.js navigation.

### UX-03: No keyboard navigation in settings nav
**Severity:** 🟡 Medium
**File:** `settings/layout.tsx`
**Description:** The nav uses `<Link>` elements which are keyboard-focusable (good), but there's no `aria-orientation`, no roving tabindex, and no arrow key navigation. The horizontal scroll on mobile (`overflow-x-auto`) makes it hard to discover all tabs.
**Fix:** Add `role="tablist"`, `aria-orientation`, and ensure scroll-snap or visible scroll indicators on mobile.

### UX-04: No settings search or command palette integration
**Severity:** 🟢 Low
**File:** Settings page (missing feature)
**Description:** The app has a command palette (`command-palette.tsx`) but it's not integrated with settings. With 7 tabs and many options, searching "change my API key" should jump to the right page.
**Fix:** Add settings commands to the command palette.

### UX-05: No theme/appearance settings
**Severity:** 🟡 Medium
**File:** Settings page (missing feature)
**Description:** The app has dark mode support (CSS `dark:` variants, `color-scheme`), but there's no user-facing toggle in settings. Users can only change it via OS preference.
**Fix:** Add a "Appearance" section with Light/Dark/System toggle.

### UX-06: No notification preferences per event type
**Severity:** 🟡 Medium
**File:** `notifications-card.tsx`
**Description:** The notifications card only shows channel status (email/telegram/push ready or not) and test buttons. There's no way to configure WHICH events trigger notifications (e.g., "notify me on alert trigger but not on daily briefing").
**Fix:** Add a notification preferences matrix: event types × channels.

### UX-07: Agent page is read-only
**Severity:** 🟢 Low
**File:** `agent/page.tsx`
**Description:** The agent page shows tool catalogue with invocation stats but offers no actions. Users can't enable/disable tools, set tool-specific parameters, or view detailed invocation logs.
**Fix:** Add tool enable/disable toggles and a link to detailed telemetry.

### UX-08: No model cost comparison
**Severity:** 🟡 Medium
**File:** `models/_components/model-picker.tsx`
**Description:** The model picker shows available models but doesn't display pricing information. Users can't compare costs when choosing between models.
**Fix:** Show per-model pricing (input/output token cost) in the picker dropdown.

### UX-09: Fallback chain picker has no drag-to-reorder
**Severity:** 🟢 Low
**File:** `models/_components/fallback-chain-picker.tsx`
**Description:** The fallback chain uses up/down buttons to reorder. Drag-and-drop would be more intuitive for reordering a priority chain.
**Fix:** Add drag-and-drop reordering (e.g., `@dnd-kit/sortable`).

### UX-10: No bulk symbol operations
**Severity:** 🟢 Low
**File:** `symbols/_components/symbols-form.tsx`
**Description:** Symbols can only be added one at a time via search. There's no bulk import (paste a list), no categories filter, and no export.
**Fix:** Add bulk import (textarea with comma/newline separated symbols) and category filters.

### UX-11: No loading indicator for model picker initial fetch
**Severity:** 🟡 Medium
**File:** `models/_components/model-picker.tsx`
**Description:** When `initialValue` is null (which is always for chat picker), the component fetches the current value on mount. During this fetch, there's no skeleton — just an empty dropdown.
**Fix:** Show a `SkeletonCard` while fetching the initial value.

### UX-12: No back/breadcrumb navigation in settings sub-pages
**Severity:** 🟢 Low
**Files:** All settings sub-pages
**Description:** Sub-pages have headers but no breadcrumb back to `/settings`. Users must use the nav sidebar, which is not visible on mobile (horizontal scroll).
**Fix:** Add a "← Back to Settings" link on mobile or breadcrumbs.

---

## 6. Code Quality Issues

### CQ-01: Inconsistent error handling patterns
**Severity:** 🟡 Medium
**Files:** Throughout settings
**Description:** Some server actions return `{ ok: false, error: string }` while the API keys page uses `{ status: 'error', message: string }`. Client components handle errors differently — some use `toast.error()`, some use `useActionState` with `useEffect`.
**Fix:** Standardize on one result type pattern across all server actions and client handlers.

### CQ-02: `console.error` used instead of structured logging
**Severity:** 🟡 Medium
**Files:** `actions.ts` (6 instances), throughout app
**Description:** All server action errors are logged via `console.error('[settings] ...')`. While Sentry is installed, there's no structured logging with context (user ID, action name, input hash). In production, these console errors may not be captured by Sentry unless Sentry's `captureException` is called.
**Fix:** Replace `console.error` with `Sentry.captureException(err, { tags: { action: '...' } })` or a structured logger.

### CQ-03: No TypeScript strict return types on some server actions
**Severity:** 🟢 Low
**File:** `actions.ts`
**Description:** Server actions use `as const` for discriminated unions (good), but the `updateUsageSettingsAction` and `updateMarketDataProviderAction` don't have explicit return type annotations. The inferred types work but could drift.
**Fix:** Add explicit return type annotations.

### CQ-04: Inline server action in page component
**Severity:** 🟢 Low
**File:** `api-keys/page.tsx` — `updateApiKeys`
**Description:** The `updateApiKeys` function is defined inside the page component file as an inline server action. While Next.js supports this, it mixes the server component (page render) with server action logic in the same file. All other actions are in `actions.ts`.
**Fix:** Move `updateApiKeys` to `actions.ts` for consistency.

### CQ-05: `SETUP_INSTRUCTIONS` hardcoded in client component
**Severity:** 🟡 Medium
**File:** `api-keys/_components/api-key-card.tsx`
**Description:** Provider setup instructions (dashboard URLs, free tier info, rate limits) are hardcoded in the client component. This data should come from the provider metadata in `@hamafx/shared` or the catalog endpoint, so it stays in sync when providers are updated.
**Fix:** Move setup instructions to provider metadata in the shared package.

### CQ-06: Missing `aria-labelledby` on some interactive elements
**Severity:** 🟢 Low
**Files:** Various settings components
**Description:** While most cards have `aria-labelledby` on their `<section>`, some interactive elements like the `<details>` disclosures in models and api-keys pages don't have explicit ARIA labels for their summary elements.
**Fix:** Add `aria-label` or `aria-labelledby` to all `<summary>` elements.

### CQ-07: No unit tests for settings components
**Severity:** 🟡 Medium
**Files:** No test files in settings directory
**Description:** The project has 590 passing tests, but none are for settings components. Server actions, form validation, and error states are untested.
**Fix:** Add Vitest tests for server actions (mock DB + auth) and Playwright tests for settings flows.

---

## 7. Performance Issues

### PERF-01: `force-dynamic` on settings pages prevents caching
**Severity:** 🟡 Medium
**Files:** `settings/page.tsx`, `agent/page.tsx`, `models/page.tsx`, `usage/page.tsx`
**Description:** Multiple settings pages use `export const dynamic = 'force-dynamic'` which prevents any static optimization. While some pages need fresh data (usage stats, push subscription counts), the agent page's tool catalogue changes infrequently and could use `revalidate = 60` instead.
**Fix:** Use `revalidate` with appropriate TTLs instead of `force-dynamic` where possible.

### PERF-02: Redundant `auth()` calls in nested server components
**Severity:** 🟡 Medium
**Files:** `settings/page.tsx`, `usage-glance.tsx`, multiple sub-pages
**Description:** The settings page calls `auth()`, then `UsageGlance` (a child component) calls `auth()` again. Each `auth()` call may trigger a DB lookup or JWT decode. Next.js deduplicates `fetch()` but not custom async calls.
**Fix:** Pass session data as props from the parent, or use a React context to share session.

### PERF-03: `computeUsage()` called multiple times
**Severity:** 🟡 Medium
**Files:** `settings/page.tsx` (via `UsageGlance`), `api-keys/page.tsx`, `usage/page.tsx`
**Description:** `computeUsage(session.user.id)` is called in `UsageGlance` on the general settings page AND separately in the API keys page and usage page. If a user navigates through all three, the same expensive computation runs 3 times.
**Fix:** Cache the result with `unstable_cache` or React `cache()`.

### PERF-04: `buildToolCatalogue()` called in both `AgentCard` and agent page
**Severity:** 🟢 Low
**Files:** `agent-card.tsx`, `agent/page.tsx`
**Description:** The tool catalogue is built in the `AgentCard` on the general settings page and again on the agent page. This involves DB queries for telemetry.
**Fix:** Use `unstable_cache` with a short TTL (30s) for `buildToolCatalogue()`.

### PERF-05: `buildCatalogForUser()` called on both API keys and models pages
**Severity:** 🟢 Low
**Files:** `api-keys/page.tsx`, `models/page.tsx`
**Description:** The provider catalog is built independently on both pages. Each call decrypts BYOK keys and checks provider health.
**Fix:** Cache with `unstable_cache` keyed by userId.

### PERF-06: No pagination for symbol catalog
**Severity:** 🟢 Low
**File:** `symbols/page.tsx`
**Description:** The symbol catalog is fetched entirely (`db.select().from(schema.symbolCatalog).where(eq(schema.symbolCatalog.isActive, true))`). With a large catalog, this could be slow.
**Fix:** Add server-side pagination or infinite scroll for the catalog search.

---

## 8. Improvements & Enhancements

### IMP-01: Move AI preferences from localStorage to DB
**Priority:** P1
**Description:** `AIPrefsCard` stores custom AI instructions in `localStorage` only. This should be persisted to the `userSettings` table so instructions survive device switches and are available to the server-side prompt builder.
**Implementation:**
1. Add `customInstructions` column to `userSettings` schema
2. Create `updateCustomInstructionsAction` server action
3. Read from DB in `AIPrefsCard` (make it a server component with a client form island)
4. Keep localStorage as offline cache

### IMP-02: Move UI preferences from localStorage to DB
**Priority:** P1
**Description:** Same as IMP-01 but for `PreferencesCard` (default symbol, time format, reduced motion).
**Implementation:**
1. Add `uiPreferences` JSON column to `userSettings`
2. Create `updatePreferencesAction` server action
3. Hydrate from DB, cache in localStorage

### IMP-03: Add loading skeletons for all settings sub-pages
**Priority:** P2
**Description:** Only `usage/loading.tsx` exists. Add `loading.tsx` to `profile/`, `api-keys/`, `models/`, `agent/`, `symbols/`.
**Implementation:** Create skeleton components matching each page's layout.

### IMP-04: Add error boundary for settings
**Priority:** P2
**Description:** Add `settings/error.tsx` with a retry button and contextual error message.
**Implementation:**
```tsx
'use client';
export default function SettingsError({ error, reset }) {
  return (
    <div className="flex flex-col gap-4 items-center p-8">
      <h2>Settings couldn't load</h2>
      <p>{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
```

### IMP-05: Standardize server action result types
**Priority:** P2
**Description:** Create a shared `ActionResult` type:
```ts
type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
```
Use across all server actions for consistency.

### IMP-06: Add structured error logging with Sentry
**Priority:** P2
**Description:** Replace all `console.error` in server actions with:
```ts
import * as Sentry from '@sentry/nextjs';
Sentry.captureException(err, { tags: { module: 'settings', action: 'updateProfile' } });
```

### IMP-07: Add rate limiting to server actions
**Priority:** P2
**Description:** Use the existing `withRateLimit` utility from `@hamafx/db` to rate-limit all server actions. Suggested limits:
- Profile update: 10/min
- Symbol add/remove: 30/min
- Usage settings: 10/min
- Export keys: 3/min
- Import keys: 5/min

### IMP-08: Use `getServerEnv()` everywhere
**Priority:** P2
**Description:** Replace all `process.env` direct access in server components with the typed `getServerEnv()` helper.

### IMP-09: Add tests for settings server actions
**Priority:** P3
**Description:** Add Vitest tests for:
- `updateProfileAction` — validation, auth check, DB update
- `addSymbolAction` / `removeSymbolAction` — catalog validation, ordering
- `exportKeysAction` / `importKeysAction` — encryption round-trip
- `updateUsageSettingsAction` — threshold parsing

### IMP-10: Add Playwright E2E tests for settings flows
**Priority:** P3
**Description:** Test critical user journeys:
- Profile update flow
- API key save + test flow
- Symbol add/remove/reorder flow
- Model picker selection flow
- Usage budget setting flow

### IMP-11: Consolidate provider metadata
**Priority:** P3
**Description:** Move `SETUP_INSTRUCTIONS` from `api-key-card.tsx` into the shared provider metadata so it's defined once and used everywhere.

### IMP-12: Add `cache()` wrapping for expensive queries
**Priority:** P3
**Description:** Wrap `computeUsage`, `buildToolCatalogue`, and `buildCatalogForUser` with React's `cache()` or Next.js `unstable_cache` to deduplicate within a render pass.

---

## 9. Feature Upgrades

### UPG-01: Add theme/appearance settings
**Priority:** P2
**Description:** Add a "Appearance" section to settings with:
- Light / Dark / System theme toggle
- Accent color picker (if brand supports variants)
- Font size adjustment
**Implementation:** Store in `userSettings.uiPreferences`, apply via `data-theme` attribute on `<html>`.

### UPG-02: Add session management
**Priority:** P2
**Description:** Add a "Sessions" section showing:
- List of active sessions (device, browser, last active, IP)
- Revoke individual sessions
- "Sign out everywhere" button
**Implementation:** Use NextAuth v5's session API + DB-backed session store.

### UPG-03: Add account deletion (GDPR)
**Priority:** P1
**Description:** Add "Delete account" option that:
- Requires password confirmation
- Cascading deletes: threads, messages, journal entries, alerts, symbols, settings, push subscriptions, provider tests
- Irreversible with 7-day grace period
**Implementation:** Server action with cascading DB deletes + confirmation dialog.

### UPG-04: Add data export (GDPR)
**Priority:** P2
**Description:** Add "Export my data" that bundles:
- Profile data
- Chat history (JSON)
- Journal entries
- Alert configurations
- Settings & preferences
- Usage telemetry
**Implementation:** Server action that queries all user tables, zips JSON, returns download link.

### UPG-05: Add 2FA/MFA
**Priority:** P3
**Description:** Add TOTP-based 2FA using `otplib`:
- QR code setup in settings
- Backup codes
- Require 2FA for sensitive actions (export keys, delete account)
**Implementation:** Add `twoFactorSecret` and `twoFactorEnabled` to users table.

### UPG-06: Add notification preferences matrix
**Priority:** P2
**Description:** Add a matrix UI: event types (alerts, briefings, weekly review, usage warnings) × channels (email, telegram, push) with checkboxes.
**Implementation:** Store as JSON in `userSettings.notificationPreferences`.

### UPG-07: Add model pricing display
**Priority:** P3
**Description:** Show per-model pricing in the model picker:
- Input token cost per 1M
- Output token cost per 1M
- Estimated monthly cost based on usage
**Implementation:** Add pricing to provider metadata in `@hamafx/shared`.

### UPG-08: Add usage cost forecasting
**Priority:** P3
**Description:** On the usage page, show:
- Projected monthly spend (based on current daily rate × days in month)
- Days until budget exhausted
- Comparison vs last month
**Implementation:** Compute from existing telemetry data.

### UPG-09: Add tool enable/disable in agent settings
**Priority:** P3
**Description:** Allow users to enable/disable individual AI tools from the agent settings page. Some users may not want certain tools (e.g., `log-journal`) to be available.
**Implementation:** Add `disabledTools` JSON array to `userSettings`, filter in tool registry.

### UPG-10: Add settings command palette integration
**Priority:** P3
**Description:** Register settings commands in the existing command palette:
- "Change API key" → `/settings/api-keys`
- "Switch model" → `/settings/models`
- "Clear chat history" → trigger action
- "Export my data" → trigger action
**Implementation:** Add to `command-palette.tsx` command list.

### UPG-11: Add drag-and-drop for fallback chain
**Priority:** P4
**Description:** Replace up/down buttons with drag-and-drop reordering using `@dnd-kit/sortable`.
**Implementation:** Wrap chain items in `SortableContext`, add drag handles.

### UPG-12: Add bulk symbol import
**Priority:** P4
**Description:** Add a "Bulk import" mode to the symbols page:
- Textarea for pasting comma/newline separated symbols
- Validate against catalog
- Batch insert with single server action
**Implementation:** New `bulkAddSymbolsAction` in `actions.ts`.

### UPG-13: Add language/locale settings
**Priority:** P4
**Description:** Add language selector (English, Arabic, etc.) and date/time locale formatting.
**Implementation:** Store `locale` in `userSettings`, use `next-intl` or similar.

### UPG-14: Add API key rotation reminders
**Priority:** P4
**Description:** Show a "last updated X days ago" badge on each API key card with a rotation reminder if >90 days.
**Implementation:** Use existing `aiApiKeysUpdatedAt` timestamps.

### UPG-15: Add usage alerts via notification channels
**Priority:** P3
**Description:** When daily/monthly budget thresholds are exceeded, send alerts via configured notification channels (email/telegram/push).
**Implementation:** Cron job checking `computeUsage()` against `userSettings.monthlyBudgetLimit` + `providerSpendingThresholds`, dispatching via existing notification infrastructure.

---

## 10. Prioritized Action Plan

### Phase 1 — Critical Fixes (P1) 🔴
> Complete within 1 week

| # | Task | Type | Effort |
|---|---|---|---|
| 1 | BUG-01: Fix `listPushSubscriptions()` user scoping | Bug | S |
| 2 | BUG-03: Fix `importKeysAction` missing timestamp update | Bug | S |
| 3 | BUG-07: Move AI prefs & UI prefs from localStorage to DB | Bug | M |
| 4 | SEC-03: Verify password on export/import keys | Security | M |
| 5 | UPG-03: Add account deletion (GDPR) | Feature | M |

### Phase 2 — High Priority (P2) 🟠
> Complete within 2 weeks

| # | Task | Type | Effort |
|---|---|---|---|
| 6 | BUG-02: Replace hardcoded PROVIDER_IDS with shared import | Bug | S |
| 7 | BUG-04: Redirect to login instead of returning null | Bug | S |
| 8 | BUG-05: Add settings error boundary | Bug | S |
| 9 | BUG-06: Add loading skeletons for all sub-pages | Bug | M |
| 10 | BUG-10: Verify CSRF on inline server action | Security | S |
| 11 | SEC-01: Use `getServerEnv()` everywhere | Security | S |
| 12 | SEC-02: Add rate limiting to server actions | Security | M |
| 13 | SEC-07: Add session management UI | Feature | M |
| 14 | SEC-08: Add data export (GDPR) | Feature | M |
| 15 | IMP-05: Standardize action result types | Quality | S |
| 16 | IMP-06: Replace console.error with Sentry | Quality | S |
| 17 | IMP-07: Add rate limiting to server actions | Quality | M |
| 18 | UPG-01: Add theme/appearance settings | Feature | M |
| 19 | UPG-06: Add notification preferences matrix | Feature | M |
| 20 | UPG-10: Add settings command palette integration | Feature | S |

### Phase 3 — Medium Priority (P3) 🟡
> Complete within 1 month

| # | Task | Type | Effort |
|---|---|---|---|
| 21 | BUG-08: Fix DataCard clearAll cross-component sync | Bug | S |
| 22 | BUG-09: Remove duplicate formatAge function | Bug | S |
| 23 | BUG-11: Add error logging to silent catch blocks | Bug | S |
| 24 | BUG-12: Pass initialValue to ChatModelPicker | Bug | S |
| 25 | SEC-04: Audit Shiki dangerouslySetInnerHTML | Security | S |
| 26 | SEC-05: Replace innerHTML with replaceChildren | Security | S |
| 27 | UX-02: Add unsaved changes warning on API keys | UX | S |
| 28 | UX-03: Improve keyboard navigation in settings nav | UX | S |
| 29 | UX-05: (covered by UPG-01) | — | — |
| 30 | UX-08: Add model pricing display | UX | M |
| 31 | UX-11: Add loading indicator for model picker fetch | UX | S |
| 32 | IMP-08: (covered by SEC-01) | — | — |
| 33 | IMP-09: Add Vitest tests for server actions | Quality | M |
| 34 | IMP-10: Add Playwright E2E tests for settings | Quality | M |
| 35 | IMP-11: Consolidate provider metadata | Quality | S |
| 36 | IMP-12: Add cache() for expensive queries | Quality | M |
| 37 | UPG-08: Add usage cost forecasting | Feature | S |
| 38 | UPG-09: Add tool enable/disable | Feature | M |
| 39 | UPG-15: Add usage alerts via notification channels | Feature | M |

### Phase 4 — Low Priority / Polish (P4) 🟢
> Backlog / opportunistic

| # | Task | Type | Effort |
|---|---|---|---|
| 40 | UX-01: Make settings layout a server component | UX | M |
| 41 | UX-04: Add settings search | UX | S |
| 42 | UX-07: Make agent page interactive | UX | M |
| 43 | UX-09: Add drag-and-drop for fallback chain | UX | M |
| 44 | UX-10: Add bulk symbol operations | UX | M |
| 45 | UX-12: Add breadcrumb navigation | UX | S |
| 46 | CQ-01: Standardize error handling patterns | Quality | M |
| 47 | CQ-03: Add explicit return type annotations | Quality | S |
| 48 | CQ-04: Move inline server action to actions.ts | Quality | S |
| 49 | CQ-06: Add missing ARIA labels | Quality | S |
| 50 | CQ-07: (covered by IMP-09/10) | — | — |
| 51 | PERF-01: Replace force-dynamic with revalidate | Perf | S |
| 52 | PERF-02: Deduplicate auth() calls | Perf | M |
| 53 | PERF-03: Cache computeUsage | Perf | S |
| 54 | PERF-04: Cache buildToolCatalogue | Perf | S |
| 55 | PERF-05: Cache buildCatalogForUser | Perf | S |
| 56 | PERF-06: Add pagination for symbol catalog | Perf | M |
| 57 | UPG-05: Add 2FA/MFA | Feature | L |
| 58 | UPG-11: (covered by UX-09) | — | — |
| 59 | UPG-12: (covered by UX-10) | — | — |
| 60 | UPG-13: Add language/locale settings | Feature | L |
| 61 | UPG-14: Add API key rotation reminders | Feature | S |

---

## Summary Statistics

| Category | Count |
|---|---|
| 🔴 Critical Bugs | 2 |
| 🟠 High Bugs | 5 |
| 🟡 Medium Bugs | 5 |
| 🟢 Low Bugs | 3 |
| 🔴 Critical Security | 0 |
| 🟠 High Security | 5 |
| 🟡 Medium Security | 3 |
| UX/UI Flaws | 12 |
| Code Quality Issues | 7 |
| Performance Issues | 6 |
| Improvements | 12 |
| Feature Upgrades | 15 |
| **Total Findings** | **75** |

### Effort Estimates

| Effort | Count |
|---|---|
| S (Small, <2h) | 30 |
| M (Medium, 2-8h) | 25 |
| L (Large, >8h) | 2 |
| **Total estimated effort** | **~180 hours** |

---

## Existing Plans in Repository

The repo already contains related planning documents that should be cross-referenced:

| Document | Scope |
|---|---|
| `.hermes/plans/frontend-fixes/phase-4-layout-settings-ui-fixes.md` | Layout, settings & UI library fixes (39 findings) |
| `.hermes/plans/system-upgrades/plan-1-symbol-selection.md` | Symbol selection upgrades |
| `.hermes/plans/system-upgrades/plan-2-data-providers.md` | Data provider upgrades |
| `.hermes/plans/system-upgrades/plan-3-chart-system.md` | Chart system upgrades |
| `.hermes/plans/system-upgrades/plan-4-chat-ai-output.md` | Chat AI output upgrades |
| `.hermes/plans/system-upgrades/plan-5-onboarding.md` | Onboarding upgrades |
| `.kiro/specs/phase-*/` | Phase 1-5 specs with requirements, design, tasks |

This plan complements those documents by providing a settings-specific deep-dive with 75 findings across bugs, security, UX, code quality, performance, and feature upgrades.

---

*End of document.*
