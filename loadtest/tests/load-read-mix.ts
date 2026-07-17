// Average-load test — broad read mix.
// Baseline for regression comparison.
import { sleep } from 'k6';
import { env } from '../config/environments.js';
import { averageLoad } from '../config/load-profiles.js';
import { READ_MIX, READ_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { readMix } from '../scenarios/read-mix.js';
import { handleSummary } from '../lib/summary.js';

const TARGET_RPS = parseInt(__ENV['K6_TARGET_RPS'] ?? '30', 10);
const PRE_ALLOCATED_VUS = parseInt(__ENV['K6_PRE_ALLOCATED_VUS'] ?? '15', 10);
const MAX_VUS = parseInt(__ENV['K6_MAX_VUS'] ?? '80', 10);

export const options = {
  ...averageLoad(TARGET_RPS, PRE_ALLOCATED_VUS, MAX_VUS),
  thresholds: {
    http_req_failed: READ_MIX.httpReqFailed,
    checks: READ_MIX.checks,
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
