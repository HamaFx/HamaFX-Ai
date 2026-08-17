/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@kestrel/ai', () => ({
  getDb: () => mockDb,
}));

vi.mock('@kestrel/db/schema', () => ({
  liveTicks: { ts: 'ts' },
}));

vi.mock('@kestrel/shared', () => ({
  metrics: {
    increment: vi.fn(),
    observe: vi.fn(),
  },
}));

vi.mock('@kestrel/shared/metrics-export', () => ({
  flushMetrics: vi.fn(async () => {}),
}));

const mockDb = {
  select: () => ({
    from: () => ({
      orderBy: () => ({
        limit: async () => [{ ts: new Date(Date.now() - 5_000) }],
      }),
    }),
  }),
};

import { metrics } from '@kestrel/shared';
import { flushMetrics } from '@kestrel/shared/metrics-export';

import { runMetricsFlush } from '../src/jobs/metrics-flush';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/tenant-router';

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();

beforeEach(() => {
  vi.mocked(metrics.increment).mockClear();
  vi.mocked(metrics.observe).mockClear();
  vi.mocked(flushMetrics).mockClear();
});

describe('runMetricsFlush', () => {
  it('records tick freshness and pushes the registry', async () => {
    const result = await runMetricsFlush({ log, signal: new AbortController().signal, tenantRouter: testRouter });

    expect(metrics.increment).toHaveBeenCalledWith('worker_flush_total');
    const [, freshness] = vi.mocked(metrics.observe).mock.calls[0] ?? [];
    expect(freshness).toBeGreaterThan(0);
    expect(freshness).toBeLessThan(10_000);
    expect(flushMetrics).toHaveBeenCalledTimes(1);
    expect(result.note).toContain('tick_freshness_ms');
  });

  it('tolerates a missing live_ticks row', async () => {
    mockDb.select = () => ({
      from: () => ({
        orderBy: () => ({
          limit: async () => [],
        }),
      }),
    });

    const result = await runMetricsFlush({ log, signal: new AbortController().signal, tenantRouter: testRouter });
    expect(result.note).toContain('no-ticks');
    expect(metrics.observe).not.toHaveBeenCalled();
  });
});