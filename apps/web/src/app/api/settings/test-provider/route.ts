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

import { testProviderKey } from '@hamafx/ai';
import { PROVIDER_IDS, type ProviderId } from '@hamafx/shared/encryption';
import { getDb, schema } from '@hamafx/db';
import { and, eq } from 'drizzle-orm';
import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  provider: z.enum(PROVIDER_IDS as readonly [ProviderId, ...ProviderId[]]),
  apiKey: z.string().min(8, 'API key is too short').max(512),
});

export const POST = withAuth<void>(async (req, { user }) => {
  let body: z.infer<typeof BodySchema>;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  const result = await testProviderKey(body.provider, body.apiKey);

  // Phase A — UX_UPGRADE_PLAN.md item 7. Upsert the latest test
  // result for this (user, provider). Idempotent: re-testing
  // overwrites the previous row rather than accumulating history.
  // The health badge on /settings/api-keys reads from this table.
  const db = getDb();
  const testedAt = new Date();
  await db
    .delete(schema.providerTests)
    .where(
      and(
        eq(schema.providerTests.userId, user.userId),
        eq(schema.providerTests.providerId, body.provider),
      ),
    );
  await db.insert(schema.providerTests).values({
    userId: user.userId,
    providerId: body.provider,
    ok: result.ok,
    error: result.ok ? null : (result.error ?? 'unknown error'),
    testedAt: testedAt.toISOString(),
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }
  return Response.json({ ok: true });
});
