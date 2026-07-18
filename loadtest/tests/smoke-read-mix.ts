// Smoke test — broad read mix (market + news + calendar + sentiment + threads + health).
// Validates script wiring + SUT connectivity across the full read surface with minimal load.
import { sleep } from 'k6';
import http from 'k6/http';
import { env } from '../config/environments.js';
import { smoke } from '../config/load-profiles.js';
import { READ_MIX, READ_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { readMix } from '../scenarios/read-mix.js';
import { handleSummary } from '../lib/summary.js';

export const options = {
  ...smoke(1, 3),
  thresholds: {
    http_req_failed: READ_MIX.httpReqFailed,
    checks: READ_MIX.checks,
    rate_limited: READ_MIX.rateLimited,
    ...READ_MIX_TAGGED_RELAXED,
  },
};

export function setup() {
  const ctxs = bootstrapAuth();

  // Warmup: prime DB connection pool, JIT compilation, and server caches
  // before any VU iterations start. Hits the broader read-mix surface.
  if (env.authMode === 'legacy') {
    http.get(`${env.baseUrl}/api/health`);
    http.get(`${env.baseUrl}/api/market/price?symbol=XAUUSD`);
    http.get(`${env.baseUrl}/api/chat/threads`);
    http.get(`${env.baseUrl}/api/news`);
  }

  return ctxs;
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
