# HamaFX-Ai Authentication System — Full Fix & Improvement Plan

> **Purpose:** This file is a complete, self-contained implementation guide for an AI coding agent (vibe coding). Every section includes the exact file paths, the problem, the fix, code snippets, and acceptance criteria. Work through sections in order — earlier fixes are prerequisites for later ones.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Critical Security Bugs (Fix First)](#2-critical-security-bugs-fix-first)
3. [High-Severity Issues](#3-high-severity-issues)
4. [Medium-Severity Issues](#4-medium-severity-issues)
5. [Low-Severity Issues & Cleanup](#5-low-severity-issues--cleanup)
6. [Feature Gaps & Improvements](#6-feature-gaps--improvements)
7. [Test Plan](#7-test-plan)
8. [Implementation Order Checklist](#8-implementation-order-checklist)

---

## 1. Architecture Overview

### Current Stack

| Component | Technology | File(s) |
|-----------|-----------|---------|
| Auth framework | NextAuth.js v5 (Auth.js) | `apps/web/src/auth.ts`, `apps/web/src/auth.config.ts` |
| Session strategy | JWT (stateless) | `auth.config.ts` → `session: { strategy: 'jwt' }` |
| Database adapter | `@auth/drizzle-adapter` | `auth.ts` → `DrizzleAdapter(getDb())` |
| Credentials provider | Email + Password (bcrypt) | `auth.ts` → `Credentials(...)`, `apps/web/src/app/(auth)/actions.ts` |
| Middleware | Edge middleware (NextAuth + CSRF) | `apps/web/src/middleware.ts` |
| CSRF | Double-submit cookie | `apps/web/src/lib/csrf.ts`, `middleware.ts` |
| 2FA | TOTP via `otplib` | `apps/web/src/app/(app)/settings/actions.ts` |
| DB schema | Drizzle ORM (Postgres) | `packages/db/src/schema/auth.ts` |
| Route protection | `authorized` callback + middleware | `auth.config.ts`, `middleware.ts` |
| API auth | `withAuth()` HOC + `getUserFromRequest()` | `apps/web/src/lib/api.ts` |
| Env validation | Zod schemas | `apps/web/src/lib/env.ts`, `packages/shared/src/env.ts` |

### Auth Flow (Current)

```
User → /login (form) → loginAction() → signIn('credentials') → authorize()
  ↓ authorize() returns user object → JWT created → cookie set
  ↓ middleware reads JWT → authorized() callback → redirect or allow
  ↓ route handlers call getUserFromRequest() → reads x-user-id header or auth()
```

### Key Files to Modify

```
apps/web/src/auth.ts                          ← Credentials authorize() — CRITICAL
apps/web/src/auth.config.ts                   ← JWT/session callbacks — CRITICAL
apps/web/src/middleware.ts                    ← CSRF + route protection
apps/web/src/app/(auth)/actions.ts            ← login/register server actions
apps/web/src/app/(auth)/login/page.tsx        ← login UI
apps/web/src/app/(auth)/register/page.tsx     ← register UI
apps/web/src/app/api/dev/login/route.ts       ← dev login route — CRITICAL
apps/web/src/app/(app)/settings/actions.ts    ← 2FA, sessions, password
apps/web/src/app/(app)/settings/page.tsx      ← settings page (null safety)
apps/web/src/lib/api.ts                       ← API auth helpers
apps/web/src/lib/csrf.ts                      ← CSRF client helpers
apps/web/src/lib/env.ts                       ← env validation
packages/db/src/schema/auth.ts                ← DB schema
```

---

## 2. Critical Security Bugs (Fix First)

### BUG-01: `authorize()` is a stub — any password logs in as any user

**Severity:** CRITICAL — complete authentication bypass  
**File:** `apps/web/src/auth.ts` (lines ~55-70)

**Problem:**  
The `authorize()` function in the Credentials provider skips all database checks and returns a hardcoded user object:

```typescript
// CURRENT (BROKEN):
async authorize(credentials) {
  const email = typeof credentials?.email === 'string' ? credentials.email.toLowerCase().trim() : '';
  if (!email) return null;
  // MINIMAL authorize — skip DB entirely for now
  return {
    id: 'test-user-id',
    email,
    name: 'Test User',
  };
}
```

This means **any email + any password** authenticates successfully. Every user is assigned `id: 'test-user-id'`, so all logins share a single identity. This is the single most dangerous bug in the codebase.

**Fix:**  
Replace `authorize()` with a real implementation that:
1. Validates the email and password are present
2. Queries the `user` table by email
3. Checks the user exists, is not soft-deleted, and has a `hashedPassword`
4. Compares the password with `bcrypt.compare()`
5. Checks 2FA if enabled (see BUG-03)
6. Returns the user object on success, `null` on failure

```typescript
// FIXED:
import bcrypt from 'bcryptjs';
import { eq, isNull } from 'drizzle-orm';

async authorize(credentials) {
  const email = typeof credentials?.email === 'string' ? credentials.email.toLowerCase().trim() : '';
  const password = typeof credentials?.password === 'string' ? credentials.password : '';
  if (!email || !password) return null;

  const db = getDb();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(and(
      eq(schema.users.email, email),
      isNull(schema.users.deletedAt),
    ))
    .limit(1);

  if (!user || !user.hashedPassword) return null;

  const passwordValid = await bcrypt.compare(password, user.hashedPassword);
  if (!passwordValid) return null;

  // 2FA check — see BUG-03 for full implementation
  if (user.twoFactorEnabled) {
    // The credentials provider doesn't natively support step-up auth.
    // Option A: Add a `totpCode` credential field and verify here.
    // Option B: Return a special error that the login form handles
    //           by showing a 2FA input step, then re-calling signIn.
    // See BUG-03 for the recommended approach.
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
  };
}
```

**Imports needed at top of `auth.ts`:**
```typescript
import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@hamafx/db';
```

> **Note:** You need to import `schema` from `@hamafx/db`. Check the existing exports in `packages/db/src/index.ts` — if `schema` is not exported, add it. The `getDb()` function is already imported.

**Acceptance criteria:**
- [ ] Login with wrong password returns error "Invalid email or password"
- [ ] Login with correct password succeeds and JWT contains the real user ID
- [ ] Different users get different `user.id` values in their JWT
- [ ] Soft-deleted users (deletedAt != null) cannot log in
- [ ] Users without a hashedPassword (if any) cannot log in via credentials
- [ ] Unit test: `authorize()` returns null for wrong password
- [ ] Unit test: `authorize()` returns user object for correct password

---

### BUG-02: `tokenVersion` is never checked — "Sign out everywhere" doesn't work

**Severity:** CRITICAL — session revocation is a no-op  
**Files:** `apps/web/src/auth.config.ts` (jwt callback), `apps/web/src/app/(app)/settings/actions.ts` (signOutEverywhereAction)

**Problem:**  
The `signOutEverywhereAction` increments `tokenVersion` in the database:
```typescript
await db.update(schema.users)
  .set({ tokenVersion: sql`${schema.users.tokenVersion} + 1` })
  .where(eq(schema.users.id, authSession.user.id));
```

But the `jwt()` callback in `auth.config.ts` never reads or validates `tokenVersion`:
```typescript
jwt({ token, user }) {
  if (user) {
    token.id = user.id;
  }
  return token;  // ← tokenVersion never stored or checked
}
```

This means old JWTs remain valid until they naturally expire (30 days). "Sign out everywhere" is security theater.

**Fix:**  
1. Store `tokenVersion` in the JWT at sign-in time
2. On every subsequent JWT read, compare the token's version against the DB
3. If they differ, return `null` (or an empty token) to invalidate the session

**Step 1: Add `tokenVersion` to the JWT at sign-in**

In `auth.config.ts`:
```typescript
jwt({ token, user }) {
  if (user) {
    token.id = user.id;
    // Store tokenVersion at sign-in so we can compare on refresh
    if ((user as any).tokenVersion !== undefined) {
      token.tokenVersion = (user as any).tokenVersion;
    }
  }
  return token;
}
```

**Step 2: Update `authorize()` in `auth.ts` to include `tokenVersion`**

In the fixed `authorize()` (from BUG-01), add `tokenVersion` to the returned user:
```typescript
return {
  id: user.id,
  email: user.email,
  name: user.name,
  image: user.image,
  tokenVersion: user.tokenVersion,  // ← add this
};
```

**Step 3: Validate `tokenVersion` on every JWT refresh**

The `jwt()` callback runs on every request that checks the session. On subsequent calls (after sign-in), `user` is undefined and only `token` is available. We need to periodically check the DB.

> **Important:** `auth.config.ts` is Edge-compatible and must NOT import Node.js modules. The DB check must happen in `auth.ts` (Node runtime) or via a separate callback.

**Option A (Recommended): Move the full jwt callback to `auth.ts`**

Since `auth.ts` already has the full config with the adapter, override the `jwt` callback there:

```typescript
// In auth.ts — override jwt callback with DB access
export const { handlers, auth, signIn, signOut } = _nextAuth({
  ...authConfig,
  adapter,
  providers: [Credentials({...})],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.tokenVersion = (user as any).tokenVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      // Periodically check tokenVersion against DB
      // Only check every 5 minutes to avoid DB hit on every request
      const now = Math.floor(Date.now() / 1000);
      const lastChecked = (token as any).tvCheckedAt as number | undefined;
      if (!lastChecked || now - lastChecked > 300) {
        try {
          const db = getDb();
          const [u] = await db
            .select({ tv: schema.users.tokenVersion })
            .from(schema.users)
            .where(eq(schema.users.id, token.id as string))
            .limit(1);
          if (u && u.tv !== token.tokenVersion) {
            // Token version mismatch — invalidate session
            return { ...session, user: undefined as any, expires: '0' } as any;
          }
          (token as any).tvCheckedAt = now;
        } catch {
          // DB error — fail open (let the request through)
        }
      }
      return session;
    },
  },
});
```

**Option B (Simpler, less real-time): Check tokenVersion only in `auth.ts` auth() wrapper**

Wrap the exported `auth()` function to check tokenVersion on every call:
```typescript
const originalAuth = _nextAuth({...}).auth;
export const auth = async () => {
  const session = await originalAuth();
  if (session?.user?.id) {
    // Check tokenVersion
    // ... DB check ...
  }
  return session;
};
```

**Acceptance criteria:**
- [ ] `tokenVersion` is stored in the JWT at sign-in
- [ ] When `signOutEverywhereAction` is called, other sessions are invalidated within 5 minutes
- [ ] The current session (the one that called sign out everywhere) is also invalidated
- [ ] DB check for tokenVersion is rate-limited (not on every single request)
- [ ] If DB is unreachable, the session check fails open (does not lock out users)

---

### BUG-03: 2FA is never enforced during login

**Severity:** CRITICAL — 2FA provides no protection if attackers can bypass it at login  
**Files:** `apps/web/src/auth.ts` (authorize), `apps/web/src/app/(auth)/actions.ts` (loginAction), `apps/web/src/app/(auth)/login/page.tsx`

**Problem:**  
The 2FA system exists in settings (`setupTwoFactorAction`, `verifyTwoFactorAction`, `disableTwoFactorAction`) but the login flow never checks `twoFactorEnabled`. A user with 2FA enabled can log in with just email + password, completely bypassing their second factor.

**Fix:**  
Implement a two-step login flow:

**Step 1: Add `totpCode` to the Credentials provider**

In `auth.ts`, add a `totpCode` credential field and verify it in `authorize()`:

```typescript
Credentials({
  name: 'Email + Password',
  credentials: {
    email: { label: 'Email', type: 'email' },
    password: { label: 'Password', type: 'password' },
    totpCode: { label: '2FA Code', type: 'text' },
  },
  async authorize(credentials) {
    // ... existing email/password validation from BUG-01 ...
    
    const passwordValid = await bcrypt.compare(password, user.hashedPassword);
    if (!passwordValid) return null;

    // 2FA check
    if (user.twoFactorEnabled) {
      const totpCode = typeof credentials?.totpCode === 'string' ? credentials.totpCode.trim() : '';
      if (!totpCode) {
        // Throw a special error so the login form knows to show the 2FA step
        throw new Error('2FA_REQUIRED');
      }
      const { verifySync } = await import('otplib');
      const isValid = verifySync({ secret: user.twoFactorSecret!, token: totpCode }).valid;
      if (!isValid) {
        throw new Error('INVALID_2FA_CODE');
      }
    }

    return { id: user.id, email: user.email, name: user.name, image: user.image, tokenVersion: user.tokenVersion };
  },
}),
```

**Step 2: Update `loginAction` to handle the 2FA flow**

In `apps/web/src/app/(auth)/actions.ts`:

```typescript
export async function loginAction(prevState: unknown, formData: FormData) {
  // ... existing validation ...
  
  try {
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      totpCode: formData.get('totpCode') as string || undefined,
      redirectTo: next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat',
    });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      const message = error.message;
      if (message === '2FA_REQUIRED') {
        return { requires2FA: true, email: normalizedEmail, password: password };
      }
      if (message === 'INVALID_2FA_CODE') {
        return { error: 'Invalid 2FA code', requires2FA: true };
      }
      return { error: 'Invalid email or password' };
    }
    return { error: `Error: ${String(error).slice(0, 200)}` };
  }
}
```

**Step 3: Update the login UI to show a 2FA input step**

In `apps/web/src/app/(auth)/login/page.tsx`, add a conditional 2FA input:

```tsx
// Add state for 2FA step
const [requires2FA, setRequires2FA] = useState(false);

// In the useEffect for state changes:
useEffect(() => {
  if (state.requires2FA) {
    setRequires2FA(true);
  }
  if (state.success) {
    setSuccess(true);
  }
}, [state.requires2FA, state.success]);

// In the form, conditionally show 2FA input:
{requires2FA && (
  <div className="flex flex-col gap-2">
    <label htmlFor="totpCode" className="text-fg text-sm font-semibold">
      2FA Code
    </label>
    <Input
      id="totpCode"
      name="totpCode"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={6}
      autoComplete="one-time-code"
      autoFocus
      required
      disabled={pending || success}
      placeholder="Enter 6-digit code"
    />
  </div>
)}
```

> **Security note:** Do NOT pass the password back from the server action to the client. Instead, keep the email/password in the form (the form is still rendered, just with the 2FA field added). The user re-submits with the 2FA code filled in.

**Alternative approach (simpler for vibe coding):**  
Always show an optional 2FA field on the login form. If the user has 2FA enabled and the field is empty, `authorize()` throws `2FA_REQUIRED`. The form shows an error "2FA code required" and the user fills it in and re-submits. This avoids state management complexity.

**Acceptance criteria:**
- [ ] User with 2FA enabled cannot log in without a valid TOTP code
- [ ] User without 2FA enabled logs in normally (no 2FA prompt)
- [ ] Invalid 2FA code shows "Invalid 2FA code" error
- [ ] Valid 2FA code logs in successfully
- [ ] 2FA code is not stored in the JWT or any client-visible storage
- [ ] Rate limiting applies to 2FA attempts (use existing `withRateLimit`)

---

### BUG-04: Dev login route exposed in production

**Severity:** CRITICAL — unauthenticated access to any deployment  
**Files:** `apps/web/src/app/api/dev/login/route.ts`, `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/middleware.ts`

**Problem:**  
1. The `/api/dev/login` route is excluded from middleware auth checks (the matcher pattern excludes `api/dev`). It creates a dev user in the DB and signs in with `signIn('credentials', { email, password: 'devpass' })`. Since `authorize()` is currently a stub (BUG-01), this works. But even after fixing BUG-01, the route explicitly creates a user with no password and calls `signIn` — which would fail, but the route still redirects to `/chat`.

2. The login page shows a "Skip login (dev only)" button **unconditionally** — even in production:

```tsx
<button
  type="button"
  onClick={() => { window.location.href = '/api/dev/login'; }}
  className="text-fg-muted hover:text-fg cursor-pointer text-xs underline underline-offset-2 transition-colors"
>
  Skip login (dev only)
</button>
```

**Fix:**  

**Fix 4a: Guard the dev login route**

In `apps/web/src/app/api/dev/login/route.ts`:

```typescript
export async function GET() {
  // Hard guard — only allow in development
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }
  
  // Additional guard — require explicit opt-in
  if (process.env.ENABLE_DEV_LOGIN !== 'true') {
    return new NextResponse('Not Found', { status: 404 });
  }
  
  // ... rest of existing dev login logic ...
}
```

**Fix 4b: Conditionally render the "Skip login" button**

In `apps/web/src/app/(auth)/login/page.tsx`:

```tsx
// Option 1: Use a server-passed flag
// Add to the page's server component parent:
// const isDev = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_LOGIN === 'true';

// Option 2: Use NEXT_PUBLIC_ env var
{process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true' && (
  <div className="flex flex-col items-center gap-2 border-t border-divider pt-4">
    <button
      type="button"
      onClick={() => { window.location.href = '/api/dev/login'; }}
      className="text-fg-muted hover:text-fg cursor-pointer text-xs underline underline-offset-2 transition-colors"
    >
      Skip login (dev only)
    </button>
  </div>
)}
```

Add `NEXT_PUBLIC_ENABLE_DEV_LOGIN` to `.env.example`:
```
# Optional: Enable dev login bypass (NEVER set in production)
NEXT_PUBLIC_ENABLE_DEV_LOGIN=
```

**Fix 4c: Remove `api/dev` from middleware exclusion (or keep but rely on route guard)**

The middleware matcher currently excludes `api/dev`:
```
'/((?!auth|share|api/auth|api/dev|api/cron|api/telegram|debug|sw\\.js|...).*)'
```

You can either:
- Keep the exclusion (the route itself is guarded) — simpler
- Remove `api/dev` from the exclusion so middleware runs — more defense-in-depth

Recommended: Keep the exclusion but add the route-level guard from Fix 4a.

**Acceptance criteria:**
- [ ] `/api/dev/login` returns 404 in production
- [ ] "Skip login" button is not visible in production
- [ ] Dev login still works in development when `ENABLE_DEV_LOGIN=true`
- [ ] No new env vars are required for production

---

### BUG-05: `userSessions` table is never populated — session management UI is broken

**Severity:** CRITICAL — sessions feature is non-functional  
**Files:** `apps/web/src/auth.ts` (authorize/signIn), `apps/web/src/app/(app)/settings/actions.ts` (listSessionsAction)

**Problem:**  
The `userSessions` table exists in the schema and the settings page has a "Sessions" card that lists/revoke sessions. But no code ever inserts into `userSessions` during login. The table is always empty, so the sessions card always shows "No active sessions". Revoking sessions does nothing because there's nothing to revoke.

**Fix:**  
Create a session record on successful sign-in. The best place is either:
- In the `authorize()` function (after password validation)
- In a custom `signIn` event handler
- In the `jwt()` callback on first sign-in (when `user` is present)

**Recommended approach — use NextAuth events:**

In `auth.ts`:
```typescript
export const { handlers, auth, signIn, signOut } = _nextAuth({
  ...authConfig,
  adapter,
  providers: [Credentials({...})],
  events: {
    async signIn({ user, account, profile }) {
      if (!user.id) return;
      try {
        const db = getDb();
        // Create a session record
        await db.insert(schema.userSessions).values({
          id: crypto.randomUUID(),
          userId: user.id,
          deviceName: null,  // Could parse from User-Agent in a real implementation
          ip: null,           // Could capture from request headers
          createdAt: new Date(),
          lastActiveAt: new Date(),
        });
      } catch (err) {
        // Don't fail the login if session tracking fails
        console.error('[auth] Failed to create session record:', err);
      }
    },
    async signOut({ token }) {
      if (!token?.id) return;
      try {
        const db = getDb();
        // Optionally delete the session record on explicit signout
        // This is tricky because we don't know which session to delete
        // without a session ID in the JWT. For now, just leave it.
      } catch (err) {
        console.error('[auth] Failed to clean up session record:', err);
      }
    },
  },
});
```

**Better approach — store session ID in JWT:**

To properly track which session belongs to the current JWT:
1. Generate a session ID in `authorize()` or the `signIn` event
2. Store it in the JWT via the `jwt()` callback
3. Use it to update `lastActiveAt` on each request
4. Use it to delete the specific session on sign out

```typescript
// In jwt callback:
jwt({ token, user }) {
  if (user) {
    token.id = user.id;
    token.tokenVersion = user.tokenVersion ?? 0;
    token.sessionId = crypto.randomUUID();  // Generate once at sign-in
  }
  return token;
}

// In signIn event:
events: {
  async signIn({ user, token }) {
    if (!user.id || !token?.sessionId) return;
    const db = getDb();
    await db.insert(schema.userSessions).values({
      id: token.sessionId,
      userId: user.id,
      ...
    });
  }
}
```

**Acceptance criteria:**
- [ ] A `userSessions` row is created on every successful login
- [ ] The sessions card in settings shows active sessions
- [ ] "Revoke session" actually invalidates the session (deletes the row)
- [ ] "Sign out everywhere" deletes all session rows AND increments tokenVersion
- [ ] `lastActiveAt` is updated periodically (at least every 5 minutes)

---

## 3. High-Severity Issues

### HIGH-01: 2FA secret stored in plaintext in the database

**Severity:** HIGH — sensitive key material exposed if DB is compromised  
**File:** `packages/db/src/schema/auth.ts`, `apps/web/src/app/(app)/settings/actions.ts`

**Problem:**  
The schema comment says `twoFactorSecret` is "encrypted at rest", but `setupTwoFactorAction()` stores the raw secret directly:
```typescript
await db.update(schema.users)
  .set({ twoFactorSecret: secret })  // ← plaintext!
  .where(eq(schema.users.id, session.user.id));
```

The `encryptSecret()` / `decryptSecret()` functions exist in `@hamafx/shared/encryption` but are not used for 2FA secrets.

**Fix:**  
1. Encrypt the secret before storing it
2. Decrypt it when verifying

```typescript
// In setupTwoFactorAction:
import { encryptSecret } from '@hamafx/shared/encryption';

const encryptedSecret = encryptSecret(secret);
await db.update(schema.users)
  .set({ twoFactorSecret: encryptedSecret })
  .where(eq(schema.users.id, session.user.id));

// In verifyTwoFactorAction and disableTwoFactorAction:
import { decryptSecret } from '@hamafx/shared/encryption';

const [user] = await db.select({ twoFactorSecret: schema.users.twoFactorSecret })
  .from(schema.users)
  .where(eq(schema.users.id, session.user.id));

const decryptedSecret = decryptSecret(user?.twoFactorSecret);
if (!decryptedSecret) {
  return { ok: false, error: '2FA secret is corrupted. Please disable and re-enable 2FA.' };
}
const isValid = verifySync({ secret: decryptedSecret, token }).valid;
```

Also update the `authorize()` function in `auth.ts` to decrypt the 2FA secret before verifying the TOTP code during login.

**Acceptance criteria:**
- [ ] `twoFactorSecret` column contains encrypted data, not plaintext
- [ ] 2FA setup, verification, and disabling all work with encrypted secrets
- [ ] 2FA verification during login decrypts the secret before checking
- [ ] If decryption fails, the user is prompted to re-setup 2FA

---

### HIGH-02: No rate limiting on login attempts

**Severity:** HIGH — brute force attacks are trivially possible  
**File:** `apps/web/src/app/(auth)/actions.ts` (loginAction)

**Problem:**  
The `registerAction` has rate limiting (`withRateLimit`), but `loginAction` does not. An attacker can make unlimited login attempts to brute-force passwords.

**Fix:**  
Add rate limiting to `loginAction`:

```typescript
export async function loginAction(prevState: unknown, formData: FormData) {
  // ... existing validation ...
  
  // Rate limit login attempts — 10 per minute per IP
  const headersList = await headers();
  const clientIp = 
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    'unknown';
  const rl = await withRateLimit(`login:${clientIp}`, 'login', 10);
  if (!rl.allowed) {
    return { error: 'Too many login attempts. Please try again later.' };
  }
  
  // Also rate limit per email — 5 per minute per email
  const rlEmail = await withRateLimit(`login-email:${normalizedEmail}`, 'login_email', 5);
  if (!rlEmail.allowed) {
    return { error: 'Too many login attempts for this email. Please try again later.' };
  }
  
  // ... existing signIn logic ...
}
```

> **Note:** Check that `'login'` and `'login_email'` are valid rate limit keys. Look at the `withRateLimit` function in `packages/db/src/` to see the allowed buckets and limits. You may need to add new rate limit configurations.

**Acceptance criteria:**
- [ ] More than 10 login attempts per minute from the same IP are blocked
- [ ] More than 5 login attempts per minute for the same email are blocked
- [ ] Rate limit error message is shown to the user
- [ ] Legitimate users are not rate-limited under normal usage

---

### HIGH-03: Debug route leaks environment and DB info

**Severity:** HIGH — information disclosure  
**File:** `apps/web/src/app/debug/route.ts`

**Problem:**  
The `/debug` route exposes:
- `DATABASE_URL` prefix (first 20 chars — includes protocol, user, and part of password)
- `DATABASE_URL` length
- Whether auth module loads successfully
- DrizzleAdapter status
- NextAuth initialization details
- DB connection test results

This route is excluded from middleware (`debug` is in the matcher exclusion), so it's accessible without authentication.

**Fix:**  
Guard the route to only work in development:

```typescript
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }
  
  // Even in dev, require a secret query param
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.DEBUG_SECRET) {
    return new NextResponse('Not Found', { status: 404 });
  }
  
  // ... existing debug logic ...
}
```

Alternatively, **delete the route entirely** and use a proper debugging tool (Sentry, Vercel logs, etc.).

**Acceptance criteria:**
- [ ] `/debug` returns 404 in production
- [ ] `/debug` requires authentication or a secret in development
- [ ] No environment variable values are leaked

---

### HIGH-04: No email verification on registration

**Severity:** HIGH — users can register with any email, no proof of ownership  
**Files:** `apps/web/src/app/(auth)/actions.ts` (registerAction), `packages/db/src/schema/auth.ts` (emailVerified field exists but is never set)

**Problem:**  
The `emailVerified` field exists in the user schema but is never populated. Users can register with any email address — real or fake — with no verification. This enables:
- Account spamming
- Email impersonation
- Bypassing "unique email" constraints by registering someone else's email first

**Fix:**  
Implement email verification:

1. After registration, generate a verification token
2. Send a verification email with a link
3. On click, mark the email as verified

```typescript
// In registerAction, after creating the user:
import { randomBytes } from 'crypto';

const verifyToken = randomBytes(32).toString('hex');
const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

await db.insert(schema.verificationTokens).values({
  identifier: normalizedEmail,
  token: verifyToken,
  expires: verifyExpires,
});

// Send verification email
// If you have an email service configured:
// await sendVerificationEmail(normalizedEmail, verifyToken);
// For now, log it in dev:
if (process.env.NODE_ENV !== 'production') {
  console.log(`[verify] http://localhost:3000/api/auth/verify-email?token=${verifyToken}`);
}
```

2. Create a verification route at `apps/web/src/app/api/auth/verify-email/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { eq, and, gt } from 'drizzle-orm';
import { getDb, schema } from '@hamafx/db';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const db = getDb();
  const [vt] = await db.select()
    .from(schema.verificationTokens)
    .where(and(
      eq(schema.verificationTokens.token, token),
      gt(schema.verificationTokens.expires, new Date()),
    ))
    .limit(1);

  if (!vt) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
  }

  // Mark email as verified
  await db.update(schema.users)
    .set({ emailVerified: new Date() })
    .where(eq(schema.users.email, vt.identifier));

  // Delete the token
  await db.delete(schema.verificationTokens)
    .where(eq(schema.verificationTokens.token, token));

  return NextResponse.redirect(new URL('/login?verified=true', req.url));
}
```

3. Add `verify-email` to the middleware exclusion list so the route is accessible without auth.

**Acceptance criteria:**
- [ ] New registrations generate a verification token
- [ ] Clicking the verification link marks the email as verified
- [ ] Expired tokens are rejected
- [ ] The `emailVerified` field is set on the user after verification
- [ ] (Optional) Unverified users see a banner prompting them to verify

---

### HIGH-05: No password reset / forgot password flow

**Severity:** HIGH — users who forget their password are permanently locked out  
**Files:** New files needed

**Problem:**  
There is no way for a user to reset their password if they forget it. The only option is to create a new account.

**Fix:**  
Implement a password reset flow:

1. **Forgot password page** — `apps/web/src/app/(auth)/forgot-password/page.tsx`
   - User enters email
   - Generate a reset token, store in `verificationTokens` table
   - Send email with reset link

2. **Reset password page** — `apps/web/src/app/(auth)/reset-password/page.tsx`
   - User enters new password (with strength validation)
   - Verify the reset token
   - Update `hashedPassword` in the DB
   - Delete the token
   - Increment `tokenVersion` to invalidate old sessions

3. **Server actions** — `apps/web/src/app/(auth)/actions.ts`
   - `forgotPasswordAction(email)` — generates token, sends email
   - `resetPasswordAction(token, newPassword)` — verifies token, updates password

4. **Add routes to middleware exclusion** — `forgot-password` and `reset-password` need to be accessible without auth.

```typescript
// forgotPasswordAction
export async function forgotPasswordAction(prevState: unknown, formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  if (!email) return { error: 'Email is required' };

  const rl = await withRateLimit(`forgot:${email}`, 'forgot_password', 3);
  if (!rl.allowed) return { error: 'Too many requests. Try again later.' };

  const db = getDb();
  const [user] = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  // Don't reveal whether the email exists
  if (user) {
    const token = randomBytes(32).toString('hex');
    await db.insert(schema.verificationTokens).values({
      identifier: email,
      token,
      expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });
    // Send email with link: /reset-password?token=xxx
    // In dev, log it
  }

  return { success: true, message: 'If an account exists, a reset link has been sent.' };
}

// resetPasswordAction
export async function resetPasswordAction(prevState: unknown, formData: FormData) {
  const token = formData.get('token') as string;
  const password = formData.get('password') as string;
  
  // Validate password strength (same schema as register)
  const parsed = passwordSchema.safeParse({ password });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const db = getDb();
  const [vt] = await db.select()
    .from(schema.verificationTokens)
    .where(and(
      eq(schema.verificationTokens.token, token),
      gt(schema.verificationTokens.expires, new Date()),
    ))
    .limit(1);

  if (!vt) return { error: 'Invalid or expired reset link' };

  const hashedPassword = await bcrypt.hash(password, 10);
  
  await db.transaction(async (tx) => {
    await tx.update(schema.users)
      .set({ hashedPassword, tokenVersion: sql`${schema.users.tokenVersion} + 1` })
      .where(eq(schema.users.email, vt.identifier));
    await tx.delete(schema.verificationTokens)
      .where(eq(schema.verificationTokens.token, token));
  });

  return { success: true };
}
```

**Acceptance criteria:**
- [ ] Forgot password form sends a reset link (in dev, logs the link)
- [ ] Reset password page accepts a new password
- [ ] Password is hashed and stored
- [ ] Old sessions are invalidated (tokenVersion incremented)
- [ ] Reset token is single-use (deleted after use)
- [ ] Reset token expires after 1 hour
- [ ] Forgot password doesn't reveal whether an email is registered

---

## 4. Medium-Severity Issues

### MED-01: Open redirect in login `next` parameter

**Severity:** MEDIUM — can redirect users to malicious sites  
**File:** `apps/web/src/app/(auth)/actions.ts` (line 32)

**Problem:**  
```typescript
redirectTo: next && next.startsWith('/') ? next : '/chat',
```

`startsWith('/')` allows `//evil.com` which browsers interpret as a protocol-relative URL to `evil.com`.

**Fix:**
```typescript
// Reject protocol-relative URLs and ensure the path starts with exactly one /
const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';
redirectTo: safeNext,
```

Also validate in the middleware's `authorized` callback where `next` is set:
```typescript
// In auth.config.ts authorized callback:
const next = nextUrl.pathname + nextUrl.search;
const redirectUrl = new URL('/login', nextUrl.origin);
if (next.startsWith('/') && !next.startsWith('//')) {
  redirectUrl.searchParams.set('next', next);
}
```

**Acceptance criteria:**
- [ ] `//evil.com` as the `next` parameter redirects to `/chat` instead
- [ ] Normal paths like `/dashboard` work correctly
- [ ] Paths with query params like `/chat?thread=123` work correctly

---

### MED-02: CSRF protection has a gap on first request

**Severity:** MEDIUM — first state-changing request from a new session has no CSRF protection  
**File:** `apps/web/src/middleware.ts`

**Problem:**  
The CSRF check only validates when a cookie already exists:
```typescript
if (isStateChanging && req.nextUrl.pathname.startsWith('/api/')) {
  if (cookieToken) {  // ← only checks if cookie exists
    const headerToken = req.headers.get('x-csrf-token');
    if (!headerToken || headerToken !== cookieToken) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }
}
```

If no CSRF cookie exists yet, any POST/PUT/DELETE to `/api/*` is allowed through without CSRF validation.

**Fix:**
```typescript
if (isStateChanging && req.nextUrl.pathname.startsWith('/api/')) {
  // Always require CSRF token for state-changing API requests
  const headerToken = req.headers.get('x-csrf-token');
  if (!cookieToken || !headerToken || headerToken !== cookieToken) {
    return new NextResponse('Forbidden - CSRF token missing or invalid', { status: 403 });
  }
}
```

> **Note:** This means the CSRF cookie must be set BEFORE any state-changing request. The middleware sets the cookie on the first request (GET), so normal browsing flow will set it. But if a user's first interaction is a POST (e.g., from an external link), it will fail. This is acceptable for security — the alternative is a CSRF hole.

> **Also exclude auth routes from CSRF:** NextAuth's own POST routes (`/api/auth/callback/*`, `/api/auth/signout`) should be excluded from CSRF since NextAuth has its own CSRF protection. Add `api/auth` to the check:
> ```typescript
> if (isStateChanging && req.nextUrl.pathname.startsWith('/api/') && !req.nextUrl.pathname.startsWith('/api/auth/')) {
> ```

**Acceptance criteria:**
- [ ] POST requests without a CSRF cookie are rejected with 403
- [ ] POST requests with mismatched CSRF token are rejected with 403
- [ ] NextAuth auth routes (`/api/auth/*`) are exempted
- [ ] Normal flow (GET first, then POST) works correctly

---

### MED-03: Settings page crashes if session is null

**Severity:** MEDIUM — runtime error on settings page  
**File:** `apps/web/src/app/(app)/settings/page.tsx`

**Problem:**  
The settings page accesses `session.user.id` without checking if session exists:
```tsx
<SystemStatusCard userId={session.user.id} />          // ← crash if session is null
<NotificationsCard userId={session.user.id} />          // ← crash if session is null
```

The middleware should prevent unauthenticated access, but defense-in-depth requires null checks.

**Fix:**
```tsx
export default async function SettingsPage() {
  const session = await auth();
  
  if (!session?.user?.id) {
    redirect('/login');
  }
  
  const userId = session.user.id;
  // ... rest of the page, using `userId` instead of `session.user.id`
  
  return (
    <div className="flex flex-col gap-4">
      <SystemStatusCard userId={userId} />
      <UsageGlance userId={userId} />
      {/* ... */}
      <NotificationsCard userId={userId} />
      {/* ... */}
    </div>
  );
}
```

**Acceptance criteria:**
- [ ] Settings page redirects to login if session is missing
- [ ] No runtime errors when session is null
- [ ] All `session.user.id` references are replaced with the null-checked `userId`

---

### MED-04: `AUTH_SECRET` vs `NEXTAUTH_SECRET` inconsistency

**Severity:** MEDIUM — confusing env var naming can lead to misconfiguration  
**Files:** `apps/web/src/auth.config.ts`, `apps/web/src/lib/env.ts`, `.env.example`

**Problem:**  
- `auth.config.ts` checks both: `process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET`
- `lib/env.ts` only validates `NEXTAUTH_SECRET`
- `.env.example` only documents `NEXTAUTH_SECRET`
- NextAuth v5 prefers `AUTH_SECRET` (the `NEXTAUTH_` prefix is deprecated)

**Fix:**
1. Standardize on `AUTH_SECRET` (NextAuth v5 convention)
2. Keep `NEXTAUTH_SECRET` as a fallback for backward compatibility
3. Update `.env.example` to document `AUTH_SECRET` as the primary var
4. Update `lib/env.ts` to validate `AUTH_SECRET` with `NEXTAUTH_SECRET` as fallback

```typescript
// In lib/env.ts:
const AuthEnvSchema = z.object({
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 chars').optional(),
  NEXTAUTH_SECRET: z.string().min(32).optional(),  // deprecated fallback
  // ...
});

// Add a refinement or post-parse check:
function getAuthSecret(env: AuthEnv): string | undefined {
  return env.AUTH_SECRET ?? env.NEXTAUTH_SECRET;
}
```

**Acceptance criteria:**
- [ ] `AUTH_SECRET` is the documented primary env var
- [ ] `NEXTAUTH_SECRET` still works as a fallback
- [ ] `.env.example` is updated
- [ ] A warning is logged if only `NEXTAUTH_SECRET` is set (deprecation notice)

---

### MED-05: `AUTH_MODE=legacy` bypasses all authentication

**Severity:** MEDIUM — dangerous escape hatch  
**Files:** `apps/web/src/auth.config.ts`, `apps/web/src/middleware.ts`, `apps/web/src/app/(app)/layout.tsx`

**Problem:**  
When `AUTH_MODE=legacy`:
- The `authorized` callback returns `true` for all requests (no auth check)
- The middleware injects `x-user-id: __system__` for all requests
- The app layout skips the onboarding check

This is a dangerous escape hatch that, if accidentally set in production, disables all authentication.

**Fix:**
1. Only allow `AUTH_MODE=legacy` in development:

```typescript
// In auth.config.ts authorized callback:
if (process.env.AUTH_MODE === 'legacy' && process.env.NODE_ENV !== 'production') return true;
```

```typescript
// In middleware.ts:
if (process.env.AUTH_MODE === 'legacy' && process.env.NODE_ENV !== 'production') {
  // ... legacy mode logic ...
}
```

2. Add a startup warning if `AUTH_MODE=legacy` is set in production:

```typescript
// In lib/env.ts or instrumentation.ts:
if (process.env.AUTH_MODE === 'legacy' && process.env.NODE_ENV === 'production') {
  console.error('[SECURITY] AUTH_MODE=legacy is set in production! Authentication is disabled.');
}
```

**Acceptance criteria:**
- [ ] `AUTH_MODE=legacy` is ignored in production
- [ ] A warning is logged if it's set in production
- [ ] Legacy mode still works in development

---

### MED-06: Unused custom auth library (`lib/auth.ts`) creates confusion

**Severity:** MEDIUM — dead code, potential for accidental misuse  
**File:** `apps/web/src/lib/auth.ts`

**Problem:**  
`lib/auth.ts` implements a complete signed-cookie auth system (HMAC-SHA256, base64url encoding, cookie helpers) that appears to be a legacy implementation from before NextAuth was integrated. It's not used by the current auth flow (NextAuth handles everything), but it's still importable and could confuse developers.

The file's header says it's used by `/api/auth/login`, `/api/auth/logout`, `middleware.ts`, and `requireAuth()` — but none of those actually use it (they use NextAuth instead).

**Fix:**
1. **Option A (Recommended): Delete the file** — it's dead code. Run `grep -r "lib/auth" apps/web/src/ --include="*.ts" --include="*.tsx"` to confirm no imports, then delete.
2. **Option B: Mark as deprecated** — add a deprecation notice at the top and remove the exports from any barrel files.

> **Before deleting:** Run a grep to confirm nothing imports from it:
> ```bash
> grep -r "from '@/lib/auth'" apps/web/src/ --include="*.ts" --include="*.tsx"
> grep -r "from '../lib/auth'" apps/web/src/ --include="*.ts" --include="*.tsx"
> ```
> The test file `apps/web/test/auth.test.ts` imports from `../src/lib/auth` — those tests test the legacy auth system. If you delete `lib/auth.ts`, also delete or update `test/auth.test.ts`.

**Acceptance criteria:**
- [ ] Dead code is removed or clearly marked as deprecated
- [ ] No imports break
- [ ] Tests are updated to not test deleted code

---

## 5. Low-Severity Issues & Cleanup

### LOW-01: `getCachedSession` exported but likely unused

**File:** `apps/web/src/auth.ts`

**Problem:**  
`getCachedSession` wraps `auth()` with React `cache()` for request-level deduplication, but it's unclear if any component actually uses it.

**Fix:**  
Run `grep -r "getCachedSession" apps/web/src/ --include="*.ts" --include="*.tsx"`. If no results, remove the export. If used, keep it but add a comment explaining when to use it vs `auth()`.

---

### LOW-02: Registration creates user without `emailVerified`

**File:** `apps/web/src/app/(auth)/actions.ts`

**Problem:**  
The `registerAction` creates a user without setting `emailVerified`. Even if email verification is not implemented yet (HIGH-04), the field should be explicitly set to `null` for clarity.

**Fix:**  
This is addressed by HIGH-04. If email verification is not implemented, at least set `emailVerified: null` explicitly in the insert.

---

### LOW-03: `bcrypt` cost factor is 10 — consider increasing

**File:** `apps/web/src/app/(auth)/actions.ts` (registerAction)

**Problem:**  
`bcrypt.hash(password, 10)` uses a cost factor of 10. As hardware improves, 12 is becoming the recommended minimum.

**Fix:**
```typescript
const BCRYPT_COST = 12;
const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);
```

> **Note:** Increasing the cost factor will NOT break existing passwords (bcrypt reads the cost from the hash). New passwords will use the higher cost. You can also implement gradual re-hashing on login.

**Acceptance criteria:**
- [ ] New passwords are hashed with cost factor 12
- [ ] Existing passwords (cost 10) still verify correctly
- [ ] (Optional) On successful login with an old hash, re-hash with cost 12

---

### LOW-04: No password change flow in settings

**File:** `apps/web/src/app/(app)/settings/actions.ts`

**Problem:**  
Users cannot change their password from the settings page. They must use the forgot password flow (which doesn't exist yet — see HIGH-05).

**Fix:**  
Add a `changePasswordAction`:

```typescript
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
  totpCode?: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  // Verify current password
  const passwordValid = await verifyAccountPassword(session.user.id, currentPassword);
  if (!passwordValid) return { ok: false, error: 'Current password is incorrect' };

  // Verify 2FA if enabled
  const db = getDb();
  const [user] = await db.select({
    twoFactorEnabled: schema.users.twoFactorEnabled,
    twoFactorSecret: schema.users.twoFactorSecret,
  }).from(schema.users).where(eq(schema.users.id, session.user.id));

  if (user?.twoFactorEnabled) {
    if (!totpCode) return { ok: false, error: '2FA code is required' };
    const secret = decryptSecret(user.twoFactorSecret);
    if (!secret || !verifySync({ secret, token: totpCode }).valid) {
      return { ok: false, error: 'Invalid 2FA code' };
    }
  }

  // Validate new password strength
  const parsed = passwordSchema.safeParse({ password: newPassword });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  // Hash and update
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await db.update(schema.users)
    .set({ hashedPassword, tokenVersion: sql`${schema.users.tokenVersion} + 1` })
    .where(eq(schema.users.id, session.user.id));

  return { ok: true };
}
```

Add a "Change Password" card to the settings page.

---

### LOW-05: No account lockout after failed attempts

**File:** `apps/web/src/app/(auth)/actions.ts`

**Problem:**  
Rate limiting (HIGH-02) slows down brute force, but there's no account lockout. An attacker can continuously try passwords at the rate limit threshold.

**Fix:**  
Add a `failedLoginAttempts` counter to the user schema. After 5 failed attempts, lock the account for 15 minutes.

```typescript
// Add to schema/auth.ts:
failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
lockedUntil: timestamp('locked_until', { withTimezone: true }),
```

In `authorize()`:
```typescript
// Check if account is locked
if (user.lockedUntil && user.lockedUntil > new Date()) {
  throw new Error('Account temporarily locked. Try again later.');
}

// On failed password:
if (!passwordValid) {
  const attempts = user.failedLoginAttempts + 1;
  const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
  await db.update(schema.users)
    .set({ 
      failedLoginAttempts: attempts,
      lockedUntil: lockUntil,
    })
    .where(eq(schema.users.id, user.id));
  return null;
}

// On successful login, reset counter
await db.update(schema.users)
  .set({ failedLoginAttempts: 0, lockedUntil: null })
  .where(eq(schema.users.id, user.id));
```

---

## 6. Feature Gaps & Improvements

### FEAT-01: Add OAuth providers (Google, GitHub)

**Files:** `apps/web/src/auth.ts`, `.env.example`

NextAuth v5 makes adding OAuth providers trivial. Adding Google and GitHub gives users passwordless options and reduces the burden on the credentials provider.

```typescript
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';

providers: [
  Credentials({...}),
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
  }),
  GitHub({
    clientId: process.env.AUTH_GITHUB_ID,
    clientSecret: process.env.AUTH_GITHUB_SECRET,
  }),
],
```

Add the corresponding env vars to `.env.example`.

---

### FEAT-02: Session activity tracking (device/IP)

**Files:** `apps/web/src/middleware.ts`, `apps/web/src/auth.ts`

Capture device name and IP during login and update `lastActiveAt` periodically:

```typescript
// In middleware, after auth check:
if (userId) {
  // Update lastActiveAt every 5 minutes (throttled)
  // This requires a DB write — consider using a KV store or edge-compatible DB
}
```

Or use the `session` callback in `auth.ts` to update `lastActiveAt` when the session is read.

---

### FEAT-03: Security audit log

**Files:** New `packages/db/src/schema/audit.ts` (already exists!), `apps/web/src/app/(auth)/actions.ts`

The `auditLogs` table already exists in the schema. Log auth events:

```typescript
// On successful login:
await db.insert(schema.auditLogs).values({
  userId: user.id,
  action: 'login',
  metadata: { ip: clientIp, userAgent: req.headers.get('user-agent') },
});

// On failed login:
await db.insert(schema.auditLogs).values({
  userId: user.id,
  action: 'login_failed',
  metadata: { reason: 'invalid_password', ip: clientIp },
});

// On 2FA disable:
await db.insert(schema.auditLogs).values({
  userId: session.user.id,
  action: '2fa_disabled',
});
```

---

### FEAT-04: "Remember me" functionality

**Files:** `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/auth.config.ts`

Add a "Remember me" checkbox that controls the JWT maxAge:

```typescript
// In auth.config.ts:
session: {
  strategy: 'jwt',
  maxAge: 30 * 24 * 60 * 60,  // 30 days default
},
```

The `signIn` call can pass a custom maxAge via the `expires` parameter or a custom JWT claim.

---

### FEAT-05: Gradual password re-hashing

**File:** `apps/web/src/auth.ts` (authorize)

On successful login, check if the hash uses an outdated cost factor and re-hash:

```typescript
if (passwordValid) {
  // Check if hash needs upgrading
  const hashCost = parseInt(user.hashedPassword.split('$')[2], 10);
  if (hashCost < 12) {
    const newHash = await bcrypt.hash(password, 12);
    await db.update(schema.users)
      .set({ hashedPassword: newHash })
      .where(eq(schema.users.id, user.id));
  }
}
```

---

## 7. Test Plan

### Unit Tests to Add/Update

| Test | File | Description |
|------|------|-------------|
| `authorize() rejects wrong password` | `test/auth.test.ts` | Verify authorize returns null for wrong password |
| `authorize() accepts correct password` | `test/auth.test.ts` | Verify authorize returns user for correct password |
| `authorize() rejects non-existent user` | `test/auth.test.ts` | Verify authorize returns null for unknown email |
| `authorize() rejects soft-deleted user` | `test/auth.test.ts` | Verify authorize returns null for deletedAt != null |
| `authorize() enforces 2FA` | `test/auth.test.ts` | Verify authorize throws 2FA_REQUIRED when 2FA is enabled |
| `tokenVersion invalidation` | `test/auth.test.ts` | Verify session is invalidated when tokenVersion changes |
| `open redirect blocked` | `test/auth-flow.test.ts` | Verify `//evil.com` next param is rejected |
| `CSRF gap closed` | `test/csrf.test.ts` | Verify POST without CSRF cookie is rejected |
| `dev login blocked in prod` | `test/dev-secrets.test.ts` | Verify /api/dev/login returns 404 in production |
| `2FA secret encrypted at rest` | `test/auth.test.ts` | Verify stored secret is not plaintext |
| `rate limiting on login` | `test/auth-flow.test.ts` | Verify login is rate-limited |

### E2E Tests to Add/Update

| Test | File | Description |
|------|------|-------------|
| Full login flow | `tests/e2e/auth.spec.ts` | Login → redirect to /chat |
| 2FA login flow | `tests/e2e/auth.spec.ts` | Login with 2FA → enter code → redirect |
| Registration flow | `tests/e2e/auth.spec.ts` | Register → redirect to /onboarding |
| Session management | `tests/e2e/settings.spec.ts` | View sessions → revoke → verify revoked |
| Password reset | `tests/e2e/auth.spec.ts` | Forgot password → reset → login with new password |

### Manual Smoke Tests

1. **Login with correct credentials** → should succeed
2. **Login with wrong password** → should show "Invalid email or password"
3. **Login with 2FA enabled** → should prompt for 2FA code
4. **Register new account** → should create account and redirect to onboarding
5. **Sign out everywhere** → other sessions should be invalidated
6. **Revoke a session** → that session should be invalidated
7. **Access /debug in production** → should return 404
8. **Access /api/dev/login in production** → should return 404
9. **POST to /api/* without CSRF cookie** → should return 403
10. **Login with `next=//evil.com`** → should redirect to /chat, not evil.com

---

## 8. Implementation Order Checklist

Work through these in order. Each item links to the section above.

### Phase 1: Critical Security Fixes (do these first)

- [ ] **BUG-01:** Fix `authorize()` to actually verify passwords against the DB
- [ ] **BUG-04:** Guard dev login route and hide "Skip login" button in production
- [ ] **BUG-03:** Implement 2FA enforcement during login
- [ ] **BUG-02:** Implement `tokenVersion` checking in JWT callback
- [ ] **BUG-05:** Populate `userSessions` table on login

### Phase 2: High-Severity Fixes

- [ ] **HIGH-01:** Encrypt 2FA secrets at rest
- [ ] **HIGH-02:** Add rate limiting to login
- [ ] **HIGH-03:** Guard or delete debug route
- [ ] **HIGH-04:** Implement email verification
- [ ] **HIGH-05:** Implement password reset flow

### Phase 3: Medium-Severity Fixes

- [ ] **MED-01:** Fix open redirect in `next` parameter
- [ ] **MED-02:** Close CSRF gap on first request
- [ ] **MED-03:** Add null checks in settings page
- [ ] **MED-04:** Standardize on `AUTH_SECRET`
- [ ] **MED-05:** Guard `AUTH_MODE=legacy` to dev only
- [ ] **MED-06:** Remove or deprecate unused `lib/auth.ts`

### Phase 4: Low-Severity & Cleanup

- [ ] **LOW-01:** Remove unused `getCachedSession` if applicable
- [ ] **LOW-03:** Increase bcrypt cost to 12
- [ ] **LOW-04:** Add password change flow in settings
- [ ] **LOW-05:** Add account lockout after failed attempts

### Phase 5: Feature Improvements (optional)

- [ ] **FEAT-01:** Add OAuth providers (Google, GitHub)
- [ ] **FEAT-02:** Session activity tracking (device/IP)
- [ ] **FEAT-03:** Security audit log for auth events
- [ ] **FEAT-04:** "Remember me" functionality
- [ ] **FEAT-05:** Gradual password re-hashing

### Phase 6: Tests

- [ ] Add unit tests for all fixes (see Test Plan section)
- [ ] Add E2E tests for critical flows
- [ ] Run full test suite: `pnpm test`
- [ ] Run typecheck: `pnpm typecheck`
- [ ] Run lint: `pnpm lint`

---

## Appendix: Key References

- [NextAuth v5 Documentation](https://authjs.dev)
- [NextAuth v5 Edge Compatibility](https://authjs.dev/guides/edge-compatibility)
- [NextAuth v5 Credentials Provider](https://authjs.dev/providers/credentials)
- [NextAuth v5 Callbacks](https://authjs.dev/configuration/callbacks)
- [Drizzle Adapter](https://authjs.dev/getting-started/adapters/drizzle)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Next.js App Router Auth Guide 2026](https://workos.com/blog/nextjs-app-router-authentication-guide-2026)

---

*Generated from a full analysis of the HamaFX-Ai codebase on 2026-06-28.*