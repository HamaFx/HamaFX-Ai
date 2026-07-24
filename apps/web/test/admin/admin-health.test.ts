// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';

import { computeHealthSloService } from '@/lib/services/admin-health';

function createMockDb(scenario: 'healthy' | 'missing-live-ticks' | 'stale-tick' = 'healthy') {
  // The service always issues queries in the same order:
  // 1) DB probe, 2) live_ticks, 3) cron_runs, 4) chat_tool_telemetry,
  // 5) chat_telemetry, 6) analysis_jobs. We use a counter because
  // Drizzle `sql` objects do not stringify to their SQL text reliably.
  let callIndex = 0;

  return {
    execute: vi.fn(async () => {
      callIndex += 1;

      if (callIndex === 1) {
        return { rows: [{ '?column?': 1 }] };
      }

      if (callIndex === 2) {
        if (scenario === 'missing-live-ticks') {
          throw new Error('relation "live_ticks" does not exist');
        }
        return scenario === 'stale-tick'
          ? { rows: [{ symbol_count: 3, newest_age_s: 90 }] }
          : { rows: [{ symbol_count: 2, newest_age_s: 30 }] };
      }

      if (callIndex === 3) {
        return { rows: [{ total: '10', done: '9', stuck: '1' }] };
      }

      if (callIndex === 4) {
        return { rows: [{ total: '100', ok: '99' }] };
      }

      if (callIndex === 5) {
        return { rows: [{ turns: '50' }] };
      }

      if (callIndex === 6) {
        return { rows: [{ stale: '0', stuck: '0' }] };
      }

      return { rows: [] };
    }),
  };
}

describe('computeHealthSloService', () => {
  it('returns the aggregated live tick symbol count and newest age', async () => {
    const db = createMockDb('healthy');
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.dbOk).toBe(true);
    expect(result.overall).toBe('degraded'); // anomalies exist (stuck cron)

    const tickSli = result.slis.find((s) => s.key === 'worker_ticks');
    expect(tickSli).toBeDefined();
    expect(tickSli?.details).toBe('Newest tick 30s old across 2 symbols');
    expect(tickSli?.success).toBe(1);
  });

  it('does not break other SLIs when live_ticks is missing', async () => {
    const db = createMockDb('missing-live-ticks');
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.dbOk).toBe(true);
    expect(result.slis.find((s) => s.key === 'worker_ticks')?.current).toBeNull();
    expect(result.slis.find((s) => s.key === 'cron_jobs')?.total).toBe(10);
    expect(result.slis.find((s) => s.key === 'ai_gateway')?.total).toBe(100);
  });

  it('computes cron and AI gateway SLIs correctly', async () => {
    const db = createMockDb('healthy');
    const result = await computeHealthSloService(db, { hours: 24 });

    const cronSli = result.slis.find((s) => s.key === 'cron_jobs');
    expect(cronSli?.success).toBe(9);
    expect(cronSli?.total).toBe(10);
    expect(cronSli?.current).toBe(0.9);

    const toolSli = result.slis.find((s) => s.key === 'ai_gateway');
    expect(toolSli?.success).toBe(99);
    expect(toolSli?.total).toBe(100);
    expect(toolSli?.current).toBe(0.99);
  });

  it('flags a stale tick anomaly', async () => {
    const db = createMockDb('stale-tick');
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.anomalies.some((a) => a.includes('stale'))).toBe(true);
    expect(result.overall).toBe('degraded');
  });
});
