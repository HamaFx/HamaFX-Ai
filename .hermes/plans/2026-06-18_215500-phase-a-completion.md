# Phase A (Multi-User) Completion — Implementation Plan

**Goal:** Finish the NextAuth.js v5 wiring so the auth gate actually works end-to-end (register → login → middleware → protected page). Currently the UI is built and the DB schema is migrated, but `auth.ts` is stubbed and middleware bypasses auth.

**Architecture:** NextAuth v5 with DrizzleAdapter + Credentials provider. JWT session strategy (Edge-compatible). `lib/api.ts` already has `getUserIdFromRequest()` reading `x-user-id` header — middleware will populate that from the JWT.

**Tech Stack:** next-auth@5.0.0-beta.31, @auth/drizzle-adapter, bcryptjs, drizzle-orm. No new deps.

---

## Current State (VERIFIED June 18, 2026)

### ✅ Already done in code

- DB schema (`packages/db/src/schema/auth.ts`): `users`, `accounts`, `sessions`, `verificationTokens`, `userSettings`, `userSymbols`
- Migration `0009_phase_a_multi_user.sql` (130 LOC) — creates all new tables, adds `user_id` to 10 existing tables, adds 11 indexes (incl. 2 composite)
- `auth.config.ts` (Edge-safe, 42 LOC) — `session: { strategy: 'jwt' }`, callbacks for authorized/jwt/session
- `app/api/auth/[...nextauth]/route.ts` — re-exports `handlers` from `@/auth`
- Login page (`/login`) + register page (`/register`) — full UI
- `app/(auth)/actions.ts` — `loginAction` + `registerAction` server actions with bcrypt + Drizzle insert
- Onboarding page (`/onboarding`) — layout + page + actions
- Settings subpages: `settings/api-keys`, `settings/symbols` — read/write real `userSettings`/`userSymbols` tables
- `lib/api.ts` — `getUserIdFromRequest()` reads `x-user-id` header (injected by middleware)
- `lib/env.ts` — `NEXTAUTH_SECRET` required, `APP_PASSWORD`/`AUTH_COOKIE_SECRET` optional
- `instrumentation.ts` — auto-creates admin user from `APP_PASSWORD` if no users exist, backfills `user_id` on existing data
- `.env.example` updated with `NEXTAUTH_SECRET` + `ENCRYPTION_SECRET`
- Existing test: `apps/web/test/auth.test.ts` covers legacy HMAC token utility

### ❌ Broken / missing (the gap to close)

1. **`auth.ts` is a STUB** (21 LOC) — returns hardcoded `__system__` user. No real providers, no DrizzleAdapter, no real `signIn`. Calling `signIn('credentials', ...)` from `actions.ts` WILL FAIL.
2. **Middleware is OPEN** — hardcodes `x-user-id: __system__`, never calls NextAuth's `auth()`. Anyone can hit any URL. No auth gate at all.
3. **`lib/auth.ts`** (legacy HMAC utility) still exists but is unused by middleware. Still used by `lib/cron.ts` for the share-link/cron path — KEEP.
4. **Worker test FAILING** — `apps/worker/src/alerts/evaluator.ts:309` references `schema.users` (new table) but the test PGlite DB doesn't have it.
5. **Worker typecheck FAILING** — 2 unrelated errors blocking the build.
6. **No `NOT NULL` on `user_id`** — currently nullable. Will enforce after data backfill is verified.

### Open decisions made (no need to ask)

| Decision | Choice | Why |
|---|---|---|
| Delete legacy `lib/auth.ts`? | **No, keep it** | Still used by `lib/cron.ts` for cron-secret and share-link HMAC |
| Add Google/GitHub OAuth now? | **No, defer** | Plans say optional + env-gated. Credentials is sufficient for Phase A. YAGNI. |
| Add magic-link/email verification? | **No, defer** | Same reason. Login works with email + password. |
| Enforce `NOT NULL` on `user_id`? | **Not in this plan** | Defer to a follow-up after manual backfill verification on prod. |
| Rate limiting (in-memory → Postgres)? | **Defer** | Out of Phase A scope. Current in-memory login throttle works. |

---

## Tasks (bite-sized, TDD, frequent commits)

### Phase 0 — Unblock the build (small, do first)

