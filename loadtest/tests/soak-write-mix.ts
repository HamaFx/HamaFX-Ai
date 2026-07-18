// Soak test — constant moderate write load for extended duration.
// Detects memory leaks, DB connection pool exhaustion, rate-limit creep,
// and latency degradation over hours.
// Never run in PR/regular CI; nightly or manual only.
import { sleep } from 'k6';
import { env } from '../config/environments.js';
import { soak } from '../config/load-profiles.js';
import { WRITE_MIX, WRITE_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { writeMix } from '../scenarios/write-mix.js';
import { handleSummary } from '../lib/summary.js';

const TARGET_RPS = parseInt(__ENV['K6_TARGET_RPS'] ?? '10', 10);
const PRE_ALLOCATED_VUS = parseInt(__ENV['K6_PRE_ALLOCATED_VUS'] ?? '5', 10);
const MAX_VUS = parseInt(__ENV['K6_MAX_VUS'] ?? '30', 10);

export const options = {
  ...soak(TARGET_RPS, PRE_ALLOCATED_VUS, MAX_VUS),
  thresholds: {
    http_req_failed: ['rate<0.03'],
    checks: ['rate>0.95'],
    rate_limited: WRITE_MIX.rateLimited,
    ...WRITE_MIX_TAGGED_RELAXED,
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
  writeMix(ctx);
  sleep(0.5);
}

export { handleSummary };
