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

// Admin audit log helpers — record privileged actions taken via the admin panel.

import { desc } from 'drizzle-orm';
import { getDb } from '../client';
import { schema } from '../client';

/**
 * Record a privileged admin action.
 *
 * @param actorUserId — the admin user performing the action
 * @param action — short, stable action identifier (e.g. 'user.role.update')
 * @param targetUserId — optional subject of the action
 * @param metadata — extra, non-sensitive context
 */
export async function recordAdminAudit(
  actorUserId: string,
  action: string,
  targetUserId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.insert(schema.adminAuditLogs).values({
    actorUserId,
    action,
    targetUserId,
    metadata,
  });
}

/** List admin audit log entries, newest first. */
export async function listAdminAuditLogs(
  limit: number,
  offset: number,
): Promise<typeof schema.adminAuditLogs.$inferSelect[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.adminAuditLogs)
    .orderBy(desc(schema.adminAuditLogs.createdAt))
    .limit(limit)
    .offset(offset);
}
