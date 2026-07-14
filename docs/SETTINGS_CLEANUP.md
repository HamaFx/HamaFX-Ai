# Settings Cleanup, Restructure & Hardening — Summary

**Date:** July 2026
**Branch:** `feat/settings-cleanup` (based on `main`)
**PR:** Settings section cleanup, restructure, de-duplication & polish

---

## Final Information Architecture

### Before
The Settings section had **two competing information architectures** overlapping heavily:

- **(A)** A giant "General" scroll page stacking: System status, Usage glance, Security, Notifications, AI & Agent, Data, About, Admin, plus a floating Appearance card at the bottom.
- **(B)** A left sidebar of dedicated subpages: General, Profile, API Keys, Models, Agent, Symbols, Usage, Track Record, Portfolio, Telegram, Billing.

Key sections (Security, Notifications, Appearance, Data) were **only reachable by blind scrolling** the General page — undiscoverable from the nav. Several widgets showed the same data in two places (channel readiness in both `SystemStatusCard` and `NotificationsCard`).

### After
A single clean architecture with the **sidebar-of-subpages** as the primary IA:

| Route | Content |
|-------|---------|
| `/settings` (General) | Overview: System Status + Usage Glance + Quick-link cards → About + Admin |
| `/settings/profile` | Profile (display name, email) |
| `/settings/api-keys` | BYOK provider keys, market data config, key export/import |
| `/settings/models` | Chat/vision/embedding model pickers, fallback chain, comparison table |
| `/settings/agent` | Tool catalogue, analysis mode, model overrides, custom instructions |
| `/settings/symbols` | Watchlist management with drag-and-drop |
| **`/settings/security`** ✨ | Password, 2FA, linked accounts, active sessions |
| **`/settings/notifications`** ✨ | Test buttons (Email/Web-push), noise control, notification preferences |
| **`/settings/appearance`** ✨ | Theme (light/dark/system), locale |
| **`/settings/data`** ✨ | Data & cache management, watchlist preferences |
| `/settings/usage` | Token spend, budget gauges, model/agent breakdowns, recent turns |
| `/settings/track-record` | AI signal accuracy, per-model/horizon/action breakdowns |
| `/settings/portfolio` | Open positions with live P&L, risk dashboard, account settings |
| `/settings/telegram` | Bot linking, test notifications, available commands |
| `/settings/billing` | Subscription status, plans, payment history |

✨ = new subpages

---

## Bugs Fixed

### Phase 1 — Mechanical

| # | Bug | Severity | Fix |
|---|-----|----------|-----|
| 3.1 | `Icon<Word>` strings clobbered in visible UI text/comments across 15 files (e.g. `Open HamaFX IconRobot on Telegram`) | P0 | Restored all human-readable words |
| 3.2 | `/settings/telegram` rendered two `<PageHeader>` components with two `<h1>`s | P0 | Removed duplicate header, used canonical `<h2>` pattern |
| 3.3 | `/settings/agent` used a rogue `<main>` + `<h1>` with duplicate padding | P1 | Converted to canonical subpage with `<div>` + `<h2>` |
| 3.4 | `ChangePasswordCard` used `surface-panel` (sharp corners, no gap) | P1 | Switched to canonical card wrapper |
| 3.7 | `UsagePage.BudgetCard` division-by-zero when `maxDailyUsd <= 0` | P2 | Added `> 0` guard |

### Phase 2 — Logic

| # | Bug | Severity | Fix |
|---|-----|----------|-----|
| 3.5 | `NotificationsCard` nested `<Link><button>`, wrong destinations, no-op links | P0/P1 | Removed Link wrappers, fixed destinations, added chevron only for Telegram |
| 3.6 | `NoiseControlCard` save dropped trailing edits, preview spammed per keystroke | P1 | Proper debounce with trailing save queue; preview only after successful save, labeled "based on saved settings" |
| 3.8 | `Portfolio` empty state promised an "Add position" action that doesn't exist | P2 | Reworded to reference MT5/HamaBridge EA; added read-only note to Account Settings panel |

### a11y

- `NotificationPrefsCard`: Table columns now have visible labels (was icon-only with `sr-only`)
- `AboutCard`: Heading changed from "Session" to "About"; removed hardcoded stack strings
- All Test buttons, copy buttons, and revoke buttons verified with `aria-label`

---

## Canonical Patterns Introduced

### Subpage Shell (used on all 15 subpages)
```tsx
<div className="flex flex-col gap-6 max-w-2xl">       {/* or full-width for dashboards */}
  <div className="flex flex-col gap-1">
    <h2 className="text-fg text-lg font-semibold tracking-tight">{Title}</h2>
    <p className="text-fg-subtle text-sm">{Description}</p>
  </div>
  {/* content */}
</div>
```

### Card Wrapper (standardized across all cards)
```tsx
<div className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-4">
  <h2 className="text-fg text-base font-semibold tracking-tight">{Title}</h2>
  {/* optional meta: text-fg-subtle text-caption uppercase tracking-wider */}
</div>
```

### Divider
Shared `RowDivider` component at `_components/row-divider.tsx`:
```tsx
<div className="border-border -mx-4 my-1 border-t" />
```
All inline `<hr>` variants eliminated. No `surface-panel` usages remain.

### Max-width Policy
- **Content-form subpages**: `max-w-2xl` (profile, api-keys, models, symbols, agent, security, notifications, appearance, data, billing)
- **Dashboards**: full-width (usage, track-record, portfolio)
- **Overview**: full-width (General page)

