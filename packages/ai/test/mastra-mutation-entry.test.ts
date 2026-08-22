import { describe, expect, it } from 'vitest';

import {
  buildMutationInput,
  classifyMutationRequest,
  MutationExtractionError,
} from '@kestrel/ai/mastra';

describe('classifyMutationRequest', () => {
  it('detects alert intents', () => {
    expect(classifyMutationRequest('set an alert for XAUUSD above 3400')).toBe('set_alert');
    expect(classifyMutationRequest('alert me when XAUUSD drops below 3300')).toBe('set_alert');
    expect(classifyMutationRequest('notify me when gold breaks 3400')).toBe('set_alert');
  });

  it('detects journal intents', () => {
    expect(classifyMutationRequest('log a trade: long XAUUSD at 3320')).toBe('log_journal');
    expect(classifyMutationRequest('record my journal entry for EURUSD')).toBe('log_journal');
    expect(classifyMutationRequest('add a position to my journal')).toBe('log_journal');
  });

  it('detects share intents', () => {
    expect(classifyMutationRequest('share this snapshot with me')).toBe('share_snapshot');
    expect(classifyMutationRequest('share an analysis summary for XAUUSD')).toBe('share_snapshot');
  });

  it('detects system action intents', () => {
    expect(classifyMutationRequest('run the system action maintenance')).toBe('run_system_action');
  });

  it('returns null for read-only research prompts', () => {
    expect(classifyMutationRequest('analyze XAUUSD trend for today')).toBeNull();
    expect(classifyMutationRequest('What is the current gold price?')).toBeNull();
    expect(classifyMutationRequest('')).toBeNull();
    expect(classifyMutationRequest('hi')).toBeNull();
  });
});

describe('buildMutationInput', () => {
  it('builds a validated set_alert input with defaults', () => {
    const input = buildMutationInput('set_alert', {
      rule: {
        type: 'priceCross',
        symbol: 'XAUUSD',
        level: 3400,
        direction: 'above',
      },
      note: 'breakout watch',
    });
    expect(input).toMatchObject({
      kind: 'set_alert',
      rule: { type: 'priceCross', symbol: 'XAUUSD', level: 3400, direction: 'above' },
      channels: ['email'],
      note: 'breakout watch',
    });
  });

  it('normalizes journal symbols to uppercase and defaults outcome', () => {
    const input = buildMutationInput('log_journal', {
      symbol: 'xauusd',
      side: 'long',
      entry: 3320,
      stop: 3300,
      target: 3360,
      tags: ['gold', 'breakout'],
    });
    expect(input).toMatchObject({
      kind: 'log_journal',
      symbol: 'XAUUSD',
      side: 'long',
      entry: 3320,
      stop: 3300,
      target: 3360,
      outcome: 'open',
      tags: ['gold', 'breakout'],
    });
    expect((input as { openedAt: number }).openedAt).toBeGreaterThan(0);
  });

  it('builds a share_snapshot input', () => {
    const input = buildMutationInput('share_snapshot', {
      title: 'Gold breakout',
      body: 'XAUUSD looks strong above 3400.',
      symbol: 'xauusd',
    });
    expect(input).toMatchObject({
      kind: 'share_snapshot',
      title: 'Gold breakout',
      body: 'XAUUSD looks strong above 3400.',
      symbol: 'XAUUSD',
    });
  });

  it('rejects extraction results that fail validation', () => {
    expect(() =>
      buildMutationInput('log_journal', { symbol: '', side: 'long' }),
    ).toThrow(MutationExtractionError);
    expect(() =>
      buildMutationInput('set_alert', { rule: { type: 'bogus' } }),
    ).toThrow(MutationExtractionError);
  });
});
