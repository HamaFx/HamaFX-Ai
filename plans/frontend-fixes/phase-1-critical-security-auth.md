# Phase 1 — Critical Security & Authentication Fixes

**Priority:** P0 — Fix immediately before any deployment
**Estimated files touched:** 8
**Findings covered:** 15 (10 bugs + 5 improvements)

---

## Overview

This phase addresses the most severe security vulnerabilities and broken user flows. Every issue here either exposes user data, breaks authentication, or prevents new users from completing onboarding. No other work should proceed until these are fixed and verified.

---

## Task 1.1 — Fix Auth Bypass in `lib/api.ts` (🔴 P0 CRITICAL)

**File:** `apps/web/src/lib/api.ts` (~line 71)
**Severity:** Complete authentication bypass — every API route is fully accessible without login.

### Problem

`getUserFromRequest()` falls back to a `__system__` user instead of returning `null` when no authenticated user is found. The `withAuth()` wrapper checks `if (!user)` to return 401, but this fallback means `user` is never `null`:

```ts
// Fallback to system user since authentication is disabled for self-hosted instances
return {
  userId: '__system__',
  email: 'admin@localhost',
  name: 'Admin',
};
```

### Fix

Replace the fallback with `return null`. This ensures `withAuth()` properly returns 401 for unauthenticated requests:

```ts
// No authenticated user found — do NOT fall back to a system user.
// Return null so withAuth() can properly reject the request with 401.
return null;
```

### Verification

1. Start the dev server without being logged in
2. Attempt `GET /api/chat/threads` — should return 401
3. Attempt `POST /api/chat/threads` — should return 401
4. Log in and retry — should succeed
5. Run `pnpm typecheck` to ensure no type errors from the return type change

### Important Notes

- If the app is intended to support a "self-hosted single-user mode" without auth, implement this as an explicit configuration flag (e.g., `ALLOW_NO_AUTH=true` env var) rather than a silent fallback. The current approach is a security hole disguised as a feature.
- Check all callers of `getUserFromRequest()` to ensure they handle `null` correctly. The `withAuth()` wrapper already does, but there may be direct callers.

---

## Task 1.2 — Fix Wrong Onboarding Redirect Path (🔴 P0)

**File:** `apps/web/src/app/onboarding/page.tsx`
**Severity:** New users get a 404 when redirected to login from onboarding.

### Problem

The redirect uses `/auth/login` but the actual login route is `/login` (the `(auth)` is a Next.js route group, not a URL segment):

```ts
// WRONG — /auth/login does not exist as a URL path
redirect('/auth/login');
```

### Fix

Change all occurrences of `/auth/login` to `/login`:

```ts
redirect('/login');
```

### Verification

1. Clear cookies (unauthenticated state)
2. Navigate to `/onboarding`
3. Should redirect to `/login` (not 404)
4. Search the entire codebase for any other `/auth/login` or `/auth/register` references and fix them too:
   ```bash
   grep -r "'/auth/" apps/web/src/ --include="*.ts" --include="*.tsx"
   ```

---

## Task 1.3 — Fix CSRF First-Request Failure (🔴 P0)

**File:** `apps/web/src/middleware.ts`
**File:** `apps/web/src/lib/csrf.ts`
**Severity:** The first state-changing request from any new session always fails CSRF validation.

### Problem

When no `hfx_csrf` cookie exists yet, the middleware generates a new token and sets it as a cookie. But the client doesn't have this cookie yet — the first POST/fetch from a new session will fail CSRF validation because the client sends no CSRF token (or a mismatched one).

### Fix

Implement a "double-submit cookie" pattern with a GET bootstrap:

1. In `middleware.ts`, when generating a new CSRF token, also inject it into the response headers so the client can read it immediately:

```ts
// In the middleware, after generating the token:
const response = NextResponse.next({
  request: { headers: requestHeaders },
});
response.cookies.set('hfx_csrf', token, {
  httpOnly: false, // Client needs to read this for double-submit
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
});
// Also set as response header for immediate client access
response.headers.set('x-csrf-token', token);
return response;
```

2. In the client-side `fetchCsrf` helper (likely in `lib/csrf.ts` or a client utility), read the CSRF token from:
   - First: a meta tag or header injected by the server
   - Fallback: the cookie itself (since `httpOnly: false` allows client reads)

```ts
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  // Try cookie first
  const match = document.cookie.match(/(?:^|;\s*)hfx_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

3. For the very first request after page load, the middleware should allow the request through if:
   - The method is GET (safe method — already allowed)
   - The method is POST but the `x-csrf-token` header matches the cookie value that the middleware just set

### Alternative Simpler Fix

If the above is too complex, exempt the first request by checking if the `hfx_csrf` cookie was just created in this response cycle:

```ts
// In CSRF validation logic:
const cookieToken = request.cookies.get('hfx_csrf')?.value;
const headerToken = request.headers.get('x-csrf-token');

