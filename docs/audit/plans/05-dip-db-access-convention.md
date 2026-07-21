# Plan 05 — Settle the DB-Access Convention + Type the DI Tokens

**Covers findings:** DIP-1 and DIP-2 (see `docs/audit/solid-findings.md`).
**Packages:** `packages/shared`, `packages/ai`, plus a docs/lint rule.
**Est. blast radius:** small code change + a documented rule + optional lint
guard. **This is a "decide and align" plan, not a mass rewrite.**

> ⚠️ **Explicit non-goal:** do **not** convert all 110 direct `getDb` importers to
> the container. The container is a stringly-typed *service locator* — a weak
> abstraction. Spreading it to 110 more files is churn that entrenches the weaker
> pattern. The fix is a single clear rule + type-safe tokens where the container
> is genuinely useful.

---

## 1. The problem (with citations)

- **DIP-1:** Two conventions for the same dependency coexist. The DI container
  (`packages/shared/src/container.ts`) is bootstrapped in
  `packages/ai/src/db.ts:39` and used in ~a dozen `packages/ai` hot spots
  (`agent.ts:139,697`, tool files). But **110 non-test files still
  `import { getDb } from '@hamafx/db'`** and call the module singleton directly
  (e.g. `apps/web/src/app/(app)/settings/_actions-*.ts`,
  `apps/web/src/app/(auth)/actions.ts`, most `api/**/route.ts`). A mock registered
  via `container.register('db', …)` silently fails to intercept those 110
  importers — a real test footgun.
- **DIP-2:** Tokens are magic strings with a caller-asserted generic —
  `container.resolve<DbClient>('db')` (`agent.ts:139`, `db.ts:45`) and the literal
  `'llmClient'` (`agent.ts:697`). A `TOKENS` constant exists
  (`packages/ai/src/services.ts:32`) but is used **once** (`services.ts:48`) and
  ignored elsewhere. No compile-time link between token and type.

---

## 2. Target design (minimal)

### Decision (DIP-1): the container is for the `packages/ai` runtime only
Rationale: the AI runtime benefits from injectable `db`/`llmClient` for testing
long agent flows; Next.js server actions/route handlers are already the
composition edge and read cleanly with direct `getDb()`.

- **Rule:** *"Inside `packages/ai`, resolve `db`/`llmClient` via the container.
  Everywhere else (`apps/web`, `apps/worker`, other packages), import `getDb`
  directly from `@hamafx/db`."*
- Document it in `AGENTS.md`/`CONTRIBUTING.md` and (optional) enforce with an
  ESLint `no-restricted-imports` rule that bans `@hamafx/db` `getDb` **inside
  `packages/ai/src`** (forcing the container there), so the split stops drifting.

### Type-safe tokens (DIP-2)
Replace stringly-typed tokens with a typed token registry so `resolve` infers `T`:

```ts
// packages/shared/src/container.ts
export interface Token<T> { readonly key: string; readonly _t?: T }
export function token<T>(key: string): Token<T> { return { key }; }

// register/resolve become generic over Token<T>:
register<T>(t: Token<T>, factory: () => T): void
resolve<T>(t: Token<T>): T
has<T>(t: Token<T>): boolean
```

Central token definitions (single source of truth):

```ts
// packages/ai/src/tokens.ts
import type { DbClient } from '@hamafx/db';
import type { LlmClient } from './llm-client';
export const DB = token<DbClient>('db');
export const LLM_CLIENT = token<LlmClient>('llmClient');
```

Now `container.resolve(DB)` is typed `DbClient` with no manual generic, and a
wrong type is a compile error.

---

## 3. Implementation sequence

1. **Add the `Token<T>` type + typed `token()` helper** to
   `packages/shared/src/container.ts`. Keep the internal maps keyed by
   `token.key` (string) so runtime behavior is unchanged. Retain string-key
   overloads temporarily if needed to avoid a big-bang, but prefer switching all
   call sites in step 3.
2. **Create `packages/ai/src/tokens.ts`** with `DB` and `LLM_CLIENT`. Remove the
   old `TOKENS` object in `services.ts:32` (replace its single use at
   `services.ts:48` with `container.register(LLM_CLIENT, …)`).
3. **Migrate the container call sites** (small, all in `packages/ai`):
   `agent.ts:139` (`resolve<DbClient>('db')` → `resolve(DB)`), `agent.ts:697`
   (`'llmClient'` → `LLM_CLIENT`), `db.ts:39,45`, and any tool files using
   `container.resolve(...)`. Grep to find them all:
   `grep -rn "container.resolve\|container.register" packages/ai/src`.
4. **Write the convention down** in `CONTRIBUTING.md` (and `AGENTS.md` if it
   documents architecture). One short paragraph + the rule from §2.
5. **(Optional but recommended) Add the ESLint guard:** a
   `no-restricted-imports` entry scoped to `packages/ai/src/**` forbidding
   `getDb` from `@hamafx/db`, with a message pointing at `resolve(DB)`. This is
   what actually prevents the split from re-drifting.
6. **Do NOT** rewrite the 110 direct importers. They are on the correct side of
   the rule.

---

## 4. What NOT to change (scope boundary)

- **Do not** migrate `apps/web` / `apps/worker` / non-`ai` packages to the
  container. Direct `getDb()` there is now the sanctioned convention.
- **Do not** change `getDb()` itself or the Drizzle client construction
  (`packages/db/src/client.ts`).
- **Do not** add new services to the container beyond `db`/`llmClient` in this
  change.
- **Do not** turn the container into a full IoC framework (no auto-wiring, no
  decorators) — it stays a tiny typed registry.
- **Do not** change the container's caching/`clear()` semantics used by tests.

---

## 5. Verification

- **Typecheck:** `pnpm typecheck` (whole workspace). The typed tokens must make
  `container.resolve(DB)` infer `DbClient` with no explicit generic; a mismatched
  register/resolve must fail to compile.
- **Tests:** `pnpm --filter @hamafx/ai test` and `pnpm --filter @hamafx/shared test`.
  Confirm test-time DB mocking still works via `container.register(DB, () => mockDb)`
  (update any test that used the string `'db'` token).
- **Lint (if guard added):** `pnpm lint` — introduce a deliberate `getDb` import
  inside `packages/ai/src` and confirm the rule flags it; then remove it.
- **Grep gates:**
  - `grep -rn "resolve<.*>('.*')\|register('.*'" packages/ai/src` → nothing
    (no stringly-typed tokens remain in `ai`).
  - `grep -rn "TOKENS\." packages apps --include=*.ts` → nothing (old constant
    gone).
- **Manual check:** boot the app; a chat turn resolves `db`/`llmClient` from the
  container without runtime "No service registered" errors
  (`container.ts:69-73`).
