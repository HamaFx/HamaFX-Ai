# HamaFX-Ai — Authentication System Audit & Upgrade Plan

> **Audience:** an AI coding agent implementing the fixes.
> **Scope:** the login / signup / logout / password-reset / session subsystem of `apps/web`, its
> Drizzle schema in `packages/db`, plus adding **Google as a login/signup option** and a full
> backend + frontend hardening pass.
> **Stack:** Next.js (App Router) · NextAuth v5 (Auth.js) · Drizzle ORM · Postgres · bcryptjs · Zod ·
> pnpm/turbo monorepo.
> **Golden rule:** do **not** break the Credentials (email+password) flow while adding OAuth. Keep the
> JWT session strategy. Every change must ship with tests and pass `pnpm lint && pnpm typecheck && pnpm test`.

---

## 0. Current architecture (as-built)

| Concern | Location | Notes |
|---|---|---|
| Edge auth config (strategy, callbacks, pages, `authorized` gate) | `apps/web/src/auth.config.ts` | JWT strategy, `maxAge` 30d, `pages.signIn = '/login'` |
| Full auth config (providers, callbacks) | `apps/web/src/auth.ts` | Credentials provider + dev-only Impersonation provider. **No DB adapter wired.** |
| Route handler | `apps/web/src/app/api/auth/[...nextauth]/route.ts` | Exports NextAuth `GET/POST` handlers |
| Middleware (CSRF + gate + header injection) | `apps/web/src/middleware.ts` | Double-submit CSRF cookie `hfx_csrf`; injects `x-user-id` |
| Server actions (login/register/forgot/reset) | `apps/web/src/app/(auth)/actions.ts` | Rate-limited via `withRateLimit` |
| Login / Register / Forgot / Reset UI | `apps/web/src/app/(auth)/**` | Client components using `useActionState` |
| Email verify endpoint | `apps/web/src/app/api/auth/verify-email/route.ts` | GET, marks `emailVerified` |
| Dev login shortcut | `apps/web/src/app/api/dev/login/route.ts` | Dev-only, double-guarded |
| Session mgmt / logout / sign-out-everywhere | `apps/web/src/app/(app)/settings/actions.ts` | `signOutEverywhereAction`, `revokeSessionAction`, `listSessionsAction` |
| Admin gate | `apps/web/src/lib/admin-auth.ts` | Single-user = earliest user is admin |
| Auth anomaly metrics | `apps/web/src/lib/auth-anomaly.ts` | In-memory sliding window → Sentry |
| Env validation | `apps/web/src/lib/env.ts` | `AuthEnvSchema` already declares `AUTH_GOOGLE_ID/SECRET`, `AUTH_GITHUB_ID/SECRET` |
| DB schema (`user`, `account`, `session`, `verificationToken`, `user_sessions`) | `packages/db/src/schema/auth.ts` | `account` (OAuth) + `session` tables exist but are **unused** (no adapter) |

---

## 1. Findings — prioritized

Severity: **P0 = security/broken-in-prod**, **P1 = high**, **P2 = medium**, **P3 = polish**.

### P0 — Critical

**P0-1 — 2FA is NOT enforced at login (complete bypass).**
`auth.ts` → Credentials `authorize()` validates the password and returns the user immediately. It never
loads `twoFactorEnabled` / `twoFactorSecret`, never verifies `totpCode`, and never throws
`2FA_REQUIRED` / `INVALID_2FA_CODE`. Yet `actions.ts::loginAction` *handles* those errors and the login
page renders a 2FA field. Net effect: **any account with 2FA "enabled" can be accessed with password
only.** 2FA is enforced for `exportKeys` / `deleteAccount` in settings but not for the front door.
→ Implement TOTP verification inside `authorize()` (see §3.1).

