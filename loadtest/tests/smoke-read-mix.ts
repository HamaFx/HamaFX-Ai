// Smoke test — broad read mix (market + news + calendar + sentiment + threads + health).
// Validates script wiring + SUT connectivity across the full read surface with minimal load.
import { sleep } from 'k6';
import { env } from '../config/environments.ts';
import { smoke } from '../config/load-profiles.ts';
import { READ_MIX, READ_MIX_TAGGED } from '../config/thresholds.ts';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.ts';
import { readMix } from '../scenarios/read-mix.ts';
import { handleSummary } from '../lib/summary.ts';

export const options = {
  ...smoke('smoke-read-mix', 1, 3),
  thresholds: {
    http_req_failed: READ_MIX.httpReqFailed,
    checks: READ_MIX.checks,
    rate_limited: READ_MIX.rateLimited,
    ...READ_MIX_TAGGED,
  },
};

export function setup() {
  return bootstrapAuth();
}

export default function (
  ctxs: ReturnType<typeof bootstrapAuth>,
) {
  const ctx = pickUser(ctxs);
  applyAuth(ctx);
  readMix(ctx);
  sleep(0.5);
}

export { handleSummary };
