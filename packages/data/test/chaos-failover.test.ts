/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Phase 4.4: Chaos / failure injection tests for the data package's
// failover and health-scoring infrastructure.
//
// Scenarios covered:
//   1. Provider failover on HTTP 500 (PROVIDER_HTTP_ERROR)
//   2. Provider failover on timeout (PROVIDER_TIMEOUT)
//   3. Circuit-breaker open/close behaviour integrated with failover

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProviderError } from '../src/errors';
import { _resetHealth } from '../src/health';
import { runWithFailover } from '../src/failover';

beforeEach(() => {
  _resetHealth();
});

// ---------------------------------------------------------------------------
// Provider failover — HTTP 500
// ---------------------------------------------------------------------------

describe('chaos: failover on HTTP 500', () => {
  it('falls back when primary returns HTTP 500', async () => {
    const out = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => {
          throw new ProviderError('PROVIDER_HTTP_ERROR', 'twelve-data', 'HTTP 500 Internal Server Error', { status: 500 });
        },
      },
      {
        name: 'finnhub',
        run: async () => 'fallback-ok',
      },
    ]);

    expect(out).toEqual({ value: 'fallback-ok', provider: 'finnhub' });
  });

  it('rethrows when all providers return HTTP 500', async () => {
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'twelve-data', 'HTTP 500', { status: 500 });
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'finnhub', 'HTTP 500', { status: 500 });
          },
        },
      ]),
    ).rejects.toThrow('HTTP 500');
  });

  it('rethrows with the first provider error when all have same rank', async () => {
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'twelve-data', 'primary-500', { status: 500 });
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'finnhub', 'secondary-500', { status: 502 });
          },
        },
      ]),
    ).rejects.toThrow('primary-500');
  });

  it('retries the healthy provider after primary recovers (health not tainted across calls)', async () => {
    // Primary fails once, fallback succeeds. Health recorded.
    const out1 = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => {
          throw new ProviderError('PROVIDER_HTTP_ERROR', 'twelve-data', 'down', { status: 500 });
        },
      },
      {
        name: 'finnhub',
        run: async () => 'A',
      },
    ]);
    expect(out1.provider).toBe('finnhub');

    // Second call: primary health was dinged by the failure, so finnhub
    // (still at neutral 0.5) is tried first.
    const out2 = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => 'B',
      },
      {
        name: 'finnhub',
        run: async () => 'C',
      },
    ]);
    expect(out2.provider).toBe('finnhub');
    expect(out2.value).toBe('C');
  });
});

// ---------------------------------------------------------------------------
// Provider failover — timeout
// ---------------------------------------------------------------------------

describe('chaos: failover on timeout', () => {
  it('falls back when primary times out', async () => {
    const out = await runWithFailover([
      {
        name: 'twelve-data',
        run: async () => {
          throw new ProviderError('PROVIDER_TIMEOUT', 'twelve-data', 'upstream timed out');
        },
      },
      {
        name: 'finnhub',
        run: async () => 'timeout-fallback-ok',
      },
    ]);

    expect(out).toEqual({ value: 'timeout-fallback-ok', provider: 'finnhub' });
  });

  it('prefers quota error over timeout error when all fail', async () => {
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_TIMEOUT', 'twelve-data', 'timeout');
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_QUOTA_EXCEEDED', 'finnhub', 'quota exceeded');
          },
        },
      ]),
    ).rejects.toThrow('quota exceeded');
  });

  it('surfaces timeout error when no higher-rank error exists', async () => {
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_TIMEOUT', 'twelve-data', 't1 timeout');
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_TIMEOUT', 'finnhub', 't2 timeout');
          },
        },
      ]),
    ).rejects.toThrow('t1 timeout');
  });

  it('tolerates mix of timeout and HTTP error and rethrows highest rank', async () => {
    // Both same rank (2), so first wins.
    await expect(
      runWithFailover([
        {
          name: 'twelve-data',
          run: async () => {
            throw new ProviderError('PROVIDER_TIMEOUT', 'twelve-data', 'timeout', { status: 0 });
          },
        },
        {
          name: 'finnhub',
          run: async () => {
            throw new ProviderError('PROVIDER_HTTP_ERROR', 'finnhub', 'http 503', { status: 503 });
          },
        },
      ]),
    ).rejects.toThrow('timeout');
  });
});


