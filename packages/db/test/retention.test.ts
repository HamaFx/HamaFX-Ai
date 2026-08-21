import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.fn();

vi.mock('../src/client', () => ({
  getDb: vi.fn(() => ({ execute })),
}));

import {
  getRetentionConfigFromEnv,
  runRetentionCleanup,
  runVacuumAnalyze,
} from '../src/retention';

describe('retention cleanup', () => {
  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue({ count: 2 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses safe defaults and rejects unsafe environment windows', () => {
    vi.stubEnv('TELEMETRY_RETENTION_DAYS', '-1');
    vi.stubEnv('TRACE_RETENTION_DAYS', '99999');
    vi.stubEnv('RATE_LIMIT_RETENTION_HOURS', '0');

    expect(getRetentionConfigFromEnv()).toMatchObject({
      telemetryRetentionDays: 90,
      traceRetentionDays: 30,
      rateLimitRetentionHours: 2,
    });
  });

  it('cleans all operational and recovery tables with one bounded batch each', async () => {
    const result = await runRetentionCleanup({
      telemetryRetentionDays: 1,
      traceRetentionDays: 1,
      rateLimitRetentionHours: 1,
      providerDailyQuotaRetentionDays: 1,
      cronRunRetentionDays: 1,
      outboxRetentionDays: 1,
      budgetReservationRetentionDays: 1,
    });

    expect(execute).toHaveBeenCalledTimes(8);
    expect(result).toMatchObject({
      telemetryDeleted: 2,
      toolTelemetryDeleted: 2,
      tracesDeleted: 2,
      rateLimitsDeleted: 2,
      providerDailyQuotaDeleted: 2,
      cronRunsDeleted: 2,
      outboxDeleted: 2,
      budgetReservationsDeleted: 2,
    });
    expect(result.note).toContain('outboxDeleted=2');
  });

  it('does not issue a second batch when the first batch is full', async () => {
    execute.mockResolvedValue({ count: 1_000 });

    await runRetentionCleanup({ telemetryRetentionDays: 1 });

    expect(execute).toHaveBeenCalledTimes(8);
  });

  it('vacuum analyzes only the bounded operational table list', async () => {
    await runVacuumAnalyze();

    expect(execute).toHaveBeenCalledTimes(8);
  });
});
