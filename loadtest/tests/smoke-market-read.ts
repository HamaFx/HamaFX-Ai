// Smoke test — market_read group (GET /api/market/* endpoints).
// Validates script wiring + SUT connectivity with minimal load.
// Run this FIRST before any other load test.
import { sleep } from 'k6';
import http from 'k6/http';
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
  const ctxs = bootstrapAuth();

  // Warmup: prime DB connection pool, JIT compilation, and server caches
  // before any VU iterations start. Raw http.get() works in setup() but
  // cookieJar() and __VU/__ITER do not.
  if (env.authMode === 'legacy') {
    http.get(`${env.baseUrl}/api/health`);
    http.get(`${env.baseUrl}/api/market/price?symbol=XAUUSD`);
    http.get(`${env.baseUrl}/api/market/candles?symbol=XAUUSD&timeframe=1h`);

    // Warm the compute-heavy POST endpoints — these benefit most from
    // a hot JIT compiler and populated DB/cache pipelines.
    http.post(
      `${env.baseUrl}/api/market/indicators`,
      JSON.stringify({
        symbol: 'XAUUSD',
        tf: '1h',
        indicators: [{ kind: 'sma', params: { period: 20 } }],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    http.post(
      `${env.baseUrl}/api/market/structure`,
      JSON.stringify({ symbol: 'XAUUSD', tf: '1h' }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  return ctxs;
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
