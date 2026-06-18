'use server';

import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function completeOnboardingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  // Capture once so the narrowing survives inside the transaction callback.
  const userId = session.user.id;

  // const _name = formData.get('name') as string;
  const timezone = formData.get('timezone') as string;
  const defaultSymbol = formData.get('defaultSymbol') as string;

  const db = getDb();

  await db.transaction(async (tx) => {
    // 1. Skip user name update in self-hosted mode
    // if (name && name !== session.user.name) {
    //   await tx.update(schema.users)
    //     .set({ name })
    //     .where(eq(schema.users.id, userId));
    // }

    // 2. Insert or update user settings
    const existing = await tx.select({ userId: schema.userSettings.userId })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId));

    if (existing.length === 0) {
      await tx.insert(schema.userSettings).values({
        userId,
        defaultSymbol: defaultSymbol || 'XAUUSD',
        timezone: timezone || 'UTC',
        onboardingCompleted: true,
      });
    } else {
      await tx.update(schema.userSettings)
        .set({
          defaultSymbol: defaultSymbol || 'XAUUSD',
          timezone: timezone || 'UTC',
          onboardingCompleted: true,
        })
        .where(eq(schema.userSettings.userId, userId));
    }

    // 3. Add default watchlists
    const defaultWatchlist = ['XAUUSD', 'EURUSD', 'GBPUSD'];
    // We try to insert these silently (on conflict do nothing)
    try {
      await tx.insert(schema.userSymbols).values(
        defaultWatchlist.map((symbol, i) => ({
          userId,
          symbol,
          displayOrder: i,
        }))
      ).onConflictDoNothing();
    } catch {
      // ignore
    }
  });

  revalidatePath('/');
  return { success: true };
}
