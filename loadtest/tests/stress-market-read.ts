// Stress test — find the throughput ceiling.
// Ramps arrival-rate through steps (50→100→200→400 rps) until thresholds break.
// The GOAL is to observe where failures climb, not to pass every step.
// Use --no-thresholds to keep running after first breach.
import { sleep } from 'k6';
import { env } from '../config/environments.ts';
import { stress } from '../config/load-profiles.ts';
import { STRESS, MARKET_READ_TAGGED } from '../config/thresholds.ts';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.ts';
import { marketRead } from '../scenarios/market-read.ts';
import { handleSummary } from '../lib/summary.ts';

const RPS_STEPS = (__ENV['K6_STRESS_STEPS'] ?? '50,100,200,400')
  .split(',')
  .map(Number);

const PRE_ALLOCATED_VUS = parseInt(__ENV['K6_PRE_ALLOCATED_VUS'] ?? '50', 10);
const MAX_VUS = parseInt(__ENV['K6_MAX_VUS'] ?? '250', 10);

export const options = {
  ...stress('stress-market-read', RPS_STEPS, '1m', PRE_ALLOCATED_VUS, MAX_VUS),
  thresholds: {
    http_req_failed: STRESS.httpReqFailed,
    checks: STRESS.checks,
    rate_limited: STRESS.rateLimited,
    ...MARKET_READ_TAGGED,
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
  sleep(0.1);
}

export { handleSummary };
