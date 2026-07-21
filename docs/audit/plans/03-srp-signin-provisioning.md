# Plan 03 — Extract User Provisioning out of the `signIn` Callback

**Covers finding:** SRP-3 (see `docs/audit/solid-findings.md`).
**App:** `apps/web`.
**Est. blast radius:** `apps/web/src/auth.ts` + one new service module + tests. No
schema or auth-flow behavior change.

---

## 1. The problem (with citations)

`apps/web/src/auth.ts` is the NextAuth configuration file, but it also carries
user-lifecycle **business logic**:

- The `signIn` callback spans `auth.ts:366-474` (~108 lines) and is typed
  `{ user: any; account: any; profile: any }` (`auth.ts:366`) — so account
  linking + provisioning run with **no type checking**.
- Impersonation challenge helpers also live here (`auth.ts:80`, `:96`) — separate
  concern, but out of scope for this plan (see boundary).

Two responsibilities are fused: **framework auth wiring** (providers, session
strategy, callbacks) and **user provisioning / account-linking rules**. The
business logic can't be unit-tested without booting NextAuth, and the `any` types
hide breakage.

---

## 2. Target design (minimal)

Introduce **one typed service** that the callback delegates to. Keep NextAuth
wiring in `auth.ts`; move the "what happens to our user records on sign-in" logic
into a testable function.

New module: `apps/web/src/lib/auth/provision-user.ts`

```ts
export interface SignInInput {
  user: { id?: string; email?: string | null; name?: string | null; image?: string | null };
  account: { provider: string; providerAccountId: string; type: string } | null;
  profile?: Record<string, unknown> | undefined;
}

export interface SignInDecision {
  allow: boolean;
  reason?: string; // for logging / denial redirect
}

/** All DB reads/writes for provisioning + account linking on sign-in. */
export async function provisionUserOnSignIn(input: SignInInput): Promise<SignInDecision> { /* ... */ }
```

The `signIn` callback becomes thin glue: map NextAuth's loosely-typed args into
`SignInInput`, call `provisionUserOnSignIn`, return its `allow` boolean.

---

## 3. Implementation sequence

1. **Read the current callback carefully** (`auth.ts:366-474`) and inventory every
   distinct action: which tables it reads/writes, the account-linking rule
   (note `allowDangerousEmailAccountLinking: false` at `auth.ts:293` — linking is
   done explicitly here), any denial conditions, and any side effects (audit log,
   welcome email, default settings row).
2. **Create `apps/web/src/lib/auth/provision-user.ts`** and move that logic
   verbatim into `provisionUserOnSignIn(input)`, replacing `any` field access
   with the typed `SignInInput`. Preserve exact ordering and early-returns so
   behavior is identical. Reuse existing `@hamafx/db` query functions the
   callback already calls — do not rewrite queries.
3. **Slim the callback** in `auth.ts` to:
   ```ts
   async signIn({ user, account, profile }) {
     const decision = await provisionUserOnSignIn({
       user, account: account ?? null, profile: profile ?? undefined,
     });
     if (!decision.allow) logger.warn({ reason: decision.reason }, 'sign-in denied');
     return decision.allow;
   }
   ```
   Keep the callback parameter types as NextAuth provides them, but do the `any`
   narrowing at the mapping boundary only.
4. **Leave `session`/`jwt` callbacks** (`auth.ts:475+`, `callbacks:` at `:357`)
   untouched unless they share a helper with provisioning; if they do, export
   that helper from the new module too.

---

## 4. What NOT to change (scope boundary)

- **Do not** change the auth flow, providers list (`auth.ts:116-314`), session
  strategy, redirect/page paths, or `allowDangerousEmailAccountLinking`.
- **Do not** touch the impersonation helpers (`auth.ts:80-113`) — that's a
  separate concern; leave it in `auth.ts`.
- **Do not** alter the `session`/`jwt` callback outputs (token/session shape) —
  downstream code depends on them.
- **Do not** change any DB schema or migration.
- **Do not** "improve" the account-linking policy — this is a pure extraction;
  behavior must be byte-for-byte equivalent.

---

## 5. Verification

- **Typecheck:** `pnpm --filter @hamafx/web typecheck` — the new module must be
  fully typed (no `any` inside `provisionUserOnSignIn`).
- **Unit test (new):** add `apps/web/test/provision-user.test.ts` that calls
  `provisionUserOnSignIn` with a mocked DB (register a mock via the DI container
  or the existing test DB harness used in `apps/web/test/auth-flow.test.ts`) and
  asserts: new user → created + `allow: true`; existing user → linked, no
  duplicate; denial condition → `allow: false`.
- **Existing auth tests:** `pnpm --filter @hamafx/web test test/auth-flow.test.ts test/nextauth-wiring.test.ts`
  must pass unchanged.
- **Manual check:** sign in with a brand-new account (row created, default
  settings present), then sign in again (no duplicate, linked correctly), and
  confirm any denial path still redirects/blocks as before.
- **E2E (optional):** `pnpm test:e2e` → `apps/web/tests/e2e/auth.spec.ts`.
