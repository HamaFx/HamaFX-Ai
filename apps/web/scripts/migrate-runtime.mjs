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
