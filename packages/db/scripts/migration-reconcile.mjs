#!/usr/bin/env node

/**
 * Read-only production migration/schema reconciliation report.
 *
 * This command never runs DDL or DML. It compares the repository's
 * migration hashes with drizzle.__drizzle_migrations and inspects the
 * production invariants needed before applying migrations 0065–0068.
 *
 * Usage:
 *   DIRECT_URL=... pnpm --filter @kestrel/db migrate:reconcile
 *   DIRECT_URL=... pnpm --filter @kestrel/db migrate:reconcile -- --json
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const HERE = new URL('.', import.meta.url).pathname;
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');
const jsonOutput = process.argv.includes('--json');

function getRepositoryMigrations() {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf8'),
  );
  const byHash = new Map();
  const entries = journal.entries ?? [];
  for (const entry of entries) {
    const file = join(DRIZZLE_DIR, `${entry.tag}.sql`);
    if (!existsSync(file)) {
      throw new Error(`Missing SQL file for journal entry ${entry.tag}`);
    }
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    byHash.set(hash, entry.tag);
  }
  return { entries, byHash };
}

function resolveSslOptions() {
  if (process.env.DB_DISABLE_SSL === 'true') {
    if (
      process.env.NODE_ENV !== 'production' ||
      (process.env.KESTREL_LOCAL_DOCKER ?? process.env.HAMAFX_LOCAL_DOCKER) === 'true'
    ) {
      return false;
    }
    throw new Error(
      'DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true.',
    );
  }
  const ca = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
  if (ca) return { ca, rejectUnauthorized: true };
  return (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production')
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false };
}

function resolveDatabaseUrl() {
  return (
    process.env.MIGRATION_DATABASE_URL ||
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    null
  );
}

function printHumanReport(report) {
  console.log('\nKestrel migration reconciliation (READ ONLY)\n');
  console.log(`Repository migrations: ${report.repository.migrationCount}`);
  console.log(`Production migrations: ${report.production.migrationCount ?? 'unavailable'}`);
  console.log(`Migration tracking table available: ${String(report.production.trackingTableAvailable)}`);
  console.log(`Unknown production hashes: ${report.production.unknown.length}`);
  console.log(`Repository hashes absent in production: ${report.production.missing.length}`);
  console.log(`Duplicate briefing groups: ${report.schema.duplicateBriefingGroups.length}`);
  console.log(`Missing required tables: ${report.schema.missingTables.join(', ') || 'none'}`);
  console.log(`Missing required columns: ${report.schema.missingColumns.join(', ') || 'none'}`);
  console.log(`Missing required indexes: ${report.schema.missingIndexes.join(', ') || 'none'}`);
  console.log(
    `Stale production-only columns: ${report.schema.staleColumns.map((column) => `${column.name} (non-empty=${column.nonEmptyValues})`).join(', ') || 'none'}`,
  );
  console.log(`Current role: ${report.security.currentRole ?? 'unavailable'}`);
  console.log(`Current role bypasses RLS: ${String(report.security.roleBypassRls)}`);
  console.log('\nUnknown production migration rows:');
  for (const row of report.production.unknown) {
    console.log(`  id=${row.id} hash=${row.hash}`);
  }
  console.log('\nDuplicate briefing groups:');
  for (const group of report.schema.duplicateBriefingGroups) {
    console.log(`  user=${group.userId} count=${group.count}`);
    for (const thread of group.threads) {
      console.log(
        `    thread=${thread.id} created=${thread.createdAt} updated=${thread.updatedAt} messages=${thread.messageCount}`,
      );
    }
  }
  console.log('\nNo database writes were performed.');
}

const { entries, byHash } = getRepositoryMigrations();
const url = resolveDatabaseUrl();
if (!url) {
  const report = {
    repository: { migrationCount: entries.length },
    production: { migrationCount: null, trackingTableAvailable: false, unknown: [], missing: [] },
    schema: { duplicateBriefingGroups: [], missingTables: [], missingColumns: [], missingIndexes: [], staleColumns: [] },
    security: { currentRole: null, roleBypassRls: null },
    connection: 'unavailable',
  };
  if (jsonOutput) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Repository migrations: ${entries.length}`);
    console.log('No database URL configured; repository-only report generated.');
  }
  process.exit(0);
}

const sql = postgres(url, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 10,
  ssl: resolveSslOptions(),
});

try {
  const trackingRows = await sql`
    SELECT to_regclass('drizzle.__drizzle_migrations') AS table_name
  `;
  const trackingTableAvailable = Boolean(trackingRows[0]?.table_name);
  const appliedRows = trackingTableAvailable
    ? await sql`
        SELECT id, hash, created_at
        FROM drizzle."__drizzle_migrations"
        ORDER BY id
      `
    : [];
  const appliedHashes = new Set(appliedRows.map((row) => row.hash));
  const unknown = appliedRows
    .filter((row) => !byHash.has(row.hash))
    .map((row) => ({ id: row.id, hash: row.hash, createdAt: row.created_at }));
  const missing = trackingTableAvailable
    ? entries
        .filter((entry) => {
          const file = join(DRIZZLE_DIR, `${entry.tag}.sql`);
          const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
          return !appliedHashes.has(hash);
        })
        .map((entry) => entry.tag)
    : [];

  const duplicateRows = await sql`
    WITH duplicate_users AS (
      SELECT user_id
      FROM public.chat_threads
      WHERE is_briefings = true
      GROUP BY user_id
      HAVING count(*) > 1
    )
    SELECT
      t.user_id,
      t.id,
      t.created_at,
      t.updated_at,
      (SELECT count(*) FROM public.chat_messages m WHERE m.thread_id = t.id) AS message_count
    FROM public.chat_threads t
    JOIN duplicate_users d ON d.user_id = t.user_id
    WHERE t.is_briefings = true
    ORDER BY t.user_id, t.created_at, t.id
  `;
  const duplicateBriefingGroups = [];
  for (const row of duplicateRows) {
    let group = duplicateBriefingGroups.find((item) => item.userId === row.user_id);
    if (!group) {
      group = { userId: row.user_id, count: 0, threads: [] };
      duplicateBriefingGroups.push(group);
    }
    group.count += 1;
    group.threads.push({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: Number(row.message_count),
    });
  }

  const requiredTables = ['telegram_updates'];
  const tableRows = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('telegram_updates')
  `;
  const existingTables = new Set(tableRows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((name) => !existingTables.has(name));

  const requiredColumns = [
    ['chat_tool_telemetry', 'output_chars'],
    ['alerts', 'delivery_claimed_at'],
  ];
  const columnRows = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'chat_tool_telemetry' AND column_name = 'output_chars')
        OR (table_name = 'alerts' AND column_name = 'delivery_claimed_at'))
  `;
  const existingColumns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingColumns = requiredColumns
    .map(([table, column]) => `${table}.${column}`)
    .filter((key) => !existingColumns.has(key));

  const staleColumnDefinition = await sql`
    SELECT count(*)::int AS total
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'symbol_catalog'
      AND column_name = 'twelve_data_symbol'
  `;
  const staleColumns = [];
  if (Number(staleColumnDefinition[0]?.total ?? 0) > 0) {
    const staleColumnRows = await sql`
      SELECT count(*) FILTER (
        WHERE "twelve_data_symbol" IS NOT NULL
          AND btrim("twelve_data_symbol") <> ''
      )::int AS non_empty
      FROM public."symbol_catalog"
    `;
    staleColumns.push({
      name: 'symbol_catalog.twelve_data_symbol',
      nonEmptyValues: Number(staleColumnRows[0]?.non_empty ?? 0),
    });
  }

  const requiredIndexes = [
    'alerts_delivery_claimed_at_idx',
    'chat_threads_one_briefings_per_user_idx',
  ];
  const indexRows = await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN ('alerts_delivery_claimed_at_idx', 'chat_threads_one_briefings_per_user_idx')
  `;
  const existingIndexes = new Set(indexRows.map((row) => row.indexname));
  const missingIndexes = requiredIndexes.filter((name) => !existingIndexes.has(name));

  const roleRows = await sql`
    SELECT current_user AS current_role, r.rolbypassrls
    FROM pg_roles r
    WHERE r.rolname = current_user
  `;
  const role = roleRows[0];
  const report = {
    repository: { migrationCount: entries.length },
    production: {
      migrationCount: appliedRows.length,
      trackingTableAvailable,
      minId: appliedRows[0]?.id ?? null,
      maxId: appliedRows.at(-1)?.id ?? null,
      unknown,
      missing,
    },
    schema: {
      duplicateBriefingGroups,
      missingTables,
      missingColumns,
      missingIndexes,
      staleColumns,
    },
    security: {
      currentRole: role?.current_role ?? null,
      roleBypassRls: role?.rolbypassrls ?? null,
    },
    connection: 'verified',
  };

  if (jsonOutput) console.log(JSON.stringify(report, null, 2));
  else printHumanReport(report);
} finally {
  await sql.end({ timeout: 5 });
}
