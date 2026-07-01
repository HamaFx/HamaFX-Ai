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

/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchResonanceInputsMock: vi.fn(),
  onConflictDoUpdateMock: vi.fn(),
  state: { currentUserRole: 'admin' as 'admin' | 'user' },
}));

vi.mock('@hamafx/db', () => {
  const schema = {
    users: { id: 'user.id', role: 'user.role' },
    snapshots: { symbol: 'snapshots.symbol', kind: 'snapshots.kind', asOf: 'snapshots.as_of' },
    intermarketResonance: { date: 'intermarket_resonance.date' },
  };

  return {
    getDb: () => ({
      select: () => ({
        from: (table: unknown) => ({
          where: () => {
            if (table === schema.users) {
              return [{ role: mocks.state.currentUserRole }];
            }

            if (table === schema.snapshots) {
              return [
                { asOf: new Date('2026-05-28T00:00:00Z'), data: { close: 2350.0 } },
                { asOf: new Date('2026-05-27T00:00:00Z'), data: { close: 2340.0 } },
                { asOf: new Date('2026-05-26T00:00:00Z'), data: { close: 2330.0 } },
                { asOf: new Date('2026-05-25T00:00:00Z'), data: { close: 2320.0 } },
                { asOf: new Date('2026-05-22T00:00:00Z'), data: { close: 2310.0 } },
              ];
            }

            return [];
          },
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: mocks.onConflictDoUpdateMock,
        }),
      }),
    }),
    schema,
  };
});

vi.mock('@hamafx/data', () => ({
  fred: {
    fetchResonanceInputs: mocks.fetchResonanceInputsMock,
  },
}));

import { runSystemActionTool } from '../src/tools/run-system-action';
import { withToolContext } from '../src/tool-context';
import type { RunSystemActionOutput } from '@hamafx/shared';

function makeContext(latestUserMessageText: string) {
  return {
    threadId: 'thread-1',
    userId: 'user-1',
    latestUserMessageText,
    env: {} as any,
    signal: null,
    budget: { spent: 0.15, max: 10.0 },
    userSettings: {} as any,
  };
}

describe('run_system_action', () => {
  beforeEach(() => {
    mocks.state.currentUserRole = 'admin';
    vi.clearAllMocks();
    process.env['FRED_API_KEY'] = 'test-fred-key';

    mocks.fetchResonanceInputsMock.mockResolvedValue({
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
    });
    mocks.onConflictDoUpdateMock.mockResolvedValue({});
  });

  it('runs the resonance sync for an admin on an explicit request', async () => {
    const result = (await withToolContext(
      makeContext('Please run the resonance sync now.'),
      () => Promise.resolve(runSystemActionTool.execute!({ action: 'resonance_sync' }, {} as any)),
    )) as RunSystemActionOutput;

    expect(result.action).toBe('resonance_sync');
    expect(result.status).toBe('success');
    expect(result.consoleLogs[0]).toContain('Initiating action: RESONANCE_SYNC');
    expect(mocks.fetchResonanceInputsMock).toHaveBeenCalledOnce();
    expect(mocks.onConflictDoUpdateMock).toHaveBeenCalled();
  });

  it('rejects non-admin callers before any FRED fetch or DB write', async () => {
    mocks.state.currentUserRole = 'user';

    await expect(
      withToolContext(makeContext('Run the resonance sync now.'), () =>
        Promise.resolve(runSystemActionTool.execute!({ action: 'resonance_sync' }, {} as any))),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(mocks.fetchResonanceInputsMock).not.toHaveBeenCalled();
    expect(mocks.onConflictDoUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects implicit or ambient-health-triggered requests', async () => {
    await expect(
      withToolContext(makeContext('How stale is the resonance data right now?'), () =>
        Promise.resolve(runSystemActionTool.execute!({ action: 'resonance_sync' }, {} as any))),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    expect(mocks.fetchResonanceInputsMock).not.toHaveBeenCalled();
    expect(mocks.onConflictDoUpdateMock).not.toHaveBeenCalled();
  });
});