#### Task 0.1: Fix worker typecheck error in `apps/worker/src/jobs/alerts.ts:6`

**Files:**
- Modify: `apps/worker/src/jobs/alerts.ts:6`

**Step 1: Reproduce**
```bash
cd /home/ubuntu/HamaFX-Ai && pnpm typecheck 2>&1 | grep alerts.ts
```
Expected: `src/jobs/alerts.ts(6,39): error TS2379: ... exactOptionalPropertyTypes`

**Step 2: Fix**

Read the file first to see the exact shape, then either drop the `signal` key when undefined OR adjust the function type. Likely fix: build the args object conditionally.

**Step 3: Verify**
```bash
cd /home/ubuntu/HamaFX-Ai && pnpm --filter @hamafx/worker typecheck
```
Expected: exit 0.

**Step 4: Commit**
```bash
git add apps/worker/src/jobs/alerts.ts
git commit -m "fix(worker): pass signal conditionally to satisfy exactOptionalPropertyTypes"
```

#### Task 0.2: Fix worker typecheck error in `apps/worker/src/symbol-manager.ts:68`

**Files:**
- Modify: `apps/worker/src/symbol-manager.ts:68`

**Step 1: Reproduce**
```bash
cd /home/ubuntu/HamaFX-Ai && pnpm typecheck 2>&1 | grep symbol-manager
```
Expected: `error TS2345: Argument of type 'string' is not assignable to '"XAUUSD" | "EURUSD" | "GBPUSD"'`

**Step 2: Fix**

Either narrow with `as const` / `assertSupportedSymbol()` from `@hamafx/shared`, or import the `SYMBOLS` const array. Read the surrounding context first.

**Step 3-4: same as 0.1, separate commit.**

#### Task 0.3: Fix worker test — `schema.users` missing in test DB

**Files:**
- Modify: `apps/worker/src/alerts/evaluator.ts:309` (and any other `schema.users` references in test path)
- Modify: `apps/worker/test/alerts-evaluator-parallel.test.ts` — its DB setup

**Step 1: Reproduce**
```bash
cd /home/ubuntu/HamaFX-Ai && pnpm --filter @hamafx/worker test -- --run 2>&1 | tail -20
```
Expected: 2 failing tests, error `Cannot read properties of undefined (reading 'id')` in `evaluator.ts:309`.

**Step 2: Investigate root cause**

Read `apps/worker/src/alerts/evaluator.ts:300-330` and the test setup. Two possible causes:
- (a) The test PGlite DB doesn't have migration `0009` applied → fix the test DB setup
- (b) The query is wrong (selecting from `users` when no user exists) → fix the evaluator

**Step 3: Fix (likely option a — apply the migration to test DB)**

**Step 4: Verify**
```bash
cd /home/ubuntu/HamaFX-Ai && pnpm --filter @hamafx/worker test -- --run
```
Expected: all tests pass.

**Step 5: Commit**
```bash
git add apps/worker/src/alerts/evaluator.ts apps/worker/test/...
git commit -m "fix(worker): make alerts evaluator tests see the multi-user schema"
```

**Step 6: Run the full test + typecheck gate**
```bash
cd /home/ubuntu/HamaFX-Ai && pnpm turbo run test -- --run && pnpm typecheck
```
Expected: all green.

---

### Phase A.1 — Real NextAuth wiring

#### Task A.1.1: Write a test that exercises the auth gate

**Files:**
- Create: `apps/web/test/nextauth-wiring.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { auth, signIn, signOut, handlers } from '../src/auth';

describe('NextAuth wiring', () => {
  it('exports a real `auth` function (not the __system__ stub)', async () => {
    // The stub always returns a hardcoded user. The real one returns null
    // when there's no session cookie.
    const result = await auth();
    expect(result).toBeNull();
  });

  it('exports real `signIn` and `signOut` functions (not no-op stubs)', () => {
    expect(signIn).toBeTypeOf('function');
    expect(signIn.toString()).not.toContain('async (...args) => {}');
    expect(signOut).toBeTypeOf('function');
    expect(signOut.toString()).not.toContain('async (...args) => {}');
  });

  it('exports NextAuth handlers (GET + POST)', () => {
    expect(handlers).toBeDefined();
    expect(handlers.GET).toBeTypeOf('function');
    expect(handlers.POST).toBeTypeOf('function');
  });
});
```

