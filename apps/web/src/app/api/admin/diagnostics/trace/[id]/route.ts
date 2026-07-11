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

import { eq } from 'drizzle-orm';

import { getDb, schema } from '@hamafx/db';

import { getAdminUser } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { admin, reason } = await getAdminUser();
  if (!admin) {
    const status = reason === 'unauthenticated' ? 401 : 403;
    const code = reason === 'unauthenticated' ? 'UNAUTHORIZED' : 'FORBIDDEN';
    const message = reason === 'unauthenticated' ? 'Authentication required' : 'Admin access required';
    return Response.json({ error: { code, message } }, { status });
  }

  const { id } = await params;

  const db = getDb();
  const [trace] = await db
    .select()
    .from(schema.diagnosticTraces)
    .where(eq(schema.diagnosticTraces.id, id));

  if (!trace) {
    return Response.json({ error: { code: 'NOT_FOUND', message: 'Trace not found' } }, { status: 404 });
  }

  return Response.json({ trace });
};
