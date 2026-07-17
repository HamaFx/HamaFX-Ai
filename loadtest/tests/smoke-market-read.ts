// Smoke test — market_read group (GET /api/market/* endpoints).
// Validates script wiring + SUT connectivity with minimal load.
// Run this FIRST before any other load test.
import { sleep } from 'k6';
import { env } from '../config/environments.js';
import { smoke } from '../config/load-profiles.js';
import { MARKET_READ, MARKET_READ_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { marketRead } from '../scenarios/market-read.js';
import { handleSummary } from '../lib/summary.js';

export const options = {
  ...smoke(1, 3),
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
  sleep(0.5);
}

export { handleSummary };
