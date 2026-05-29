import { beforeEach, describe, expect, it } from 'vitest';

import { ProviderError } from '../src/errors';
import { runWithFailover } from '../src/failover';
import { _resetHealth, recordFailure, recordSuccess } from '../src/health';

describe('runWithFailover — Phase 7a health-aware ordering', () => {
  beforeEach(() => {
    _resetHealth();
  });

  it('returns the first attempt that succeeds and records success', async () => {
    let primaryCalls = 0;
    let fallbackCalls = 0;
    const out = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => {
          primaryCalls += 1;
          return 'A';
        },
      },
      {
        name: 'finnhub',
        run: async () => {
          fallbackCalls += 1;
          return 'B';
        },
      },
    ]);
    expect(out).toEqual({ value: 'A', provider: 'twelve-data' });
    expect(primaryCalls).toBe(1);
    expect(fallbackCalls).toBe(0);
  });

  it('falls over to the second provider on ProviderError', async () => {
    const out = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => {
          throw new ProviderError('PROVIDER_HTTP_ERROR', 'twelve-data', 'down');
        },
      },
      {
        name: 'finnhub',
        run: async () => 'OK',
      },
    ]);
    expect(out).toEqual({ value: 'OK', provider: 'finnhub' });
  });

  it('reorders attempts by health score (unhealthy primary deprioritised)', async () => {
    // Make primary look unhealthy: 5 recorded failures, no successes.
    for (let i = 0; i < 5; i += 1) recordFailure('twelve-data');
    // Make fallback look healthy: 5 successes.
    for (let i = 0; i < 5; i += 1) recordSuccess('finnhub');

    const order: string[] = [];
    const out = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => {
          order.push('twelve-data');
          return 'A';
        },
      },
      {
        name: 'finnhub',
        run: async () => {
          order.push('finnhub');
          return 'B';
        },
      },
    ]);
    expect(out.provider).toBe('finnhub');
    expect(order).toEqual(['finnhub']);
  });

  it('preserves caller order when scores tie', async () => {
    // Both unknown — getScore returns 0.5 for each → preserve caller order.
    const order: string[] = [];
    const out = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => {
          order.push('twelve-data');
          return 'A';
        },
      },
      {
        name: 'finnhub',
        run: async () => {
          order.push('finnhub');
          return 'B';
        },
      },
    ]);
    expect(out.provider).toBe('twelve-data');
    expect(order).toEqual(['twelve-data']);
  });

  it('rethrows the most-actionable error when every attempt fails', async () => {
    // Phase 3 hardening §16 — the runner now picks the highest-rank
    // ProviderError to surface (`PROVIDER_QUOTA_EXCEEDED` >
    // `PROVIDER_HTTP_ERROR` > everything else). The pre-fix behavior
    // re-threw the FIRST error encountered; the new behavior gives
    // the operator the most-useful message (a quota signal trumps a
    // generic HTTP failure).
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'twelve-data', 'first');
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_QUOTA_EXCEEDED', 'finnhub', 'second');
          },
        },
      ]),
    ).rejects.toThrow('second');
  });

  it('falls back to the first error when no attempt produced a higher-rank one', async () => {
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'twelve-data', 'alpha');
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'finnhub', 'beta');
          },
        },
      ]),
    ).rejects.toThrow('alpha');
  });
});