// If no cookie exists yet, this is the first request — allow it through
// and set the cookie. Subsequent requests must match.
if (!cookieToken) {
  // Generate and set new token, allow request through
  const newToken = generateCsrfToken();
  // ... set cookie, set header
  return NextResponse.next({ ... });
}

// Normal validation for existing sessions
if (cookieToken !== headerToken) {
  return new NextResponse(JSON.stringify({ error: 'CSRF token mismatch' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
}
```

### Verification

1. Clear all cookies
2. Open the app in a fresh browser session
3. Immediately attempt a POST (e.g., submit the login form)
4. Should succeed without a CSRF error
5. Attempt a second POST — should also succeed
6. Manually tamper with the CSRF cookie — POST should fail with 403

---

## Task 1.4 — Fix Email Normalization in Registration (🔴 P1)

**File:** `apps/web/src/app/(auth)/actions.ts`
**Severity:** `User@Example.com` and `user@example.com` bypass the duplicate check but collide on insert.

### Problem

`registerAction` doesn't normalize the email before the duplicate check:

```ts
const existing = await db.query.users.findFirst({
  where: eq(users.email, email), // email is raw input
});
if (existing) return { ok: false, error: 'Email already registered' };
// ... insert with raw email
```

### Fix

Normalize email to lowercase + trim before any DB operation:

```ts
const normalizedEmail = email.trim().toLowerCase();

// Use normalizedEmail for ALL operations:
const existing = await db.query.users.findFirst({
  where: eq(users.email, normalizedEmail),
});
if (existing) return { ok: false, error: 'Email already registered' };

// Insert with normalizedEmail
await db.insert(users).values({
  email: normalizedEmail,
  // ... other fields
});
```

Also apply the same normalization in `loginAction` so users can log in regardless of case.

### Verification

1. Register with `Test@Example.COM`
2. Attempt to register again with `test@example.com` — should get "Email already registered"
3. Log in with `TEST@EXAMPLE.COM` — should succeed

---

## Task 1.5 — Fix Unguarded `JSON.parse` in Onboarding (🔴 P1)

**File:** `apps/web/src/app/onboarding/actions.ts`
**Severity:** Malformed input crashes the server action with an unhandled exception.

### Fix

Wrap in try-catch with validation:

```ts
let prefs: unknown;
try {
  prefs = JSON.parse(input);
} catch {
  return { ok: false, error: 'Invalid preferences data' };
}

// Optionally validate with zod:
const result = onboardingPrefsSchema.safeParse(prefs);
if (!result.success) {
  return { ok: false, error: 'Invalid preferences format' };
}
```

### Verification

1. Call `completeOnboardingAction` with `input = "not json"` — should return error
2. Call with valid JSON — should succeed
3. Call with `input = "{bad json"` — should return error, not crash

---

## Task 1.6 — Fix Silent Delete Errors in Journal API (🔴 P1)

**File:** `apps/web/src/app/api/journal/[id]/route.ts`

### Fix

Ensure proper error responses with try-catch, 404 for not found, 401 for unauthorized, 500 for server errors.

### Verification

1. Delete an existing entry — should return `{ ok: true }`
2. Delete a non-existent entry — should return 404
3. Delete another user's entry — should return 404 (not 403, to prevent enumeration)

---

## Task 1.7 — Fix PII (Email) in API Request Logs (🟡 P1)

**File:** `apps/web/src/lib/api.ts`

### Fix

Log only the user ID, not email:
```ts
console.log(`[api] ${method} ${path} userId=${user.userId}`);
```

### Verification

1. Make an API request — email should not appear in plain text in logs

---

## Task 1.8 — Fix Inconsistent Server Action Error Handling (🟡 P2)

**Files:** Multiple server action files

### Fix

Standardize ALL server actions to return `{ ok: boolean, error?: string, data?: T }`. Never throw.

### Files to audit:
1. `app/(auth)/actions.ts` — `loginAction`, `registerAction`
2. `app/(app)/settings/actions.ts` — all exported actions
3. `app/onboarding/actions.ts` — `completeOnboardingAction`
4. `app/(app)/settings/profile/page.tsx` — calling code
5. `app/(app)/settings/symbols/page.tsx` — calling code

### Verification

1. Trigger an error in each server action — should return `{ ok: false, error }`, not throw
2. The calling component should display the error message in the UI

---

## Task 1.9 — Fix Missing Auth Check in `clearChatHistoryAction` (🟡 P2)

**File:** `apps/web/src/app/(app)/settings/actions.ts`

### Fix

Add auth check at the top:
```ts
export async function clearChatHistoryAction() {
  const user = await getUserFromRequest();
  if (!user) return { ok: false, error: 'Unauthorized' };
  await db.delete(chatThreads).where(eq(chatThreads.userId, user.userId));
  return { ok: true };
}
```

---

## Task 1.10 — Fix Onboarding `displayName` Not Saved (🟡 P2)

**File:** `apps/web/src/app/onboarding/actions.ts`

### Fix

Parse `displayName` from input and update users table:
```ts
if (prefs.displayName && typeof prefs.displayName === 'string') {
  await db.update(users)
    .set({ name: prefs.displayName.trim().slice(0, 100) })
    .where(eq(users.id, user.userId));
}
```

### Verification

1. Complete onboarding with a display name
2. Navigate to Settings → Profile — the name should be populated

---

## Task 1.11 — Fix Logout Redirect on Fetch Failure (🟡 P2)

**File:** `apps/web/src/app/(app)/settings/_components/logout-button.tsx`

### Fix

Check response before redirecting:
```ts
const res = await fetch('/api/auth/signout', { method: 'POST', ...withCsrf() });
if (!res.ok) {
  toast.error('Failed to log out. Please try again.');
  return;
}
queryClient.clear();
router.push('/login');
router.refresh();
```

### Verification

1. Simulate network failure — should show error toast, NOT redirect
2. Successful logout — should redirect to `/login`

---

## Task 1.12 — Add Password Complexity Requirements (🟢 P2)

**File:** `apps/web/src/app/(auth)/register/page.tsx`
**File:** `apps/web/src/app/(auth)/actions.ts`

### Fix

Add zod schema:
```ts
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Must contain at least one number');
```

Show real-time validation checklist below password field.

### Verification

1. Try to register with `password` — should fail
2. Try to register with `Password1` — should succeed

---

## Task 1.13 — Fix `window.confirm` vs `useConfirm` Inconsistency (🟡 P2)

**File:** `apps/web/src/components/chat/chat-top-bar.tsx`
**File:** `apps/web/src/app/(app)/settings/_components/ai-prefs-card.tsx`

### Fix

Replace all `window.confirm()` calls with the `useConfirm()` hook. Search and replace:
```bash
grep -rn "window.confirm" apps/web/src/ --include="*.tsx" --include="*.ts"
```

### Verification

1. Bulk delete — should show styled confirm drawer, not native dialog

---

## Task 1.14 — Fix Duplicate `id="main-content"` (🟡 P2)

**File:** `apps/web/src/app/(app)/settings/agent/page.tsx`

### Fix

Remove duplicate `id` from the page-level `<main>`.

### Verification

1. `grep -rn 'id="main-content"' apps/web/src/` — should return exactly one result

---

## Task 1.15 — Audit All API Routes for Auth Coverage (🟡 P2)

**Files:** All files in `apps/web/src/app/api/`

### Audit Checklist

For each route file, verify:
1. GET routes use `getUserFromRequest()` and check for `null`
2. POST/PUT/PATCH/DELETE routes use `withAuth()` wrapper
3. Cron routes check CRON_SECRET header
4. Public routes don't leak sensitive data

### Routes to audit:
- `api/chat/route.ts`, `api/chat/threads/*`, `api/journal/*`, `api/alerts/*`
- `api/upload/route.ts`, `api/me/keys/route.ts`, `api/push/*`
- `api/settings/*`, `api/market/*`, `api/admin/*`, `api/telegram/webhook/route.ts`

### Verification

1. For each route, attempt access without auth — should get 401
2. For each route, attempt access with auth — should work

---

## Completion Checklist

- [x] Task 1.1 — Auth bypass fixed
- [x] Task 1.2 — Onboarding redirect uses `/login`
- [x] Task 1.3 — CSRF first-request no longer fails
- [x] Task 1.4 — Email normalized
- [x] Task 1.5 — `JSON.parse` wrapped in try-catch
- [x] Task 1.6 — Journal delete returns proper errors
- [x] Task 1.7 — No PII in logs
- [x] Task 1.8 — All server actions return `{ ok, error }`
- [x] Task 1.9 — `clearChatHistoryAction` has auth check
- [x] Task 1.10 — Onboarding `displayName` saved
- [x] Task 1.11 — Logout checks fetch result
- [x] Task 1.12 — Password complexity enforced
- [x] Task 1.13 — All `window.confirm` replaced
- [x] Task 1.14 — No duplicate `id="main-content"`
- [x] Task 1.15 — All API routes audited

## Post-Phase Verification

1. `pnpm typecheck` — zero errors
2. `pnpm lint` — zero errors
3. Unauthenticated access to every API route returns 401
4. Full registration → onboarding → login flow works end-to-end
5. CSRF works on first request from fresh session
6. `grep -rn "window.confirm" apps/web/src/` — zero results
7. `grep -rn "__system__" apps/web/src/` — zero results
8. `grep -rn "'/auth/" apps/web/src/` — zero results
