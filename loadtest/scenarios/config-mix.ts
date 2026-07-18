// Per-iteration VU function: settings/config endpoint mix covering the
// full user-configuration surface. Settings are read-heavy with occasional
// writes (model switching, watchlist edits, analysis mode changes).
//
// Covers all 13 Settings API route files (~30 HTTP methods):
//   ▸ symbols CRUD          ─ GET list, POST add, PATCH reorder, DELETE by symbol
//   ▸ model config          ─ chat/vision/embedding model GET/PUT/DELETE
//   ▸ analysis mode         ─ GET + PATCH
//   ▸ fallback chain        ─ GET + PUT
//   ▸ usage stats           ─ by-agent + by-provider (aggregation queries)
//   ▸ provider tests        ─ test-provider, test-market-provider, bulk-test
//
// Provider test endpoints (test-provider, test-market-provider, bulk-test)
// require valid API keys and will likely return 400 in test environments.
// They're included at low probability for code-path coverage only.

import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { getJson, postJson, patchJson, putJson, deleteReq } from '../lib/http.js';
import type { SessionCtx } from '../config/environments.js';

const symbols = new SharedArray('symbols', () =>
  JSON.parse(open('../lib/data/symbols.json') as string) as string[],
);

// ── Helpers ────────────────────────────────────────────────────────

/** Pick a random symbol. */
function pickSymbol(): string {
  return randomItem(symbols);
}

/** Pick a random provider ID for model config. */
function randomProvider(): string {
  return randomItem(['google', 'openai', 'anthropic', 'groq', 'mistral', 'xai']);
}

/** Pick a plausible chat model ID for a given provider. */
function chatModelForProvider(provider: string): string {
  const models: Record<string, string> = {
    google: 'gemini-2.5-pro',
    openai: 'gpt-4o',
    anthropic: 'claude-3.5-sonnet',
    groq: 'mixtral-8x7b',
    mistral: 'mistral-large',
    xai: 'grok-2',
  };
  return models[provider] ?? 'gpt-4o';
}

// ── Config Mix Scenario ────────────────────────────────────────────

/**
 * Per-iteration VU function exercising a weighted mix of settings/config
 * endpoints. Distribution:
 *   ▸ Symbol operations     35%  (list, add, delete, reorder, catalog)
 *   ▸ Model config          25%  (chat/vision/embedding read, write)
 *   ▸ Analysis mode         10%  (read + patch)
 *   ▸ Fallback chain        10%  (read + put)
 *   ▸ Usage stats           10%  (by-agent + by-provider aggregations)
 *   ▸ Provider tests        10%  (test-provider, test-market, bulk — likely 400)
 */
