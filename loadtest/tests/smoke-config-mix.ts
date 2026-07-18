// Smoke test — config mix (settings API: symbols, models, analysis mode,
// fallback chain, usage stats, provider tests).
// Validates script wiring + SUT connectivity across the full config surface.
import { sleep } from 'k6';
import http from 'k6/http';
import { env } from '../config/environments.js';
import { smoke } from '../config/load-profiles.js';
import { CONFIG_MIX, CONFIG_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
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
    http.get(`${env.baseUrl}/api/health`);
    http.get(`${env.baseUrl}/api/settings/symbols`);
    http.get(`${env.baseUrl}/api/settings/catalog`);
    http.get(`${env.baseUrl}/api/settings/chat-model`);
    http.get(`${env.baseUrl}/api/settings/analysis-mode`);
    http.get(`${env.baseUrl}/api/settings/fallback-chain`);
    http.get(`${env.baseUrl}/api/settings/usage-by-agent`);
    http.get(`${env.baseUrl}/api/settings/usage-by-provider`);
    http.get(`${env.baseUrl}/api/notifications/noise-config`);

    // Warm model config PUT path (may 400 if model not in spec — still primes JIT)
    http.put(
      `${env.baseUrl}/api/settings/chat-model`,
      JSON.stringify({ providerId: 'google', modelId: 'gemini-2.5-pro' }),
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
  configMix(ctx);
  sleep(0.5);
}

export { handleSummary };
