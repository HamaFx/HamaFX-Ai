// Soak test — constant moderate load for extended duration.
// Detects memory leaks, latency creep, DB connection exhaustion over time.
// Never run in PR/regular CI; nightly or manual only.
import { sleep } from 'k6';
import { env } from '../config/environments.js';
import { soak } from '../config/load-profiles.js';
import { READ_MIX, READ_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { readMix } from '../scenarios/read-mix.js';
import { handleSummary } from '../lib/summary.js';

const TARGET_RPS = parseInt(__ENV['K6_TARGET_RPS'] ?? '20', 10);
const PRE_ALLOCATED_VUS = parseInt(__ENV['K6_PRE_ALLOCATED_VUS'] ?? '10', 10);
const MAX_VUS = parseInt(__ENV['K6_MAX_VUS'] ?? '60', 10);

export const options = {
  ...soak(TARGET_RPS, PRE_ALLOCATED_VUS, MAX_VUS),
  thresholds: {
    http_req_failed: ['rate<0.02'],
    checks: ['rate>0.99'],
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
  sleep(0.5);
}

export { handleSummary };
