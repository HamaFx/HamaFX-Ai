// Average-load test — config mix.
// Baseline for regression comparison on settings/config endpoints.
// Settings operations are lightweight reads with occasional config writes.
import { sleep } from 'k6';
import { env } from '../config/environments.js';
import { averageLoad } from '../config/load-profiles.js';
import { CONFIG_MIX, CONFIG_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { configMix } from '../scenarios/config-mix.js';
import { handleSummary } from '../lib/summary.js';

const TARGET_RPS = parseInt(__ENV['K6_TARGET_RPS'] ?? '30', 10);
const PRE_ALLOCATED_VUS = parseInt(__ENV['K6_PRE_ALLOCATED_VUS'] ?? '10', 10);
const MAX_VUS = parseInt(__ENV['K6_MAX_VUS'] ?? '40', 10);

export const options = {
  ...averageLoad(TARGET_RPS, PRE_ALLOCATED_VUS, MAX_VUS),
  thresholds: {
    http_req_failed: CONFIG_MIX.httpReqFailed,
    checks: CONFIG_MIX.checks,
    rate_limited: CONFIG_MIX.rateLimited,
    ...CONFIG_MIX_TAGGED_RELAXED,
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
  configMix(ctx);
  sleep(0.3);
}

export { handleSummary };
