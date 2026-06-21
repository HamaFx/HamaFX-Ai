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

// /api/settings/chat-model — Phase F single-model picker.
//
//   GET    /api/settings/chat-model
//     → { chatModel: "<providerId>:<bareModelId>" | null }
//
//   PUT    /api/settings/chat-model
//     body: { providerId: ProviderId, modelId: string }
//     → { ok: true, chatModel: "<providerId>:<modelId>" }
//
//   DELETE /api/settings/chat-model
//     → { ok: true, chatModel: null }   (falls back to spec defaults)
//
// Auth: NextAuth session gate. Per-user data only.

import { BYOK_PROVIDERS } from '@hamafx/ai';
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
  providerId: z.enum(PROVIDER_IDS as readonly [ProviderId, ...ProviderId[]]),
  modelId: z.string().min(1).max(120),
});

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const db = getDb();
    const [row] = await db
      .select({ chatModel: schema.userSettings.chatModel })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, user.userId));
    return Response.json({ chatModel: row?.chatModel ?? null });
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

  const spec = BYOK_PROVIDERS[body.providerId];
  if (!spec) {
    return Response.json(
      { error: { message: `Unknown provider: ${body.providerId}` } },
      { status: 400 },
    );
  }
  // Models with provider prefix (OpenRouter, Vertex) come in as
  // "<provider>/<bare>" — strip the prefix before lookup so the spec
  // catalog (which stores bare ids) matches.
  const bareModelId = body.modelId.includes('/')
    ? body.modelId.split('/').slice(1).join('/')
    : body.modelId;
  const known = (spec.models ?? []).some(
    (m: { modelId: string }) => m.modelId === bareModelId,
  );
  if (!known) {
    return Response.json(
      {
        error: {
          message: `Model ${body.modelId} is not in the ${body.providerId} catalog`,
        },
      },
      { status: 400 },
    );
  }

  const value = `${body.providerId}:${bareModelId}`;
  try {
    const db = getDb();
    await db
      .update(schema.userSettings)
      .set({ chatModel: value })
      .where(eq(schema.userSettings.userId, user.userId));
    return Response.json({ ok: true, chatModel: value });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<void>(async (_req, { user }) => {
  try {
    const db = getDb();
    await db
      .update(schema.userSettings)
      .set({ chatModel: null })
      .where(eq(schema.userSettings.userId, user.userId));
    return Response.json({ ok: true, chatModel: null });
  } catch (err) {
    return errorResponse(err);
  }
});
