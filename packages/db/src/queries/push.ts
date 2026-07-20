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

// PF-01 Phase 2 — Push subscription query helpers.

import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../client';

export type PushSubscriptionRow = typeof schema.pushSubscriptions.$inferSelect;
export type CreatePushSubscriptionInput = typeof schema.pushSubscriptions.$inferInsert;

export async function listPushSubscriptions(userId: string): Promise<PushSubscriptionRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId));
}

export async function getPushSubscriptionByEndpoint(endpoint: string): Promise<PushSubscriptionRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, endpoint))
    .limit(1);
  return rows[0];
}

export async function createPushSubscription(input: CreatePushSubscriptionInput): Promise<PushSubscriptionRow> {
  const db = getDb();
  const rows = await db.insert(schema.pushSubscriptions).values(input).returning();
  return rows[0]!;
}

export async function deletePushSubscription(id: string, userId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.id, id), eq(schema.pushSubscriptions.userId, userId)));
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const db = getDb();
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint));
}
