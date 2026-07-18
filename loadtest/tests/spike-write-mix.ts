// Spike test — sharp 0→peak→0 write-mix surge.
// Validates the SUT recovers after a sudden burst of write operations.
// Defaults chosen for 20 RPS × 1s iterations = 20 VUs with headroom.
import { sleep } from 'k6';
import { spike } from '../config/load-profiles.js';
import { WRITE_MIX, WRITE_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { writeMix } from '../scenarios/write-mix.js';
import { handleSummary } from '../lib/summary.js';

const PEAK_RPS = parseInt(__ENV['K6_SPIKE_RPS'] ?? '20', 10);
const PRE_ALLOCATED_VUS = parseInt(__ENV['K6_PRE_ALLOCATED_VUS'] ?? '15', 10);
const MAX_VUS = parseInt(__ENV['K6_MAX_VUS'] ?? '40', 10);

export const options = {
  ...spike(PEAK_RPS, '20s', '1m', PRE_ALLOCATED_VUS, MAX_VUS),
  thresholds: {
    http_req_failed: ['rate<0.08'], // spike tolerance — writes are brittle
    checks: ['rate>0.90'],
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
  sleep(0.2);
}

export { handleSummary };
