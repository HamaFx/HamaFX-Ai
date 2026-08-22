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
  JournalCreateSchema,
  JournalPatchSchema,
  createJournalEntryService,
  deleteJournalEntryService,
  updateJournalEntryService,
  type JournalCreateInput,
  type JournalPatchInput,
  type EntryDTO,
} from '@/lib/services/journal';

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function createJournalEntryAction(
  rawInput: JournalCreateInput,
): Promise<ActionResult<{ entry: EntryDTO }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  const parsed = JournalCreateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid journal input' };
  }

  try {
    const entry = await createJournalEntryService(session.user.id, parsed.data);
    revalidatePath('/journal');
    return { ok: true, data: { entry } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to create journal entry' };
  }
}

export async function updateJournalEntryAction(
  id: string,
  rawInput: JournalPatchInput,
): Promise<ActionResult<{ entry: EntryDTO }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  const parsed = JournalPatchSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid journal input' };
  }

  try {
    const entry = await updateJournalEntryService(session.user.id, id, parsed.data);
    if (!entry) {
      return { ok: false, error: 'Journal entry not found' };
    }
    revalidatePath('/journal');
    return { ok: true, data: { entry } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update journal entry' };
  }
}

export async function deleteJournalEntryAction(id: string): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  try {
    const deleted = await deleteJournalEntryService(session.user.id, id);
    if (!deleted) {
      return { ok: false, error: 'Journal entry not found' };
    }
    revalidatePath('/journal');
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to delete journal entry' };
  }
}
