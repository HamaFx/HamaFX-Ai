/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db', () => ({
  getDb: vi.fn(),
}));

import { getDb } from '../src/db';
import { getOrCreateBriefingsThread } from '../src/briefings/persistence';
import {
  claimAlertDelivery,
  markFired,
  releaseAlertDeliveryClaim,
} from '../src/alerts/persistence';

function mockDb(value: unknown): void {
  vi.mocked(getDb).mockReturnValue(value as never);
}

describe('Phase 2 concurrency guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('converges on the winning briefing thread after an insert conflict', async () => {
    const winner = {
      id: 'thread-winner',
      title: 'Briefings',
      titleSource: 'llm',
      pinnedSymbol: null,
      modelOverride: null,
      createdAt: new Date(1_000),
      updatedAt: new Date(2_000),
    };
    const selectResults: unknown[][] = [[], [winner]];
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(selectResults.shift() ?? []),
          }),
        }),
      })),
      insert: vi.fn(() => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      })),
    };
    mockDb(db);

    const thread = await getOrCreateBriefingsThread('user-1');

    expect(thread.id).toBe('thread-winner');
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('claims an eligible alert once and rejects a competing claim', async () => {
    const update = vi.fn(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ id: 'alert-1' }]),
        }),
      }),
    }));
    mockDb({ update });

    const claimed = await claimAlertDelivery('user-1', 'alert-1', new Date(10_000));

    expect(claimed).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);

    const competingUpdate = vi.fn(() => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    }));
    mockDb({ update: competingUpdate });

    await expect(
      claimAlertDelivery('user-1', 'alert-1', new Date(10_001)),
    ).resolves.toBe(false);
  });

  it('fences finalization and releases a failed claim', async () => {
    const where = vi.fn(() => ({ returning: () => Promise.resolve([{ id: 'alert-1' }]) }));
    const update = vi.fn(() => ({ set: () => ({ where }) }));
    mockDb({ update });

    const claimAt = new Date(20_000);
    await expect(markFired('user-1', 'alert-1', new Date(20_001), claimAt)).resolves.toBe(true);
    expect(where).toHaveBeenCalledTimes(1);

    const releaseWhere = vi.fn(() => Promise.resolve([]));
    const releaseUpdate = vi.fn(() => ({ set: () => ({ where: releaseWhere }) }));
    mockDb({ update: releaseUpdate });
    await releaseAlertDeliveryClaim('user-1', 'alert-1', claimAt);
    expect(releaseWhere).toHaveBeenCalledTimes(1);
  });
});
