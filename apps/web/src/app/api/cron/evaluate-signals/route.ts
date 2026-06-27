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

// GET /api/cron/evaluate-signals — evaluates active decision signals
// past their horizon against actual price movement.
//
// Cadence: daily at 1 AM UTC (vercel.json crons).
// Idempotent: ON CONFLICT DO NOTHING on (signal_id, horizon).

import { evaluatePendingSignals } from '@hamafx/ai';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const result = await evaluatePendingSignals();
    return {
      processed: result.processed,
      note: result.note,
    };
  });
}