// Web-push subscription persistence.
//
// Single-user app, but the user can subscribe from multiple devices. We
// key by `endpoint` (unique per browser/device + service worker scope) so
// re-subscribing from the same device is an upsert, not a duplicate row.
//
// 410 Gone responses from the push service mean "this subscription is
// dead — remove it"; the delivery layer calls `deletePushSubscription`
// or `deletePushSubscriptionByEndpoint` to clean up.

import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: number;
}

export interface SavePushSubscriptionArgs {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null | undefined;
}

function rowToSub(row: typeof schema.pushSubscriptions.$inferSelect): PushSubscriptionRow {
  return {
    id: row.id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.userAgent ?? null,
    createdAt: row.createdAt.getTime(),
  };
}

/** All active subscriptions. The delivery loop fans out across this list. */
export async function listPushSubscriptions(): Promise<PushSubscriptionRow[]> {
  const rows = await getDb().select().from(schema.pushSubscriptions);
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
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: {
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent ?? null,
      },
    })
    .returning();
  return rowToSub(inserted[0]!);
}

export async function deletePushSubscription(id: string): Promise<void> {
  await getDb().delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, id));
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await getDb()
    .delete(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, endpoint));
}
