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
import { PROVIDER_IDS, type ProviderId } from '@hamafx/shared/encryption';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  errorResponse,
  parseJsonBody,
  withAuth,
} from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PutBodySchema = z.object({
  fallbackChain: z.array(z.enum(PROVIDER_IDS as readonly [ProviderId, ...ProviderId[]])),
});

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const db = getDb();
    const [row] = await db
      .select({ aiFallbackChain: schema.userSettings.aiFallbackChain })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, user.userId));
    return Response.json({ fallbackChain: row?.aiFallbackChain ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PUT = withAuth<void>(async (req, { user }) => {
  let body: z.infer<typeof PutBodySchema>;
  try {
    body = await parseJsonBody(req, PutBodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  try {
    const db = getDb();
    await db
      .update(schema.userSettings)
      .set({ aiFallbackChain: body.fallbackChain })
      .where(eq(schema.userSettings.userId, user.userId));
    return Response.json({ ok: true, fallbackChain: body.fallbackChain });
  } catch (err) {
    return errorResponse(err);
  }
});
