// Phase 2 hardening §2 — pinned attempts and ProviderEmptyError.
//
// The pre-fix runner reordered every attempt by health score, which
// meant a pseudo-provider that returned "no fresh data" during a
// worker restart was demoted below the BiQuote REST fallback and never
// recovered its primary slot. The new contract:
//
//   - `pinned: true` keeps the attempt in caller order regardless of
//     score.
//   - `ProviderEmptyError` (a sibling of `ProviderError`) signals "no
//     data right now"; the runner falls through without recording a
//     health failure.

import { beforeEach, describe, expect, it } from 'vitest';

import { ProviderEmptyError, ProviderError } from '../src/errors';
import { runWithFailover } from '../src/failover';
import { _resetHealth, recordFailure, recordSuccess } from '../src/health';

describe('runWithFailover — pinned attempts (Phase 2 §2)', () => {
  beforeEach(() => {
    _resetHealth();
  });

  it('keeps a pinned primary in first position even after repeated failures', async () => {
    // Pre-load the health window so the dynamic-sort would normally
    // demote `live-ticks` below `biquote`.
    for (let i = 0; i < 10; i += 1) recordFailure('live-ticks');
    for (let i = 0; i < 10; i += 1) recordSuccess('biquote');

    const order: string[] = [];
    const out = await runWithFailover([
      {
        name: 'live-ticks',
        pinned: true,
        run: async () => {
          order.push('live-ticks');
          return 'fresh';
        },
      },
      {
        name: 'biquote',
        run: async () => {
          order.push('biquote');
          return 'rest';
        },
      },
    ]);

    expect(out.provider).toBe('live-ticks');
    expect(order).toEqual(['live-ticks']);
  });

  it('still falls through past a pinned attempt that fails', async () => {
    const order: string[] = [];
    const out = await runWithFailover([
      {
        name: 'live-ticks',
        pinned: true,
        run: async () => {
          order.push('live-ticks');
          throw new ProviderEmptyError('live-ticks', 'no fresh row');
        },
      },
      {
        name: 'biquote',
        run: async () => {
          order.push('biquote');
          return 'rest';
        },
      },
    ]);

    expect(out.provider).toBe('biquote');
    expect(order).toEqual(['live-ticks', 'biquote']);
  });

  it('preserves dynamic ordering for unpinned attempts', async () => {
    recordFailure('twelve-data');
    for (let i = 0; i < 5; i += 1) recordSuccess('finnhub');

    const order: string[] = [];
    const out = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => {
          order.push('twelve-data');
          return 'a';
        },
      },
      {
        name: 'finnhub',
        run: async () => {
          order.push('finnhub');
          return 'b';
        },
      },
    ]);

    // finnhub has the higher score, so it wins.
    expect(out.provider).toBe('finnhub');
    expect(order).toEqual(['finnhub']);
  });
});

describe('runWithFailover — ProviderEmptyError (Phase 2 §2)', () => {
  beforeEach(() => {
    _resetHealth();
  });

  it('falls through on ProviderEmptyError without recording a health failure', async () => {
    const out = await runWithFailover([
      {
        name: 'live-ticks',
        run: async () => {
          throw new ProviderEmptyError('live-ticks', 'cold cache');
        },
      },
      {
        name: 'biquote',
        run: async () => 'rest',
      },
    ]);
    expect(out.provider).toBe('biquote');

    // The crucial assertion: live-ticks's score wasn't dinged. We
    // simulate this by counting 10 more biquote successes (which would
    // amplify any pre-existing demotion) and then checking that
    // live-ticks is still tried first when both attempts succeed —
    // because score is 0.5 vs 1.0, but live-ticks has caller-order
    // priority only when scores are tied. So we need to test by giving
    // live-ticks an explicit success first to bring it to 1.0, after
    // which both providers tie at 1.0 and caller order wins.
    recordSuccess('live-ticks');
    const order: string[] = [];
    await runWithFailover([
      {
        name: 'live-ticks',
        run: async () => {
          order.push('live-ticks');
          return 'fresh';
        },
      },
      {
        name: 'biquote',
        run: async () => {
          order.push('biquote');
          return 'rest';
        },
      },
    ]);
    expect(order).toEqual(['live-ticks']);
  });

  it('does not record a failure on ProviderEmptyError (score stays neutral)', async () => {
    // Hit the empty error 100 times. If recordFailure were being
    // called, live-ticks would be demoted; we assert score stays at
    // the neutral 0.5 by checking caller-order priority survives a
    // tie with a never-tried provider.
    for (let i = 0; i < 100; i += 1) {
      try {
        await runWithFailover([
          {
            name: 'live-ticks',
            run: async () => {
              throw new ProviderEmptyError('live-ticks', 'still empty');
            },
          },
          // Always-failing fallback so the runWithFailover throws and
          // we don't accidentally record success on a sibling.
          {
            name: 'biquote',
            run: async () => {
              throw new ProviderError('PROVIDER_HTTP_ERROR', 'biquote', 'down');
            },
          },
        ]);
      } catch {
        // expected
      }
    }

    // Both providers have unchanged scores: live-ticks at neutral 0.5
    // (no failures recorded), biquote at 0.0 (100 failures). live-ticks
    // wins by score.
    const order: string[] = [];
    await runWithFailover([
      {
        name: 'biquote',
        run: async () => {
          order.push('biquote');
          return 'rest';
        },
      },
      {
        name: 'live-ticks',
        run: async () => {
          order.push('live-ticks');
          return 'fresh';
        },
      },
    ]);
    expect(order).toEqual(['live-ticks']);
  });

  it('still records failures for genuine ProviderError', async () => {
    await runWithFailover([
      {
        name: 'live-ticks',
        run: async () => {
          throw new ProviderError(
            'PROVIDER_HTTP_ERROR',
            'live-ticks',
            'db connection refused',
          );
        },
      },
      {
        name: 'biquote',
        run: async () => 'rest',
      },
    ]);

    // Now the dynamic sort should put biquote first (it succeeded
    // while live-ticks failed).
    const order: string[] = [];
    await runWithFailover([
      {
        name: 'live-ticks',
        run: async () => {
          order.push('live-ticks');
          return 'fresh';
        },
      },
      {
        name: 'biquote',
        run: async () => {
          order.push('biquote');
          return 'rest';
        },
      },
    ]);
    expect(order).toEqual(['biquote']);
  });
});
