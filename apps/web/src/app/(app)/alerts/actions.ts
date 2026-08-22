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
  AlertCreateSchema,
  AlertPatchSchema,
  createAlertService,
  deleteAlertService,
  updateAlertService,
  type AlertCreateInput,
  type AlertPatchInput,
  type AlertDTO,
} from '@/lib/services/alerts';

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function createAlertAction(
  rawInput: AlertCreateInput,
): Promise<ActionResult<{ alert: AlertDTO }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  const parsed = AlertCreateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid alert input' };
  }

  try {
    const result = await createAlertService(session.user.id, parsed.data);
    revalidatePath('/alerts');
    return { ok: true, data: { alert: result.alert } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to create alert' };
  }
}

export async function toggleAlertAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ alert: AlertDTO }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  const patchInput: AlertPatchInput = {
    active,
    ...(active ? { firedAt: null } : {}),
  };

  const parsed = AlertPatchSchema.safeParse(patchInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid update input' };
  }

  try {
    const alert = await updateAlertService(session.user.id, id, parsed.data);
    if (!alert) {
      return { ok: false, error: 'Alert not found' };
    }
    revalidatePath('/alerts');
    return { ok: true, data: { alert } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update alert' };
  }
}

export async function deleteAlertAction(id: string): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  try {
    await deleteAlertService(session.user.id, id);
    revalidatePath('/alerts');
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to delete alert' };
  }
}