**Step 2: Run, expect fail**
```bash
cd /home/ubuntu/HamaFX-Ai/apps/web && pnpm test test/nextauth-wiring.test.ts -- --run
```
Expected: `auth()` returns `{ user: { id: '__system__', ... } }` — not null. The test fails.

**Step 3-5: implement in next task.**

#### Task A.1.2: Replace the stub `auth.ts` with real NextAuth

**Files:**
- Rewrite: `apps/web/src/auth.ts`

**Step 1: Read current state**
- `apps/web/src/auth.config.ts` (Edge config)
- `apps/web/src/lib/env.ts` (`getAuthEnv`, `getServerEnv`)
- `packages/db/src/schema/auth.ts` (user columns)
- `apps/web/src/app/(auth)/actions.ts` (what signIn is called with)

**Step 2: Implement**

```typescript
// apps/web/src/auth.ts — NextAuth v5 full configuration (Node runtime).
//
// Wires up the DrizzleAdapter + Credentials provider. The Credentials
// provider is the primary login path for self-hosted single-org deploys.
// OAuth providers (Google/GitHub) are added later behind env vars.

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

import { authConfig } from './auth.config';
import { getDb, schema } from '@hamafx/db';
import { getServerEnv } from '@/lib/env';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(getDb()),
  providers: [
    Credentials({
      name: 'Email + Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email.toLowerCase() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;

        const db = getDb();
        const rows = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .limit(1);

        const user = rows[0];
        if (!user || !user.hashedPassword) return null;

        const ok = await bcrypt.compare(password, user.hashedPassword);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  // session.strategy is 'jwt' from authConfig — keeps middleware Edge-safe.
  // We still use DrizzleAdapter for the user/account/verification tables
  // (Credentials itself uses JWT; OAuth would use the adapter for sessions).
});
```

**Step 3: Run the wiring test**
```bash
cd /home/ubuntu/HamaFX-Ai/apps/web && pnpm test test/nextauth-wiring.test.ts -- --run
```
Expected: 3 tests pass.

**Step 4: Typecheck**
```bash
cd /home/ubuntu/HamaFX-Ai && pnpm --filter @hamafx/web typecheck
```
Expected: exit 0.

**Step 5: Commit**
```bash
git add apps/web/src/auth.ts apps/web/test/nextauth-wiring.test.ts
git commit -m "feat(auth): wire NextAuth v5 with DrizzleAdapter + Credentials provider"
```

#### Task A.1.3: Make middleware call NextAuth's `auth()` and gate

**Files:**
- Rewrite: `apps/web/src/middleware.ts`

**Step 1: Write a test for the middleware behavior**

For middleware tests, the cleanest pattern is to extract the auth logic into a pure function and unit-test that. The full middleware can be tested via integration in Phase A.2.

For now, do a code review of the change against the existing matcher config.

**Step 2: Replace the middleware**

```typescript
// apps/web/src/middleware.ts — Edge middleware with NextAuth v5.
//
// The `auth` function from NextAuth returns the JWT session if the request
// has a valid session cookie. We use it to:
//   1. Gate authenticated routes (everything not in the public allow-list).
//   2. Inject the user id as `x-user-id` for downstream handlers via
//      `lib/api.ts::getUserIdFromRequest()`.
//
// CSRF double-submit and X-Request-Id stamping are preserved.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { REQUEST_ID_HEADER, readOrCreateRequestId } from '@/lib/request-id';

export default auth((req) => {
  const requestId = readOrCreateRequestId(req);

  // ── CSRF double-submit cookie (state-changing /api/*) ───────────
  let csrfToken = req.cookies.get('hfx_csrf')?.value;
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
  }
  const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  if (isStateChanging && req.nextUrl.pathname.startsWith('/api/')) {
    const headerToken = req.headers.get('x-csrf-token');
    if (!headerToken || headerToken !== csrfToken) {
      return new NextResponse('Forbidden - CSRF token missing or invalid', { status: 403 });
    }
  }

  // ── Auth gate ───────────────────────────────────────────────────
  // req.auth is the JWT session (set by NextAuth's `auth()` wrapper).
  // null when there's no valid session cookie. /login + /register + /api/auth/*
  // + /api/cron/* + /share/* are public — see the matcher config.
  const userId = req.auth?.user?.id ?? null;

  const headers = new Headers(req.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  if (userId) {
    headers.set('x-user-id', userId);
  } else {
    // Route handlers that REQUIRE auth should check via getUserIdFromRequest()
    // and return 401 if null. The header stays absent (vs the previous stub
    // that injected '__system__') so the check is honest.
    headers.delete('x-user-id');
  }

  const next = NextResponse.next({ request: { headers } });
  next.headers.set(REQUEST_ID_HEADER, requestId);

  if (!req.cookies.has('hfx_csrf')) {
    next.cookies.set('hfx_csrf', csrfToken, {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return next;
});

export const config = {
  // Same exclusions as before — /api/auth is NextAuth's catch-all.
  matcher: [
    '/((?!auth|share|api/auth|api/cron|api/telegram|sw\\.js|sw-precache\\.json|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icons|robots\\.txt|sitemap\\.xml).*)',
  ],
};
```

