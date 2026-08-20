import { describe, expect, it } from 'vitest';

import { evaluateMastraCapability, getMastraCapability, MASTRA_CAPABILITIES } from '../src/mastra';

describe('Mastra capability policy', () => {
  it('declares the current XAUUSD research capability explicitly', () => {
    expect(MASTRA_CAPABILITIES['xauusd-research']).toMatchObject({
      id: 'xauusd-research',
      allowedSymbols: ['XAUUSD'],
      allowedModes: ['single', 'auto'],
      readOnly: true,
      evidencePolicy: 'required',
      supportsAbort: true,
    });
  });

  it('declares the conversational narrow-tool allowlist and step budget', () => {
    expect(MASTRA_CAPABILITIES['xauusd-conversation']).toMatchObject({
      tools: [
        'get-xauusd-market-structure',
        'get-xauusd-session-levels',
        'analyze-xauusd-technical',
        'get-xauusd-correlation',
        'get-xauusd-intermarket',
        'forecast-xauusd-volatility',
        'get-xauusd-news',
        'get-xauusd-calendar',
        'get-xauusd-social-sentiment',
        'get-xauusd-fundamental-context',
        'get-xauusd-seasonality',
        'get-xauusd-cot',
        'get-xauusd-intermarket-resonance',
        'search-untrusted-web',
        'search-untrusted-knowledge',
      ],
      maxSteps: 3,
      readOnly: true,
    });
  });

  it('keeps mutation workflows disabled and approval-gated', () => {
    expect(MASTRA_CAPABILITIES['mutation-workflows']).toMatchObject({
      readOnly: false,
      requiresConfirmation: true,
      tools: ['set_alert', 'log_journal', 'share_snapshot', 'run_system_action'],
    });
    expect(
      evaluateMastraCapability({
        capabilityId: 'mutation-workflows',
        symbol: 'XAUUSD',
        mode: 'single',
        mutationRequested: true,
        confirmed: true,
      }),
    ).toMatchObject({ allowed: false, reason: 'mutations-disabled' });
  });

  it('resolves known capabilities and rejects unknown IDs', () => {
    expect(getMastraCapability('xauusd-research')?.id).toBe('xauusd-research');
    expect(getMastraCapability('not-a-capability')).toBeNull();
  });

  it('allows the current read-only XAUUSD Single capability', () => {
    expect(
      evaluateMastraCapability({
        capabilityId: 'xauusd-research',
        symbol: 'XAUUSD',
        mode: 'single',
      }),
    ).toMatchObject({ allowed: true });
  });

  it.each([
    ['unsupported symbol', { symbol: 'EURUSD', mode: 'single' as const }, 'unsupported-symbol'],
    ['unsupported mode', { symbol: 'XAUUSD', mode: 'standard' as const }, 'unsupported-mode'],
    [
      'explicit model override',
      { symbol: 'XAUUSD', mode: 'single' as const, hasModelOverride: true },
      'model-override',
    ],
    [
      'mutation request',
      { symbol: 'XAUUSD', mode: 'single' as const, mutationRequested: true },
      'mutation-request',
    ],
  ])('rejects %s before model execution', (_label, request, reason) => {
    expect(
      evaluateMastraCapability({
        capabilityId: 'xauusd-research',
        ...request,
      }),
    ).toMatchObject({ allowed: false, reason });
  });

  it('rejects unknown capabilities closed by default', () => {
    expect(
      evaluateMastraCapability({
        capabilityId: 'unknown',
        symbol: 'XAUUSD',
        mode: 'single',
      }),
    ).toEqual({
      allowed: false,
      capability: null,
      reason: 'unknown-capability',
    });
  });
});