export function configMix(_ctx: SessionCtx): void {
  const roll = Math.random();
  const symbol = pickSymbol();

  // ── Symbol operations (35%) ─────────────────────────────────────
  if (roll < 0.10) {
    // GET /api/settings/symbols — list watchlist with catalog metadata (10%)
    getJson('/api/settings/symbols', 'symbols_list');
  } else if (roll < 0.18) {
    // POST /api/settings/symbols — add symbol to watchlist (8%)
    postJson('/api/settings/symbols', 'symbols_add', { symbol });
  } else if (roll < 0.26) {
    // DELETE /api/settings/symbols/[symbol] — remove symbol (8%)
    // Uses EURUSD which exists in the seed catalog. Safe to delete/add back.
    deleteReq('/api/settings/symbols/EURUSD', 'symbols_delete');
  } else if (roll < 0.31) {
    // PATCH /api/settings/symbols — reorder watchlist (5%)
    patchJson('/api/settings/symbols', 'symbols_reorder', {
      symbols: ['XAUUSD', 'EURUSD', 'GBPUSD'],
    });
  } else if (roll < 0.35) {
    // GET /api/settings/catalog — full symbol catalog (4%)
    getJson('/api/settings/catalog', 'catalog_list');
  }
  // ── Model config (25%) ──────────────────────────────────────────
  else if (roll < 0.40) {
    // GET /api/settings/chat-model — read current chat model (5%)
    getJson('/api/settings/chat-model', 'chat_model_read');
  } else if (roll < 0.43) {
    // PUT /api/settings/chat-model — set chat model (3%)
    // Uses google/gemini-2.5-pro — may 400 if model not in spec catalog
    const provider = 'google';
    putJson('/api/settings/chat-model', 'chat_model_write', {
      providerId: provider,
      modelId: chatModelForProvider(provider),
    });
  } else if (roll < 0.46) {
    // DELETE /api/settings/chat-model — reset chat model (3%)
    deleteReq('/api/settings/chat-model', 'chat_model_write');
  } else if (roll < 0.49) {
    // GET /api/settings/vision-model — read current vision model (3%)
    getJson('/api/settings/vision-model', 'vision_model_read');
  } else if (roll < 0.52) {
    // PUT /api/settings/vision-model — set vision model (3%)
    // May 400 if provider doesn't support vision — exercises code path
    putJson('/api/settings/vision-model', 'vision_model_write', {
      providerId: 'google',
      modelId: 'gemini-2.5-pro',
    });
  } else if (roll < 0.55) {
    // DELETE /api/settings/vision-model — reset vision model (3%)
    deleteReq('/api/settings/vision-model', 'vision_model_write');
  } else if (roll < 0.58) {
    // GET /api/settings/embedding-model — read current embedding model (3%)
    getJson('/api/settings/embedding-model', 'embedding_model_read');
  } else if (roll < 0.60) {
    // PUT /api/settings/embedding-model — set embedding model (2%)
    putJson('/api/settings/embedding-model', 'embedding_model_write', {
      providerId: 'google',
      modelId: 'text-embedding-004',
    });
  }
  // ── Analysis mode (10%) ─────────────────────────────────────────
  else if (roll < 0.65) {
    // GET /api/settings/analysis-mode — read current mode (5%)
    getJson('/api/settings/analysis-mode', 'analysis_mode_read');
  } else if (roll < 0.70) {
    // PATCH /api/settings/analysis-mode — update mode (5%)
    patchJson('/api/settings/analysis-mode', 'analysis_mode_write', {
      defaultAnalysisMode: randomItem(['single', 'quick', 'standard', 'full', 'auto']),
    });
  }
  // ── Fallback chain (10%) ────────────────────────────────────────
  else if (roll < 0.75) {
    // GET /api/settings/fallback-chain — read current chain (5%)
    getJson('/api/settings/fallback-chain', 'fallback_chain_read');
  } else if (roll < 0.80) {
    // PUT /api/settings/fallback-chain — update chain (5%)
    putJson('/api/settings/fallback-chain', 'fallback_chain_write', {
      fallbackChain: ['google', 'openai', 'anthropic'],
    });
  }
  // ── Usage stats (10%) ──────────────────────────────────────────
  else if (roll < 0.85) {
    // GET /api/settings/usage-by-agent — per-agent cost breakdown (5%)
    // Aggregation query across agent_opinions table
    getJson('/api/settings/usage-by-agent', 'usage_by_agent');
  } else if (roll < 0.90) {
    // GET /api/settings/usage-by-provider — per-provider breakdown (5%)
    // Aggregation query via computeUsage()
    getJson('/api/settings/usage-by-provider', 'usage_by_provider');
  }
  // ── Provider tests (10%) ────────────────────────────────────────
  else if (roll < 0.94) {
    // POST /api/settings/test-provider — test a BYOK key (4%)
    // Expected to 400 (no valid API key in test env) — code-path coverage
    postJson('/api/settings/test-provider', 'provider_test', {
      provider: randomProvider(),
      apiKey: 'k6-test-key-placeholder-that-will-fail-12345',
    });
  } else if (roll < 0.97) {
    // POST /api/settings/test-market-provider — test market data key (3%)
    postJson('/api/settings/test-market-provider', 'market_provider_test', {
      provider: 'finnhub',
      apiKey: 'k6-test-key-placeholder',
    });
  } else {
    // POST /api/settings/bulk-test — test all configured providers (3%)
    // Rate-limited to 2 calls / 5min — expect 429 after first hit.
    // Returns ndjson stream — exercises streaming response path.
    postJson('/api/settings/bulk-test', 'bulk_test', {});
  }

  // Randomized think-time: 0.3–2 seconds
  // Config operations are typically batchy — users make a change then pause.
  sleep(0.3 + Math.random() * 1.7);
}
