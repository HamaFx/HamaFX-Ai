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

// /api/settings/analysis-mode — Multi-Agent analysis mode settings.
//
//   GET    /api/settings/analysis-mode
//     → { defaultAnalysisMode, showAgentOpinions }
//
//   PATCH  /api/settings/analysis-mode
//     body: { defaultAnalysisMode?, showAgentOpinions? }
//     → { ok: true }
//
// Auth: NextAuth session gate. Per-user data only.

import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchBodySchema = z.object({
  defaultAnalysisMode: z.enum(['single', 'quick', 'standard', 'full', 'auto']).optional(),
  showAgentOpinions: z.boolean().optional(),
  agentModelOverrides: z.object({
    technical: z.string().optional(),
    fundamental: z.string().optional(),
    risk: z.string().optional(),
    sentiment: z.string().optional(),
    decision: z.string().optional(),
  }).optional(),
});

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        defaultAnalysisMode: schema.userSettings.defaultAnalysisMode,
        showAgentOpinions: schema.userSettings.showAgentOpinions,
        agentModelOverrides: schema.userSettings.agentModelOverrides,
      })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, user.userId));
    return Response.json({
      defaultAnalysisMode: row?.defaultAnalysisMode ?? 'auto',
      showAgentOpinions: row?.showAgentOpinions ?? true,
      agentModelOverrides: row?.agentModelOverrides ?? {},
    });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PATCH = withAuth<void>(async (req, { user }) => {
  let body: z.infer<typeof PatchBodySchema>;
  try {
    body = await parseJsonBody(req, PatchBodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  const updates: Record<string, unknown> = {};
  if (body.defaultAnalysisMode !== undefined) {
    updates.defaultAnalysisMode = body.defaultAnalysisMode;
  }
  if (body.showAgentOpinions !== undefined) {
    updates.showAgentOpinions = body.showAgentOpinions;
  }
  if (body.agentModelOverrides !== undefined) {
    updates.agentModelOverrides = body.agentModelOverrides;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: { message: 'No fields to update' } }, { status: 400 });
  }

  try {
    const db = getDb();
    await db
      .update(schema.userSettings)
      .set(updates)
      .where(eq(schema.userSettings.userId, user.userId));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});