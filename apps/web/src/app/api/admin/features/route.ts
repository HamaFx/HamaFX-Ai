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


import { z } from 'zod';

import { getDb, schema } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toggleSchema = z.record(z.boolean());

export const GET = withAdminAuth(async () => {
  const db = getDb();
  const rows = await db.select().from(schema.featureFlags);

  const features: Record<string, boolean> = {};
  for (const row of rows) {
    features[row.key] = row.enabled;
  }

  return Response.json({ features });
});

export const POST = withAdminAuth(async (req, { user }) => {
  const body = await parseJsonBody(req, toggleSchema);

  const db = getDb();
  await db.transaction(async (tx) => {
    for (const [key, enabled] of Object.entries(body)) {
      await tx
        .insert(schema.featureFlags)
        .values({ key, enabled, updatedBy: user.userId })
        .onConflictDoUpdate({
          target: schema.featureFlags.key,
          set: { enabled, updatedAt: new Date(), updatedBy: user.userId },
        });
    }
  });

  return Response.json({ ok: true });
});