**P0-2 — `ACCOUNT_LOCKED` (and any thrown auth error) is swallowed by `authorize()`'s own try/catch.**
In `auth.ts::authorize`, `throw new Error('ACCOUNT_LOCKED')` sits inside the same `try { … } catch (error) { return null; }`
block, so the throw is caught and converted to `null`. `loginAction` therefore never receives
`ACCOUNT_LOCKED` — the lockout UX and anomaly signal (`account_locked`) never fire; the user just sees
"Invalid email or password". Restructure so control-flow errors (`ACCOUNT_LOCKED`, `2FA_REQUIRED`,
`INVALID_2FA_CODE`) propagate out of `authorize()` while genuine internal errors still fail closed. (See §3.1.)

**P0-3 — "Remember me" is non-functional; everyone is force-logged-out after 24h.**
`authorize()` returns a hardcoded `rememberMe: false`. The `jwt` callback only sets `token.rememberMe = true`
when `user.rememberMe === true`, and the `session` callback invalidates any token older than 24h unless
`rememberMe === true`. Because the flag is never set, **the 30-day `maxAge` and the "Remember me" checkbox
are dead** — all sessions die at 24h. Thread the real `rememberMe` value from the form → `signIn` →
`authorize` → JWT. (See §3.2.)

**P0-4 — Session-management UI is cosmetic / broken.**
`authorize()` returns `sessionId: ''` and **no row is ever inserted into `user_sessions`** on login. As a
result: `listSessionsAction` always returns empty, `session.sessionId` is never populated, the
`lastActiveAt` update in the `session` callback never runs, and `revokeSessionAction` deletes rows that
don't exist / can't invalidate a JWT (JWT strategy ignores `user_sessions`). "Revoke this device" gives
users false security. Either (a) create a `user_sessions` row on login + embed `sessionId` in the JWT +
check it on each request, or (b) remove the feature. Recommended: implement (a) properly. (See §3.3.)

**P0-5 — Email verification is generated but never sent, and never enforced.**
`registerAction` creates a `verificationTokens` row and only **logs** the link in dev — there is no
`sendVerificationEmail(...)` call (unlike password reset which does call Resend). And `emailVerified` is
**written** by `verify-email/route.ts` but **read/enforced nowhere**. So: prod users can't verify, and
verification status gates nothing. Decide the policy and implement it end-to-end. (See §3.4.)

**P0-6 — Token-type confusion: one table for email-verify AND password-reset.**
Both flows insert into `verificationTokens` with only `identifier`/`token`/`expires` — no `type` column.
Consequences:
  - A 24h **email-verification** token can be replayed against `resetPasswordAction` to reset the
    password (it only checks token + expiry).
  - A **password-reset** token can be replayed against `GET /api/auth/verify-email` to mark the email verified.
Add a `purpose` discriminator (`'email_verify' | 'password_reset'`) and filter by it in every consumer.
Also **hash tokens at rest** (store `sha256(token)`), and **single-use** delete on consume. (See §3.5.)

### P1 — High

**P1-1 — `recordAuthEvent('login_success')` fires before authentication succeeds.**
In `loginAction` the success event is recorded *before* `await signIn(...)`. Failed logins that throw are
still counted as successes, poisoning the anomaly detector's success-rate threshold. Move the call to
after `signIn` resolves without throwing (and add `recordAuthEvent('login_failure')` on the failure paths
— partially present). (See §3.6.)

**P1-2 — No DB adapter → adding any OAuth provider will 500 downstream.**
With JWT strategy and no `DrizzleAdapter`, an OAuth sign-in would mint a session whose `user.id` is the
provider `sub`, but **no `user` / `user_settings` row exists**, so every downstream query
(`userSettings`, FK-constrained inserts, `admin-auth`, RLS `app.current_tenant`) breaks. Google sign-in
**must** upsert a `user` + `user_settings` (+ `organization`/tenant) row. Prefer an explicit `signIn`
callback that provisions the DB row and reuses your existing `id` scheme, rather than flipping to the
database session strategy. (See §2 & §4.)

**P1-3 — CSRF first-request bootstrap gap.**
`middleware.ts` only sets `hfx_csrf` on the response, but a state-changing request that arrives before the
cookie exists is rejected (`!cookieToken`). SPA flows that POST immediately after first paint can 403.
Ensure the cookie is minted on the first GET (document/navigation) and that the client reads it before any
mutation; document the header contract (`x-csrf-token`). (See §3.7.)

