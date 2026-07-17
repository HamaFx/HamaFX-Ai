#!/usr/bin/env node
/**
 * Seed script for k6 load testing (Strategy B — real NextAuth sessions).
 *
 * Run from repo root:
 *   K6_ALLOW_SEED=true K6_USER_COUNT=25 K6_TEST_PASSWORD=LoadTest!123 \
 *     node loadtest/lib/seed/seed-users.mjs
 *
 * What it does:
 *   1. Upserts N users `loadtest+000@hamafx.ai` … `loadtest+NNN@hamafx.ai`
 *      with a shared bcrypt password.
 *   2. Creates one chat thread per user (needed for /api/chat tests).
 *   3. Writes loadtest/lib/data/seeded-users.json manifest.
 *
 * Safety: refuses to run unless K6_ALLOW_SEED=true is set AND DATABASE_URL
 * is clearly not a production DB (no strict check; just a warning).
 */

import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

// Dynamic imports from the workspace — the repo must be built before
// running this script so the compiled output is available.
// We use tsx to run ESM TypeScript directly, so relative imports
// from workspace packages should resolve via the pnpm workspace links
// if the script is run from the repo root.

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;

async function main() {
  // ── Safety gate ──
  if (process.env.K6_ALLOW_SEED !== 'true') {
    console.error('ABORTED: K6_ALLOW_SEED must be "true" to run this script.');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (dbUrl.includes('prod') || dbUrl.includes('production')) {
    console.warn(
      'WARNING: DATABASE_URL contains "prod"/"production". ' +
        'Are you sure this is a load-test DB?',
    );
  }

  const userCount = parseInt(process.env.K6_USER_COUNT ?? '10', 10);
  const password = process.env.K6_TEST_PASSWORD ?? 'LoadTest!123';

  if (Number.isNaN(userCount) || userCount < 1 || userCount > 1000) {
    console.error('ABORTED: K6_USER_COUNT must be between 1 and 1000.');
    process.exit(1);
  }

  // ── Import workspace deps (dynamic, so they don't block the safety gates) ──
  const { getDb } = await import('@hamafx/db');
  const schema = await import('@hamafx/db/schema');
  // Dynamically import the eq helper
  const { eq } = await import('drizzle-orm');

  const db = getDb();

  const users_ = [];
  const start = Date.now();
  const hashedPassword = await bcrypt.hash(password, 12);

  for (let i = 0; i < userCount; i++) {
    const email = `loadtest+${String(i).padStart(3, '0')}@hamafx.ai`;
    const userId = randomUUID();

    // Upsert user
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (!existing) {
      await db.insert(schema.users).values({
        id: userId,
        email,
        name: `LoadTest ${i}`,
        hashedPassword,
        // role is optional; default is fine
      });
      console.log(`Created user: ${email}`);
    } else {
      console.log(`User already exists: ${email}`);
    }

    // Create one chat thread per user
    const threadId = randomUUID();
    try {
      await db.insert(schema.chatThreads).values({
        id: threadId,
        userId: existing?.id ?? userId,
        title: `Load test thread`,
        pinnedSymbol: 'XAUUSD',
      });
    } catch {
      // Thread might already exist; ignore constraint errors
    }

    users_.push({
      email: existing?.email ?? email,
      threadId,
    });
  }

  // ── Write manifest ──
  const manifestPath = `${SCRIPT_DIR}/../data/seeded-users.json`;
  const fs = await import('node:fs');
  fs.writeFileSync(manifestPath, JSON.stringify(users_, null, 2) + '\n');

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `Seeded ${userCount} users in ${elapsed}s. Manifest written to ${manifestPath}`,
  );
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
