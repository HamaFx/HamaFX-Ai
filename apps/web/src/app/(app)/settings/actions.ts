'use server';

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

import { deleteAllThreads } from '@hamafx/ai';
import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq, asc, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

const NAME_MIN = 1;
const NAME_MAX = 80;

/**
 * Server action to delete all chat history.
 */
export async function clearChatHistoryAction() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: 'Unauthorized',
    };
  }

  try {
    await deleteAllThreads(session.user.id);
    return { ok: true as const };
  } catch (err) {
    console.error('[settings] clearChatHistoryAction failed', err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to update user profile.
 */
export async function updateProfileAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const raw = formData.get('name');
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return {
      ok: false as const,
      error: `Name must be between ${NAME_MIN} and ${NAME_MAX} characters`,
    };
  }

  if (name === session.user.name) {
    revalidatePath('/settings/profile');
    return { ok: true as const };
  }

  try {
    const db = getDb();
    await db
      .update(schema.users)
      .set({ name })
      .where(eq(schema.users.id, session.user.id));

    revalidatePath('/settings/profile');
    return { ok: true as const };
  } catch (err) {
    console.error('[settings] updateProfile failed', err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to add a symbol to watchlist.
 */
export async function addSymbolAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  let symbol = formData.get('symbol') as string;
  if (!symbol) {
    return { ok: false as const, error: 'Symbol is required' };
  }
  symbol = symbol.trim().toUpperCase();

  try {
    const db = getDb();
    
    // Find highest displayOrder
    const existing = await db.select({ displayOrder: schema.userSymbols.displayOrder })
      .from(schema.userSymbols)
      .where(eq(schema.userSymbols.userId, session.user.id))
      .orderBy(asc(schema.userSymbols.displayOrder));
      
    const nextOrder = existing.length > 0 ? (existing[existing.length - 1]?.displayOrder ?? 0) + 1 : 0;

    await db.insert(schema.userSymbols).values({
      userId: session.user.id,
      symbol,
      displayOrder: nextOrder,
    }).onConflictDoNothing({
      target: [schema.userSymbols.userId, schema.userSymbols.symbol],
    });

    revalidatePath('/settings/symbols');
    return { ok: true as const };
  } catch (err) {
    console.error('[settings] addSymbol failed', err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to remove a symbol from watchlist.
 */
export async function removeSymbolAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const symbol = formData.get('symbol') as string;
  if (!symbol) {
    return { ok: false as const, error: 'Symbol is required' };
  }

  try {
    const db = getDb();
    await db.delete(schema.userSymbols)
      .where(
        and(
          eq(schema.userSymbols.userId, session.user.id),
          eq(schema.userSymbols.symbol, symbol)
        )
      );

    revalidatePath('/settings/symbols');
    return { ok: true as const };
  } catch (err) {
    console.error('[settings] removeSymbol failed', err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