---

## De-duplication

- **Channel readiness**: Lives only in `SystemStatusCard` on the General overview. `NotificationsCard` component removed from General page (deleted as dead code).
- **Telegram test**: Lives only on `/settings/telegram`. Removed from `/settings/notifications`.
- **AIPrefsCard**: Lives on `/settings/agent` (was only on General page, now effectively discoverable).
- **`NotificationsCard`**: Deleted — its StatusPill + channel test rows are now inline in `/settings/notifications/page.tsx`.

---

## Files Changed

### Modified (22 files)
| File | Changes |
|------|---------|
| `_components/ai-prefs-card.tsx` | Removed duplicate `/settings/models` link |
| `_components/appearance-card.tsx` | (unchanged — moved to subpage) |
| `_components/change-password-card.tsx` | Fixed card wrapper, heading style, stale comment |
| `_components/data-card.tsx` | Switched to shared `RowDivider`, removed local fn + inline `<hr>` |
| `_components/noise-control-card.tsx` | Fixed clobbered comment, rewrote save/preview effects |
| `_components/notifications-card.tsx` | **Deleted** — dead code after IA restructure |
| `_components/notification-prefs-card.tsx` | Added visible column labels, removed dead const |
| `_components/preferences-card.tsx` | Switched to shared `RowDivider`, removed local fn |
| `_components/sessions-card.tsx` | Switched to shared `RowDivider`, removed inline `<hr>` |
| `_components/settings-nav.tsx` | Added 4 new entries: Security, Notifications, Appearance, Data |
| `_components/symbols-form.tsx` | Fixed clobbered comments |
| `_components/telegram-link-card.tsx` | Fixed clobbered strings (`IconRobot`→`Bot`, etc.) |
| `_components/test-email-button.tsx` | Fixed clobbered comment |
| `_components/test-telegram-button.tsx` | Fixed clobbered comment |
| `page.tsx` (General) | Refactored to overview with QuickLink grid |
| `agent/page.tsx` | Fixed rogue `<main>`, added `AIPrefsCard`, added `max-w-2xl` |
| `billing/page.tsx` | Switched from `SettingsSection` to canonical subpage pattern |
| `models/_components/model-picker.tsx` | Fixed clobbered string |
| `portfolio/page.tsx` | Fixed clobbered strings, rewrote empty state, added read-only note |
| `profile/page.tsx` | Standardized heading, changed `max-w-xl`→`max-w-2xl` |
| `telegram/page.tsx` | Removed duplicate `PageHeader`, canonical `<h2>` |
| `track-record/page.tsx` | Standardized heading to canonical pattern |
| `usage/page.tsx` | Added division-by-zero guard, standardized heading |
| `usage/_components/usage-limits-form.tsx` | Fixed clobbered strings + wrong icon |
| `api-keys/_components/api-key-card.tsx` | Fixed clobbered string |
| `api-keys/_components/export-import-keys.tsx` | Fixed clobbered string |
| `api-keys/_components/market-data-config.tsx` | Fixed clobbered strings |
| `api-keys/_components/save-bar.tsx` | Fixed clobbered strings |
| `agent/_components/disabled-tools-form.tsx` | Fixed clobbered string |

### Created (8 files)
- `_components/row-divider.tsx` — Shared divider component
- `security/page.tsx` + `security/loading.tsx`
- `notifications/page.tsx` + `notifications/loading.tsx`
- `appearance/page.tsx` + `appearance/loading.tsx`
- `data/page.tsx` + `data/loading.tsx`

### Deleted (1 file)
- `_components/notifications-card.tsx` — Dead after IA restructure

---

## Before/After Route Map

| Before | After |
|--------|-------|
| `/settings` — giant scroll of 8 sections + orphan card | `/settings` — overview with System Status + Usage Glance + quick links |
| Security, Notifications, Appearance, Data → only on General page | Each has its own subpage, reachable from left nav |
| Channel readiness shown in both `SystemStatusCard` and `NotificationsCard` | Only in `SystemStatusCard` |
| Telegram test on General + `/settings/telegram` | Only on `/settings/telegram` |
| `AIPrefsCard` only on General page | On `/settings/agent` with the rest of AI config |
| 11 nav items | 15 nav items (4 new) |
| `surface-panel` used as card wrapper | Eliminated; canonical `border bg-bg-elev-1 rounded-sm` everywhere |
| 3 different divider styles | One shared `RowDivider` |
| 5 different subpage heading patterns | One canonical pattern |

---

## Verification

| Check | Result |
|-------|--------|
| `pnpm --filter @hamafx/web typecheck` | ✅ Pass |
| `pnpm --filter @hamafx/web lint` | ✅ Pass (0 warnings) |
| `pnpm --filter @hamafx/web exec vitest --run` | ✅ 467 passed (37 files) |

---

## Known Remaining Items

1. **Theme flash**: `AppearanceCard` sets `data-theme` client-side but no cookie or inline script sets it before hydration. The `<html>` tag uses `suppressHydrationWarning`. If user selects "light" mode, there may be a brief dark flash on page load. The root layout hardcodes `<meta name="color-scheme" content="dark" />`. Fixing this requires either a cookie-based theme or an inline `<script>` that reads the saved theme before first paint — scope-creep for this refactor.

2. **Full monorepo build**: Requires `AUTH_SECRET` environment variable to be set at build time (Next.js production build check). Passes locally when env is configured.
