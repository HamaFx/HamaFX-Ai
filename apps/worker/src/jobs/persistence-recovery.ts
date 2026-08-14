/**
 * Copyright 2026 Kestrel
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

// Phase 5 — replay failed messages, opinions, telemetry, and traces.

import { replayPersistenceFailures } from '@kestrel/ai';

import type { JobContext, JobResult } from './types.js';

const REPLAY_BATCH_SIZE = 25;

export async function runPersistenceRecovery(ctx: JobContext): Promise<JobResult> {
  const result = await replayPersistenceFailures(REPLAY_BATCH_SIZE);

  if (result.claimed > 0 || result.dead > 0) {
    ctx.log.warn('persistence outbox replay completed', result);
  } else {
    ctx.log.info('persistence outbox replay found no due records');
  }

  return {
    processed: result.completed,
    note: `claimed=${result.claimed} completed=${result.completed} failed=${result.failed} dead=${result.dead}`,
  };
}
