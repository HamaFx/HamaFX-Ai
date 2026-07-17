// Reusable threshold presets. Every test imports from here so SLOs are
// consistent across smoke/load/stress/spike/soak/chat.
//
// k6 thresholds use the same tag-namespaced syntax as the rest of the
// metric system.  Groups are tagged in lib/http.ts.

export interface ThresholdPreset {
  /** Global network/5xx failure rate. */
  httpReqFailed: string[];
  /** Global check pass rate. */
  checks: string[];
  /** Share of requests that returned 429 (rate-limited). */
  rateLimited: string[];
}

// ── market_read (GET /api/market/{price,candles,indicators,structure,search}) ──
export const MARKET_READ: ThresholdPreset = {
  httpReqFailed: ['rate<0.01'],
  checks: ['rate>0.99'],
  rateLimited: ['rate<0.02'],
};

export const MARKET_READ_TAGGED = {
  'http_req_duration{group:market_read}': ['p(95)<500', 'p(99)<1200'],
};

// ── read_mix (broad GET surface) ──
export const READ_MIX: ThresholdPreset = {
  httpReqFailed: ['rate<0.01'],
  checks: ['rate>0.99'],
  rateLimited: ['rate<0.02'],
};

export const READ_MIX_TAGGED = {
  'http_req_duration{group:market_read}': ['p(95)<500', 'p(99)<1200'],
  'http_req_duration{group:news_read}': ['p(95)<800', 'p(99)<1500'],
  'http_req_duration{group:calendar_read}': ['p(95)<800', 'p(99)<1500'],
  'http_req_duration{group:sentiment_read}': ['p(95)<800', 'p(99)<1500'],
  'http_req_duration{group:decision_signals}': ['p(95)<800', 'p(99)<1500'],
  'http_req_duration{group:thread_list}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:health}': ['p(95)<300', 'p(99)<800'],
};

// ── chat (POST /api/chat — full stream, expect slow) ──
export const CHAT: ThresholdPreset = {
  httpReqFailed: ['rate<0.02'],
  checks: ['rate>0.99'],
  rateLimited: ['rate<0.05'], // expect some 429s at the 30/min/user ceiling
};

export const CHAT_TAGGED = {
  'http_req_duration{group:chat}': ['p(95)<10000', 'p(99)<15000'],
  chat_ttfb: ['p(95)<2500'],
  chat_stream_bytes: ['count>0'],
};

// ── stress (expect breaking — thresholds are high-water marks, not gates) ──
export const STRESS: ThresholdPreset = {
  httpReqFailed: ['rate<0.05'],
  checks: ['rate>0.95'],
  rateLimited: ['rate<0.10'],
};
