// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';

import { computeHealthSloService } from '@/lib/services/admin-health';

function createMockDb(scenario: 'healthy' | 'missing-live-ticks' | 'stale-tick' | 'silent' = 'healthy') {
  // The service always issues queries in the same order:
  // 1) DB probe, 2) live_ticks, 3) cron_runs, 4) chat_tool_telemetry,
  // 5) chat_telemetry, 6) full-analysis workflow runs (stale/stuck),
  // 7) operational recovery signals. We use a counter because Drizzle `sql`
  // objects do not stringify to their SQL text reliably.
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
          ? { rows: [{ symbol_count: 3, oldest_age_s: 90 }] }
          : { rows: [{ symbol_count: 2, oldest_age_s: 30 }] };
      }

      if (callIndex === 3) {
        return scenario === 'silent'
          ? { rows: [{ total: '0', done: '0', stuck: '0' }] }
          : { rows: [{ total: '10', done: '9', stuck: '1' }] };
      }

      if (callIndex === 4) {
        return scenario === 'silent'
          ? { rows: [{ total: '0', ok: '0' }] }
          : { rows: [{ total: '100', ok: '99' }] };
      }

      if (callIndex === 5) {
        return scenario === 'silent'
          ? { rows: [{ turns: '0' }] }
          : { rows: [{ turns: '50' }] };
      }

      if (callIndex === 6) {
        return { rows: [{ stale: '0', stuck: '0' }] };
      }

      if (callIndex === 7) {
        return {
          rows: [{
            full_total: '10', full_completed: '10', full_failed: '0',
            sentiment_total: '10', sentiment_succeeded: '9',
            outbox_terminal: '10', outbox_completed: '10', outbox_dead: '0',
            budget_terminal: '10', budget_errors: '0',
            trace_total: '10', trace_failed: '0', provider_fallback_traces: '1',
          }],
        };
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
    expect(tickSli?.details).toBe('Oldest symbol tick 30s old across 2 symbols');
    expect(tickSli?.success).toBe(1);
    expect(result.slis.find((s) => s.key === 'full_mode_completion')?.current).toBe(1);
    expect(result.slis.find((s) => s.key === 'sentiment_health')?.current).toBe(0.9);
  });

  it('does not break other SLIs when live_ticks is missing', async () => {
    const db = createMockDb('missing-live-ticks');
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.dbOk).toBe(true);
    expect(result.slis.find((s) => s.key === 'worker_ticks')?.current).toBeNull();
    expect(result.overall).toBe('degraded');
    expect(result.anomalies).toContain('Tick telemetry is unavailable — worker health cannot be verified');
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
    expect(result.slis.find((s) => s.key === 'worker_ticks')?.window).toBe('current');
    expect(result.slis.find((s) => s.key === 'cron_jobs')?.window).toBe('24h');

    const toolSli = result.slis.find((s) => s.key === 'ai_gateway');
    expect(toolSli?.success).toBe(99);
    expect(toolSli?.total).toBe(100);
    expect(toolSli?.current).toBe(0.99);
  });

  it('supports postgres-js array results as well as { rows } results', async () => {
    const rowsDb = createMockDb('healthy');
    const db = {
      execute: vi.fn(async () => {
        const result = await rowsDb.execute();
        return result && typeof result === 'object' && 'rows' in result
          ? (result as { rows: unknown[] }).rows
          : result;
      }),
    };
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.slis.find((s) => s.key === 'full_mode_completion')?.current).toBe(1);
    expect(result.slis.find((s) => s.key === 'sentiment_health')?.current).toBe(0.9);
    expect(result.anomalies).not.toContain(
      'Recovery telemetry is unavailable — outbox, budget, trace, and Full-mode health cannot be verified',
    );
  });

  it('flags a stale tick anomaly', async () => {
    const db = createMockDb('stale-tick');
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.anomalies.some((a) => a.includes('stale'))).toBe(true);
    expect(result.overall).toBe('degraded');
  });

  it('flags silent AI telemetry instead of reporting an unverified healthy window', async () => {
    const db = createMockDb('silent');
    const result = await computeHealthSloService(db, { hours: 1 });

    expect(result.overall).toBe('degraded');
    expect(result.anomalies).toContain('No AI tool calls in the selected window — gateway health cannot be verified');
    expect(result.anomalies).toContain('No chat turns in the selected window — chat health cannot be verified');
    expect(result.anomalies).toContain('No cron runs in the selected window — cron health cannot be verified');
  });
});