**P1-4 — `deleteAccountAction` hard-deletes the user, contradicting soft-delete design.**
`users.deletedAt` exists and `authorize` filters `isNull(deletedAt)`, but `deleteAccountAction` does
`db.delete(users)`. Decide: soft-delete (set `deletedAt`, bump `tokenVersion`, purge PII) vs hard-delete.
If hard-delete is intended, document why `deletedAt` exists. Recommended: soft-delete + async purge. (See §3.8.)

### P2 — Medium

- **P2-1 — Login user-enumeration timing.** `authorize` returns `null` instantly when the user doesn't
  exist but runs bcrypt when it does, leaking existence via response time. Run a dummy `bcrypt.compare`
  against a constant hash on the "no user" path to equalize timing. Forgot-password already avoids
  enumeration in its *response*; keep that.
- **P2-2 — Failed-login counter races / fail-open.** `failedLoginAttempts` update is best-effort
  (`catch {}`) and read-modify-write (racy under concurrency). Use an atomic SQL increment
  (`failed_login_attempts = failed_login_attempts + 1`) and evaluate lockout from the returned value.
- **P2-3 — Dev fallback secret.** `auth.config.ts` uses a hardcoded dev secret when `NODE_ENV !== production`.
  Fine for dev, but assert at boot that production has a real `AUTH_SECRET` (the env schema marks it
  optional). Add a startup invariant that throws in prod if unset.
- **P2-4 — Password policy is weak-ish.** Min 8 + upper/lower/digit, no symbol requirement, no
  breached-password check, no max length guard for bcrypt's 72-byte truncation. Add a max length (e.g.
  ≤ 128, and pre-hash long inputs) and optionally a HaveIBeenPwned k-anonymity check. Consider raising
  min length to 10–12.
- **P2-5 — `AUTH_MODE=legacy` bypass.** Guarded to non-prod, good — but it sets `x-user-id=__system__`
  granting full access. Keep the prod guard and add a loud boot warning when legacy mode is on.
- **P2-6 — CSRF cookie flags.** `hfx_csrf` is `sameSite=lax`, `secure` only in prod. It is intentionally
  readable by JS (double-submit). Confirm it is **not** `httpOnly` (correct) and add `__Host-` prefix +
  `path=/` in prod for stronger binding.
