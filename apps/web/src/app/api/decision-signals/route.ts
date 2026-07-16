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

// /api/decision-signals — list decision signals for the authenticated user.
// GET /api/decision-signals?limit=50&status=active

import { listSignals } from '@hamafx/ai';
import { withRateLimit } from '@hamafx/db';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DECISION_SIGNALS_RATE_LIMIT = Number(process.env.DECISION_SIGNALS_RATE_LIMIT) || 60;

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    // RL-5: per-user rate limit on decision signals reads.
    const rl = await withRateLimit(user.userId, 'decision_signals', DECISION_SIGNALS_RATE_LIMIT);
    if (!rl.allowed) {
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: `Too many requests (${rl.count}/${rl.limit} per minute).` } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 100);
    const status = url.searchParams.get('status') ?? undefined;

    const signals = await listSignals(user.userId, {
      limit,
      ...(status ? { status } : {}),
    });
    return Response.json({ signals });
  } catch (err) {
    return errorResponse(err);
  }
});