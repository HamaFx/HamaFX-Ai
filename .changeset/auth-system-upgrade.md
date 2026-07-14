---
'@hamafx/web': minor
'@hamafx/db': minor
'@hamafx/shared': patch
---

Authentication system audit & upgrade — full security hardening pass

Comprehensive fix of the authentication subsystem across all layers:

**P0 — Critical fixes:**
- 2FA now enforced at login (was completely bypassed — authorize() never checked twoFactorEnabled)
- Error propagation fixed — ACCOUNT_LOCKED, 2FA_REQUIRED, INVALID_2FA_CODE now reach loginAction
- "Remember me" wired end-to-end (was hardcoded false, all sessions died at 24h)
- Session management made real — user_sessions rows created on login, sessionId in JWT, revokeSessionAction now actually kills devices
- Email verification actually sends via Resend + soft enforcement via session
- Token-type confusion fixed — purpose discriminator ('email_verify' | 'password_reset'), SHA-256 hashing at rest, single-use deletion

**P1 — High fixes:**
- Anomaly event ordering corrected (login_success recorded after signIn succeeds)
- Google OAuth added — conditional GoogleProvider, signIn callback for DB provisioning, account linking by email
- CSRF bootstrap gap fixed — cookie now set on every response
- deleteAccountAction switched to soft-delete (deletedAt, tokenVersion++, PII nulled)

**P2 — Medium fixes:**
- Constant-time user enumeration defense (dummy bcrypt on no-user path)
- Atomic SQL increment for failed logins (no read-modify-write race)
- Prod AUTH_SECRET boot invariant (throws on missing secret in production)
- Password max-length 128 (bcrypt 72-byte truncation guard)
- __Host- CSRF cookie prefix in production
- Centralized sanitizeNext() redirect sanitizer (blocks //, \\, encoded %2f)
- AUTH_MODE=legacy boot warning in dev
- Expired token cleanup cron job at /api/cron/cleanup-tokens

**Frontend polish:**
- Shared PasswordField component (show/hide toggle, caps-lock detection, strength meter)
- Shared FormError component (aria-live for screen readers)
- "Continue with Google" OAuth button on login + register pages
- Resend-verification-email inline form on login page
- Connected accounts card in /settings

**Files added:**
- apps/web/src/app/api/cron/cleanup-tokens/route.ts — token cleanup cron
- apps/web/src/lib/auth-tokens.ts — token hashing utility
- apps/web/src/app/(auth)/_components/oauth-buttons.tsx — Google sign-in button
- apps/web/src/app/(auth)/_components/password-field.tsx — shared password field
- apps/web/src/app/(auth)/_components/form-error.tsx — shared form error
- apps/web/src/app/(app)/settings/_components/linked-accounts-card.tsx
- packages/db/drizzle/0049_auth_token_purpose_hash.sql — migration

**Tests:**
- 22 new unit tests (sanitizeNext, password max-length, token hashing, 2FA logic, session validation)
