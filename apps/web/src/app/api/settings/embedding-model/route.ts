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

// /api/settings/embedding-model — Phase D2 user-pickable embedding model.
//
// Same shape as chat-model + vision-model. PUT validates that the
// provider supports embedding AND the model is in the spec catalog.
//
//   GET    /api/settings/embedding-model
//     → { embeddingModel: "<providerId>:<bareModelId>" | null }
//
//   PUT    /api/settings/embedding-model
//     body: { providerId, modelId }
//     → { ok: true, embeddingModel: "<providerId>:<modelId>" }
//
//   DELETE /api/settings/embedding-model
//     → { ok: true, embeddingModel: null }   (falls back to operator
//                                             env.AI_EMBEDDING_MODEL
//                                             or the hardcoded default)
//
// Auth: NextAuth session gate. Per-user data only.

import { BYOK_PROVIDERS } from '@hamafx/ai';
import { getUserWithSettings, updateUserSettingsField } from '@hamafx/db';
import { PROVIDER_IDS, type ProviderId } from '@hamafx/shared/encryption';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PutBodySchema = z.object({
  providerId: z.enum(PROVIDER_IDS as readonly [ProviderId, ...ProviderId[]]),
  modelId: z.string().min(1).max(120),
});

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const { settings } = await getUserWithSettings(user.userId);
    return Response.json({ embeddingModel: settings?.embeddingModel ?? null });
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
  // Defense in depth — embeddings only work on embedding-capable
  // providers. (Some providers host embedding models without
  // exposes them in the spec; this guards against a typo.)
  if (!spec.supports.embedding) {
    return Response.json(
      {
        error: {
          message: `Provider ${body.providerId} does not support embedding`,
        },
      },
      { status: 400 },
    );
  }
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
    await updateUserSettingsField(user.userId, 'embeddingModel', value);
    return Response.json({ ok: true, embeddingModel: value });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<void>(async (_req, { user }) => {
  try {
    await updateUserSettingsField(user.userId, 'embeddingModel', null);
    return Response.json({ ok: true, embeddingModel: null });
  } catch (err) {
    return errorResponse(err);
  }
});