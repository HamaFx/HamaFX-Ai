// Smoke test — config mix (settings API: symbols, models, analysis mode,
// fallback chain, usage stats, provider tests).
// Validates script wiring + SUT connectivity across the full config surface.
import { sleep } from 'k6';
import http from 'k6/http';
import { env } from '../config/environments.js';
import { smoke } from '../config/load-profiles.js';
import { CONFIG_MIX, CONFIG_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { expectOk } from '../lib/checks.js';
import { configMix } from '../scenarios/config-mix.js';
import { handleSummary } from '../lib/summary.js';

export const options = {
  ...smoke(1, 5),
  thresholds: {
    http_req_failed: CONFIG_MIX.httpReqFailed,
    checks: CONFIG_MIX.checks,
    rate_limited: CONFIG_MIX.rateLimited,
    ...CONFIG_MIX_TAGGED_RELAXED,
  },
};

export function setup() {
  const ctxs = bootstrapAuth();

  // Warmup: prime DB connection pool, JIT compilation, and server caches
  // before any VU iterations start. Hits each config endpoint type once.
  if (env.authMode === 'legacy') {
    expectOk(http.get(`${env.baseUrl}/api/health`));
    expectOk(http.get(`${env.baseUrl}/api/settings/symbols`));
    expectOk(http.get(`${env.baseUrl}/api/settings/catalog`));
    expectOk(http.get(`${env.baseUrl}/api/settings/chat-model`));
    expectOk(http.get(`${env.baseUrl}/api/settings/analysis-mode`));
    expectOk(http.get(`${env.baseUrl}/api/settings/fallback-chain`));
    expectOk(http.get(`${env.baseUrl}/api/settings/usage-by-agent`));
    expectOk(http.get(`${env.baseUrl}/api/settings/usage-by-provider`));
    expectOk(http.get(`${env.baseUrl}/api/notifications/noise-config`));

    // Warm model config PUT path (may 400 if model not in spec — still primes JIT)
    expectOk(http.put(
      `${env.baseUrl}/api/settings/chat-model`,
      JSON.stringify({ providerId: 'google', modelId: 'gemini-2.5-pro' }),
      { headers: { 'Content-Type': 'application/json' } },
    ));
  }

  return ctxs;
}

export default function (
  ctxs: ReturnType<typeof bootstrapAuth>,
) {
  const ctx = pickUser(ctxs);
  applyAuth(ctx);
  configMix(ctx);
  sleep(0.5);
}

export { handleSummary };
