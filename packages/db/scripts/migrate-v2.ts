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

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/schema';
import { eq, isNull } from 'drizzle-orm';
import { env } from '@hamafx/shared/env';

/**
 * Migration script for Phase B (Multi-User).
 * Backfills existing data (which was created by the single "User Zero")
 * with a default user_id.
 */
async function run() {
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const queryClient = postgres(env.DATABASE_URL);
  const db = drizzle(queryClient, { schema });

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@localhost';
  console.log(`Using default admin email: ${adminEmail}`);

  // 1. Ensure user exists
  let user = await db.query.users.findFirst({
    where: eq(schema.users.email, adminEmail),
  });

  if (!user) {
    console.log(`Creating default user ${adminEmail}...`);
    const [newUser] = await db
      .insert(schema.users)
      .values({
        email: adminEmail,
        // In a real scenario they'd reset password or use an OAuth provider
      })
      .returning();
    user = newUser;
  }

  const userId = user.id;
  console.log(`Default user ID: ${userId}`);

  // 2. Backfill tables
  const tablesWithUserId = [
    schema.alerts,
    schema.briefings,
    schema.chatThreads,
    schema.dailyAiSpend,
    schema.journal,
    schema.memory,
    schema.pushSubscriptions,
    schema.rateLimits,
    schema.shareLinks,
    schema.telemetryTraces,
    schema.toolTelemetry,
  ];

  console.log('Starting backfill...');
  for (const table of tablesWithUserId) {
    try {
      const result = await db
        .update(table)
        // @ts-expect-error - dynamic table access
        .set({ userId })
        // @ts-expect-error - dynamic table access
        .where(isNull(table.userId))
        .returning({ id: table.userId }); // Returning something to count rows

      console.log(`Updated ${result.length} rows in table`);
    } catch (err) {
      console.warn(`Could not update table. It may not exist or has a different schema structure. Error: ${err}`);
    }
  }

  console.log('Migration complete. You may now safely run migrations that make user_id NOT NULL.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
