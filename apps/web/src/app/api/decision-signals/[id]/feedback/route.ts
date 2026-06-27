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

// /api/decision-signals/[id]/feedback — user thumbs-up/down on a signal.
// POST { feedback: 'useful' | 'not_useful' }

import { getSignal, recordFeedback } from '@hamafx/ai';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FeedbackSchema = z.object({
  feedback: z.enum(['useful', 'not_useful']),
});

export const POST = withAuth<{ id: string }>(async (req, { user, params }) => {
  try {
    const { id } = await params;
    const { feedback } = await parseJsonBody(req, FeedbackSchema);

    // Verify the signal belongs to the user (IDOR guard).
    const signal = await getSignal(user.userId, id);
    if (!signal) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Signal not found' } },
        { status: 404 },
      );
    }

    await recordFeedback(user.userId, id, feedback);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});