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
  createAlertMock: vi.fn(),
  createEntryMock: vi.fn(),
  createSnapshotMock: vi.fn(),
  signShareTokenMock: vi.fn(),
}));

vi.mock('../src/alerts/persistence', () => ({
  createAlert: mocks.createAlertMock,
}));

vi.mock('../src/journal/persistence', () => ({
  createEntry: mocks.createEntryMock,
}));

vi.mock('../src/share/persistence', () => ({
  createSnapshot: mocks.createSnapshotMock,
}));

vi.mock('../src/share/sign', () => ({
  signShareToken: mocks.signShareTokenMock,
}));

import { withToolContext } from '../src/tool-context';
import { logJournalTool } from '../src/tools/log-journal';
import { setAlertTool } from '../src/tools/set-alert';
import { shareSnapshotTool } from '../src/tools/share-snapshot';
import type { LogJournalOutput, SetAlertOutput, ShareSnapshotOutput } from '@hamafx/shared';

function makeContext(latestUserMessageText: string) {
  return {
    threadId: 'thread-1',
    userId: 'user-1',
    latestUserMessageText,
    env: {} as any,
    signal: null,
    budget: { spent: 0, max: 5 },
    userSettings: {} as any,
  };
}

describe('mutation tool intent guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createAlertMock.mockResolvedValue({ id: 'alert_123' });
    mocks.createEntryMock.mockResolvedValue({ id: 'entry_123' });
    mocks.createSnapshotMock.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Gold breakout snapshot',
      body: 'Shared analysis body',
      overlay: null,
      symbol: 'XAUUSD',
      tf: '1h',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });
    mocks.signShareTokenMock.mockReturnValue('signed-token');

    process.env.AUTH_COOKIE_SECRET = 'a'.repeat(32);
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.hamafx.test';
  });

  it('allows set_alert only when the user explicitly asks for an alert', async () => {
    const result = (await withToolContext(
      makeContext('Set an alert if XAUUSD breaks above 2400.'),
      () =>
        Promise.resolve(
          setAlertTool.execute!(
            {
              rule: {
                type: 'priceCross',
                symbol: 'XAUUSD',
                level: 2400,
                direction: 'above',
              },
              channels: ['email'],
              note: null,
            },
            {} as any,
          ),
        ),
    )) as SetAlertOutput;

    expect(result.alertId).toBe('alert_123');
    expect(mocks.createAlertMock).toHaveBeenCalledOnce();
  });

  it('blocks set_alert when the latest user message did not ask for an alert', async () => {
    await expect(
      withToolContext(makeContext('What do you think about gold today?'), () =>
        Promise.resolve(
          setAlertTool.execute!(
            {
              rule: {
                type: 'priceCross',
                symbol: 'XAUUSD',
                level: 2400,
                direction: 'above',
              },
              channels: ['email'],
              note: null,
            },
            {} as any,
          ),
        )),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    expect(mocks.createAlertMock).not.toHaveBeenCalled();
  });

  it('allows log_journal only when the user explicitly asks to journal or log a trade', async () => {
    const result = (await withToolContext(
      makeContext('Journal: I shorted XAUUSD at 2392, stop 2398, target 2378.'),
      () =>
        Promise.resolve(
          logJournalTool.execute!(
            {
              symbol: 'XAUUSD',
              side: 'short',
              entry: 2392,
              stop: 2398,
              target: 2378,
              notes: 'London fade',
            },
            {} as any,
          ),
        ),
    )) as LogJournalOutput;

    expect(result.entryId).toBe('entry_123');
    expect(mocks.createEntryMock).toHaveBeenCalledOnce();
  });

  it('blocks log_journal when the latest user message did not ask to save a trade', async () => {
    await expect(
      withToolContext(makeContext('Can you analyze this setup?'), () =>
        Promise.resolve(
          logJournalTool.execute!(
            {
              symbol: 'XAUUSD',
              side: 'short',
              entry: 2392,
            },
            {} as any,
          ),
        )),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    expect(mocks.createEntryMock).not.toHaveBeenCalled();
  });

  it('requires an explicit share-link request before creating a public snapshot', async () => {
    await expect(
      withToolContext(makeContext('Can you summarize this analysis for me?'), () =>
        Promise.resolve(
          shareSnapshotTool.execute!(
            {
              title: 'Gold breakout snapshot',
              body: 'Shared analysis body',
              symbol: 'XAUUSD',
              tf: '1h',
              ttlMinutes: 60,
            },
            {} as any,
          ),
        )),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    expect(mocks.createSnapshotMock).not.toHaveBeenCalled();

    const result = (await withToolContext(
      makeContext('Share this analysis as a public link I can send.'),
      () =>
        Promise.resolve(
          shareSnapshotTool.execute!(
            {
              title: 'Gold breakout snapshot',
              body: 'Shared analysis body',
              symbol: 'XAUUSD',
              tf: '1h',
              ttlMinutes: 60,
            },
            {} as any,
          ),
        ),
    )) as ShareSnapshotOutput;

    expect(result.url).toBe('https://app.hamafx.test/share/550e8400-e29b-41d4-a716-446655440000?t=signed-token');
    expect(mocks.createSnapshotMock).toHaveBeenCalledOnce();
    expect(mocks.signShareTokenMock).toHaveBeenCalledOnce();
  });
});
