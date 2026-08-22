'use server';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import 'server-only';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import {
  BYOK_PROVIDERS,
  updateUserSettingsField,
  type ProviderId,
} from '@/lib/services/api-boundary';
import { getDb, schema } from '@kestrel/db';
import { eq } from 'drizzle-orm';
import type { ActionResult } from './_actions-shared';

export async function updateChatModelAction(
  providerId: ProviderId,
  modelId: string,
): Promise<ActionResult<{ chatModel: string | null }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  const spec = BYOK_PROVIDERS[providerId];
  if (!spec) {
    return { ok: false, error: `Unknown provider: ${providerId}` };
  }

  const bareModelId = modelId.startsWith(`${providerId}/`)
    ? modelId.slice(providerId.length + 1)
    : providerId === 'vertex' && modelId.startsWith('google-vertex/')
      ? modelId.slice('google-vertex/'.length)
      : modelId;

  const value = `${providerId}:${bareModelId}`;

  try {
    await updateUserSettingsField(session.user.id, 'chatModel', value);
    revalidatePath('/settings');
    return { ok: true, data: { chatModel: value } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update chat model' };
  }
}

export async function clearChatModelAction(): Promise<ActionResult<{ chatModel: null }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  try {
    await updateUserSettingsField(session.user.id, 'chatModel', null);
    revalidatePath('/settings');
    return { ok: true, data: { chatModel: null } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to reset chat model' };
  }
}

export async function resetOnboardingAction(
  options: { soft?: boolean } = {},
): Promise<ActionResult<{ reset: boolean }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  const db = getDb();
  try {
    if (options.soft) {
      await db
        .update(schema.userSettings)
        .set({ onboardingCompleted: false })
        .where(eq(schema.userSettings.userId, session.user.id));
    } else {
      await db
        .update(schema.userSettings)
        .set({
          onboardingCompleted: false,
          onboardingProgress: {},
        })
        .where(eq(schema.userSettings.userId, session.user.id));
    }

    revalidatePath('/settings');
    revalidatePath('/onboarding');
    return { ok: true, data: { reset: true } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to reset onboarding' };
  }
}
