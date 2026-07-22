// Smoke test — write mix (POST-heavy endpoints: alerts, threads, journal,
// portfolio, onboarding, push subscribe, decision signals).
// Validates script wiring + SUT connectivity with minimal load.
// Run this FIRST before any write-path load test.
//
// Warmup phase creates seed resources so subsequent VU iterations have
// existing data to work with.
import { sleep } from 'k6';
import http from 'k6/http';
import { env } from '../config/environments.js';
import { smoke } from '../config/load-profiles.js';
import { WRITE_MIX, WRITE_MIX_TAGGED_RELAXED } from '../config/thresholds.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { expectOk } from '../lib/checks.js';
import { writeMix } from '../scenarios/write-mix.js';
import { handleSummary } from '../lib/summary.js';

export const options = {
  ...smoke(1, 5),
  thresholds: {
    http_req_failed: WRITE_MIX.httpReqFailed,
    checks: WRITE_MIX.checks,
    rate_limited: WRITE_MIX.rateLimited,
    ...WRITE_MIX_TAGGED_RELAXED,
  },
};

export function setup() {
  const ctxs = bootstrapAuth();

  // Warmup: prime DB connection pool, JIT compilation, and server caches
  // before any VU iterations start. Creates seed data so GET/PATCH/DELETE
  // endpoints have resources to operate on.
  if (env.authMode === 'legacy') {
    // 1. Prime health + general readiness
    expectOk(http.get(`${env.baseUrl}/api/health`));

    // 2. Create a seed thread (will be used by GET/PATCH/POST/fork in VU iterations)
    const threadRes = http.post(
      `${env.baseUrl}/api/chat/threads`,
      JSON.stringify({ pinnedSymbol: 'XAUUSD' }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    let threadId: string | null = null;
    try {
      const body = JSON.parse(threadRes.body as string);
      threadId = body.thread?.id ?? null;
    } catch {
      // ignore parse failures
    }

    // 3. Warm the compute-heavy POST endpoints.
    expectOk(http.post(
      `${env.baseUrl}/api/alerts/preview`,
      JSON.stringify({
        rule: { type: 'priceCross', symbol: 'XAUUSD', direction: 'above', level: 2100 },
        lookbackDays: 30,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ));
    expectOk(http.post(
      `${env.baseUrl}/api/alerts`,
      JSON.stringify({
        rule: { type: 'priceCross', symbol: 'XAUUSD', direction: 'above', level: 2100 },
        channels: ['email'],
        note: 'k6 warmup',
        snoozeHours: 0,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ));
    expectOk(http.post(
      `${env.baseUrl}/api/journal`,
      JSON.stringify({
        symbol: 'XAUUSD',
        side: 'long',
        openedAt: Date.now() - 86400000 * 7,
        entry: 1950,
        stop: 1900,
        target: 2050,
        size: 1,
        notes: 'k6 warmup entry',
        tags: ['k6', 'warmup'],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ));
    expectOk(http.post(
      `${env.baseUrl}/api/portfolio/positions`,
      JSON.stringify({
        symbol: 'XAUUSD',
        direction: 'long',
        entryPrice: 1950,
        stopLoss: 1900,
        takeProfit: 2050,
        lotSize: 1,
        openedAt: Date.now(),
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ));
    expectOk(http.post(
      `${env.baseUrl}/api/onboarding/save-progress`,
      JSON.stringify({
        step: 5,
        name: 'k6 warmup user',
        timezone: 'UTC',
        tradingStyle: 'swing',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ));
    expectOk(http.post(
      `${env.baseUrl}/api/journal/import`,
      JSON.stringify({
        trades: [
          { symbol: 'XAUUSD', side: 'long', entry: 1930, stop: 1900, target: 2000, exit: 2010, size: 2, openedAt: Date.now() - 86400000 * 14, closedAt: Date.now() - 86400000 * 7, notes: 'k6 warmup import' },
          { symbol: 'EURUSD', side: 'short', entry: 1.08, stop: 1.09, target: 1.05, exit: 1.04, size: 50000, openedAt: Date.now() - 86400000 * 10, closedAt: Date.now() - 86400000 * 5, notes: 'k6 warmup import 2' },
        ],
      }),
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
  writeMix(ctx);
  sleep(0.5);
}

export { handleSummary };
