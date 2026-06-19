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

import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export async function ensureTestUser(email = 'test@example.com', password = 'password123') {
  const db = getDb();
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();

  const result = await db.insert(schema.users).values({
    id,
    email,
    name: 'Test User',
    hashedPassword,
    role: 'user',
  }).onConflictDoUpdate({
    target: schema.users.email,
    set: { hashedPassword }
  }).returning();

  const user = result[0];

  await db.insert(schema.userSettings).values({
    userId: user.id,
    defaultSymbol: 'XAUUSD',
    timezone: 'UTC',
    language: 'en',
    onboardingCompleted: true,
  }).onConflictDoUpdate({
    target: schema.userSettings.userId,
    set: { onboardingCompleted: true }
  });

  return user;
}
