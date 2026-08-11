/**
 * Copyright 2026 Kestrel
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

// Web-push subscription persistence.
//
// Single-user app, but the user can subscribe from multiple devices. We
// key by `endpoint` (unique per browser/device + service worker scope) so
// re-subscribing from the same device is an upsert, not a duplicate row.
//
// 410 Gone responses from the push service mean "this subscription is
// dead — remove it"; the delivery layer calls `deletePushSubscription`
// or `deletePushSubscriptionByEndpoint` to clean up.

import { schema } from '@kestrel/db';
import { getDb } from '../db';
import { and, eq } from 'drizzle-orm';

export interface PushSubscriptionRow {
  id: string;
  userId: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: number;
}

export class PushSubscriptionConflictError extends Error {
  constructor() {
    super('Push subscription endpoint belongs to another user');
    this.name = 'PushSubscriptionConflictError';
  }
}

export interface SavePushSubscriptionArgs {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null | undefined;
}

function rowToSub(row: typeof schema.pushSubscriptions.$inferSelect): PushSubscriptionRow {
  return {
    id: row.id,
    userId: row.userId,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.userAgent ?? null,
    createdAt: row.createdAt.getTime(),
  };
}

/** All active subscriptions. The delivery loop fans out across this list. */
export async function listPushSubscriptions(userId: string): Promise<PushSubscriptionRow[]> {
  const rows = await getDb()
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId));
  return rows.map(rowToSub);
}

/**
 * Upsert a subscription on `endpoint`. Re-subscribing from the same browser
 * regenerates `p256dh` + `auth`, so we always overwrite those fields.
 */
export async function savePushSubscription(
  args: SavePushSubscriptionArgs,
): Promise<PushSubscriptionRow> {
  const inserted = await getDb()
    .insert(schema.pushSubscriptions)
    .values({
      userId: args.userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      // Never overwrite userId on an endpoint conflict. The endpoint is
      // globally unique; preserving its owner prevents a caller from
      // transferring another user's subscription by replaying its endpoint.
      // The WHERE clause also prevents a different user from overwriting the
      // owner's keys or user-agent metadata.
      set: {
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent ?? null,
      },
      setWhere: eq(schema.pushSubscriptions.userId, args.userId),
    })
    .returning();
  if (inserted.length === 0) {
    throw new PushSubscriptionConflictError();
  }
  return rowToSub(inserted[0]!);
}

export async function deletePushSubscription(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.id, id),
        eq(schema.pushSubscriptions.userId, userId),
      ),
    );
}

export async function deletePushSubscriptionByEndpoint(userId: string, endpoint: string): Promise<void> {
  await getDb()
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.endpoint, endpoint),
        eq(schema.pushSubscriptions.userId, userId),
      ),
    );
}
