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

// /api/journal/review — generate an AI post-trade review for a closed journal entry.
// POST { id: string }

import { getEntry, reviewTrade } from '@hamafx/ai';
import { getUserWithSettings } from '@hamafx/db';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ReviewSchema = z.object({
  id: z.string().uuid(),
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const { id } = await parseJsonBody(req, ReviewSchema);

    const entry = await getEntry(user.userId, id);
    if (!entry) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'entry not found' } },
        { status: 404 },
      );
    }

    if (entry.outcome === 'open') {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: 'Cannot review an open trade; close it first.' } },
        { status: 400 },
      );
    }

    const { settings: userSettings } = await getUserWithSettings(user.userId);

    if (!userSettings) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'user settings not found' } },
        { status: 404 },
      );
    }

    const env = getServerEnv();
    const result = await reviewTrade({
      userId: user.userId,
      entry,
      userSettings,
      env,
      signal: req.signal,
    });

    return Response.json({ review: result });
  } catch (err) {
    return errorResponse(err);
  }
});
