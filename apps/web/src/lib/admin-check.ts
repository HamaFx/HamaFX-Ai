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

import { cache } from 'react';
import { eq, sql } from 'drizzle-orm';

import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';

export const checkIsAdmin = cache(async (): Promise<boolean> => {
  const session = await auth();
  if (!session?.user?.id) return false;

  const db = getDb();
  const [user] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));

  if (user?.role === 'admin') return true;

  // Single-user mode: no admins exist
  const [adminCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users)
    .where(eq(schema.users.role, 'admin'));

  return Number(adminCount?.count ?? 0) === 0;
});
