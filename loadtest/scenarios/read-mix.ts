// Per-iteration VU function: broad read endpoint mix resembling a browsing
// user on the dashboard/chat surface.
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { getJson } from '../lib/http.js';
import type { SessionCtx } from '../config/environments.js';

const symbols = new SharedArray('symbols', () =>
  JSON.parse(open('../lib/data/symbols.json') as string) as string[],
);

export function readMix(_ctx: SessionCtx): void {
  const symbol = randomItem(symbols);

  // ── Market read group ──────────────────────────────────────────
  getJson(`/api/market/price?symbol=${symbol}`, 'market_read');
  sleep(0.3 + Math.random() * 0.5);

  if (Math.random() < 0.4) {
    getJson(
      `/api/market/candles?symbol=${symbol}&timeframe=1h`,
      'market_read',
    );
    sleep(0.3 + Math.random() * 0.5);
  }

  // ── News ───────────────────────────────────────────────────────
  if (Math.random() < 0.3) {
    getJson('/api/news', 'news_read');
    sleep(0.5 + Math.random() * 1);
  }

  // ── Calendar ───────────────────────────────────────────────────
  if (Math.random() < 0.2) {
    getJson('/api/calendar', 'calendar_read');
    sleep(0.5 + Math.random() * 1);
  }

  // ── Sentiment ──────────────────────────────────────────────────
  if (Math.random() < 0.3) {
    getJson(`/api/sentiment?symbol=${symbol}`, 'sentiment_read');
    sleep(0.3 + Math.random() * 0.5);
  }

  // ── Decision signals ───────────────────────────────────────────
  if (Math.random() < 0.2) {
    getJson('/api/decision-signals', 'decision_signals');
    sleep(0.3 + Math.random() * 0.5);
  }

  // ── Thread list ────────────────────────────────────────────────
  if (Math.random() < 0.3) {
    getJson('/api/chat/threads', 'thread_list');
    sleep(0.3 + Math.random() * 0.5);
  }

  // ── Health (deep probe — once per ~20 iterations) ──────────────
  if (Math.random() < 0.05) {
    getJson('/api/health', 'health');
    sleep(0.5);
  }
}
