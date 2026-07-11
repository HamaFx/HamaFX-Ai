# HamaFX-Ai — Debugging, Admin Control & Testing Upgrade Plan

> **Purpose:** Make the project fully debuggable and testable by an admin without creating new accounts every time. Upgrade the logging system so AI coding agents can identify bugs more easily.
>
> **Status:** Not started — this is a detailed implementation plan for another AI coding agent.
>
> **Prerequisites:** Read `AGENTS.md` first. Follow its conventions (pnpm, Turborepo, strict TS, Vitest, ESLint flat config, Apache-2.0 license headers).

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Problem Statement](#2-problem-statement)
3. [Implementation Plan](#3-implementation-plan)
   - Phase 1: Admin Debug API Routes
   - Phase 2: Admin Debug Dashboard Page
   - Phase 3: Onboarding Reset & Replay System
   - Phase 4: Logging System Upgrade
   - Phase 5: AI-Agent-Friendly Bug Detection Layer
   - Phase 6: Test Infrastructure for Admin Debugging
   - Phase 7: Documentation Updates
4. [File Inventory (All Files to Create/Modify)](#4-file-inventory)
5. [Testing Checklist](#5-testing-checklist)
6. [Security Considerations](#6-security-considerations)
7. [Migration & Deployment Notes](#7-migration--deployment-notes)

---

## 1. Current State Analysis

### 1.1 What Exists Today

#### Logging
- **`packages/shared/src/logger.ts`** — Pino logger with redaction paths for `authorization`, `cookie`, `password`, `hashedPassword`, `email`, `token`, `keys`, `aiApiKeys`. Level configurable via `LOG_LEVEL` env var. No structured error context, no trace correlation, no log categories/tags.
- **`apps/web/src/lib/logger.ts`** — Request-scoped child logger (`createRequestLogger`) that adds `requestId`, `userId`, `route`, `service` to every log line. Also `createScopedLoggerWithContext` for non-request contexts (cron, background).
- **`apps/worker/src/log.ts`** — Custom lightweight logger (not pino) with JSON/plain-text modes, redaction of sensitive keys, `.with()` child loggers. Aligned field shape with pino logger but separate implementation.
- **Problem:** Two separate logging implementations (pino for web, custom for worker). No correlation between log lines and diagnostic traces. No structured error envelope in logs. No log categories (auth, db, ai, cron, etc.). Many `console.error`/`console.warn` calls scattered in cron routes that bypass the structured logger entirely.

#### Diagnostic Tracing
- **`packages/ai/src/diagnostics/run-context.ts`** — `AsyncLocalStorage`-based per-chat-turn tracing. Records `DiagnosticStep[]` (name, status, durationMs, metadata) and `DiagnosticError[]` (message, name, stack). All redacted via `redactSecrets()`. Exported via `exportDiagnosticContext()`.
- **`packages/ai/src/diagnostics/redact.ts`** — Comprehensive redaction engine (regex patterns + object key matching). Redacts authorization headers, URLs with credentials, JSON key:value pairs, key=value patterns, Bearer tokens, x-api-key headers.
- **`packages/ai/src/tools/with-telemetry.ts`** — Wraps every tool's `execute` to record one row in `chat_tool_telemetry` (threadId, tool, ms, ok, errorCode) + diagnostic steps.
- **`packages/ai/src/tools/get-system-diagnostics.ts`** — Agent-facing tool that returns DB status, latency, table counts, budget, env check, narrative.
- **Problem:** Diagnostic context only lives in-memory during a chat turn. No persistence to DB or file. `DEBUG_TRACE_PATH` env var is documented but NOT implemented. No way for an admin to view past diagnostic traces without Sentry access.

#### Error Handling
- **`packages/shared/src/errors.ts`** — `AppError` class with stable error codes (`VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `BUDGET_EXCEEDED`, `INTERNAL`). `formatErrorResponse()` produces a consistent JSON envelope with `code`, `message`, `details`, `requestId`.
- **`apps/web/src/lib/api.ts`** — `withAuth()` wrapper for route handlers, `getUserFromRequest()` for fast-path userId extraction, `parseBody()` for zod-validated body parsing.
- **Problem:** No structured error logging — errors are caught and returned but not logged with context. Sentry captures exceptions but doesn't log the full diagnostic context unless manually attached.

#### Admin Controls
- **`apps/web/src/app/api/dev/login/route.ts`** — Dev-only login that creates a `dev@hamafx.ai` user. Guarded by `NODE_ENV === 'development'` AND `ENABLE_DEV_LOGIN === 'true'`. Creates user with hardcoded `test-user-id` and `devpass` password.
- **`apps/web/src/app/api/admin/test-alert-email/route.ts`** — Sends test email via Resend. Gated by `withAuth`.
- **`apps/web/src/app/api/admin/test-telegram/route.ts`** — Sends test Telegram message. Gated by `withAuth`.
- **`apps/web/src/app/api/health/route.ts`** — Health check (DB, env, cron, pgvector). Gated by `withAuth`.
- **`apps/web/src/app/api/health/db/route.ts`** — DB health check (connectivity + migration count). Gated by `withAuth`.
- **`apps/web/src/app/debug/route.ts`** — Dev-only debug route showing env var types, DB connection test, auth module loading test. Guarded by `NODE_ENV !== 'production'`.
- **`apps/web/src/app/(app)/settings/_components/system-status-card.tsx`** — UI card showing email/Telegram/push channel readiness, DB connection, stuck jobs, recent errors, market phase.
- **`apps/web/src/lib/cron.ts`** — `withCronAuth()` accepts both Bearer token (schedulers) and session cookie (admin UI). All 12 cron routes use this wrapper, so admins can hand-trigger any cron job from the UI.
- **Problem:** No admin dashboard page. No way to reset onboarding without DB access. No way to replay onboarding for an existing user. No way to view diagnostic traces, tool telemetry, or cron run history from the UI. No way to impersonate a user. No way to reset user settings. The `role` field exists in the `users` table (default `'user'`) but no admin role check exists anywhere — `role: 'admin'` is never used or checked.

#### Onboarding
- **`apps/web/src/app/onboarding/page.tsx`** — Server component that checks `onboardingCompleted` and redirects to `/chat` if already done, otherwise renders the wizard.
- **`apps/web/src/app/onboarding/actions.ts`** — `completeOnboardingAction()` server action that saves displayName, timezone, defaultSymbol, API keys (encrypted), watchlist symbols. Sets `onboardingCompleted: true`.
- **`apps/web/src/app/api/onboarding/save-progress/route.ts`** — Saves wizard step progress to `onboardingProgress` JSONB column.
- **`apps/web/src/app/(app)/layout.tsx`** — App layout checks `onboardingCompleted` on every navigation and redirects to `/onboarding` if false.
- **`apps/web/src/components/onboarding/wizard.tsx`** — 5-step wizard: name/timezone → API keys → trading style → symbols → review/submit. Saves progress to sessionStorage and server.
- **Problem:** Once `onboardingCompleted` is `true`, the user is permanently redirected away from `/onboarding`. To test onboarding again, an admin must manually update the DB (`UPDATE user_settings SET onboarding_completed = false WHERE user_id = '...'`). There is no API endpoint or UI button to reset onboarding.

#### Testing
- **204 test files** across all packages (Vitest unit + Playwright E2E).
- **`packages/test-utils/`** — Shared factories (`makeUser`, `makeThread`, `makeMessage`, `makeCandles`), mocks (`createTestDb` via PGlite, `createMockLlm`, `createMockFetch`, `installServerOnlyStub`).
- **`apps/web/tests/e2e/test-utils.ts`** — `ensureTestUser()` creates a test user with `onboardingCompleted: true` and dummy encrypted API key.
- **`apps/web/tests/e2e/global-setup.ts`** — Loads env, applies Drizzle migrations.
- **Problem:** No test for onboarding reset. No test for admin debug routes. No test for diagnostic trace persistence. No test for the upgraded logging system. E2E tests create a new user each run but can't test the "reset onboarding" flow because no such endpoint exists.

#### Observability Infrastructure
- **Sentry** — Server + Edge configs in `apps/web/src/sentry.server.config.ts` and `sentry.edge.config.ts`. Tags `service:web`. `tracesSampleRate: 0.1` in prod, `1.0` in dev. Used extensively in `apps/web/src/app/(app)/settings/actions.ts` (14 `captureException` calls).
- **Langfuse + OpenTelemetry** — `packages/ai/src/instrumentation.ts`. Optional, enabled when `LANGFUSE_*` env vars are set. Exports AI SDK spans to self-hosted Langfuse.
- **`cron_runs` table** — Tracks cron job lifecycle (started/done/error) with idempotency guard.
- **`audit_logs` table** — Records user actions (e.g., `password_reset`) with metadata.
- **`chat_tool_telemetry` table** — Per-tool-call rows with `threadId`, `tool`, `ms`, `ok`, `errorCode`.

---

## 2. Problem Statement

### 2.1 Admin Cannot Test Onboarding Without DB Access
The admin must manually run SQL to reset `onboarding_completed` to `false`. There is no API endpoint, no UI button, and no CLI script. Every time the admin wants to test the onboarding flow, they must either:
- Create a brand new account (wasteful, pollutes the DB)
- Manually run `UPDATE user_settings SET onboarding_completed = false, onboarding_progress = NULL WHERE user_id = '...'`

### 2.2 No Admin Debug Dashboard
There is no centralized admin page. The admin must visit individual settings pages, hit health endpoints manually, or read Sentry to understand system state. The `system-status-card.tsx` component exists but it's buried in settings and doesn't show diagnostic traces, tool telemetry, or cron run history.

### 2.3 Logging is Fragmented and Not AI-Agent-Friendly
- Two separate logger implementations (pino for web, custom for worker)
- ~30 `console.error`/`console.warn` calls in cron routes bypass the structured logger
- No log categories/tags for filtering (auth, db, ai, cron, onboarding, billing, etc.)
- No correlation between log lines and diagnostic trace IDs
- No structured error context in logs (error code, stack, cause chain)
- No `DEBUG_TRACE_PATH` implementation (documented but not built)
- Logs don't include enough context for an AI coding agent to identify the root cause of a bug without manual investigation

### 2.4 No Diagnostic Trace Persistence
Diagnostic traces live only in-memory during a chat turn. Once the turn ends, the trace is lost unless it was sent to Sentry (which requires Sentry access). An admin or AI agent cannot query past traces.

### 2.5 No Admin Role System
The `users.role` column exists (default `'user'`) but no code checks for `role === 'admin'`. The admin test routes (`/api/admin/*`) are gated by `withAuth` (any authenticated user can access them). There is no admin-specific authorization layer.

---

## 3. Implementation Plan

### Phase 1: Admin Debug API Routes

Create a set of admin-only API routes under `/api/admin/` that provide debugging and testing capabilities. All routes must be gated by a new `withAdminAuth()` wrapper that checks `role === 'admin'` (or a fallback for single-user deployments where the user IS the admin).

#### 1.1 Create `withAdminAuth()` wrapper

**File:** `apps/web/src/lib/admin-auth.ts` (NEW)

```typescript
// Wrapper that checks the authenticated user has admin privileges.
// In single-user deployments (no admin role set), the sole authenticated
// user is treated as admin. In multi-user deployments, requires role='admin'.
//
// Usage:
//   export const POST = withAdminAuth(async (req, { user }) => { ... });

import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { AppError, forbidden, unauthorized } from '@hamafx/shared';
import { createRequestLogger } from './logger';
import { REQUEST_ID_HEADER } from './request-id';

export interface AdminUser {
  userId: string;
  email: string;
  name: string | null;
}

export async function getAdminUser(): Promise<AdminUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const db = getDb();
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));

  if (!user) return null;

  // Admin if role is 'admin' OR if this is a single-user deployment
  // (no users with role='admin' exist, meaning the sole user is the operator)
  // For simplicity in self-hosted: if role is 'admin', allow.
  // If role is 'user', check if ANY admin exists. If none exist, allow (single-user mode).
  if (user.role === 'admin') {
    return { userId: user.id, email: user.email, name: user.name };
  }

  // Check if any admin exists
  const adminCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users)
    .where(eq(schema.users.role, 'admin'));
  
  if (Number(adminCount[0]?.count ?? 0) === 0) {
    // No admins exist — single-user mode, treat as admin
    return { userId: user.id, email: user.email, name: user.name };
  }

  return null;
}

export function withAdminAuth<T>(
  handler: (req: Request, ctx: { user: AdminUser }) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const log = createRequestLogger(req);
    const admin = await getAdminUser();
    if (!admin) {
      log.warn({ userId: admin?.userId }, 'admin route access denied');
      return Response.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 },
      );
    }
    log.info({ userId: admin.userId }, 'admin route accessed');
    return handler(req, { user: admin });
  };
}
```

**Key decisions:**
- Falls back to "single-user mode" when no user has `role='admin'` — this preserves backward compatibility for self-hosted single-user deployments where the operator is the only user.
- Logs every admin route access for audit trail.
- Returns `403 FORBIDDEN` (not `401 UNAUTHORIZED`) when the user is authenticated but not admin.

#### 1.2 Onboarding Reset API

**File:** `apps/web/src/app/api/admin/onboarding/reset/route.ts` (NEW)

```
POST /api/admin/onboarding/reset
Body: { userId?: string }  // defaults to the admin's own userId
Response: 200 { ok: true, userId, reset: true }
```

Resets `onboarding_completed` to `false` and clears `onboarding_progress` to `NULL` for the specified user (or the admin's own account if no userId provided). Also clears the user's watchlist symbols and resets `defaultSymbol` and `timezone` to defaults so the wizard starts fresh.

This lets the admin re-run the onboarding wizard immediately without touching the DB.

#### 1.3 Onboarding Status API

**File:** `apps/web/src/app/api/admin/onboarding/status/route.ts` (NEW)

```
GET /api/admin/onboarding/status?userId=<optional>
Response: 200 { userId, onboardingCompleted, onboardingProgress, defaultSymbol, timezone, watchlist: string[] }
```

Returns the current onboarding state for a user. Lets the admin verify the state before/after reset without querying the DB.

#### 1.4 Diagnostic Trace Viewer API

**File:** `apps/web/src/app/api/admin/diagnostics/traces/route.ts` (NEW)

```
GET /api/admin/diagnostics/traces?threadId=<id>&limit=20
Response: 200 { traces: DiagnosticTraceSummary[] }
```

Returns recent diagnostic traces for a thread. Requires implementing trace persistence (see Phase 4.5).

**File:** `apps/web/src/app/api/admin/diagnostics/trace/[id]/route.ts` (NEW)

```
GET /api/admin/diagnostics/trace/[id]
Response: 200 { trace: RunDiagnosticContext }
```

Returns a single diagnostic trace by ID with all steps, errors, and metadata.

#### 1.5 Tool Telemetry Viewer API

**File:** `apps/web/src/app/api/admin/diagnostics/tool-telemetry/route.ts` (NEW)

```
GET /api/admin/diagnostics/tool-telemetry?threadId=<id>&limit=50&ok=<true|false>
Response: 200 { entries: ToolTelemetryRow[] }
```

Returns recent tool telemetry rows, optionally filtered by threadId and success/failure. This data already exists in the `chat_tool_telemetry` table — this endpoint just exposes it to the admin UI.

#### 1.6 Cron Run History API

**File:** `apps/web/src/app/api/admin/cron-history/route.ts` (NEW)

```
GET /api/admin/cron-history?days=7
Response: 200 { runs: CronRunRow[] }
```

Returns cron run history from the `cron_runs` table for the last N days. Shows job name, run date, status (started/done/error), note, started_at, finished_at.

#### 1.7 User Impersonation API (Dev Only)

**File:** `apps/web/src/app/api/admin/impersonate/route.ts` (NEW)

```
POST /api/admin/impersonate
Body: { userId: string }
Response: 200 { ok: true, redirect: '/chat' }
```

Dev-only route (guarded by `NODE_ENV !== 'production'`). Signs in as the specified user without a password. Lets the admin test the app from a specific user's perspective. Uses NextAuth's `signIn` with a custom credentials flow that bypasses password check when called by an admin.

#### 1.8 User List API (Admin)

**File:** `apps/web/src/app/api/admin/users/route.ts` (NEW)

```
GET /api/admin/users?limit=50&offset=0
Response: 200 { users: UserSummary[], total: number }
```

Returns a paginated list of users with their onboarding status, role, creation date, and last session. Lets the admin see all users in the system.

#### 1.9 Feature Flag Toggle API

**File:** `apps/web/src/app/api/admin/features/route.ts` (NEW)

```
GET /api/admin/features
Response: 200 { features: { [key: string]: boolean } }

POST /api/admin/features
Body: { [key: string]: boolean }
Response: 200 { ok: true }
```

Allows the admin to toggle feature flags at runtime (stored in a new `feature_flags` table or in Redis). Useful for testing features in isolation. Feature flags can be read by the app via a `getFeatureFlag(key)` helper.

#### 1.10 System Flush API (Dev Only)

**File:** `apps/web/src/app/api/admin/flush/route.ts` (NEW)

```
POST /api/admin/flush
Body: { target: 'cache' | 'sessions' | 'cron_locks' | 'all' }
Response: 200 { ok: true, flushed: string[] }
```

Dev-only route that flushes in-memory caches, clears stale session tokens, or removes stuck cron locks. Lets the admin reset state without restarting the server.

---

### Phase 2: Admin Debug Dashboard Page

Create a dedicated admin dashboard page that surfaces all the debug capabilities in one place.

#### 2.1 Admin Dashboard Page

**File:** `apps/web/src/app/(app)/admin/page.tsx` (NEW)

A server component that:
1. Checks admin auth (redirects to `/chat` if not admin)
2. Fetches system health (DB, env, cron, pgvector) by calling the health check logic directly
3. Fetches recent cron runs, tool telemetry stats, and user count
4. Renders the admin dashboard with tabs/sections

Sections:
- **System Health** — DB status, latency, env check, pgvector, cron stuck jobs (reuse `system-status-card.tsx` logic)
- **Onboarding Control** — Button to reset own onboarding, button to reset another user's onboarding (with user picker), current onboarding status display
- **Cron Jobs** — Table of recent cron runs with status, duration, and "Run Now" buttons (triggers `/api/cron/*` via session cookie auth)
- **Tool Telemetry** — Table of recent tool calls with success/failure, duration, error codes. Filterable by tool name and ok/fail.
- **Diagnostic Traces** — List of recent traces with trace ID, user, thread, duration, error count. Click to expand and see full step-by-step trace.
- **User Management** — Table of users with role, onboarding status, created date. "Impersonate" button (dev only).
- **Feature Flags** — Toggle switches for feature flags.
- **Logs Viewer** — Real-time log stream (dev only, connects to a log streaming endpoint)

#### 2.2 Admin Dashboard Sub-Components

**File:** `apps/web/src/app/(app)/admin/_components/admin-health-card.tsx` (NEW)
**File:** `apps/web/src/app/(app)/admin/_components/admin-onboarding-control.tsx` (NEW)
**File:** `apps/web/src/app/(app)/admin/_components/admin-cron-table.tsx` (NEW)
**File:** `apps/web/src/app/(app)/admin/_components/admin-tool-telemetry-table.tsx` (NEW)
**File:** `apps/web/src/app/(app)/admin/_components/admin-diagnostic-traces.tsx` (NEW)
**File:** `apps/web/src/app/(app)/admin/_components/admin-user-table.tsx` (NEW)
**File:** `apps/web/src/app/(app)/admin/_components/admin-feature-flags.tsx` (NEW)
**File:** `apps/web/src/app/(app)/admin/_components/admin-log-viewer.tsx` (NEW)

Each component is a client component (`'use client'`) that fetches from the corresponding admin API route and renders the data in a table/card with filtering and actions.

#### 2.3 Admin Dashboard Layout & Navigation

**File:** `apps/web/src/app/(app)/admin/layout.tsx` (NEW)

Layout wrapper that:
1. Verifies admin access server-side
2. Renders a sub-navigation bar with tabs for each section
3. Only renders if the user has admin privileges

**File:** `apps/web/src/components/layout/nav-drawer.tsx` (MODIFY)

Add an "Admin" link in the navigation drawer that only appears for admin users. The link should be visible when `role === 'admin'` or in single-user mode.

#### 2.4 Admin Access Check Helper

**File:** `apps/web/src/lib/admin-check.ts` (NEW)

```typescript
import { cache } from 'react';
import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq, sql } from 'drizzle-orm';

export const checkIsAdmin = cache(async (): Promise<boolean> => {
  const session = await auth();
  if (!session?.user?.id) return false;

  const db = getDb();
  const [user] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));

  if (user?.role === 'admin') return true;

  // Single-user mode: no admins exist
  const [adminCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users)
    .where(eq(schema.users.role, 'admin'));

  return Number(adminCount?.count ?? 0) === 0;
});
```

---

### Phase 3: Onboarding Reset & Replay System

#### 3.1 Onboarding Reset Button in Settings

**File:** `apps/web/src/app/(app)/settings/_components/onboarding-reset-card.tsx` (NEW)

A card component in the settings page that shows:
- Current onboarding status (completed/progress)
- "Reset Onboarding" button that calls `POST /api/admin/onboarding/reset`
- Confirmation dialog ("This will reset your onboarding. You'll need to go through the wizard again. Continue?")
- Success toast + redirect to `/onboarding`

**File:** `apps/web/src/app/(app)/settings/page.tsx` (MODIFY)

Add the `OnboardingResetCard` to the settings page, visible only to admin users.

#### 3.2 Onboarding Replay with Preserved Data

The reset endpoint should support two modes:
- **Full reset:** Clears everything (onboarding_completed, onboarding_progress, watchlist, defaultSymbol, timezone, API keys)
- **Soft reset:** Only sets `onboarding_completed = false` and clears `onboarding_progress`, preserving API keys and watchlist. This lets the admin re-run the wizard to test the flow without losing their configured keys.

The API body should accept `{ userId?: string, mode?: 'full' | 'soft' }` (default: `'soft'`).

#### 3.3 Onboarding Step Inspector

**File:** `apps/web/src/app/api/admin/onboarding/inspect/route.ts` (NEW)

```
GET /api/admin/onboarding/inspect?userId=<optional>
Response: 200 {
  userId,
  onboardingCompleted: boolean,
  onboardingProgress: Record<string, unknown> | null,
  userSettings: { defaultSymbol, timezone, language, ... },
  watchlist: { symbol, displayOrder }[],
  hasApiKeys: boolean,  // boolean only, never exposes actual keys
  apiProviders: string[],  // provider IDs that have keys configured
}
```

Returns a complete snapshot of the onboarding state for debugging. Never exposes actual API key values — only which providers have keys configured.

---

### Phase 4: Logging System Upgrade

This is the most critical phase for making the project debuggable by AI coding agents.

#### 4.1 Unified Logger Interface

**File:** `packages/shared/src/logger.ts` (MODIFY)

Upgrade the pino logger with:

1. **Log categories** — Add a `category` field to every log line. Categories: `auth`, `db`, `ai`, `cron`, `onboarding`, `billing`, `api`, `worker`, `cache`, `market_data`, `telegram`, `email`, `push`, `admin`. Use a `createCategorizedLogger(category)` factory.

2. **Trace correlation** — Add `traceId` field to log lines when inside a diagnostic context. The logger should read from `AsyncLocalStorage` (the diagnostic context) to automatically inject `traceId` into every log line without manual passing.

3. **Structured error context** — Add an `errorContext` helper that logs:
   ```typescript
   logger.errorContext(err, 'operation_name', {
     userId, threadId, tool, input, // additional context
   });
   ```
   This produces a log line with:
   ```json
   {
     "level": "error",
     "msg": "operation_name failed",
     "category": "ai",
     "traceId": "abc-123",
     "error": {
       "name": "Error",
       "message": "...",
       "code": "VALIDATION",
       "stack": "...",  // truncated to 2000 chars
       "cause": { ... } // if err.cause exists
     },
     "userId": "...",
     "threadId": "...",
     "tool": "...",
     "requestId": "..."
   }
   ```

4. **AI-agent-friendly error format** — Every error log should include:
   - `error.name` — Error class name
   - `error.message` — Error message (redacted)
   - `error.code` — AppError code if applicable
   - `error.stack` — Stack trace (redacted, truncated)
   - `error.cause` — Cause chain if `err.cause` exists
   - `error.file` — Source file from stack (best-effort parse)
   - `error.line` — Line number from stack (best-effort parse)
   - `context` — All additional structured context
   - `traceId` — Diagnostic trace ID if in a diagnostic scope
   - `requestId` — Request ID if available

5. **Log level hierarchy** — Add `trace` level (below `debug`) for very verbose diagnostic tracing:
   ```
   trace < debug < info < warn < error < fatal
   ```

6. **Redaction expansion** — Add redaction paths for:
   - `*.password`, `*.hashedPassword`, `*.token`, `*.secret`
   - `*.apiKey`, `*.apiKeys`, `*.aiApiKeys`, `*.privateKey`
   - `*.authorization`, `*.cookie`, `*.sessionToken`
   - `*.refreshToken`, `*.accessToken`, `*.clientSecret`
   - `*.webhook`, `*.encryptionKey`
   - Nested paths: `error.context.apiKey`, `error.context.token`

**Implementation:**

```typescript
import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

// AsyncLocalStorage for trace correlation (shared with diagnostics)
export const traceIdStorage = new AsyncLocalStorage<string>();

const isDevelopment = process.env.NODE_ENV === 'development';

const LOG_CATEGORIES = [
  'auth', 'db', 'ai', 'cron', 'onboarding', 'billing',
  'api', 'worker', 'cache', 'market_data', 'telegram',
  'email', 'push', 'admin', 'system',
] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'trace' : 'info'),
  ...(isDevelopment ? { base: null } : {}),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'hashedPassword',
      'email',
      'token',
      'keys',
      'aiApiKeys',
      // Expanded redaction
      '*.password',
      '*.hashedPassword',
      '*.token',
      '*.secret',
      '*.apiKey',
      '*.apiKeys',
      '*.aiApiKeys',
      '*.privateKey',
      '*.authorization',
      '*.cookie',
      '*.sessionToken',
      '*.refreshToken',
      '*.accessToken',
      '*.clientSecret',
      '*.webhook',
      '*.encryptionKey',
      'error.context.apiKey',
      'error.context.token',
      'error.context.secret',
      'error.context.authorization',
    ],
    censor: '[REDACTED]',
  },
  // Custom timestamp for consistent parsing
  timestamp: () => `,"ts":"${new Date().toISOString()}"`,
});

// Helper to get current traceId from AsyncLocalStorage
function getCurrentTraceId(): string | undefined {
  return traceIdStorage.getStore();
}

// Parse stack trace for file/line info (best-effort)
function parseStack(stack: string | undefined): { file?: string; line?: number } {
  if (!stack) return {};
  const match = stack.split('\n')[1]?.match(/\((.+):(\d+):\d+\)/);
  if (match) {
    return { file: match[1], line: Number(match[2]) };
  }
  return {};
}

// Structured error context logger
export function logErrorContext(
  err: unknown,
  operation: string,
  context: Record<string, unknown> = {},
  category: LogCategory = 'system',
) {
  const errorObj = err as { message?: string; name?: string; code?: string; stack?: string; cause?: unknown };
  const { file, line } = parseStack(errorObj?.stack);
  
  const traceId = getCurrentTraceId();
  
  logger.error({
    category,
    operation,
    ...(traceId ? { traceId } : {}),
    error: {
      name: errorObj?.name ?? 'Error',
      message: errorObj?.message ?? String(err),
      ...(errorObj?.code ? { code: errorObj.code } : {}),
      stack: errorObj?.stack?.slice(0, 2000),
      ...(file ? { file } : {}),
      ...(line ? { line } : {}),
      ...(errorObj?.cause ? { cause: String(errorObj.cause).slice(0, 500) } : {}),
    },
    ...context,
  }, `${operation} failed`);
}

// Create a categorized child logger
export function createCategorizedLogger(category: LogCategory, additionalContext: Record<string, unknown> = {}) {
  const child = logger.child({ category, ...additionalContext });
  
  // Wrap to auto-inject traceId
  const wrapped = {
    trace: (msg: string, meta?: Record<string, unknown>) => {
      const traceId = getCurrentTraceId();
      child.trace({ ...(traceId ? { traceId } : {}), ...(meta ?? {}) }, msg);
    },
    debug: (msg: string, meta?: Record<string, unknown>) => {
      const traceId = getCurrentTraceId();
      child.debug({ ...(traceId ? { traceId } : {}), ...(meta ?? {}) }, msg);
    },
    info: (msg: string, meta?: Record<string, unknown>) => {
      const traceId = getCurrentTraceId();
      child.info({ ...(traceId ? { traceId } : {}), ...(meta ?? {}) }, msg);
    },
    warn: (msg: string, meta?: Record<string, unknown>) => {
      const traceId = getCurrentTraceId();
      child.warn({ ...(traceId ? { traceId } : {}), ...(meta ?? {}) }, msg);
    },
    error: (msg: string, meta?: Record<string, unknown>) => {
      const traceId = getCurrentTraceId();
      child.error({ ...(traceId ? { traceId } : {}), ...(meta ?? {}) }, msg);
    },
    errorContext: (err: unknown, operation: string, ctx: Record<string, unknown> = {}) => {
      logErrorContext(err, operation, ctx, category);
    },
  };
  
  return wrapped;
}

// Existing exports preserved
export function createScopedLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
```

#### 4.2 Migrate Worker Logger to Pino

**File:** `apps/worker/src/log.ts` (MODIFY)

Replace the custom logger with the shared pino logger. The worker should use `createCategorizedLogger('worker')` or more specific categories like `'worker:signalr'`, `'worker:job:embedding-backfill'`.

The migration must:
1. Preserve the `.with()` child logger API (map to pino `.child()`)
2. Preserve the `forceJson` option (always JSON in production/journald)
3. Preserve the redaction behavior (now handled by the shared pino config)
4. Update all import sites in the worker to use the new logger

**Files to update (worker imports):**
- `apps/worker/src/index.ts`
- `apps/worker/src/scheduler.ts`
- `apps/worker/src/signalr-consumer.ts`
- `apps/worker/src/jobs/*.ts` (all job files)
- `apps/worker/test/log.test.ts` (update tests for new logger)

#### 4.3 Replace All `console.error`/`console.warn` with Structured Logger

**Files to modify (replace console.* with categorized logger):**

Every file in `apps/web/src/app/api/cron/` that uses `console.error` or `console.warn`:
- `apps/web/src/app/api/cron/briefings/route.ts` — 2 `console.error` calls
- `apps/web/src/app/api/cron/calendar/route.ts` — 1 `console.warn` call
- `apps/web/src/app/api/cron/cleanup-uploads/route.ts` — 2 `console.warn` calls
- `apps/web/src/app/api/cron/cot/route.ts` — 1 `console.error` call
- `apps/web/src/app/api/cron/fred-actuals/route.ts` — 1 `console.error` call
- `apps/web/src/app/api/cron/news/route.ts` — 2 `console.error`/`console.warn` calls
- `apps/web/src/app/api/cron/snapshots/route.ts` — 1 `console.error` call
- `apps/web/src/app/api/cron/warm-cache/route.ts` — 2 `console.warn` calls
- `apps/web/src/app/api/cron/weekly-review/route.ts` — 1 `console.error` call

Also:
- `apps/web/src/app/(auth)/actions.ts` — 1 `console.error` call (line 177)
- `apps/web/src/app/api/dev/login/route.ts` — 3 `console.error` calls
- `apps/web/src/app/api/telegram/webhook/route.ts` — 1 `console.error` call
- `apps/web/src/app/onboarding/actions.ts` — 2 `console.error` calls (lines 145, 152)

Each `console.error(...)` should be replaced with:
```typescript
const log = createCategorizedLogger('cron', { job: 'alerts' }); // or appropriate category
log.errorContext(err, 'alert_evaluation', { symbol, alertId });
// or for simple messages:
log.error('alert evaluation error', { err: String(alertErr), alertId });
```

#### 4.4 Integrate Trace Correlation with Diagnostic Context

**File:** `packages/ai/src/diagnostics/run-context.ts` (MODIFY)

Update `withDiagnostics()` to also set the `traceIdStorage` from the shared logger so that all log lines inside a diagnostic scope automatically include the `traceId`:

```typescript
import { traceIdStorage } from '@hamafx/shared/logger';

export function withDiagnostics<T>(
  userId: string,
  threadId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx: RunDiagnosticContext = {
    traceId: randomUUID(),
    userId,
    threadId,
    startedAt: Date.now(),
    steps: [],
    errors: [],
  };
  
  // Set traceId in AsyncLocalStorage so the logger auto-injects it
  return traceIdStorage.run(ctx.traceId, () =>
    diagnosticStore.run(ctx, fn)
  );
}
```

This creates a nested AsyncLocalStorage scope: the outer one provides `traceId` to the logger, the inner one provides the full diagnostic context to `recordStep`/`recordError`/etc.

#### 4.5 Implement DEBUG_TRACE_PATH (Diagnostic Trace Persistence)

**File:** `packages/ai/src/diagnostics/trace-persistence.ts` (NEW)

Implement the documented-but-unbuilt `DEBUG_TRACE_PATH` env var. When set, every completed diagnostic context is written to a JSON file at the specified path:

```
DEBUG_TRACE_PATH=/var/log/hamafx/traces
```

Each trace is written as a separate file: `{traceId}.json` containing the full `exportDiagnosticContext()` output.

Additionally, implement DB-based trace persistence:

**File:** `packages/db/src/schema/diagnostic-traces.ts` (NEW)

```typescript
import { pgTable, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const diagnosticTraces = pgTable(
  'diagnostic_traces',
  {
    id: text('id').primaryKey(),  // traceId (UUID)
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    threadId: text('thread_id'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    durationMs: integer('duration_ms'),
    stepCount: integer('step_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    status: text('status', { enum: ['completed', 'failed'] }).notNull(),
    trace: jsonb('trace').notNull(),  // full exportDiagnosticContext() output
  },
  (t) => [
    index('diag_traces_user_id_idx').on(t.userId),
    index('diag_traces_thread_id_idx').on(t.threadId),
    index('diag_traces_started_at_idx').on(t.startedAt),
  ],
);
```

**File:** `packages/db/drizzle/XXXX_diagnostic_traces.sql` (NEW) — Migration file

**File:** `packages/ai/src/diagnostics/run-context.ts` (MODIFY)

After `withDiagnostics()` completes (both success and failure), persist the trace to the DB:

```typescript
// After fn() resolves or rejects:
const exportedCtx = exportDiagnosticContext();
if (exportedCtx) {
  void persistTrace(exportedCtx);  // fire-and-forget, never blocks
}
```

The `persistTrace` function:
1. Inserts a row into `diagnostic_traces` with the full trace
2. If `DEBUG_TRACE_PATH` is set, also writes to a file
3. Never throws — persistence failures are logged but don't affect the chat turn

#### 4.6 Log Streaming Endpoint (Dev Only)

**File:** `apps/web/src/app/api/admin/logs/stream/route.ts` (NEW)

```
GET /api/admin/logs/stream  (Server-Sent Events)
```

Dev-only SSE endpoint that streams log lines in real-time. Uses pino's transport mechanism or a custom log capture buffer. The admin dashboard's log viewer component connects to this endpoint.

Implementation approach:
1. Create a ring buffer (last 1000 log lines) in memory
2. Pino custom transport or `pino.destination()` with a writable stream that pushes to the buffer
3. SSE endpoint reads from the buffer and pushes to connected clients
4. Each log line is sent as an SSE event with the full JSON structure

---

### Phase 5: AI-Agent-Friendly Bug Detection Layer

This phase adds structured metadata to logs and errors that makes it trivial for an AI coding agent to identify the root cause of a bug.

#### 5.1 Error Context Enrichment

**File:** `packages/shared/src/errors.ts` (MODIFY)

Add an `ErrorContext` interface and enrich `AppError`:

```typescript
export interface ErrorContext {
  /** The operation that failed, e.g. 'fetch_candles', 'login', 'onboarding_complete' */
  operation: string;
  /** The module/feature where the error occurred */
  module: string;
  /** The user ID involved (if any) */
  userId?: string;
  /** The thread ID involved (if any) */
  threadId?: string;
  /** The tool that failed (if any) */
  tool?: string;
  /** The input that caused the error (redacted) */
  input?: Record<string, unknown>;
  /** Whether this error is retryable */
  retryable?: boolean;
  /** Suggested fix for AI agents */
  suggestedFix?: string;
  /** Related file path */
  file?: string;
  /** Related documentation link */
  docs?: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly context?: ErrorContext;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    details?: unknown,
    context?: ErrorContext,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.context = context;
  }
}
```

#### 5.2 Bug Report Generator

**File:** `packages/shared/src/bug-report.ts` (NEW)

A utility that generates a structured bug report from an error + diagnostic context, designed to be consumed by AI coding agents:

```typescript
export interface BugReport {
  // Unique identifier for this bug report
  reportId: string;
  // ISO timestamp
  timestamp: string;
  // The error that triggered the report
  error: {
    name: string;
    message: string;
    code: string;
    stack: string;
    file?: string;
    line?: number;
    cause?: string;
  };
  // The operation that failed
  operation: string;
  // The module/feature
  module: string;
  // Whether the error is retryable
  retryable: boolean;
  // Diagnostic trace (if available)
  trace?: {
    traceId: string;
    userId: string;
    threadId: string;
    durationMs: number;
    steps: DiagnosticStep[];
    errors: DiagnosticError[];
  };
  // Environment context
  environment: {
    nodeEnv: string;
    deployedSha: string;
    runtime: string;
  };
  // Request context (if available)
  request?: {
    requestId: string;
    route: string;
    method: string;
  };
  // User context (if available)
  user?: {
    userId: string;
    // Never include email or PII
  };
  // Suggested fix (if available)
  suggestedFix?: string;
  // Related files (parsed from stack trace)
  relatedFiles: string[];
  // Log lines surrounding the error (if available)
  surroundingLogs?: string[];
}

export function generateBugReport(
  err: unknown,
  options: {
    operation: string;
    module: string;
    trace?: Record<string, unknown> | null;
    requestId?: string;
    route?: string;
    method?: string;
    userId?: string;
  },
): BugReport {
  // ... implementation
}
```

This bug report can be:
1. Logged as a structured JSON object (AI agents can grep for `bugReport` in logs)
2. Sent to Sentry as additional context
3. Returned from a diagnostic API endpoint
4. Written to a file for offline analysis

#### 5.3 AI-Agent Log Format

**File:** `packages/shared/src/logger.ts` (MODIFY — continued from 4.1)

Add a `logForAgent()` function that produces a log line specifically formatted for AI agent consumption:

```typescript
export function logForAgent(
  level: 'error' | 'warn' | 'info',
  operation: string,
  data: {
    error?: unknown;
    module: string;
    category: LogCategory;
    context?: Record<string, unknown>;
    suggestedFix?: string;
    relatedFiles?: string[];
  },
) {
  const traceId = getCurrentTraceId();
  const report = data.error
    ? generateBugReport(data.error, {
        operation,
        module: data.module,
        trace: traceId ? { traceId } : null,
      })
    : null;

  logger[level]({
    agentLog: true,  // Flag so agents can filter: grep '"agentLog":true'
    operation,
    module: data.module,
    category: data.category,
    ...(traceId ? { traceId } : {}),
    ...(report ? { bugReport: report } : {}),
    ...(data.context ?? {}),
    ...(data.suggestedFix ? { suggestedFix: data.suggestedFix } : {}),
    ...(data.relatedFiles ? { relatedFiles: data.relatedFiles } : {}),
  }, operation);
}
```

#### 5.4 Common Error Patterns Catalog

**File:** `packages/shared/src/error-patterns.ts` (NEW)

A catalog of known error patterns with suggested fixes that AI agents can reference:

```typescript
export interface ErrorPattern {
  /** Pattern to match against error message/code */
  pattern: RegExp | string;
  /** Error code if known */
  code?: ErrorCode;
  /** Human-readable description */
  description: string;
  /** Suggested fix for AI agents */
  suggestedFix: string;
  /** Related files to check */
  relatedFiles: string[];
  /** Related documentation */
  docs?: string;
  /** Whether the error is retryable */
  retryable: boolean;
}

export const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /User settings not found.*onboarding/i,
    description: 'User has not completed onboarding',
    suggestedFix: 'Check if user_settings.onboarding_completed is true. If not, redirect to /onboarding. Use the admin onboarding reset endpoint to test.',
    relatedFiles: [
      'apps/web/src/app/(app)/layout.tsx',
      'apps/web/src/app/onboarding/actions.ts',
      'packages/ai/src/agent.ts',
    ],
    retryable: false,
  },
  {
    pattern: /Daily AI budget exceeded/i,
    code: 'BUDGET_EXCEEDED',
    description: 'Daily AI spend cap reached',
    suggestedFix: 'Increase MAX_DAILY_USD env var or reset the budget counter. Check cost tracking in packages/ai/src/cost.ts.',
    relatedFiles: ['packages/ai/src/cost.ts'],
    retryable: false,
  },
  {
    pattern: /pgvector extension not installed/i,
    description: 'pgvector extension missing from database',
    suggestedFix: 'Run: CREATE EXTENSION IF NOT EXISTS vector; on the database. Check docker/postgres/init-langfuse-db.sh.',
    relatedFiles: ['apps/web/src/app/api/health/route.ts', 'docker/postgres/init-langfuse-db.sh'],
    retryable: false,
  },
  {
    pattern: /ENCRYPTION_SECRET/i,
    description: 'Encryption secret not configured',
    suggestedFix: 'Set ENCRYPTION_SECRET env var to a 32-byte hex string. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    relatedFiles: ['packages/shared/src/encryption.ts', 'packages/shared/src/env.ts'],
    retryable: false,
  },
  {
    pattern: /missing.*migrations/i,
    description: 'Database migrations are behind',
    suggestedFix: 'Run: pnpm --filter @hamafx/db exec drizzle-kit migrate. Check migration count in /api/health/db.',
    relatedFiles: ['packages/db/drizzle.config.ts', 'apps/web/src/app/api/health/db/route.ts'],
    retryable: false,
  },
  {
    pattern: /CSRF.*missing.*invalid/i,
    description: 'CSRF token validation failed',
    suggestedFix: 'Ensure the hfx_csrf cookie is set and the x-csrf-token header matches it. Check middleware.ts CSRF logic and withCsrf() helper.',
    relatedFiles: ['apps/web/src/middleware.ts', 'apps/web/src/lib/csrf.ts'],
    retryable: false,
  },
  {
    pattern: /provider.*unavailable|PROVIDER_UNAVAILABLE/i,
    code: 'PROVIDER_UNAVAILABLE',
    description: 'Market data provider is unavailable',
    suggestedFix: 'Check if the provider API key is valid. Use /api/settings/test-provider to test. Check circuit breaker state in packages/data/src/circuit-breaker.ts.',
    relatedFiles: ['packages/data/src/circuit-breaker.ts', 'packages/data/src/failover.ts'],
    retryable: true,
  },
  // Add more patterns as needed
];

export function findErrorPattern(err: unknown): ErrorPattern | null {
  const message = err instanceof Error ? err.message : String(err);
  const code = err instanceof AppError ? err.code : undefined;
  
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.code && pattern.code === code) return pattern;
    if (typeof pattern.pattern === 'string') {
      if (message.includes(pattern.pattern)) return pattern;
    } else {
      if (pattern.pattern.test(message)) return pattern;
    }
  }
  return null;
}
```

#### 5.5 Auto-Enrich Errors with Pattern Matching

**File:** `packages/shared/src/logger.ts` (MODIFY — continued)

In `logErrorContext()`, automatically look up the error pattern and inject `suggestedFix`, `relatedFiles`, `retryable` into the log line:

```typescript
import { findErrorPattern } from './error-patterns';

export function logErrorContext(err: unknown, operation: string, context = {}, category = 'system') {
  const pattern = findErrorPattern(err);
  // ... existing code ...
  logger.error({
    category,
    operation,
    traceId,
    error: { ... },
    ...context,
    ...(pattern ? {
      suggestedFix: pattern.suggestedFix,
      relatedFiles: pattern.relatedFiles,
      retryable: pattern.retryable,
      errorPattern: pattern.description,
    } : {}),
  }, `${operation} failed`);
}
```

---

### Phase 6: Test Infrastructure for Admin Debugging

#### 6.1 Admin API Route Tests

**File:** `apps/web/test/admin-onboarding-reset.test.ts` (NEW)

Test the onboarding reset endpoint:
- Resets own onboarding successfully
- Resets another user's onboarding (admin only)
- Non-admin user gets 403
- Unauthenticated user gets 401
- Full reset clears watchlist and settings
- Soft reset preserves API keys
- Returns correct onboarding status after reset

**File:** `apps/web/test/admin-onboarding-status.test.ts` (NEW)

Test the onboarding status endpoint:
- Returns correct status for completed user
- Returns correct status for incomplete user
- Returns progress data for in-progress user
- Non-admin gets 403

**File:** `apps/web/test/admin-diagnostics.test.ts` (NEW)

Test the diagnostic trace viewer:
- Returns traces for a thread
- Returns individual trace by ID
- Returns tool telemetry entries
- Filters by ok/fail correctly

**File:** `apps/web/test/admin-cron-history.test.ts` (NEW)

Test the cron history endpoint:
- Returns cron runs for last 7 days
- Returns empty array when no runs exist
- Filters by job name

**File:** `apps/web/test/admin-users.test.ts` (NEW)

Test the user list endpoint:
- Returns paginated user list
- Includes onboarding status
- Non-admin gets 403

#### 6.2 Logging System Tests

**File:** `packages/shared/test/logger-upgraded.test.ts` (NEW)

Test the upgraded logging system:
- `createCategorizedLogger()` adds `category` to every log line
- `logErrorContext()` includes structured error info (name, message, code, stack, file, line)
- `logErrorContext()` auto-injects `traceId` from AsyncLocalStorage
- `logErrorContext()` auto-enriches with error pattern data
- Redaction paths cover all sensitive fields
- `logForAgent()` produces `agentLog: true` flag
- Trace correlation works across async boundaries

**File:** `packages/shared/test/error-patterns.test.ts` (NEW)

Test the error pattern catalog:
- `findErrorPattern()` matches known patterns
- Returns `null` for unknown errors
- Pattern matching works with AppError codes
- Pattern matching works with error messages
- Suggested fixes are non-empty strings

**File:** `packages/shared/test/bug-report.test.ts` (NEW)

Test the bug report generator:
- Generates a complete bug report from an error
- Includes environment context
- Includes trace context when provided
- Never includes PII (email, password, token values)
- Parses stack trace for file/line info
- Generates unique report IDs

#### 6.3 Diagnostic Trace Persistence Tests

**File:** `packages/ai/test/trace-persistence.test.ts` (NEW)

Test that diagnostic traces are persisted:
- Trace is saved to DB after `withDiagnostics()` completes
- Trace includes all steps and errors
- Trace status is 'completed' on success
- Trace status is 'failed' on error
- `DEBUG_TRACE_PATH` writes to file when set
- Persistence failure doesn't block the chat turn

#### 6.4 E2E Tests for Admin Dashboard

**File:** `apps/web/tests/e2e/admin.spec.ts` (NEW)

E2E tests for the admin dashboard:
- Admin dashboard renders for admin user
- Non-admin user is redirected away from /admin
- Onboarding reset button works (resets and redirects to /onboarding)
- Cron table shows recent runs
- Tool telemetry table shows entries
- Diagnostic traces list is visible
- User table shows users (dev only)

**File:** `apps/web/tests/e2e/onboarding-replay.spec.ts` (NEW)

E2E test for the onboarding replay flow:
1. Login as test user (onboarding already completed)
2. Navigate to settings
3. Click "Reset Onboarding" button
4. Confirm in dialog
5. Verify redirect to /onboarding
6. Walk through the wizard again
7. Verify onboarding completes successfully
8. Verify settings are preserved (soft reset) or cleared (full reset)

#### 6.5 Test Utils Updates

**File:** `packages/test-utils/src/factories/users.ts` (MODIFY)

Add `makeAdminUser()` factory:

```typescript
export function makeAdminUser(overrides?: Partial<MockUser>): MockUser {
  return makeUser({ ...overrides, role: 'admin' });
}
```

**File:** `apps/web/tests/e2e/test-utils.ts` (MODIFY)

Add `ensureAdminUser()` function that creates a user with `role: 'admin'`:

```typescript
export async function ensureAdminUser(email = 'admin@example.com', password = 'admin123') {
  // Same as ensureTestUser but sets role: 'admin'
}
```

---

### Phase 7: Documentation Updates

#### 7.1 Update Debugging & Tracing Docs

**File:** `docs/15-debugging-and-tracing.md` (MODIFY)

Add sections for:
- Admin Debug Dashboard (how to access, what it shows)
- Onboarding Reset API (endpoints, usage)
- Diagnostic Trace Persistence (DB table, file output, DEBUG_TRACE_PATH)
- Upgraded Logging System (categories, trace correlation, error context)
- AI-Agent Log Format (how to grep for agent-friendly logs)
- Error Patterns Catalog (how to add new patterns)
- Bug Report Generator (how to use, output format)

#### 7.2 Update AGENTS.md

**File:** `AGENTS.md` (MODIFY)

Add to the Quick Reference table:
- Admin dashboard URL: `/admin`
- Onboarding reset: `POST /api/admin/onboarding/reset`
- Diagnostic traces: `GET /api/admin/diagnostics/traces`
- Tool telemetry: `GET /api/admin/diagnostics/tool-telemetry`
- Cron history: `GET /api/admin/cron-history`

Add a new section "Debugging as an Admin" with:
- How to access the admin dashboard
- How to reset onboarding without creating a new account
- How to view diagnostic traces
- How to view tool telemetry
- How to trigger cron jobs manually
- How to view logs in real-time (dev only)

#### 7.3 Update Testing Docs

**File:** `docs/09-testing.md` (MODIFY)

Add sections for:
- Admin API route tests
- Logging system tests
- Error pattern tests
- Bug report generator tests
- Diagnostic trace persistence tests
- E2E admin dashboard tests
- E2E onboarding replay tests

#### 7.4 Create Admin Debugging Guide

**File:** `docs/16-admin-debugging-guide.md` (NEW)

A comprehensive guide for admins:
- How to access the admin dashboard
- How to reset and replay onboarding
- How to view and interpret diagnostic traces
- How to view tool telemetry and identify failing tools
- How to view cron run history and detect stuck jobs
- How to trigger cron jobs manually
- How to view real-time logs (dev)
- How to use the user impersonation feature (dev)
- How to toggle feature flags
- How to interpret AI-agent-friendly log lines
- How to generate a bug report for an AI coding agent
- Common debugging scenarios with step-by-step instructions

#### 7.5 Update .env.example

**File:** `.env.example` (MODIFY)

Add new environment variables:

```bash
# --------------------------------------------------------------------------
# Debugging & Admin
# --------------------------------------------------------------------------
# ENABLE_DEV_LOGIN   Set to 'true' to enable /api/dev/login (dev only)
# DEBUG_TRACE_PATH   When set, diagnostic traces are written as JSON files
#                    to this directory. e.g. /var/log/hamafx/traces
# LOG_LEVEL          pino log level: trace | debug | info | warn | error | fatal
#                    Default: 'debug' in dev, 'info' in production
# ENABLE_LOG_STREAM  Set to 'true' to enable SSE log streaming at /api/admin/logs/stream (dev only)
# ENABLE_IMPERSONATION  Set to 'true' to enable user impersonation (dev only)
ENABLE_DEV_LOGIN=
DEBUG_TRACE_PATH=
LOG_LEVEL=
ENABLE_LOG_STREAM=
ENABLE_IMPERSONATION=
```

---

## 4. File Inventory

### New Files (43 files)

#### Admin API Routes (10 files)
1. `apps/web/src/lib/admin-auth.ts` — `withAdminAuth()` wrapper
2. `apps/web/src/lib/admin-check.ts` — `checkIsAdmin()` helper for server components
3. `apps/web/src/app/api/admin/onboarding/reset/route.ts` — Onboarding reset
4. `apps/web/src/app/api/admin/onboarding/status/route.ts` — Onboarding status
5. `apps/web/src/app/api/admin/onboarding/inspect/route.ts` — Onboarding inspector
6. `apps/web/src/app/api/admin/diagnostics/traces/route.ts` — Trace list
7. `apps/web/src/app/api/admin/diagnostics/trace/[id]/route.ts` — Single trace
8. `apps/web/src/app/api/admin/diagnostics/tool-telemetry/route.ts` — Tool telemetry
9. `apps/web/src/app/api/admin/cron-history/route.ts` — Cron run history
10. `apps/web/src/app/api/admin/users/route.ts` — User list
11. `apps/web/src/app/api/admin/features/route.ts` — Feature flags
12. `apps/web/src/app/api/admin/flush/route.ts` — System flush (dev)
13. `apps/web/src/app/api/admin/impersonate/route.ts` — User impersonation (dev)
14. `apps/web/src/app/api/admin/logs/stream/route.ts` — Log streaming SSE (dev)

#### Admin Dashboard UI (10 files)
15. `apps/web/src/app/(app)/admin/layout.tsx` — Admin layout
16. `apps/web/src/app/(app)/admin/page.tsx` — Admin dashboard page
17. `apps/web/src/app/(app)/admin/_components/admin-health-card.tsx`
18. `apps/web/src/app/(app)/admin/_components/admin-onboarding-control.tsx`
19. `apps/web/src/app/(app)/admin/_components/admin-cron-table.tsx`
20. `apps/web/src/app/(app)/admin/_components/admin-tool-telemetry-table.tsx`
21. `apps/web/src/app/(app)/admin/_components/admin-diagnostic-traces.tsx`
22. `apps/web/src/app/(app)/admin/_components/admin-user-table.tsx`
23. `apps/web/src/app/(app)/admin/_components/admin-feature-flags.tsx`
24. `apps/web/src/app/(app)/admin/_components/admin-log-viewer.tsx`

#### Onboarding Reset UI (1 file)
25. `apps/web/src/app/(app)/settings/_components/onboarding-reset-card.tsx`

#### Logging & Diagnostics (5 files)
26. `packages/shared/src/bug-report.ts` — Bug report generator
27. `packages/shared/src/error-patterns.ts` — Error pattern catalog
28. `packages/ai/src/diagnostics/trace-persistence.ts` — Trace persistence logic
29. `packages/db/src/schema/diagnostic-traces.ts` — Diagnostic traces DB schema
30. `packages/db/drizzle/XXXX_diagnostic_traces.sql` — Migration for diagnostic traces

#### Tests (10 files)
31. `apps/web/test/admin-onboarding-reset.test.ts`
32. `apps/web/test/admin-onboarding-status.test.ts`
33. `apps/web/test/admin-diagnostics.test.ts`
34. `apps/web/test/admin-cron-history.test.ts`
35. `apps/web/test/admin-users.test.ts`
36. `packages/shared/test/logger-upgraded.test.ts`
37. `packages/shared/test/error-patterns.test.ts`
38. `packages/shared/test/bug-report.test.ts`
39. `packages/ai/test/trace-persistence.test.ts`
40. `apps/web/tests/e2e/admin.spec.ts`
41. `apps/web/tests/e2e/onboarding-replay.spec.ts`

#### Documentation (3 files)
42. `docs/16-admin-debugging-guide.md`
43. `docs/15-debugging-and-tracing.md` (MODIFY — significant additions)

### Modified Files (20+ files)

1. `packages/shared/src/logger.ts` — Major upgrade (categories, trace correlation, error context, AI-agent format)
2. `packages/shared/src/errors.ts` — Add ErrorContext interface, enrich AppError
3. `packages/ai/src/diagnostics/run-context.ts` — Trace correlation + persistence
4. `packages/ai/src/diagnostics/index.ts` — Export new functions
5. `apps/worker/src/log.ts` — Migrate to shared pino logger
6. `apps/web/src/lib/logger.ts` — Update for categorized logger
7. `apps/web/src/app/(app)/settings/page.tsx` — Add onboarding reset card
8. `apps/web/src/components/layout/nav-drawer.tsx` — Add admin link
9. `apps/web/src/app/(auth)/actions.ts` — Replace console.error with logger
10. `apps/web/src/app/onboarding/actions.ts` — Replace console.error with logger
11. `apps/web/src/app/api/dev/login/route.ts` — Replace console.error with logger
12. `apps/web/src/app/api/telegram/webhook/route.ts` — Replace console.error with logger
13. `apps/web/src/app/api/cron/briefings/route.ts` — Replace console.error with logger
14. `apps/web/src/app/api/cron/calendar/route.ts` — Replace console.warn with logger
15. `apps/web/src/app/api/cron/cleanup-uploads/route.ts` — Replace console.warn with logger
16. `apps/web/src/app/api/cron/cot/route.ts` — Replace console.error with logger
17. `apps/web/src/app/api/cron/fred-actuals/route.ts` — Replace console.error with logger
18. `apps/web/src/app/api/cron/news/route.ts` — Replace console.error/warn with logger
19. `apps/web/src/app/api/cron/snapshots/route.ts` — Replace console.error with logger
20. `apps/web/src/app/api/cron/warm-cache/route.ts` — Replace console.warn with logger
21. `apps/web/src/app/api/cron/weekly-review/route.ts` — Replace console.error with logger
22. `apps/web/tests/e2e/test-utils.ts` — Add ensureAdminUser()
23. `packages/test-utils/src/factories/users.ts` — Add makeAdminUser()
24. `packages/test-utils/src/index.ts` — Export makeAdminUser
25. `AGENTS.md` — Add admin debugging section
26. `docs/09-testing.md` — Add admin test sections
27. `.env.example` — Add new env vars
28. `apps/worker/test/log.test.ts` — Update for pino migration

---

## 5. Testing Checklist

### Unit Tests
- [ ] `createCategorizedLogger()` adds `category` field to every log line
- [ ] `logErrorContext()` includes structured error info (name, message, code, stack, file, line)
- [ ] `logErrorContext()` auto-injects `traceId` from AsyncLocalStorage
- [ ] `logErrorContext()` auto-enriches with error pattern data (suggestedFix, relatedFiles)
- [ ] Redaction paths cover all sensitive nested fields
- [ ] `logForAgent()` produces `agentLog: true` flag
- [ ] `findErrorPattern()` matches all known patterns
- [ ] `findErrorPattern()` returns null for unknown errors
- [ ] `generateBugReport()` produces complete report
- [ ] `generateBugReport()` never includes PII
- [ ] Worker logger migration produces same output format as before
- [ ] Diagnostic traces persist to DB after `withDiagnostics()` completes
- [ ] `DEBUG_TRACE_PATH` writes files when set
- [ ] Trace persistence failure doesn't block chat turn
- [ ] `withAdminAuth()` allows admin users
- [ ] `withAdminAuth()` allows single-user mode (no admins exist)
- [ ] `withAdminAuth()` rejects non-admin users with 403
- [ ] `withAdminAuth()` rejects unauthenticated users with 401
- [ ] Onboarding reset (soft) preserves API keys
- [ ] Onboarding reset (full) clears all settings
- [ ] Onboarding status returns correct state
- [ ] Onboarding inspect never exposes API key values
- [ ] Cron history returns correct data
- [ ] User list returns paginated results
- [ ] Feature flag toggle works

### E2E Tests
- [ ] Admin dashboard renders for admin user
- [ ] Non-admin user redirected from /admin
- [ ] Onboarding reset button resets and redirects to /onboarding
- [ ] Onboarding replay flow completes successfully
- [ ] Cron table shows recent runs
- [ ] Tool telemetry table shows entries
- [ ] Diagnostic traces list is visible
- [ ] User table shows users (dev only)
- [ ] Log viewer streams logs (dev only)

### Integration Tests
- [ ] All cron routes use structured logger instead of console.*
- [ ] All auth routes use structured logger
- [ ] All onboarding routes use structured logger
- [ ] Trace correlation works end-to-end (request → chat turn → tool call → log)
- [ ] Error pattern enrichment works in production-like environment

---

## 6. Security Considerations

### 6.1 Admin Auth
- `withAdminAuth()` must check `role === 'admin'` on every request (not cache in JWT)
- Single-user mode fallback only applies when NO admin users exist in the DB
- Admin route access is logged for audit trail
- Impersonation route is dev-only (`NODE_ENV !== 'production'` + `ENABLE_IMPERSONATION === 'true'`)

### 6.2 Data Exposure
- Onboarding inspect endpoint returns `hasApiKeys: boolean` and `apiProviders: string[]` — NEVER the actual key values
- User list endpoint returns `userId`, `email`, `name`, `role`, `onboardingCompleted`, `createdAt` — no passwords, no API keys
- Diagnostic traces are redacted at record time via `redactSecrets()` — no change needed
- Log streaming endpoint only available in dev mode
- Bug reports never include PII (email, password, token values)

### 6.3 CSRF
- All admin POST routes go through the existing CSRF middleware (state-changing `/api/*` requests)
- Admin UI components use `withCsrf()` for fetch calls

### 6.4 Rate Limiting
- Admin routes should have a higher rate limit than user routes (admins need to debug frequently)
- Use `withRateLimit('admin:*', 'admin', 60)` — 60 requests per minute per admin

### 6.5 Feature Flags
- Feature flags stored in DB, not in env vars (so they can be toggled at runtime)
- Only admin can toggle feature flags
- Feature flag changes are audit-logged

---

## 7. Migration & Deployment Notes

### 7.1 Database Migration
- New table: `diagnostic_traces` — needs Drizzle migration
- No existing tables are modified (additive only)
- Migration should be safe to run on a live database

### 7.2 Environment Variables
- New optional env vars: `DEBUG_TRACE_PATH`, `LOG_LEVEL`, `ENABLE_LOG_STREAM`, `ENABLE_IMPERSONATION`
- All have safe defaults (empty/disabled)
- No breaking changes to existing env vars

### 7.3 Logger Migration
- Worker logger migration is a breaking change for journald parsers that expect the old format
- The new pino logger emits `{level, time, msg, ...meta}` (pino default) instead of `{ts, level, msg, ...meta}`
- Update any external log parsing/forwarding rules
- The `ts` field is now emitted as `time` (pino default) — add a custom timestamp if `ts` is needed

### 7.4 Rollout Order
1. Phase 4 (Logging) — can be rolled out independently, no UI changes
2. Phase 1 (Admin API Routes) — depends on Phase 4 for structured logging
3. Phase 2 (Admin Dashboard) — depends on Phase 1
4. Phase 3 (Onboarding Reset) — depends on Phase 1
5. Phase 5 (AI-Agent Layer) — depends on Phase 4
6. Phase 6 (Tests) — should be developed alongside each phase
7. Phase 7 (Docs) — last

### 7.5 Backward Compatibility
- `createScopedLogger()` API is preserved (existing call sites don't need changes)
- `withAuth()` API is preserved (existing routes don't need changes)
- `withCronAuth()` API is preserved (existing cron routes don't need changes)
- The worker's `createLogger()` function signature is preserved but internally delegates to pino
- Existing `console.error` calls that are replaced will produce different log output (structured JSON instead of plain text) — update any log forwarding rules

---

## Summary

This plan transforms HamaFX-Ai from a system where debugging requires DB access and Sentry knowledge into one where:

1. **Admins can test onboarding without new accounts** — One click in the settings page or admin dashboard resets onboarding, and the admin can re-run the wizard immediately.

2. **All debugging is centralized** — A single `/admin` page shows system health, cron history, tool telemetry, diagnostic traces, user list, feature flags, and real-time logs.

3. **Logging is unified and AI-agent-friendly** — One pino logger across web and worker, with categories, trace correlation, structured error context, error pattern matching with suggested fixes, and a `logForAgent()` function that produces grep-friendly bug reports.

4. **AI coding agents can identify bugs faster** — Every error log includes the error name, message, code, stack, file, line, cause chain, trace ID, request ID, suggested fix, related files, and whether it's retryable. An AI agent can grep for `"agentLog":true` or `"bugReport":` in logs and immediately understand what went wrong and where to look.

5. **Diagnostic traces are persisted** — Traces are saved to the `diagnostic_traces` DB table and optionally to files via `DEBUG_TRACE_PATH`, so admins and AI agents can query past traces without Sentry access.
