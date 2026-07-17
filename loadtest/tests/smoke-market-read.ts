// Smoke test — market_read group (GET /api/market/* endpoints).
// Validates script wiring + SUT connectivity with minimal load.
// Run this FIRST before any other load test.
import { sleep } from 'k6';
import { env } from '../config/environments.ts';
import { smoke } from '../config/load-profiles.ts';
import { MARKET_READ, MARKET_READ_TAGGED } from '../config/thresholds.ts';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.ts';
import { marketRead } from '../scenarios/market-read.ts';
import { handleSummary } from '../lib/summary.ts';

export const options = {
  ...smoke('smoke-market-read', 1, 3),
  thresholds: {
    http_req_failed: MARKET_READ.httpReqFailed,
    checks: MARKET_READ.checks,
    rate_limited: MARKET_READ.rateLimited,
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
  sleep(0.5);
}

export { handleSummary };
