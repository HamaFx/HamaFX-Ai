// SPDX-License-Identifier: Apache-2.0

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

import { BYOK_PROVIDERS } from '@/lib/services/api-boundary';
import { decryptByok, getUserWithSettings, updateUserSettingsField } from '@/lib/services/api-boundary';
import { PROVIDER_IDS, type ProviderId } from '@/lib/services/api-boundary';
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
    const { settings } = await getUserWithSettings(user.userId);
    return Response.json({ chatModel: settings?.chatModel ?? null });
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

  // The catalog only exposes providers with a user key. Enforce that same
  // boundary here so a forged request cannot save an unavailable provider
  // and later silently fall back to another model.
  let userSettings;
  try {
    ({ settings: userSettings } = await getUserWithSettings(user.userId));
  } catch (err) {
    return errorResponse(err);
  }
  const keys = decryptByok(userSettings?.aiApiKeys);
  const apiKey = keys?.[body.providerId];
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    return Response.json(
      { error: { message: `No API key configured for provider: ${body.providerId}` } },
      { status: 403 },
    );
  }

  // Preserve the exact catalog model id. Some providers (notably
  // OpenRouter) intentionally use slash-containing ids such as
  // "anthropic/claude-sonnet".
  const bareModelId = body.modelId.startsWith(`${body.providerId}/`)
    ? body.modelId.slice(body.providerId.length + 1)
    : body.providerId === 'vertex' && body.modelId.startsWith('google-vertex/')
      ? body.modelId.slice('google-vertex/'.length)
      : body.modelId;
  // Phase D2 — defense in depth. The picker UI filters out tier:
  // 'embedding' models, but a direct API call could still store one.
  // Chat turns can't consume an embedding model (different capability,
  // different dimension space) so reject the save up front.
  const pickedModel = (spec.models ?? []).find(
    (m: { modelId: string; tier?: string }) => m.modelId === bareModelId,
  );
  if (!pickedModel) {
    return Response.json(
      {
        error: {
          message: `Model ${body.modelId} is not in the ${body.providerId} catalog`,
        },
      },
      { status: 400 },
    );
  }
  if (pickedModel.tier === 'embedding') {
    return Response.json(
      {
        error: {
          message:
            `${body.modelId} is an embedding-only model and can't be used as a chat model. ` +
            `Pick a chat-capable model (flagship / pro / fast / lite) instead.`,
        },
      },
      { status: 400 },
    );
  }

  const value = `${body.providerId}:${bareModelId}`;
  try {
    await updateUserSettingsField(user.userId, 'chatModel', value);
    return Response.json({ ok: true, chatModel: value });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<void>(async (_req, { user }) => {
  try {
    await updateUserSettingsField(user.userId, 'chatModel', null);
    return Response.json({ ok: true, chatModel: null });
  } catch (err) {
    return errorResponse(err);
  }
});
