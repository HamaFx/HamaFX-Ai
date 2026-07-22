// SPDX-License-Identifier: Apache-2.0

// /api/settings/vision-model — Phase D2 user-pickable vision model.
//
// Mirrors the chat-model endpoint exactly but writes to
// user_settings.vision_model. The PUT handler additionally validates
// that the chosen provider supports vision (provider.supports.vision)
// and that the model is in the provider's spec catalog.
//
//   GET    /api/settings/vision-model
//     → { visionModel: "<providerId>:<bareModelId>" | null }
//
//   PUT    /api/settings/vision-model
//     body: { providerId, modelId }
//     → { ok: true, visionModel: "<providerId>:<modelId>" }
//
//   DELETE /api/settings/vision-model
//     → { ok: true, visionModel: null }
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
    return Response.json({ visionModel: settings?.visionModel ?? null });
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
  // Defense in depth — vision tools can only consume vision-capable
  // models. The picker UI already filters by supports.vision, but
  // validate again here so a direct API call can't store a non-
  // vision model in the user's vision column.
  if (!spec.supports.vision) {
    return Response.json(
      {
        error: {
          message: `Provider ${body.providerId} does not support vision`,
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
    await updateUserSettingsField(user.userId, 'visionModel', value);
    return Response.json({ ok: true, visionModel: value });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<void>(async (_req, { user }) => {
  try {
    await updateUserSettingsField(user.userId, 'visionModel', null);
    return Response.json({ ok: true, visionModel: null });
  } catch (err) {
    return errorResponse(err);
  }
});