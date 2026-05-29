/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';

process.env['FRED_API_KEY'] = 'test-fred-key';
process.env['GOOGLE_GENERATIVE_AI_API_KEY'] = 'test-ai-key';

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => [
          { asOf: new Date('2026-05-28'), data: { close: 2350.0 } },
          { asOf: new Date('2026-05-27'), data: { close: 2340.0 } },
          { asOf: new Date('2026-05-26'), data: { close: 2330.0 } },
          { asOf: new Date('2026-05-25'), data: { close: 2320.0 } },
          { asOf: new Date('2026-05-22'), data: { close: 2310.0 } },
        ],
        orderBy: () => ({
          limit: vi.fn().mockResolvedValue([
            {
              date: '2026-05-28',
              realYieldPct: 2.1,
              breakevenInflationPct: 2.3,
              goldClose: 2350.0,
              divergenceScore: 1.8,
              createdAt: new Date(),
            },
          ]),
        }),
        limit: vi.fn().mockResolvedValue([
          {
            count: 42,
          },
        ]),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue({}),
      }),
    }),
  }),
  schema: {
    journalEntries: { id: 'journal_entries' },
    snapshots: { id: 'snapshots', symbol: 'symbol', kind: 'kind', asOf: 'as_of' },
    briefingsEmitted: { id: 'briefings_emitted', createdAt: 'created_at' },
    intermarketResonance: { id: 'intermarket_resonance', date: 'date' },
    memoryEmbeddings: { id: 'memory_embeddings' },
  },
}));

vi.mock('@hamafx/data', () => ({
  fred: {
    fetchResonanceInputs: vi.fn().mockResolvedValue({
      realYields: [
        { date: '2026-05-28', value: 2.1 },
        { date: '2026-05-27', value: 2.05 },
        { date: '2026-05-26', value: 2.0 },
        { date: '2026-05-25', value: 1.95 },
        { date: '2026-05-22', value: 1.9 },
      ],
      breakevenInflation: [
        { date: '2026-05-28', value: 2.3 },
        { date: '2026-05-27', value: 2.28 },
        { date: '2026-05-26', value: 2.25 },
        { date: '2026-05-25', value: 2.22 },
        { date: '2026-05-22', value: 2.2 },
      ],
    }),
  },
}));

import { getSystemDiagnosticsTool } from '../src/tools/get-system-diagnostics';
import { runSystemActionTool } from '../src/tools/run-system-action';
import { withToolContext } from '../src/tool-context';
import type { GetSystemDiagnosticsOutput, RunSystemActionOutput } from '@hamafx/shared';

describe('Diagnostics & DevOps Tools', () => {
  it('correctly reports system diagnostics stats', async () => {
    const result = (await withToolContext(
      {
        threadId: 'test-thread-id',
        env: {} as any,
        signal: null,
        budget: { spent: 0.15, max: 10.0 },
      },
      () => Promise.resolve(getSystemDiagnosticsTool.execute!({ verbose: true, forceProbe: false }, {} as any)),
    )) as GetSystemDiagnosticsOutput;

    expect(result.status).toBe('healthy');
    expect(result.budget.spentUsd).toBe(0.15);
    expect(result.budget.limitUsd).toBe(10.0);
    expect(result.budget.remainingUsd).toBe(9.85);
    expect(result.database.status).toBe('connected');
    expect(result.narrative).toContain('HEALTHY');
  });

  it('correctly triggers and logs resonance sync DevOps actions', async () => {
    process.env['FRED_API_KEY'] = 'test-fred-key';

    const result = (await withToolContext(
      {
        threadId: 'test-thread-id',
        env: {} as any,
        signal: null,
        budget: { spent: 0.15, max: 10.0 },
      },
      () => Promise.resolve(runSystemActionTool.execute!({ action: 'resonance_sync' }, {} as any)),
    )) as RunSystemActionOutput;

    expect(result.action).toBe('resonance_sync');
    expect(result.status).toBe('success');
    expect(result.consoleLogs.length).toBeGreaterThan(0);
    expect(result.consoleLogs[0]).toContain('Initiating action: RESONANCE_SYNC');
    expect(result.message).toContain('Intermarket resonance database sync successfully executed');
  });

  it('correctly executes cache flushes', async () => {
    const result = (await withToolContext(
      {
        threadId: 'test-thread-id',
        env: {} as any,
        signal: null,
        budget: { spent: 0.15, max: 10.0 },
      },
      () => Promise.resolve(runSystemActionTool.execute!({ action: 'flush_cache' }, {} as any)),
    )) as RunSystemActionOutput;

    expect(result.action).toBe('flush_cache');
    expect(result.status).toBe('success');
    expect(result.consoleLogs).toContain('[cache] Flushing Redis/in-memory price feed buffers...');
    expect(result.message).toContain('pricing caches cleared');
  });
});
