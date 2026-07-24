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

import { desc, eq, ilike, or, sql } from 'drizzle-orm';

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
 * Optional `q` filters by email or name (case-insensitive substring match).
 */
export async function listUsersWithSettings(
  limit: number,
  offset: number,
  q?: string,
): Promise<UserWithSettingsRow[]> {
  const db = getDb();
  const filter = q?.trim();
  const whereClause = filter
    ? or(
        ilike(schema.users.email, `%${filter}%`),
        ilike(schema.users.name, `%${filter}%`),
      )
    : undefined;

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
    .where(whereClause)
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

/** Total count of users, optionally filtered by email/name. */
export async function countUsers(q?: string): Promise<number> {
  const db = getDb();
  const filter = q?.trim();
  const whereClause = filter
    ? or(
        ilike(schema.users.email, `%${filter}%`),
        ilike(schema.users.name, `%${filter}%`),
      )
    : undefined;

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users)
    .where(whereClause);
  return row?.count ?? 0;
}

/** Count users with an explicit admin role. */
export async function countAdmins(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users)
    .where(eq(schema.users.role, 'admin'));
  return row?.count ?? 0;
}

/**
 * Update a user's role. Returns the updated row or undefined if the user
 * does not exist.
 */
export async function updateUserRole(
  userId: string,
  role: string,
): Promise<{ id: string; role: string | null } | undefined> {
  const db = getDb();
  const [row] = await db
    .update(schema.users)
    .set({ role })
    .where(eq(schema.users.id, userId))
    .returning({ id: schema.users.id, role: schema.users.role });
  return row;
}
