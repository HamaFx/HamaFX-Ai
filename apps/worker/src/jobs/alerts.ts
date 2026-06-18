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