**Step 3: Update the `authorized` callback in `auth.config.ts` to redirect properly**

```typescript
// In apps/web/src/auth.config.ts, replace the `authorized` callback:
authorized({ auth, request: { nextUrl } }) {
  const isLoggedIn = !!auth?.user;
  const isOnAuth = nextUrl.pathname.startsWith('/login') || nextUrl.pathname.startsWith('/register');

  // Public routes — let through
  if (isOnAuth) return true;

  // Authed → let through
  if (isLoggedIn) return true;

  // Unauthed on a protected route → redirect to /login
  const redirectUrl = new URL('/login', nextUrl.origin);
  redirectUrl.searchParams.set('next', nextUrl.pathname + nextUrl.search);
  return Response.redirect(redirectUrl);
},
```

**Step 4: Typecheck + test**
```bash
cd /home/ubuntu/HamaFX-Ai && pnpm --filter @hamafx/web typecheck && pnpm --filter @hamafx/web test -- --run
```
Expected: green.

**Step 5: Commit**
```bash
git add apps/web/src/middleware.ts apps/web/src/auth.config.ts
git commit -m "feat(auth): gate routes via NextAuth middleware + redirect to /login"
```

#### Task A.1.4: Add a smoke test for the register → login → page flow

**Files:**
- Create: `apps/web/test/auth-flow.test.ts`

**Step 1: Write the test**

Use a real PGlite DB. Seed the user. Call the action. Verify the session cookie is set.

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';

describe('register → login → page flow (integration)', () => {
  beforeEach(async () => {
    // Clean tables. Tests use PGlite from a tmp dir.
    const db = getDb();
    await db.delete(schema.users).where(eq(schema.users.email, 'test@example.com'));
  });

  it('registerAction creates a user + user_settings row, then sets a session', async () => {
    const { registerAction } = await import('../src/app/(auth)/actions');
    const formData = new FormData();
    formData.set('name', 'Test User');
    formData.set('email', 'test@example.com');
    formData.set('password', 'password123');

    // Server actions in Next.js are called like this from tests.
    // The signIn() inside registerAction will throw a Next.js redirect,
    // which is expected — catch it and inspect the side-effects.
    await registerAction(null, formData).catch(() => {});

    const db = getDb();
    const user = await db.select().from(schema.users).where(eq(schema.users.email, 'test@example.com')).limit(1);
    expect(user).toHaveLength(1);
    expect(user[0]!.hashedPassword).toBeTruthy();

    const settings = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, user[0]!.id)).limit(1);
    expect(settings).toHaveLength(1);
    expect(settings[0]!.onboardingCompleted).toBe(false);
  });
});
```

**Step 2-5: standard TDD loop.**

Note: Server actions using `signIn` throw Next.js redirect errors that propagate. The test catches them. The DB side-effects (user + settings row) are what we assert.

**Step 6: Commit**
```bash
git add apps/web/test/auth-flow.test.ts
git commit -m "test(auth): integration test for registerAction side-effects"
```

---

### Phase A.2 — Verification gate

#### Task A.2.1: Full local verification

```bash
cd /home/ubuntu/HamaFX-Ai

