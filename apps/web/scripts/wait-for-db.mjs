#!/usr/bin/env node

// Password-safe PostgreSQL readiness probe for the standalone image.
// The connection URI is supplied through the environment rather than argv,
// so credentials do not appear in a process listing.

import postgres from 'postgres';

const databaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) {
  console.error('[wait-for-db] MIGRATION_DATABASE_URL is required.');
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 3,
  idle_timeout: 3,
});

try {
  await sql`SELECT 1`;
} finally {
  await sql.end({ timeout: 3 });
}
