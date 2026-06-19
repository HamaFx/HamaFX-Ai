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

import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq, asc, and } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { revalidatePath } from 'next/cache';
import { Trash } from 'lucide-react';

async function addSymbol(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  let symbol = formData.get('symbol') as string;
  if (!symbol) return;
  symbol = symbol.trim().toUpperCase();

  const db = getDb();
  
  // Find highest displayOrder
  const existing = await db.select({ displayOrder: schema.userSymbols.displayOrder })
    .from(schema.userSymbols)
    .where(eq(schema.userSymbols.userId, session.user.id))
    .orderBy(asc(schema.userSymbols.displayOrder));
    
  const nextOrder = existing.length > 0 ? (existing[existing.length - 1]?.displayOrder ?? 0) + 1 : 0;

  try {
    await db.insert(schema.userSymbols).values({
      userId: session.user.id,
      symbol,
      displayOrder: nextOrder,
    }).onConflictDoNothing();
  } catch {
    // ignore
  }

  revalidatePath('/settings/symbols');
}

async function removeSymbol(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const symbol = formData.get('symbol') as string;
  if (!symbol) return;

  const db = getDb();
  await db.delete(schema.userSymbols)
    .where(
      and(
        eq(schema.userSymbols.userId, session.user.id),
        eq(schema.userSymbols.symbol, symbol)
      )
    );
    
  // Since we only have `eq`, we'll need to drop down to sql`...` or use `and` from drizzle-orm
  revalidatePath('/settings/symbols');
}

export default async function SymbolsSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const db = getDb();
  const symbols = await db.select()
    .from(schema.userSymbols)
    .where(eq(schema.userSymbols.userId, session.user.id))
    .orderBy(asc(schema.userSymbols.displayOrder));

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-fg">Symbols Watchlist</h2>
        <p className="text-sm text-fg-subtle">Manage the instruments you want to track.</p>
      </div>

      <div className="card-premium p-4 flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {symbols.map((s) => (
            <li key={s.symbol} className="flex items-center justify-between p-3 rounded-md bg-surface border border-surface-elevated">
              <span className="font-mono text-sm font-medium">{s.symbol}</span>
              <form action={removeSymbol}>
                <input type="hidden" name="symbol" value={s.symbol} />
                <Button variant="ghost" type="submit" className="h-8 w-8 p-0 text-fg-subtle hover:text-red-500">
                  <Trash className="size-4" />
                </Button>
              </form>
            </li>
          ))}
          {symbols.length === 0 && (
            <div className="text-center p-4 text-sm text-fg-subtle">
              Your watchlist is empty.
            </div>
          )}
        </ul>

        <form action={addSymbol} className="flex gap-2 pt-2 border-t border-surface-elevated mt-2">
          <Input name="symbol" placeholder="e.g. BTCUSD" className="flex-1" />
          <Button type="submit">Add Symbol</Button>
        </form>
      </div>
    </div>
  );
}
