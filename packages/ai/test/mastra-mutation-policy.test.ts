import { afterEach, describe, expect, it } from 'vitest';

import {
  assertMastraMutationAllowed,
  evaluateMastraMutation,
} from '../src/mastra';

afterEach(() => {
  delete process.env.ENABLE_MASTRA_MUTATIONS;
});

describe('Mastra mutation policy', () => {
  const request = {
    mutation: 'set_alert' as const,
    userId: 'user-1',
    threadId: 'thread-1',
    confirmed: true,
  };

  it('rejects mutations while the operator flag is absent', () => {
    expect(evaluateMastraMutation(request)).toEqual({
      allowed: false,
      mutation: 'set_alert',
      reason: 'disabled',
    });
    expect(() => assertMastraMutationAllowed(request)).toThrow('disabled by policy');
  });

  it('requires server-side confirmation after enablement', () => {
    process.env.ENABLE_MASTRA_MUTATIONS = 'true';
    expect(evaluateMastraMutation({ ...request, confirmed: false })).toMatchObject({
      allowed: false,
      reason: 'confirmation-required',
    });
  });

  it('allows only a valid confirmed request when explicitly enabled', () => {
    process.env.ENABLE_MASTRA_MUTATIONS = 'true';
    expect(evaluateMastraMutation(request)).toEqual({
      allowed: true,
      mutation: 'set_alert',
    });
  });
});
