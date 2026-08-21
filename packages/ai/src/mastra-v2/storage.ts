// SPDX-License-Identifier: Apache-2.0

/**
 * Mastra runtime storage for the Kestrel Mastra instance (Phase 0).
 *
 * Mastra owns a namespaced set of runtime tables (threads, messages, workflow
 * snapshots, scores, datasets, experiments, background tasks, schedule
 * triggers, thread state) that live beside Kestrel's Drizzle business schema.
 * They are intentionally NOT part of the Drizzle migration chain: Mastra
 * initializes its own schema on first use (idempotent DDL), and PostgresStore
 * supports a `schemaName` so every runtime table stays under one `mastra`
 * namespace and can never collide with or be dropped by Drizzle migrations.
 *
 * Selection (first match wins):
 * - `MASTRA_STORAGE=postgres` → PostgresStore against the direct (non-pooling)
 *   connection string (DIRECT_URL → POSTGRES_URL_NON_POOLING → DATABASE_URL →
 *   POSTGRES_URL). The direct connection avoids Supabase's transaction-mode
 *   pooler, which can silently drop DDL during first-use table creation —
 *   same rule as the Drizzle migration scripts.
 * - `MASTRA_STORAGE=libsql`   → LibSQLStore backed by a file (default
 *   `file:./.kestrel/mastra.db`) so local development stays zero-setup.
 *   Note: libsql `:memory:` databases are per-connection, so multi-connection
 *   workflows (schema init vs. domain writes) would see different databases —
 *   never use `:memory:` here.
 * - unset → postgres when a connection string exists, otherwise libsql.
 *
 * Observability is deliberately NOT routed to this storage: Kestrel exports
 * traces to Langfuse (see `./instrumentation.ts`), so the high-volume
 * `observability` domain is not backed by Postgres.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { LibSQLStore } from '@mastra/libsql';
import { PostgresStore } from '@mastra/pg';
import type { MastraCompositeStore, RetentionConfig } from '@mastra/core/storage';
import { createCategorizedLogger } from '@kestrel/shared/logger';

const mlog = createCategorizedLogger('ai', { component: 'mastra-storage' });

export type MastraStorageKind = 'postgres' | 'libsql';

export interface MastraStorageResult {
  storage: MastraCompositeStore;
  kind: MastraStorageKind;
}

/** Direct (non-pooling) connection string in the same order as the migration scripts. */
export function mastraDirectConnectionString(env: NodeJS.ProcessEnv = process.env): string | null {
  return (
    env.DIRECT_URL ??
    env.POSTGRES_URL_NON_POOLING ??
    env.DATABASE_URL ??
    env.POSTGRES_URL ??
    null
  );
}

/**
 * Mirror of the `@kestrel/db` TLS policy (`packages/db/src/client.ts`,
 * `resolveSslOptions`). Mastra's Postgres client must not be allowed to
 * downgrade TLS in production.
 */
export function mastraSslOptions(
  env: NodeJS.ProcessEnv = process.env,
): boolean | { rejectUnauthorized: boolean; ca?: string } {
  if (env.DB_DISABLE_SSL === 'true') {
    const localDocker =
      (env.KESTREL_LOCAL_DOCKER ?? env.HAMAFX_LOCAL_DOCKER) === 'true';
    if (env.NODE_ENV !== 'production' || localDocker) return false;
    throw new Error(
      '[mastra] DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true; ' +
        'configure verified TLS for production databases.',
    );
  }
  const ca = env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
  if (ca) return { ca, rejectUnauthorized: true };
  if (env.NODE_ENV === 'production') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/**
 * Retention policies for growth tables (age-based; applied by
 * `storage.prune()` from a maintenance job — not yet wired in Phase 0).
 * Keys are validated against `DomainRetentionTables` at compile time.
 */
function mastraRetention(): RetentionConfig {
  return {
    memory: {
      messages: { maxAge: '90d' },
      threads: { maxAge: '180d' },
    },
    workflows: {
      workflowSnapshot: { maxAge: '30d' },
    },
    backgroundTasks: {
      backgroundTasks: { maxAge: '30d' },
    },
    schedules: {
      triggers: { maxAge: '90d' },
    },
  };
}

function libsqlUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.MASTRA_LIBSQL_URL;
  if (configured && configured.length > 0) return configured;
  return 'file:./.kestrel/mastra.db';
}

function ensureLibsqlParent(url: string): void {
  if (url === ':memory:' || !url.startsWith('file:')) return;
  const path = url.slice('file:'.length);
  if (!path || path === ':memory:') return;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (error) {
    mlog.warn('Could not create LibSQL storage directory (non-fatal)', {
      path: dirname(path),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Create the Mastra runtime store for the current environment.
 *
 * Constructing the store does not connect or create tables; Mastra
 * initializes its schema lazily on first use. Callers that need the schema
 * up front (server boot, worker boot) should await
 * `initializeMastraStorage(result)`.
 */
export function createMastraStorage(env: NodeJS.ProcessEnv = process.env): MastraStorageResult {
  const kind: MastraStorageKind =
    env.MASTRA_STORAGE === 'postgres'
      ? 'postgres'
      : env.MASTRA_STORAGE === 'libsql'
        ? 'libsql'
        : mastraDirectConnectionString(env) !== null
          ? 'postgres'
          : 'libsql';

  if (kind === 'postgres') {
    const connectionString = mastraDirectConnectionString(env);
    if (!connectionString) {
      throw new Error(
        '[mastra] MASTRA_STORAGE=postgres requires DIRECT_URL, POSTGRES_URL_NON_POOLING, ' +
          'DATABASE_URL, or POSTGRES_URL to be set.',
      );
    }
    const schemaName = env.MASTRA_SCHEMA ?? 'mastra';
    const poolMax = Number(env.MASTRA_DB_POOL_MAX ?? '5');
    mlog.debug('Creating Mastra Postgres storage', {
      schemaName,
      poolMax: Number.isFinite(poolMax) && poolMax > 0 ? Math.floor(poolMax) : 5,
      ssl: env.NODE_ENV === 'production' ? 'verify' : 'insecure-dev',
    });
    return {
      storage: new PostgresStore({
        id: 'kestrel-mastra',
        connectionString,
        schemaName,
        ssl: mastraSslOptions(env),
        max: Number.isFinite(poolMax) && poolMax > 0 ? Math.floor(poolMax) : 5,
        retention: mastraRetention(),
      }),
      kind,
    };
  }

  const url = libsqlUrl(env);
  ensureLibsqlParent(url);
  mlog.debug('Creating Mastra LibSQL storage', { url });
  return { storage: new LibSQLStore({ id: 'kestrel-mastra', url }), kind };
}

/** Explicitly initialize the storage schema (idempotent). Safe to call at boot. */
export async function initializeMastraStorage(result: MastraStorageResult): Promise<void> {
  const store = result.storage as MastraCompositeStore & { init?: () => Promise<void> };
  if (typeof store.init === 'function') {
    await store.init();
    mlog.info('Mastra storage initialized', { kind: result.kind });
  }
}