- **P2-7 — Redirect allow-listing.** `safeNext` blocks `//` (good). Also reject `next` values containing
  `\`, backslashes, or encoded `%2f%2f`, and cap length. Centralize in one `sanitizeNext()` helper used by
  both `loginAction` and the `authorized` callback.

### P3 — Polish / UX / a11y

- **P3-1** No resend-verification-email UI.
- **P3-2** Register auto-signs-in then redirects to `/onboarding` — but if `signIn` throws
  `NEXT_REDIRECT` handling is fragile (string match `errStr.includes('NEXT_REDIRECT')`). Prefer
  `isRedirectError()` from `next/navigation`.
- **P3-3** Login/Register forms lack inline field-level errors from server (only a single top error line).
- **P3-4** No rate-limit feedback with retry-after seconds.
- **P3-5** Password fields: add "caps lock on" hint and a strength meter (register has a checklist; login none).
- **P3-6** No `aria-live` region wiring beyond `role="alert"`; ensure screen-reader announces async state.
- **P3-7** Dev "Skip login" button is gated by `NEXT_PUBLIC_ENABLE_DEV_LOGIN` — verify it can never render in prod builds.

---

## 2. Design decision — how to add Google (and keep Credentials)

**Chosen approach: keep `session.strategy = 'jwt'`, add `GoogleProvider`, and provision the DB user via a
`signIn` callback.** (Do **not** switch to the database strategy — it complicates the existing
JWT/tokenVersion/rememberMe logic and the Edge middleware.)

Rationale:
- The `account` table exists for linking, but with JWT strategy NextAuth won't auto-write it unless an
  adapter is present. We add a **lightweight `DrizzleAdapter`** *only* to persist `user`/`account`
  linkage, **or** we manually upsert in the `signIn` callback. Recommended: **manual upsert in `signIn`**
  to avoid adapter/Credentials/JWT interaction pitfalls and to keep full control of `id`, `user_settings`,
  tenant/`organization`, and `dicebear` image defaults — mirroring `registerAction`.
- Account-linking policy: if a Google email matches an existing Credentials user, **link** (same `user.id`)
  rather than creating a duplicate. Guard against linking to an unverified/attacker-controlled record
  (Google emails are verified by Google → safe to trust `email_verified` from the profile).

---

## 3. Remediation tasks (backend)

### 3.1 Enforce 2FA + fix error propagation in `authorize()` (P0-1, P0-2)
File: `apps/web/src/auth.ts`
1. Extend the Credentials `authorize` select to include `twoFactorEnabled`, `twoFactorSecret`.
2. Restructure so **control-flow throws are outside** the swallowing `catch`:
   - Wrap only DB/bcrypt calls that may throw *unexpectedly* in try/catch; let intentional
     `throw new AuthError('ACCOUNT_LOCKED')` etc. propagate. Use NextAuth's `CredentialsSignin`/custom
     `AuthError` subclasses so `error.message`/`code` survives to `loginAction`.
3. After password is valid and lockout cleared:
   ```ts
   if (user.twoFactorEnabled) {
     const code = typeof credentials?.totpCode === 'string' ? credentials.totpCode.trim() : '';
     if (!code) throw new AuthError('2FA_REQUIRED');
     const secret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
     if (!secret || !verifySync({ secret, token: code }).valid) {
       recordAuthEvent('2fa_failure');
       throw new AuthError('INVALID_2FA_CODE');
     }
   }
   ```
   (Reuse the same `decryptSecret` + `verifySync` used in `settings/actions.ts`.)
4. Keep the generic `catch` **only** for truly unexpected errors → `return null` (fail closed), but
   `console.error`/Sentry them.
5. Confirm `loginAction`'s existing `2FA_REQUIRED` / `INVALID_2FA_CODE` / `ACCOUNT_LOCKED` branches now
   actually receive these codes (they already exist).

### 3.2 Wire "Remember me" end-to-end (P0-3)
Files: `apps/web/src/app/(auth)/actions.ts`, `apps/web/src/auth.ts`
1. In `loginAction`, parse `rememberMe` (checkbox `value="true"`) into a boolean and pass to `signIn`.
2. In `authorize`, read `credentials.rememberMe` and return the **real** boolean (not hardcoded `false`).
3. In the `jwt` callback, persist `token.rememberMe` from `user.rememberMe`.
4. Verify the `session` callback's 24h-cutoff only applies when `rememberMe !== true`, and that the cookie
   `maxAge` matches: consider issuing a shorter cookie `maxAge` when not remembered (e.g. session cookie)
   vs 30d when remembered, instead of relying solely on the in-token 24h check.
5. Add a test asserting a non-remembered token is rejected after 24h and a remembered one survives.

### 3.3 Make session management real (P0-4)
Files: `apps/web/src/auth.ts`, `packages/db/src/schema/auth.ts`, `apps/web/src/app/(app)/settings/actions.ts`
Option A (recommended — implement):
1. On successful `authorize`, generate `sessionId = crypto.randomUUID()`, insert a `user_sessions` row
   (`id`, `userId`, `tenantId`, `deviceName` from UA, `ip` from `x-forwarded-for`), return `sessionId` on
   the user object. *Note:* `authorize` can't easily read request headers in v5 — capture UA/IP in
   `loginAction` and pass through `signIn` credentials, or create the row in the `signIn`/`jwt` callback
   on first mint (`if (user) { …insert… }`).
2. In `jwt` callback, store `token.sessionId`.
3. In the `session` callback (already updates `lastActiveAt`), also **validate the `sessionId` still
   exists** in `user_sessions`; if it was revoked, return an invalidated session (like the `tokenVersion`
   check). This makes `revokeSessionAction` actually kill that device.
4. `revokeSessionAction` already deletes by `id`+`userId` — keep, now it has teeth.
5. `signOutEverywhereAction` already deletes all rows + bumps `tokenVersion` — keep.
Option B: if you don't want per-device revocation, **remove** `listSessionsAction`/`revokeSessionAction`
and the Sessions card UI to avoid a false security promise. (Pick A.)

### 3.4 Email verification: send + enforce (P0-5)
Files: `apps/web/src/app/(auth)/actions.ts`, `apps/web/src/app/api/auth/verify-email/route.ts`, `apps/web/src/auth.ts`
1. Add `sendVerificationEmail(to, verifyUrl)` mirroring `sendPasswordResetEmail` (Resend). Call it in
   `registerAction` after inserting the token.
2. Decide enforcement policy (recommend **soft**): allow login but surface an "unverified" banner + gated
   actions (e.g., block trading-key export until verified). If **hard** enforcement is desired, check
   `emailVerified` in `authorize` and throw `EMAIL_NOT_VERIFIED` (add UI + resend flow). Google users are
   auto-verified (set `emailVerified` on provision).
3. Add "Resend verification email" server action + UI (rate-limited).
4. `verify-email/route.ts`: filter by `purpose='email_verify'` (see §3.5), keep single-use delete, and
   redirect to `/login?verified=true`.

### 3.5 Fix token-type confusion + hash tokens (P0-6)
Files: `packages/db/src/schema/auth.ts`, new Drizzle migration, both consumers
1. Add `purpose text('purpose').notNull()` to `verificationTokens` (values `'email_verify'`,
   `'password_reset'`). Backfill migration (default existing rows to `'password_reset'` or delete them).
2. Store `token` as `sha256(rawToken)`; email the raw token, look up by hash. Prevents DB-leak replay.
3. Every consumer (`resetPasswordAction`, `verify-email`, `forgot`, `register`) must filter by `purpose`
   **and** `expires > now()` **and** delete on consume (single-use). `resetPasswordAction` already deletes
   inside its transaction — extend the WHERE with `purpose='password_reset'`.
4. Add a periodic cleanup (cron) to purge expired tokens.

### 3.6 Fix anomaly event ordering (P1-1)
File: `apps/web/src/app/(auth)/actions.ts` — move `recordAuthEvent('login_success')` to run **only after**
`await signIn(...)` returns without throwing (i.e., in the try block *after* the call, before returning
`{ success: true }`), and ensure the `NEXT_REDIRECT` re-throw path still records success (signIn throws
`NEXT_REDIRECT` on success with redirect). Record `login_failure` on the invalid-credentials branch.

### 3.7 CSRF bootstrap + docs (P1-3)
File: `apps/web/src/middleware.ts` — guarantee the cookie is set on the initial document GET; add a short
`docs/auth-csrf.md` describing the double-submit contract and the `x-csrf-token` header. Add an `apiFetch`
client helper that auto-attaches the header from the cookie so no call site forgets it.

### 3.8 Account deletion policy (P1-4)
File: `apps/web/src/app/(app)/settings/actions.ts` — switch to soft-delete: set `deletedAt`, bump
`tokenVersion`, null out PII / revoke sessions, then `signOut`. Add a purge job. Keep the 2FA + password
re-auth guard (already present).

### 3.9 Hardening batch (P2-1…P2-7)
Implement constant-time no-user path, atomic lockout increment, prod `AUTH_SECRET` boot invariant,
password max-length + optional HIBP, centralized `sanitizeNext()`, `__Host-` CSRF cookie in prod, and a
loud legacy-mode warning. Each with a focused unit test.

---

## 4. Add Google login/signup (feature)

### 4.1 Dependencies & env
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` already validated in `apps/web/src/lib/env.ts`. Add them to
  `.env.example` (they're not there yet) with setup notes.
- Google Cloud console: create OAuth 2.0 Client (Web). Authorized redirect URI:
  `https://<domain>/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for dev).
  Set `NEXTAUTH_URL`/`AUTH_URL` accordingly.

### 4.2 Provider wiring
File: `apps/web/src/auth.ts`
```ts
import Google from 'next-auth/providers/google';
// …
providers: [
  Credentials({ /* existing */ }),
  ...(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
    ? [Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: false, // we link explicitly in signIn
      })]
    : []),
  ...(IMPERSONATION_ENABLED ? [/* existing */] : []),
],
```
Register the provider conditionally so self-hosters without Google keys are unaffected.

### 4.3 DB provisioning via `signIn` + `jwt` callbacks (P1-2)
Add a `signIn` callback (currently absent):
```ts
async signIn({ user, account, profile }) {
  if (account?.provider !== 'google') return true; // credentials path unchanged
  if (!profile?.email || profile.email_verified === false) return false;
  const email = profile.email.toLowerCase().trim();
  const db = getDb();
  // find existing by email (link) …
  const [existing] = await db.select().from(schema.users)
    .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt))).limit(1);
  let userId = existing?.id;
  if (!userId) {
    userId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(schema.users).values({
        id: userId, email, name: profile.name ?? email,
        image: profile.picture ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile.name ?? email)}`,
        emailVerified: new Date(),           // Google verified
        hashedPassword: null,                // OAuth-only account
      });
      await tx.insert(schema.userSettings).values({ userId, onboardingCompleted: false, defaultSymbol: 'XAUUSD' });
    });
  }
  // upsert account link row (provider, providerAccountId, tokens)
  await db.insert(schema.accounts).values({
    userId, type: account.type, provider: 'google',
    providerAccountId: account.providerAccountId,
    access_token: account.access_token, refresh_token: account.refresh_token,
    expires_at: account.expires_at, token_type: account.token_type,
    scope: account.scope, id_token: account.id_token,
  }).onConflictDoNothing();
  // stash our canonical id so the jwt callback uses the DB id, not Google sub
  user.id = userId;
  return true;
}
```
- In the `jwt` callback, ensure `token.id` is our DB `userId` (set above), `tokenVersion` loaded from DB,
  and (for §3.3) a `sessionId` + `user_sessions` row are created on first mint for Google logins too.
- Redirect new Google users to `/onboarding`, returning users to `/chat` (use the `authorized`/redirect
  logic or a `redirect` callback that respects a safe `next`).

### 4.4 Frontend — Google button
Files: `apps/web/src/app/(auth)/login/page.tsx`, `register/page.tsx`, (optional) a shared
`(auth)/_components/oauth-buttons.tsx`.
- Add a "Continue with Google" button (client) that calls `signIn('google', { callbackUrl: safeNext })`
  from `next-auth/react`, with the Google logo, proper `aria-label`, loading state, and a divider
  ("or continue with email"). Render it **only** when `NEXT_PUBLIC_GOOGLE_ENABLED` (add a public flag) is
  set, so the button hides when the server has no Google keys.
- Mirror on the register page ("Sign up with Google").
- Handle the `?error=` query NextAuth appends on OAuth failure (e.g. `OAuthAccountNotLinked`) with a
  friendly message.

### 4.5 Account settings — linked accounts
Add a "Connected accounts" section in settings showing Google link status with connect/disconnect
(disconnect only allowed if a password is set, else warn the user they'd lock themselves out — the
`OAuth-only` note in `settings/actions.ts` already anticipates this).

---

## 5. Frontend upgrade pass

- Shared `(auth)/_components/` for: `OAuthButtons`, `PasswordField` (show/hide + caps-lock + strength),
  `AuthCard` layout, `FormError` (inline + `aria-live`).
- Login: add strength-less but add caps-lock hint; wire inline errors; keep 2FA step (now functional).
- Register: keep the live checklist; add server-side inline errors; add Google.
- Forgot/Reset: add success + rate-limit messaging with retry-after; add password strength meter to reset.
- Resend-verification UI (§3.4).
- Ensure all buttons have loading/disabled states and are keyboard/screen-reader accessible.
- Match existing design tokens (`text-fg`, `bg`, `border-border`, `text-danger`, `variant="success"`);
  **no** purple/AI-gradient styling. Support existing dark mode.

---

## 6. Testing plan (must pass in CI)

Add/extend under `apps/web/test/` and `apps/web/tests/e2e/`:
- **Unit:** `authorize()` — valid login, wrong password (+ atomic counter), locked account propagates
  `ACCOUNT_LOCKED`, 2FA required, 2FA invalid, 2FA valid, no-user constant-time path.
- **Unit:** `rememberMe` true vs false → JWT flag + 24h cutoff behavior.
- **Unit:** token-type confusion — a reset token rejected by verify-email and vice-versa; single-use;
  expired rejected; hashed lookup.
- **Unit:** Google `signIn` callback — new user provisioned (+ `user_settings`), existing email linked,
  unverified Google email rejected.
- **Integration:** session revoke actually invalidates the target device's next request; sign-out-everywhere
  bumps `tokenVersion`.
- **Integration:** CSRF — missing/incorrect `x-csrf-token` → 403; correct → passes; `/api/auth/*` exempt.
- **E2E (Playwright):** email+password login/logout, register→onboarding, forgot→reset, 2FA login,
  "Continue with Google" (mocked provider), remember-me persistence.
- Update `apps/web/test/nextauth-wiring.test.ts` and `middleware.test.ts` to cover the new providers/callbacks.
- Run: `pnpm lint && pnpm typecheck && pnpm -w test` and the e2e workflow.

---

## 7. Env / config changes
Add to `.env.example` (with comments):
```
# Google OAuth (optional — enables "Continue with Google")
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
NEXT_PUBLIC_GOOGLE_ENABLED=false   # set true when the above are configured
```
- Add a **prod boot invariant**: throw if `NODE_ENV=production` and `AUTH_SECRET`/`NEXTAUTH_SECRET` unset.
- Document that `emailVerified` enforcement + Resend keys (`RESEND_API_KEY`, `ALERT_FROM_EMAIL`) are now
  required for the verification email to actually send.
- New Drizzle migration for `verificationTokens.purpose` (+ token hashing) and any `user_sessions` changes;
  run `pnpm --filter @hamafx/db generate` / `migrate` and commit the SQL.

---

## 8. Suggested implementation order (PR-sized)
1. **PR-1 (P0 security):** 3.1 (2FA + error propagation), 3.2 (remember-me), 3.6 (anomaly ordering). Tests.
2. **PR-2 (P0 tokens):** 3.5 (purpose column + hashing + single-use) + migration; 3.4 (send + enforce verify). Tests.
3. **PR-3 (P0 sessions):** 3.3 (real `user_sessions` + JWT `sessionId` + revoke teeth). Tests.
4. **PR-4 (feature):** §4 Google login/signup end-to-end (provider + signIn callback + UI + linked accounts). Tests + e2e.
5. **PR-5 (hardening):** §3.9 batch + 3.7 CSRF bootstrap + 3.8 soft-delete. Tests.
6. **PR-6 (frontend polish):** §5 shared components, a11y, resend UI, error surfaces.

Each PR: keep Credentials login working, add a changeset (`.changeset/`), update `docs/` and `.env.example`,
and green CI before merge.

---

## 9. Explicit "do-not-regress" checklist
- [ ] Email+password login still works (with and without 2FA).
- [ ] Existing sessions survive deploy (JWT `tokenVersion` semantics unchanged unless intentionally bumped).
- [ ] Self-host without Google keys: no Google button, no provider registered, no crash.
- [ ] Middleware CSRF still exempts `/api/auth/*`, `/api/cron`, webhooks.
- [ ] Admin single-user promotion logic in `admin-auth.ts` unaffected.
- [ ] RLS/tenant (`app.current_tenant`, `user_settings.tenantId`, `organization`) satisfied for OAuth users.
