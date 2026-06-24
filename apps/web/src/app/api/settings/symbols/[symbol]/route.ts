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

import { withAuth, errorResponse } from '@/lib/api';
import { getDb, schema } from '@hamafx/db';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withAuth<{ symbol: string }>(async (_req, { params, user }) => {
  try {
    const { symbol } = await params;
    const db = getDb();

    await db
      .delete(schema.userSymbols)
      .where(
        and(
          eq(schema.userSymbols.userId, user.userId),
          eq(schema.userSymbols.symbol, symbol)
        )
      );

    return Response.json({ ok: true, symbol });
  } catch (err) {
    return errorResponse(err);
  }
});
