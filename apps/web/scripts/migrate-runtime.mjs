#!/usr/bin/env node

// Runtime migration entrypoint for the standalone Docker image.
//
// This intentionally uses Drizzle's programmatic migrator instead of
// drizzle-kit: standalone Next.js output does not guarantee that the CLI is
// present. The process exits non-zero on any failure so the application never
// starts against a stale or partial schema.

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl =
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  (process.env.HAMAFX_LOCAL_DOCKER === 'true'
    ? process.env.DATABASE_URL || process.env.POSTGRES_URL
    : undefined);

if (!databaseUrl) {
  console.error(
    '[runtime-migrate] No database URL configured. Set DIRECT_URL or POSTGRES_URL_NON_POOLING for production migrations.',
  );
  process.exit(1);
}

// The OSS release is single-user only. Do this preflight before opening a
// connection or applying migrations so an unsupported deployment cannot
// mutate its database and fail only after the migration chain completes.
const multiUserEnabled = ['1', 'true'].includes((process.env.MULTI_USER_ENABLED ?? '').toLowerCase());
const rlsEnabled = ['1', 'true'].includes((process.env.HAMAFX_ENABLE_RLS ?? '').toLowerCase());
const registrationMode = process.env.REGISTRATION_MODE ?? 'owner-first';
if (multiUserEnabled || rlsEnabled || registrationMode === 'open') {
  console.error(
    '[runtime-migrate] Multi-user/RLS and open-registration modes are disabled in this open-source release. ' +
      'Set MULTI_USER_ENABLED=0, HAMAFX_ENABLE_RLS=0, and REGISTRATION_MODE=owner-first (or disabled) until every user-data query establishes tenant context.',
  );
  process.exit(1);
}

const redactUrl = (url) => url.replace(/:[^/@]+@/, ':***@');
console.log(`[runtime-migrate] Applying migrations using ${redactUrl(databaseUrl)}`);

const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 10,
  max_lifetime: 60,
});

try {
  // The migration chain uses unqualified vector and gen_random_uuid names.
  // Install/repair both extensions before Drizzle opens its migration
  // transaction so fresh PostgreSQL and legacy extensions-schema databases
  // behave the same way.
  const existingExtensions = await sql`
    SELECT e.extname, n.nspname AS schema_name
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('vector', 'pgcrypto')
  `;
  for (const extension of existingExtensions) {
    if (extension.schema_name !== 'public') {
      await sql.unsafe(`ALTER EXTENSION ${extension.extname} SET SCHEMA public`);
    }
  }
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  const extensions = await sql`
    SELECT e.extname, n.nspname AS schema_name
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('vector', 'pgcrypto')
  `;
  for (const extension of extensions) {
    if (extension.schema_name !== 'public') {
      await sql.unsafe(`ALTER EXTENSION ${extension.extname} SET SCHEMA public`);
    }
  }

  const db = drizzle(sql);
  await migrate(db, {
    migrationsFolder: '/app/packages/db/drizzle',
    migrationsSchema: 'drizzle',
    migrationsTable: '__drizzle_migrations',
  });

  // Migration 0038 creates RLS policies unconditionally because Drizzle
  // migrations are deployment-wide. This release runs the complete schema
  // in single-user mode, so remove RLS after every migration on any
  // self-hosted Postgres target; otherwise direct user-scoped queries would
  // see no rows without an app.current_tenant transaction setting.
  const tenantTables = [
    'agent_opinions', 'alerts', 'audit_logs', 'bot_links', 'briefings_emitted',
    'chat_telemetry', 'chat_threads', 'chat_tool_telemetry', 'daily_ai_spend',
    'decision_signal_feedback', 'decision_signal_outcomes', 'decision_signals',
    'journal_entries', 'memory_embeddings', 'notification_noise_state',
    'portfolio_positions', 'portfolio_settings', 'provider_tests',
    'push_subscriptions', 'rate_limits', 'shared_snapshots', 'user_sessions',
    'user_settings', 'user_symbols', 'chat_messages',
  ];
  for (const table of tenantTables) {
    await sql.unsafe(`ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`);
    await sql.unsafe(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
  }
  console.log('[runtime-migrate] Single-user mode: tenant RLS disabled.');

  console.log('[runtime-migrate] Migrations completed successfully.');
} catch (error) {
  console.error(
    '[runtime-migrate] Migration failed; refusing to start the application.',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
