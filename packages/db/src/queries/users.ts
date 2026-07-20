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

// User query helpers — admin user management.
//
// These decouple the admin API routes from the schema/users table.

import { desc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../client';

/** Minimal user shape returned by getUserById. */
export interface UserRow {
  id: string;
}

/** Enriched user shape returned by listUsersWithSettings. */
export interface UserWithSettingsRow {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  createdAt: Date;
  onboardingCompleted: boolean | null;
}

/**
 * Look up a user by primary key. Returns undefined if not found.
 * Used by impersonation and admin user-verification routes.
 */
export async function getUserById(userId: string): Promise<UserRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row;
}

/**
 * List users with their settings joined in, ordered by creation date (newest first).
 */
export async function listUsersWithSettings(
  limit: number,
  offset: number,
): Promise<UserWithSettingsRow[]> {
  const db = getDb();
  return db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
      onboardingCompleted: schema.userSettings.onboardingCompleted,
    })
    .from(schema.users)
    .leftJoin(
      schema.userSettings,
      sql`${schema.userSettings.userId} = ${schema.users.id}`,
    )
    .orderBy(desc(schema.users.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Get a user's hashed password. Returns null if no password set (OAuth-only user).
 */
export async function getUserPasswordHash(userId: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db
    .select({ hashedPassword: schema.users.hashedPassword })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return user?.hashedPassword ?? null;
}

/** Total count of users. */
export async function countUsers(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users);
  return row?.count ?? 0;
}
