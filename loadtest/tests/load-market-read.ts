// Average-load test — market_read group.
// Baseline: ramp to N rps (default 50), hold 5m, ramp down.
// SLO: p95 < 500ms, p99 < 1200ms, <1% failures.
import { sleep } from 'k6';
import { env } from '../config/environments.js';
import { averageLoad } from '../config/load-profiles.js';
import { MARKET_READ, MARKET_READ_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { marketRead } from '../scenarios/market-read.js';
import { handleSummary } from '../lib/summary.js';

const TARGET_RPS = parseInt(__ENV['K6_TARGET_RPS'] ?? '50', 10);
const PRE_ALLOCATED_VUS = parseInt(__ENV['K6_PRE_ALLOCATED_VUS'] ?? '20', 10);
const MAX_VUS = parseInt(__ENV['K6_MAX_VUS'] ?? '100', 10);

export const options = {
  ...averageLoad(TARGET_RPS, PRE_ALLOCATED_VUS, MAX_VUS),
  thresholds: {
    http_req_failed: MARKET_READ.httpReqFailed,
    checks: MARKET_READ.checks,
    rate_limited: MARKET_READ.rateLimited,
    ...MARKET_READ_TAGGED_RELAXED,
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
  marketRead(ctx);
  sleep(0.3);
}

export { handleSummary };
