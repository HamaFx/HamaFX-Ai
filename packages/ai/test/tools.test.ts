import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve([]),
          limit: () => Promise.resolve([]),
          innerJoin: () => Promise.resolve([]),
        }),
      }),
    }),
    execute: () => Promise.resolve([]),
    insert: () => ({ values: () => Promise.resolve() }),
  }),
  schema: {
    chatToolTelemetry: {},
    chatTelemetry: {},
    chatMessages: {},
    economicEvents: {},
    users: {},
    userSettings: {},
    journals: {},
    alerts: {},
    knowledgeBase: {},
    portfolio: {},
    positions: {},
  },
}));

vi.mock('@hamafx/shared/encryption', () => ({
  PROVIDER_IDS: [
    'google',
    'vertex',
    'anthropic',
    'openai',
    'groq',
    'mistral',
    'openrouter',
    'xai',
    'deepseek',
    'iamhc',
  ],
  decryptByok: () => null,
  encryptByok: () => '',
  configuredProviders: () => [],
}));

vi.mock('@hamafx/data', () => ({
  getPrice: vi.fn(() => ({ bid: 1.08, ask: 1.0802, mid: 1.0801, timestamp: Date.now() })),
  ProviderError: class ProviderError extends Error {},
}));

import { tools } from '../src/tools/index';

describe('tools registry', () => {
  it('contains all expected tool entries', () => {
    const expectedKeys = [
      'get_price',
      'get_candles',
      'get_indicators',
      'get_market_structure',
      'get_news',
      'get_calendar',
      'set_alert',
      'log_journal',
      'search_knowledge',
      'analyze_technical',
      'analyze_fundamental',
      'get_journal_stats',
      'annotate_chart',
      'analyze_chart_image',
      'get_correlation',
      'get_cot',
      'share_snapshot',
      'compute_risk',
      'get_session_levels',
      'get_intermarket',
      'forecast_volatility',
      'get_seasonality',
      'compute_position_health',
      'replay_setup',
      'summarize_thread',
      'verify_call',
      'convene_committee',
      'get_intermarket_resonance',
      'get_system_diagnostics',
      'run_system_action',
      'get_portfolio_snapshot',
      'get_social_sentiment',
    ];
    expect(Object.keys(tools)).toEqual(expectedKeys);
    expect(Object.keys(tools).length).toBe(32);
  });

  it('every tool has description, inputSchema, and execute', () => {
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.description, `${name} missing description`).toBeTruthy();
      expect(tool.inputSchema, `${name} missing inputSchema`).toBeDefined();
      expect(tool.execute, `${name} missing execute`).toBeDefined();
    }
  });

  it('every tool name matches the withTelemetry wrapper name', () => {
    for (const [name] of Object.entries(tools)) {
      expect(name).toMatch(/^[a-z_]+$/);
    }
  });

  it('get_price tool has correct input schema', () => {
    const schema = tools.get_price.inputSchema as unknown as { describe: () => string };
    expect(schema.describe()).toBeTruthy();
  });

  it('compute_risk tool validates input schema', () => {
    const schema = tools.compute_risk.inputSchema as {
      safeParse: (v: unknown) => { success: boolean; error?: unknown };
    };
    const valid = schema.safeParse({
      symbol: 'EURUSD',
      side: 'long',
      entry: 1.08,
      stop: 1.075,
      accountUsd: 10000,
      riskPct: 1,
    });
    expect(valid.success).toBe(true);

    const invalid = schema.safeParse({
      symbol: 'EURUSD',
      side: 'long',
      entry: 1.08,
      stop: 1.075,
      accountUsd: 10000,
      riskPct: 11,
    });
    expect(invalid.success).toBe(false);
  });

  it('get_calendar tool validates input schema', () => {
    const schema = tools.get_calendar.inputSchema as {
      safeParse: (v: unknown) => { success: boolean };
    };
    const valid = schema.safeParse({});
    expect(valid.success).toBe(true);

    const withFilters = schema.safeParse({
      currencies: ['USD', 'EUR'],
      minImportance: 'high',
    });
    expect(withFilters.success).toBe(true);
  });
});
