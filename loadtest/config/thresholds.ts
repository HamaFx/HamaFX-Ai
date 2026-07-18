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
  'http_req_duration{group:market_read_slow}': ['p(95)<1500', 'p(99)<3000'],
};

// ── Relaxed variants for load-test / CI environments where the SUT
//     runs without a real worker, without provider API keys, and
//     without production-grade caching.  POST-based indicator/structure
//     calls are naturally 2-4× slower than cache-hit GETs.
const RELAXED = isRelaxed();
function isRelaxed(): boolean {
  return __ENV['K6_LOADTEST_RELAXED'] === 'true';
}

export const MARKET_READ_TAGGED_RELAXED = RELAXED
  ? {
      'http_req_duration{group:market_read}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:market_read_slow}': ['p(95)<3000', 'p(99)<6000'],
    }
  : MARKET_READ_TAGGED;

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

export const READ_MIX_TAGGED_RELAXED = RELAXED
  ? {
      'http_req_duration{group:market_read}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:news_read}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:calendar_read}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:sentiment_read}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:decision_signals}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:thread_list}': ['p(95)<1000', 'p(99)<2000'],
      'http_req_duration{group:health}': ['p(95)<500', 'p(99)<1500'],
    }
  : READ_MIX_TAGGED;

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

// ── write_mix (POST-heavy write-path endpoints, expect slower) ──
export const WRITE_MIX: ThresholdPreset = {
  httpReqFailed: ['rate<0.02'],
  checks: ['rate>0.95'],
  rateLimited: ['rate<0.05'],
};

export const WRITE_MIX_TAGGED = {
  'http_req_duration{group:alert_create}': ['p(95)<1000', 'p(99)<2000'],
  'http_req_duration{group:alert_preview}': ['p(95)<3000', 'p(99)<5000'],
  'http_req_duration{group:alert_read}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:thread_create}': ['p(95)<800', 'p(99)<1500'],
  'http_req_duration{group:thread_read}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:thread_update}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:thread_delete}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:thread_fork}': ['p(95)<2000', 'p(99)<4000'],
  'http_req_duration{group:thread_summary}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:thread_opinions}': ['p(95)<1000', 'p(99)<2000'],
  'http_req_duration{group:journal_create}': ['p(95)<800', 'p(99)<1500'],
  'http_req_duration{group:journal_read}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:journal_import}': ['p(95)<2000', 'p(99)<4000'],
  'http_req_duration{group:journal_review}': ['p(95)<5000', 'p(99)<10000'],
  'http_req_duration{group:position_create}': ['p(95)<800', 'p(99)<1500'],
  'http_req_duration{group:position_read}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:position_close}': ['p(95)<800', 'p(99)<1500'],
  'http_req_duration{group:risk_read}': ['p(95)<1000', 'p(99)<2000'],
  'http_req_duration{group:signal_feedback}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:signal_stats}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:onboarding}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:noise_config}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:push_subscribe}': ['p(95)<500', 'p(99)<1000'],
};

export const WRITE_MIX_TAGGED_RELAXED = RELAXED
  ? {
      'http_req_duration{group:alert_create}': ['p(95)<3000', 'p(99)<5000'],
      'http_req_duration{group:alert_preview}': ['p(95)<5000', 'p(99)<8000'],
      'http_req_duration{group:alert_read}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:thread_create}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:thread_read}': ['p(95)<1000', 'p(99)<2000'],
      'http_req_duration{group:thread_update}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:thread_delete}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:thread_fork}': ['p(95)<4000', 'p(99)<8000'],
      'http_req_duration{group:thread_summary}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:thread_opinions}': ['p(95)<3000', 'p(99)<5000'],
      'http_req_duration{group:journal_create}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:journal_read}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:journal_import}': ['p(95)<4000', 'p(99)<8000'],
      'http_req_duration{group:journal_review}': ['p(95)<8000', 'p(99)<15000'],
      'http_req_duration{group:position_create}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:position_read}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:position_close}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:risk_read}': ['p(95)<3000', 'p(99)<5000'],
      'http_req_duration{group:signal_feedback}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:signal_stats}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:onboarding}': ['p(95)<1000', 'p(99)<2000'],
      'http_req_duration{group:noise_config}': ['p(95)<1000', 'p(99)<2000'],
      'http_req_duration{group:push_subscribe}': ['p(95)<1000', 'p(99)<2000'],
    }
  : WRITE_MIX_TAGGED;

// ── config_mix (settings API — mostly lightweight reads + config writes) ──
export const CONFIG_MIX: ThresholdPreset = {
  httpReqFailed: ['rate<0.03'],
  checks: ['rate>0.95'],
  rateLimited: ['rate<0.05'],
};

export const CONFIG_MIX_TAGGED = {
  'http_req_duration{group:symbols_list}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:symbols_add}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:symbols_delete}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:symbols_reorder}': ['p(95)<800', 'p(99)<1500'],
  'http_req_duration{group:catalog_list}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:chat_model_read}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:chat_model_write}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:vision_model_read}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:vision_model_write}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:embedding_model_read}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:embedding_model_write}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:analysis_mode_read}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:analysis_mode_write}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:fallback_chain_read}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{group:fallback_chain_write}': ['p(95)<800', 'p(99)<1500'],
  'http_req_duration{group:usage_by_agent}': ['p(95)<1000', 'p(99)<2000'],
  'http_req_duration{group:usage_by_provider}': ['p(95)<1000', 'p(99)<2000'],
  'http_req_duration{group:provider_test}': ['p(95)<3000', 'p(99)<5000'],
  'http_req_duration{group:market_provider_test}': ['p(95)<3000', 'p(99)<5000'],
  'http_req_duration{group:bulk_test}': ['p(95)<5000', 'p(99)<10000'],
};

export const CONFIG_MIX_TAGGED_RELAXED = RELAXED
  ? {
      'http_req_duration{group:symbols_list}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:symbols_add}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:symbols_delete}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:symbols_reorder}': ['p(95)<3000', 'p(99)<5000'],
      'http_req_duration{group:catalog_list}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:chat_model_read}': ['p(95)<1000', 'p(99)<2000'],
      'http_req_duration{group:chat_model_write}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:vision_model_read}': ['p(95)<1000', 'p(99)<2000'],
      'http_req_duration{group:vision_model_write}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:embedding_model_read}': ['p(95)<1000', 'p(99)<2000'],
      'http_req_duration{group:embedding_model_write}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:analysis_mode_read}': ['p(95)<1000', 'p(99)<2000'],
      'http_req_duration{group:analysis_mode_write}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:fallback_chain_read}': ['p(95)<1000', 'p(99)<2000'],
      'http_req_duration{group:fallback_chain_write}': ['p(95)<2000', 'p(99)<4000'],
      'http_req_duration{group:usage_by_agent}': ['p(95)<3000', 'p(99)<5000'],
      'http_req_duration{group:usage_by_provider}': ['p(95)<3000', 'p(99)<5000'],
      'http_req_duration{group:provider_test}': ['p(95)<5000', 'p(99)<8000'],
      'http_req_duration{group:market_provider_test}': ['p(95)<5000', 'p(99)<8000'],
      'http_req_duration{group:bulk_test}': ['p(95)<8000', 'p(99)<15000'],
    }
  : CONFIG_MIX_TAGGED;

// ── stress (expect breaking — thresholds are high-water marks, not gates) ──
export const STRESS: ThresholdPreset = {
  httpReqFailed: ['rate<0.05'],
  checks: ['rate>0.95'],
  rateLimited: ['rate<0.10'],
};