# 1. All tests
pnpm turbo run test -- --run

# 2. Typecheck all packages
pnpm typecheck

# 3. Production build
pnpm --filter @hamafx/web build
```

**Expected:** all green. If any step fails, fix it before continuing. Do NOT commit-and-push unless all three pass.

#### Task A.2.2: Manual smoke test (logged in user instructions)

1. `pnpm dev:local` (or `docker compose up` if you want pgvector)
2. Visit `http://localhost:3000` → should redirect to `/login`
3. Click "Create an account" → register with email + 8+ char password
4. Should land on `/onboarding` (per `registerAction` redirectTo)
5. Visit `/chat` → should NOT redirect to login (auth gate working)
6. Sign out via the UI
7. Visit `/chat` → should redirect to `/login?next=/chat`

If any step fails, debug locally before considering Phase A complete.

---

## Files Changed (summary)

| File | Action | LOC |
|---|---|---|
| `apps/worker/src/jobs/alerts.ts` | Fix typecheck error | ~5 |
| `apps/worker/src/symbol-manager.ts` | Fix typecheck error | ~3 |
| `apps/worker/src/alerts/evaluator.ts` (or test setup) | Fix test DB schema | ~10 |
| `apps/web/src/auth.ts` | Replace stub with real NextAuth | ~55 |
| `apps/web/src/auth.config.ts` | Update `authorized` callback | ~10 |
| `apps/web/src/middleware.ts` | Call `auth()` from NextAuth, gate routes | ~50 |
| `apps/web/test/nextauth-wiring.test.ts` | New test | ~30 |
| `apps/web/test/auth-flow.test.ts` | New test | ~40 |

**Total: ~200 LOC changed. No new dependencies. No DB migration.**

---

## What's NOT in this plan (out of scope, deferred)

- OAuth providers (Google/GitHub) — env-gated, defer until requested
- Magic link / email verification — defer
- BYOK encryption utility — `lib/encryption.ts` doesn't exist yet; settings/api-keys page already exists but probably stubbed. Audit separately.
- Enforcing `NOT NULL` on `user_id` — needs manual prod-DB backfill verification first
- Rate limiting upgrade (in-memory → Postgres) — out of scope, current works
- Per-user queries everywhere in `@hamafx/ai` — Phase B (database scoping), separate plan
- Worker `user_symbols` UNION subscription — Phase B, separate plan

---

## Risks & tradeoffs

1. **`@/auth` is imported by middleware (Edge)** — if `auth.ts` accidentally imports a Node-only module (e.g. `bcrypt`, `postgres-js`), the Edge build breaks. The DrizzleAdapter is the main risk: it pulls `drizzle-orm` which is fine, but `getDb()` resolves to either postgres-js (Node) or PGlite (also Node). If `auth.ts` is called from middleware via `auth()`, it will trigger `getDb()`.

   **Mitigation:** verify the Edge build with `pnpm --filter @hamafx/web build`. If it fails, extract the providers into a separate file and only import the Edge-safe `authConfig` from middleware (use NextAuth's `auth()` wrapper which works with Edge-compatible config).

2. **NextAuth v5 is in beta** — `5.0.0-beta.31`. Some APIs may shift. Pin the version, watch for changes.

3. **CSRF + NextAuth interactions** — NextAuth has its own CSRF protection for credential posts. Our double-submit cookie might conflict. The current matcher already exempts `/api/auth/*`, so it should be fine. Verify in Task A.2.2.

4. **Existing tests using `getServerEnv()`** — `lib/env.ts` now requires `NEXTAUTH_SECRET`. Tests that don't set it will fail. Check existing test setup; if it relies on a stub, add `NEXTAUTH_SECRET=test-secret-please-do-not-use-in-prod-32-chars-min`.

---

## Definition of done

- [ ] `pnpm turbo run test -- --run` → all green
- [ ] `pnpm typecheck` → all green
- [ ] `pnpm --filter @hamafx/web build` → success
- [ ] Manual smoke test in Task A.2.2 → all 7 steps work
- [ ] Unauthed users cannot reach `/chat` (curl test in addition to browser)
- [ ] No `__system__` literal left in non-test code (grep for it)
