// Spike test — sharp 0→peak→0 read mix surge.
// Validates the SUT recovers after a sudden traffic burst.
// VU sizing: readMix iterations take ~1-2s (multiple sequential HTTP calls).
// At PEAK_RPS with 1.5s iterations you need ~PEAK_RPS × 1.5 concurrent VUs.
// Defaults chosen for 50 RPS × 1.5s = 75 VUs with headroom.
import { sleep } from 'k6';
import { env } from '../config/environments.js';
import { spike } from '../config/load-profiles.js';
import { READ_MIX, READ_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { readMix } from '../scenarios/read-mix.js';
import { handleSummary } from '../lib/summary.js';

const PEAK_RPS = parseInt(__ENV['K6_SPIKE_RPS'] ?? '50', 10);
const PRE_ALLOCATED_VUS = parseInt(__ENV['K6_PRE_ALLOCATED_VUS'] ?? '30', 10);
const MAX_VUS = parseInt(__ENV['K6_MAX_VUS'] ?? '80', 10);

export const options = {
  ...spike(PEAK_RPS, '20s', '1m', PRE_ALLOCATED_VUS, MAX_VUS),
  thresholds: {
    http_req_failed: ['rate<0.05'], // spike tolerance
    checks: ['rate>0.95'],
    rate_limited: READ_MIX.rateLimited,
    ...READ_MIX_TAGGED_RELAXED,
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
  sleep(0.2);
}

export { handleSummary };
