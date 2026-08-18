// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { decideMastraXauusdShadow } from '@/lib/services/mastra-shadow-routing';

describe('Mastra XAUUSD shadow eligibility', () => {
  const base = {
    prompt: 'Analyse XAUUSD today',
    featureEnabled: true,
    analysisMode: 'single',
    hasModelOverride: false,
    mastraAlreadyAttempted: false,
  };

  it('is disabled when the independent shadow flag is off', () => {
    expect(decideMastraXauusdShadow({ ...base, featureEnabled: false })).toEqual({
      enabled: false,
      reason: 'disabled',
    });
  });

  it('accepts eligible read-only single and auto-mode XAUUSD requests', () => {
    expect(decideMastraXauusdShadow(base)).toEqual({ enabled: true, reason: 'eligible' });
    expect(decideMastraXauusdShadow({ ...base, analysisMode: 'auto' })).toEqual({
      enabled: true,
      reason: 'eligible',
    });
    expect(decideMastraXauusdShadow({ ...base, prompt: 'Analyse EURUSD' })).toEqual({
      enabled: false,
      reason: 'not-xauusd',
    });
    expect(decideMastraXauusdShadow({ ...base, analysisMode: 'full' })).toEqual({
      enabled: false,
      reason: 'non-report-mode',
    });
  });

  it('does not shadow model overrides or a request already attempted by Mastra', () => {
    expect(decideMastraXauusdShadow({ ...base, hasModelOverride: true })).toEqual({
      enabled: false,
      reason: 'model-override',
    });
    expect(decideMastraXauusdShadow({ ...base, mastraAlreadyAttempted: true })).toEqual({
      enabled: false,
      reason: 'mastra-already-attempted',
    });
  });
});
