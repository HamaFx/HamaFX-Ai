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

import { evaluateAlerts } from '@hamafx/ai';

import type { JobContext, JobResult } from './types.js';

export async function runAlerts(ctx: JobContext): Promise<JobResult> {
  // Build args conditionally to satisfy exactOptionalPropertyTypes:
  // the receiving type uses `signal?: AbortSignal` (not `| undefined`),
  // so passing `{ signal: undefined }` is rejected. Omit the key instead.
  const result = await evaluateAlerts(ctx.signal ? { signal: ctx.signal } : {});
  
  ctx.log.info('alerts evaluated', {
    total: result.total,
    matched: result.matched,
    fired: result.fired,
    skipped: result.skipped,
    errors: result.errors.length,
  });

  return {
    processed: result.total,
    note: `matched=${result.matched}, fired=${result.fired}, errors=${result.errors.length}`,
  };
}
