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

// Tenant and user listing query helpers.

import { getDb, schema } from '../client';

export type OrganizationRow = typeof schema.organization.$inferSelect;

/**
 * List all active organizations (tenants).
 * Returns up to `limit` rows.
 */
export async function listActiveTenants(limit = 100): Promise<OrganizationRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.organization)
    .limit(limit);
}
