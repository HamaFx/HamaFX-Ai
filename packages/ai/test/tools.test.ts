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

import { toolRegistry } from '../src/tools/index';

describe('tools registry', () => {
  it('contains all expected tool entries', () => {
    // PF-13: Tools are now registered in category-group order
    // (market → analysis → journal → system)
    const expectedKeys = [
      // Market (10)
      'get_price',
      'get_candles',
      'get_indicators',
      'get_market_structure',
      'get_correlation',
      'get_cot',
      'get_intermarket',
      'get_intermarket_resonance',
      'get_session_levels',
      'get_seasonality',
      // Analysis (7)
      'analyze_technical',
      'analyze_fundamental',
      'analyze_chart_image',
      'annotate_chart',
      'forecast_volatility',
      'compute_risk',
      'compute_position_health',
      // Journal (8)
      'log_journal',
      'get_journal_stats',
      'get_news',
      'get_calendar',
      'set_alert',
      'search_knowledge',
      'share_snapshot',
      'summarize_thread',
      // System (7)
      'get_system_diagnostics',
      'run_system_action',
      'get_portfolio_snapshot',
      'get_social_sentiment',
      'verify_call',
      'convene_committee',
      'replay_setup',
    ];
    expect(toolRegistry.listNames()).toEqual(expectedKeys);
    expect(toolRegistry.listNames().length).toBe(32);
  });

  it('every tool has description, inputSchema, and execute', () => {
    const allTools = toolRegistry.resolve();
    for (const [name, tool] of Object.entries(allTools)) {
      expect(tool.description, `${name} missing description`).toBeTruthy();
      expect(tool.inputSchema, `${name} missing inputSchema`).toBeDefined();
      expect(tool.execute, `${name} missing execute`).toBeDefined();
    }
  });

  it('every tool name matches the withTelemetry wrapper name', () => {
    for (const name of toolRegistry.listNames()) {
      expect(name).toMatch(/^[a-z_]+$/);
    }
  });

  it('get_price tool has correct input schema', () => {
    const allTools = toolRegistry.resolve();
    const schema = (allTools.get_price as { inputSchema: unknown }).inputSchema as unknown as { describe: () => string };
    expect(schema.describe()).toBeTruthy();
  });

  it('compute_risk tool validates input schema', () => {
    const allTools = toolRegistry.resolve();
    const computeRisk = allTools['compute_risk'] as {
      inputSchema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } };
    };
    const schema = computeRisk.inputSchema;
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
    const allTools = toolRegistry.resolve();
    const cal = allTools['get_calendar'] as {
      inputSchema: { safeParse: (v: unknown) => { success: boolean } };
    };
    const schema = cal.inputSchema;
    const valid = schema.safeParse({});
    expect(valid.success).toBe(true);

    const withFilters = schema.safeParse({
      currencies: ['USD', 'EUR'],
      minImportance: 'high',
    });
    expect(withFilters.success).toBe(true);
  });
});
