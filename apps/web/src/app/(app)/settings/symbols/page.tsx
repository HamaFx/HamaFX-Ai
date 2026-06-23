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
import { eq, asc } from 'drizzle-orm';
import { SymbolsForm } from '../_components/symbols-form';

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

      <SymbolsForm initialSymbols={symbols} />
    </div>
  );
}
