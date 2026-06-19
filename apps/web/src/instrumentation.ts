/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Phase 8 PR-18 — Next.js instrumentation hook. Runs once per server
// process (Node + Edge runtimes) before the first request lands.
//
// We initialise Sentry SERVER-ONLY: no @sentry/nextjs client SDK is
// pulled into the browser bundle, which keeps the JS payload identical
// to before and avoids the privacy / replay surface that the client
// SDK adds. Client-side errors continue to surface via the existing
// error boundaries + Vercel function logs.
//
// When SENTRY_DSN is absent the whole hook is a no-op so local dev /
// preview deploys without the env var work the same as before.
//
// Phase A: legacy admin auto-creation. When APP_PASSWORD is set and the
// users table is empty, we create a default admin user with hashed
// password so the single-user → multi-user migration is seamless.

export async function register(): Promise<void> {
  // ── Local dev: initialize embedded PGlite ──────────────────────
  // When neither DATABASE_URL nor POSTGRES_URL is set AND we're in
  // Node.js runtime, boot PGlite and apply migrations automatically.
  // The Edge runtime never hits this path (no fs access).
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    !process.env.DATABASE_URL &&
    !process.env.POSTGRES_URL
  ) {
    try {
      const { ensureMigrations } = await import(
        /* webpackIgnore: true */
        '@hamafx/db/local-db'
      );
      await ensureMigrations();
      console.log('[boot] PGlite database ready (embedded Postgres)');
    } catch (err) {
      console.warn(
        '[boot] Could not initialize PGlite — some features may be unavailable:',
        (err as Error).message,
      );
    }
  }

  // ── Phase A: legacy admin auto-creation ────────────────────────
  // When APP_PASSWORD is set and no users exist yet, create a default
  // admin user with the hashed password. This lets single-user
  // deployments upgrade to NextAuth without manual DB seeding.
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.APP_PASSWORD
  ) {
    try {
      const { getDb, schema } = await import(
        /* webpackIgnore: true */
        '@hamafx/db'
      );
      const bcrypt = await import('bcryptjs');

      const db = getDb();
      const rows = await db.select({ cnt: schema.users.id }).from(schema.users).limit(1);

      if (rows.length === 0) {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@localhost';
        const hashedPassword = await bcrypt.hash(process.env.APP_PASSWORD, 12);

        // Auto-generate a UUID for the admin user (NextAuth convention)
        const { randomUUID } = await import('node:crypto');
        const userId = randomUUID();

        await db.insert(schema.users).values({
          id: userId,
          email: adminEmail,
          name: 'Admin',
          hashedPassword,
          role: 'user',
        });

        await db.insert(schema.userSettings).values({
          userId,
          defaultSymbol: 'XAUUSD',
          timezone: 'UTC',
          language: 'en',
          onboardingCompleted: false,
        });

        // Add default watchlist symbols
        const defaultSymbols = ['XAUUSD', 'EURUSD', 'GBPUSD'];
        await db.insert(schema.userSymbols).values(
          defaultSymbols.map((sym, i) => ({
            userId,
            symbol: sym,
            displayOrder: i,
          })),
        );

        console.log(
          `[boot] Legacy admin user created: ${adminEmail} (${defaultSymbols.length} default symbols)`,
        );

        // Backfill user_id on existing data — all legacy rows belong to
        // this admin user. This is safe because the user_id column is
        // nullable; rows without user_id will be invisible to queries
        // that filter by user_id until backfilled.
        const tablesToBackfill = [
          'chat_threads',
          'alerts',
          'journal_entries',
          'push_subscriptions',
          'shared_snapshots',
          'chat_telemetry',
          'chat_tool_telemetry',
        ] as const;

        for (const table of tablesToBackfill) {
          try {
            await db.execute(
              `UPDATE "${table}" SET "user_id" = '${userId}' WHERE "user_id" IS NULL`,
            );
          } catch {
            // Table might not exist yet (fresh DB) — skip
          }
        }

        // For daily_ai_spend and briefings_emitted, add PK columns
        try {
          await db.execute(
            `UPDATE "daily_ai_spend" SET "user_id" = '${userId}' WHERE "user_id" IS NULL`,
          );
        } catch { /* skip */ }
        try {
          await db.execute(
            `UPDATE "briefings_emitted" SET "user_id" = '${userId}' WHERE "user_id" IS NULL`,
          );
        } catch { /* skip */ }
        try {
          await db.execute(
            `UPDATE "memory_embeddings" SET "user_id" = '${userId}' WHERE "user_id" IS NULL`,
          );
        } catch { /* skip */ }

        console.log('[boot] Legacy data backfilled to admin user');
      }
    } catch (err) {
      console.warn(
        '[boot] Legacy admin creation failed (non-fatal):',
        (err as Error).message,
      );
    }
  }

  // ── Langfuse LLM Observability ──────────────────────────────────
  // Node runtime only — OpenTelemetry SDK uses Node APIs.
  // Silently skipped when LANGFUSE_* env vars are not set.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initLangfuse } = await import(
        /* webpackIgnore: true */
        '@hamafx/ai'
      );
      initLangfuse();
    } catch (err) {
      console.warn(
        '[boot] Langfuse init failed (non-fatal):',
        (err as Error).message,
      );
    }
  }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  // Two runtimes call this — pick the right SDK init each time.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      // Server-only: do not auto-enable any browser-side transport.
      // (`@sentry/nextjs` only ships the browser bundle when the
      // matching `sentry.client.config.ts` exists; we deliberately
      // never create one.)
      environment: process.env.NODE_ENV,
      initialScope: {
        tags: {
          service: 'web',
          commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
          region: process.env.VERCEL_REGION ?? 'local',
        },
      },
      ignoreErrors: [
        // Client-side aborts that bubble through SSE — not our bugs.
        /AbortError/i,
        /aborted/i,
      ],
    });
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      environment: process.env.NODE_ENV,
      initialScope: {
        tags: {
          service: 'web-edge',
          commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
        },
      },
    });
  }
}

/**
 * Called by Next.js when an error is thrown inside a route handler /
 * Server Action / page render. We forward to Sentry with the request id
 * already plumbed through the response (lib/api.ts).
 */
export async function onRequestError(
  err: { digest?: string },
  request: { path: string; method: string; headers: Record<string, string | string[]> },
): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.withScope((scope) => {
    const xrid = request.headers['x-request-id'];
    if (typeof xrid === 'string') scope.setTag('request_id', xrid);
    scope.setTag('route', request.path);
    scope.setTag('method', request.method);
    Sentry.captureException(err);
  });
}