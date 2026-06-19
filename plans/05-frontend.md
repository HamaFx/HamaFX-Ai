# 05 Frontend Overhaul

This document outlines the architectural changes, component updates, and new pages required to transition the HamaFX-Ai frontend (apps/web) from a single-user prototype to a multi-user, production-ready SaaS application.

## 1. Current State
- **Frameworks:** Next.js 15, React 19, Tailwind CSS v4, shadcn/ui
- **Auth:** Single password login page located at `/login`, relying on a single `APP_PASSWORD` environment variable.
- **User Profile:** No registration, no user profile structure.
- **Branding:** Layout features `robots` `noindex`/`nofollow`, and heavily relies on "Personal AI trading copilot" branding.
- **Navigation:** `NavDrawer` has single-user static items.
- **Settings:** Contains usage, notifications, preferences, and data/cache, all functioning globally.
- **Chat:** The chat page creates and lists threads globally without context of an authenticated user.
- **Onboarding:** No onboarding flow exists.
- **PWA:** `manifest.json` says "HamaFX-Ai" and focuses strictly on single-user app usage.

## 2. Auth Pages (New)
Replace the existing simplistic `/login` route with a structured `/auth` directory that leverages NextAuth.js (Auth.js v5) client helpers like `signIn()` and `signOut()`.

*All auth pages must maintain the established premium-black aesthetic (pure-black backgrounds, champagne accents, glassmorphism).*

- **`/auth/login`**: Email/password sign-in form alongside OAuth provider buttons (e.g., Google, GitHub).
- **`/auth/register`**: Account creation requiring Name, Email, and Password.
- **`/auth/verify`**: Page shown post-registration to prompt the user to click their email verification link.
- **`/auth/forgot-password`**: Request form to trigger a password reset email.
- **`/auth/reset-password`**: Form to enter a new password (accessed via reset email link).

## 3. Onboarding Flow (New)
Introduce a multi-step wizard shown to users upon their first login to configure their personalized workspace.
The onboarding state should be tracked in the database (e.g., `user_settings.onboarding_completed`).

**Flow Steps:**
1. **Welcome**: Greeting and name confirmation.
2. **Watchlist Configuration**: Symbol selection (Default: `XAUUSD`, `EURUSD`, `GBPUSD`). Allows searching and adding more instruments.
3. **AI Provider Setup**: Bring Your Own Key (BYOK) setup for the LLM provider (OpenAI, Anthropic, etc.), including a direct "Test Connection" button.
4. **Notifications**: Initial setup for email, Telegram (bot linking instructions), and Web Push preferences.
5. **Completion**: "You're all set!" page leading into a redirect to `/chat`.

*The flow should be skippable but highly encouraged.*

## 4. User Settings Overhaul
Reorganize and scope the existing settings module to be user-specific. 

- **`/settings/profile`**: Update Name, Email, Avatar, and change password.
- **`/settings/api-keys`**: BYOK key management. Inputs must be masked. Needs capability to test, edit, and delete keys.
- **`/settings/symbols`**: Watchlist management allowing users to add, remove, and reorder their actively tracked symbols.
- **`/settings/notifications`**: Granular, per-channel configuration for Email, Telegram (manage chat ID / bot link), and Web Push.
- **`/settings/usage`**: Retain the existing spend dashboard, but scope data queries (`WHERE user_id = ?`) to ensure users only see their own AI spend.
- **`/settings/preferences`**: UI Theme (dark/light/system), Timezone, Locale/Language, and Accessibility (e.g., `reduce-motion`).
- **`/settings/data`**: Options to export user data (threads, settings) or delete the account permanently.

## 5. Branding Updates
Shift the branding away from a "personal" local tool to a hosted SaaS application.

- Remove the word "Personal" from all copy.
- Update global meta description to: *"AI trading copilot for forex & commodities"*
- Remove `robots` `noindex`/`nofollow` directives from the root layout, or make them configurable via a `NEXT_PUBLIC_ALLOW_INDEXING` environment variable.
- Update the PWA `manifest.json` and associated metadata.
- Login Page: Show the updated app name and tagline, ensuring it communicates a multi-user product.

## 6. Layout Changes
The primary application shell needs adjustments to accommodate user identity.

