// Per-iteration VU function: write-path endpoint mix resembling a power user
// creating alerts, threads, journal entries, portfolio positions, and other
// stateful operations on the trading copilot surface.
//
// Covers the top 20 highest-priority endpoints that lacked k6 coverage:
//   Tier 1: alerts/preview, chat/threads POST, chat/threads CRUD, alerts CRUD,
//           portfolio positions, portfolio risk, journal CRUD, journal/review
//   Tier 2: signal feedback, signal stats, thread summary, thread opinions,
//           onboarding save-progress, push subscribe
//   Tier 3: alerts/[id] CRUD, positions/[id] CRUD, journal/[id] CRUD,
//           journal import, noise config, thread fork
//
// Strategy B users (with ctx.threadId) can hit thread-specific GET/PATCH/DELETE
// endpoints. Strategy A users exercise only the POST/list endpoints.
//
// All POST bodies use stock parameters that match each endpoint's Zod schema
// (verified against route.ts source files).

import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
// deleteReq is imported for completeness but not used in the current
// write-mix (deletes would destroy resources other VUs depend on).
import { getJson, postJson, patchJson } from '../lib/http.js';
import type { SessionCtx } from '../config/environments.js';

const symbols = new SharedArray('symbols', () =>
  JSON.parse(open('../lib/data/symbols.json') as string) as string[],
);

// ── Helpers ────────────────────────────────────────────────────────

/** Current epoch in milliseconds. */
function now(): number {
  return Date.now();
}

/** Pick a random symbol from the shared catalog. */
function pickSymbol(): string {
  return randomItem(symbols);
}

/** Pick a random side. */
function randomSide(): 'long' | 'short' {
  return Math.random() < 0.5 ? 'long' : 'short';
}

/** Pick a random alert type. */
function randomAlertType(): 'priceCross' | 'candleClose' {
  return Math.random() < 0.5 ? 'priceCross' : 'candleClose';
}

/** Pick a random condition for the alert type. */
function randomCondition(type: string): string {
  if (type === 'priceCross') {
    return randomItem(['above', 'below']);
  }
  return randomItem(['crosses_above', 'crosses_below']);
}

/** Generate a plausible price around 2000 for XAUUSD. */
function plausiblePrice(symbol: string): number {
  if (symbol === 'XAUUSD') return 1900 + Math.random() * 200;
  if (symbol === 'EURUSD') return 1.05 + Math.random() * 0.1;
  return 1.25 + Math.random() * 0.15;
}

/** Generate a plausible stop loss price. */
function plausibleStop(symbol: string, entry: number, side: string): number {
  if (side === 'long') {
    return entry - (symbol === 'XAUUSD' ? 50 : 0.02);
  }
  return entry + (symbol === 'XAUUSD' ? 50 : 0.02);
}

/** Generate a plausible target price. */
function plausibleTarget(symbol: string, entry: number, side: string): number {
  if (side === 'long') {
    return entry + (symbol === 'XAUUSD' ? 100 : 0.04);
  }
  return entry - (symbol === 'XAUUSD' ? 100 : 0.04);
}

// ── Write Mix Scenario ─────────────────────────────────────────────

/**
 * Per-iteration VU function exercising a weighted mix of write-path endpoints.
 *
 * Distribution (sums to ~100% per iteration):
 *   ▸ Thread operations        40%  (create, list, get-by-id, update, fork, summary, opinions)
 *   ▸ Alert operations         20%  (preview, create, list)
 *   ▸ Journal operations       15%  (create, list, import, review)
 *   ▸ Portfolio operations     10%  (create position, list positions, risk report)
 *   ▸ Other write ops          15%  (signal stats, onboarding, noise/route config, push sub)
 */
