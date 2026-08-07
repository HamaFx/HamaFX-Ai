/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  returning: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  lastConflictConfig: undefined as Record<string, unknown> | undefined,
}));

vi.mock('../src/db', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@hamafx/db', () => ({
  schema: {
    pushSubscriptions: {
      endpoint: 'push.endpoint',
      userId: 'push.user_id',
    },
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ conditions }),
  eq: (left: unknown, right: unknown) => ({ left, right }),
}));

import {
  PushSubscriptionConflictError,
  savePushSubscription,
} from '../src/push/persistence';

const USER_A = 'user-a';
const USER_B = 'user-b';
const ENDPOINT = 'https://push.example/subscription';

function makeRow(userId: string, p256dh: string, auth: string, userAgent: string) {
  return {
    id: 'subscription-id',
    userId,
    endpoint: ENDPOINT,
    p256dh,
    auth,
    userAgent,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

beforeEach(() => {
  mocks.lastConflictConfig = undefined;
  mocks.returning.mockReset();
  mocks.onConflictDoUpdate.mockReset();
  mocks.getDb.mockReturnValue({
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: (config: Record<string, unknown>) => {
          mocks.lastConflictConfig = config;
          return { returning: mocks.returning };
        },
      }),
    }),
  });
});

describe('savePushSubscription ownership', () => {
  it('updates keys when the endpoint already belongs to the same user', async () => {
    mocks.returning.mockResolvedValue([
      makeRow(USER_A, 'new-p256dh', 'new-auth', 'new-agent'),
    ]);

    const result = await savePushSubscription({
      userId: USER_A,
      endpoint: ENDPOINT,
      p256dh: 'new-p256dh',
      auth: 'new-auth',
      userAgent: 'new-agent',
    });

    expect(result.userId).toBe(USER_A);
    expect(result.p256dh).toBe('new-p256dh');
    expect(mocks.lastConflictConfig?.setWhere).toMatchObject({ right: USER_A });
  });

  it('rejects a cross-user endpoint claim without returning a subscription', async () => {
    mocks.returning.mockResolvedValue([]);

    await expect(
      savePushSubscription({
        userId: USER_B,
        endpoint: ENDPOINT,
        p256dh: 'attacker-key',
        auth: 'attacker-auth',
        userAgent: 'attacker-agent',
      }),
    ).rejects.toBeInstanceOf(PushSubscriptionConflictError);

    expect(mocks.lastConflictConfig?.setWhere).toMatchObject({ right: USER_B });
    expect(mocks.returning).toHaveBeenCalledOnce();
  });
});