- **`NavDrawer` (Side Navigation)**:
  - Add User Avatar + Name/Email at the top (or bottom, depending on current UX patterns).
  - Add an explicit `Logout` button using NextAuth `signOut()`.
  - Remove any legacy single-user hardcoded paths or comments.
- **`TopBar` (Header)**:
  - Add a user avatar dropdown menu (Profile, Settings, Logout).

## 7. Chat Page Updates
Ensure the core AI copilot acts entirely within the bounds of the authenticated user.

- **Thread Listing**: The sidebar fetching chat histories must enforce a user scope (`WHERE user_id = session.user.id`).
- **Thread Creation**: `runChat` (or equivalent server action/endpoint) must receive the `userId` to bind the new thread.
- **Sharing**: Existing share functionality (HMAC-based public links) remains intact, but the share metadata should reflect the thread owner internally.

## 8. Symbol Picker
Provide a global or easily accessible context switcher for the active market.

- Add a global symbol selector in the `TopBar` or within the `NavDrawer`.
- The dropdown should list the user's specific watchlist (from `/settings/symbols`).
- Include an "Add symbol" search input with autocomplete connected to the data providers (e.g., Finnhub/BiQuote).
- The selected symbol context should globally inform the Chart, Chat, and Scanner pages.

## 9. Responsive & PWA Enhancements
Ensure smooth mobile transitions for the new features.

- Maintain the mobile-first design standard for all new Auth and Settings pages.
- Update the Service Worker to appropriately handle or bypass new `/auth/*` and API routes.
- Refresh PWA manifest icons and theming to reflect the new branding.

## 10. Files to Create/Modify

### Create
- `apps/web/app/auth/layout.tsx`
- `apps/web/app/auth/login/page.tsx`
- `apps/web/app/auth/register/page.tsx`
- `apps/web/app/auth/verify/page.tsx`
- `apps/web/app/auth/forgot-password/page.tsx`
- `apps/web/app/auth/reset-password/page.tsx`
- `apps/web/app/onboarding/page.tsx`
- `apps/web/app/onboarding/layout.tsx`
- `apps/web/components/onboarding/wizard.tsx`
- `apps/web/app/settings/profile/page.tsx`
- `apps/web/app/settings/api-keys/page.tsx`
- `apps/web/app/settings/symbols/page.tsx`
- `apps/web/components/symbol-picker.tsx`

### Modify
- `apps/web/app/layout.tsx` (Metadata updates, robots tag)
- `apps/web/app/page.tsx` (Index redirection logic based on auth state)
- `apps/web/app/login/page.tsx` (Delete or redirect to `/auth/login`)
- `apps/web/app/chat/page.tsx` & `apps/web/app/chat/layout.tsx` (Inject NextAuth session and scope requests)
- `apps/web/components/nav-drawer.tsx` (Add User profile, avatar, logout)
- `apps/web/components/top-bar.tsx` (Add User avatar, global symbol picker)
- `apps/web/app/settings/layout.tsx` (Update navigation links for new settings structure)
- `apps/web/app/settings/usage/page.tsx` (Scope usage fetch to user)
- `apps/web/app/settings/notifications/page.tsx` (Update UI to configure per-channel notifications per user)
- `apps/web/public/manifest.json` (Update app name and description)

## 11. Effort Estimate & Dependencies

| Task | Estimated Effort | Dependencies |
| :--- | :--- | :--- |
| Auth Pages UI Implementation | 3 Days | `01-auth-and-users.md` (NextAuth setup) |
| Onboarding Flow & State | 2 Days | Database schema for `user_settings` |
| Settings Overhaul | 4 Days | Database schema for `user_settings`, BYOK API |
| Global Symbol Picker | 2 Days | Database schema for `watchlists`, Provider APIs |
| Nav/Layout Updates | 1 Day | Auth Pages UI |
| Chat Thread Scoping | 1 Day | `02-database.md` (Schema update for `threads`) |
| Branding & PWA Updates | 0.5 Days | None |
| **Total Estimated Time** | **~13.5 Days** | |

**Critical Dependencies:**
- The frontend work is heavily dependent on **01-auth-and-users.md** for NextAuth session availability.
- Settings and Onboarding require the database migrations from **02-database.md** to exist first so server actions can save state correctly.
- The Symbol picker relies on the API keys configured during BYOK setup.