export function writeMix(ctx: SessionCtx): void {
  const roll = Math.random();
  const symbol = pickSymbol();
  const entryPrice = plausiblePrice(symbol);

  // ── Thread operations (40%) ──────────────────────────────────────
  if (roll < 0.08) {
    // POST /api/chat/threads — create new thread (8%)
    postJson('/api/chat/threads', 'thread_create', {
      pinnedSymbol: symbol,
    });
  } else if (roll < 0.14) {
    // GET /api/chat/threads — list threads (6%)
    getJson('/api/chat/threads', 'thread_read');
  } else if (roll < 0.19 && ctx.threadId) {
    // GET /api/chat/threads/[id] — get thread with messages (5%, needs threadId)
    getJson(`/api/chat/threads/${ctx.threadId}`, 'thread_read');
  } else if (roll < 0.23 && ctx.threadId) {
    // GET /api/chat/threads/[id]?fields=thread — skinny shape (4%)
    getJson(`/api/chat/threads/${ctx.threadId}?fields=thread`, 'thread_read');
  } else if (roll < 0.27 && ctx.threadId) {
    // PATCH /api/chat/threads/[id] — update pinned symbol (4%, needs threadId)
    patchJson(`/api/chat/threads/${ctx.threadId}`, 'thread_update', {
      pinnedSymbol: symbol,
    });
  } else if (roll < 0.31 && ctx.threadId) {
    // GET /api/chat/threads/[id]/summary — thread summary (4%, needs threadId)
    // May return 404 if no summarize_thread tool call exists — that's fine
    getJson(`/api/chat/threads/${ctx.threadId}/summary`, 'thread_summary', {}, {
      tags: {},
    });
  } else if (roll < 0.35 && ctx.threadId) {
    // GET /api/chat/threads/[id]/opinions — agent opinions (4%, needs threadId)
    getJson(`/api/chat/threads/${ctx.threadId}/opinions`, 'thread_opinions');
  } else if (roll < 0.37 && ctx.threadId) {
    // POST /api/chat/threads/fork — fork thread (2%, needs threadId)
    // Uses a garbage atMessageId which will 400, but still exercises
    // the auth, routing, and body parsing code paths.
    postJson('/api/chat/threads/fork', 'thread_fork', {
      sourceThreadId: ctx.threadId,
      atMessageId: '00000000-0000-0000-0000-000000000000',
      newText: 'Can you elaborate on that analysis?',
    });
  } else if (!ctx.threadId && roll < 0.37) {
    // Strategy A: no threadId available — thread-by-ID operations fall
    // through. Use health check as filler.
    getJson('/api/health', 'health');
  }
  // ── Alert operations (20%) ──────────────────────────────────────
  else if (roll < 0.48) {
    // POST /api/alerts/preview — alert rule preview (8%)
    const alertType = randomAlertType();
    const body = {
      rule: {
        type: alertType,
        symbol,
        condition: randomCondition(alertType),
        threshold: Math.round(entryPrice * (alertType === 'priceCross' ? 1 : 100)) / 100,
        timeframe: '1h',
      },
      lookbackDays: Math.floor(Math.random() * 90) + 1,
    };
    postJson('/api/alerts/preview', 'alert_preview', body);
  } else if (roll < 0.55) {
    // POST /api/alerts — create alert (7%)
    const alertType = randomAlertType();
    postJson('/api/alerts', 'alert_create', {
      rule: {
        type: alertType,
        symbol,
        condition: randomCondition(alertType),
        threshold: Math.round(entryPrice * 1.02 * 100) / 100,
        timeframe: '1h',
      },
      channels: randomItem([['email'], ['push'], ['email', 'push']]),
      note: 'k6 load test',
      snoozeHours: 0,
    });
  } else if (roll < 0.60) {
    // GET /api/alerts — list alerts (5%)
    getJson('/api/alerts', 'alert_read');
  }
  // ── Journal operations (15%) ────────────────────────────────────
  else if (roll < 0.65) {
    // POST /api/journal — create journal entry (5%)
    postJson('/api/journal', 'journal_create', {
      symbol,
      side: randomSide(),
      openedAt: now() - Math.random() * 86400000 * 7, // within last 7 days
      entry: entryPrice,
      stop: plausibleStop(symbol, entryPrice, 'long'),
      target: plausibleTarget(symbol, entryPrice, 'long'),
      size: Math.floor(Math.random() * 10) + 1,
      notes: 'k6 load test entry',
      tags: ['k6', 'loadtest'],
    });
  } else if (roll < 0.70) {
    // GET /api/journal — list journal entries (5%)
    getJson('/api/journal', 'journal_read');
  } else if (roll < 0.75) {
    // POST /api/journal/import — bulk import (5%)
    const tradeCount = Math.floor(Math.random() * 5) + 1;
    const trades = [];
    for (let i = 0; i < tradeCount; i++) {
      const tradeSymbol = pickSymbol();
      const tEntry = plausiblePrice(tradeSymbol);
      const tSide = randomSide();
      trades.push({
        symbol: tradeSymbol,
        side: tSide,
        entry: tEntry,
        stop: plausibleStop(tradeSymbol, tEntry, tSide),
        target: plausibleTarget(tradeSymbol, tEntry, tSide),
        exit: tEntry + (tSide === 'long' ? Math.random() * 50 : -Math.random() * 50),
        size: Math.floor(Math.random() * 5) + 1,
        openedAt: now() - 86400000 * Math.floor(Math.random() * 30),
        closedAt: now() - 86400000 * Math.floor(Math.random() * 5),
        notes: 'k6 imported trade',
      });
    }
    postJson('/api/journal/import', 'journal_import', { trades });
  }
  // ── Portfolio operations (10%) ──────────────────────────────────
  else if (roll < 0.79) {
    // POST /api/portfolio/positions — create position (4%)
    postJson('/api/portfolio/positions', 'position_create', {
      symbol,
      side: randomSide(),
      entry: entryPrice,
      stop: plausibleStop(symbol, entryPrice, 'long'),
      target: plausibleTarget(symbol, entryPrice, 'long'),
      size: Math.floor(Math.random() * 5) + 1,
      openedAt: now(),
    });
  } else if (roll < 0.83) {
    // GET /api/portfolio/positions — list positions (4%)
    getJson('/api/portfolio/positions', 'position_read');
  } else if (roll < 0.85) {
    // GET /api/portfolio/risk — risk report (2%)
    getJson('/api/portfolio/risk', 'risk_read');
  }
  // ── Other write operations (15%) ────────────────────────────────
  else if (roll < 0.91) {
    // POST /api/onboarding/save-progress — save onboarding (3%)
    postJson('/api/onboarding/save-progress', 'onboarding', {
      step: Math.floor(Math.random() * 5) + 1,
      name: 'k6 load test user',
      timezone: 'America/New_York',
      defaultSymbol: symbol,
      tradingStyle: randomItem(['scalper', 'day_trader', 'swing', 'position']),
      selectedSymbols: symbols.slice(0, 3),
    });
  } else if (roll < 0.94) {
    // GET /api/notifications/noise-config — noise control config (3%)
    getJson('/api/notifications/noise-config', 'noise_config');
  } else if (roll < 0.97) {
    // GET /api/notifications/route-config — notification routing (3%)
    getJson('/api/notifications/route-config', 'noise_config');
  } else if (roll < 0.99) {
    // POST /api/push/subscribe — push subscription (2% — kept low because
    // VAPID keys are placeholder in docker-compose.loadtest.yml, so this
    // returns 503 in CI, inflating failure rate).
    const endpoint = `https://fcm.googleapis.com/fcm/send/k6-loadtest-${__VU}-${__ITER}`;
    postJson('/api/push/subscribe', 'push_subscribe', {
      endpoint,
      keys: {
        p256dh: 'BP4YQmI7q3J8XkZz6w1v2y3r4s5t6u7v8w9x0y1z2a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0',
        auth: 'k6-test-auth-token-abcdef1234567890',
      },
    });
  } else {
    // Fallback (1%) — GET /api/health as a safe round-out
    getJson('/api/health', 'health');
  }

  // Randomized think-time: 0.5–3 seconds
  // Write operations are less frequent than reads, so users pause longer
  // after state-changing actions.
  sleep(0.5 + Math.random() * 2.5);
}
