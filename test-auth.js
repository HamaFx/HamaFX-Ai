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

import { getDb } from './packages/db/src/index.ts';
import { users } from './packages/db/src/schema/users.ts';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function test() {
  const email = 'user-a@example.com';
  const password = 'passwordA';
  
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  console.log("User:", !!user);
  
  if (!user || !user.hashedPassword) return console.log("No user or hash");

  const ok = await bcrypt.compare(password, user.hashedPassword);
  console.log("Password OK?", ok);
}

test();
