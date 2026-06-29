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

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hamafx/db', () => ({
  getDb: vi.fn(),
  schema: { userSettings: 'userSettings', users: 'users' },
}));

vi.mock('@hamafx/ai', () => ({
  getMonthlySpend: vi.fn(),
  getProviderMonthlySpend: vi.fn(),
  sendDirectNotification: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b, op: 'eq' }),
}));

import { getDb } from '@hamafx/db';
import { getMonthlySpend, getProviderMonthlySpend, sendDirectNotification } from '@hamafx/ai';

import { checkAllUsageAlerts, resetSentAlerts } from '../src/lib/usage-alerts';

const mockDb = vi.mocked(getDb);
const mockGetMonthlySpend = vi.mocked(getMonthlySpend);
const mockGetProviderMonthlySpend = vi.mocked(getProviderMonthlySpend);
const mockSendNotification = vi.mocked(sendDirectNotification);

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    monthlyBudgetLimit: null,
    providerSpendingThresholds: null,
    spendAlertsConfig: null,
    alertEmail: null,
    telegramBotToken: null,
    telegramChatId: null,
    ...overrides,
  };
}

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    email: 'user@example.com',
    alertEmail: null,
    telegramBotToken: null,
    telegramChatId: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  resetSentAlerts();
});

describe('checkAllUsageAlerts', () => {
  it('returns zeros when there are no user settings', async () => {
    const whereFn = vi.fn().mockResolvedValue([]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 0 });
  });

  it('skips users without budget limit or thresholds', async () => {
    const whereFn = vi.fn().mockResolvedValue([]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([makeSettings()]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 0 });
  });

  it('skips users without alert config channels', async () => {
    const whereFn = vi.fn().mockResolvedValue([]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: {} })]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 0 });
  });

  it('skips users with alert config but no reachable channels', async () => {
    const whereFn = vi.fn().mockResolvedValue([makeUserRow({ email: null, alertEmail: null })]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } })]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);

    const result = await checkAllUsageAlerts();
    // User is still "checked" (iterated) but no alert sent
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 1 });
  });

  it('sends alert when monthly spend exceeds limit (100%)', async () => {
    const whereFn = vi.fn().mockResolvedValue([makeUserRow()]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } })]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetMonthlySpend.mockResolvedValue(100);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 1, checkedUsers: 1 });
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.stringContaining('100%'),
      expect.any(String),
      expect.any(Object),
      ['email'],
    );
  });

  it('sends alert when monthly spend reaches 80%', async () => {
    const whereFn = vi.fn().mockResolvedValue([makeUserRow()]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } })]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetMonthlySpend.mockResolvedValue(80);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 1, checkedUsers: 1 });
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.stringContaining('80%'),
      expect.any(String),
      expect.any(Object),
      ['email'],
    );
  });

  it('sends alert when monthly spend reaches 50%', async () => {
    const whereFn = vi.fn().mockResolvedValue([makeUserRow()]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } })]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetMonthlySpend.mockResolvedValue(50);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 1, checkedUsers: 1 });
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.stringContaining('50%'),
      expect.any(String),
      expect.any(Object),
      ['email'],
    );
  });

  it('sends per-provider threshold alert when exceeded', async () => {
    const whereFn = vi.fn().mockResolvedValue([makeUserRow()]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([makeSettings({ providerSpendingThresholds: { openai: 50 }, spendAlertsConfig: { email: true } })]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetProviderMonthlySpend.mockResolvedValue(60);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 1, checkedUsers: 1 });
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.stringContaining('openai'),
      expect.any(String),
      expect.any(Object),
      ['email'],
    );
  });

  it('sends alerts via telegram when configured', async () => {
    const whereFn = vi.fn().mockResolvedValue([makeUserRow({ telegramBotToken: 'bot-token', telegramChatId: 'chat-id' })]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { telegram: true } })]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetMonthlySpend.mockResolvedValue(100);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 1, checkedUsers: 1 });
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_CHAT_ID: 'chat-id' }),
      ['telegram'],
    );
  });

  it('sends alerts via both email and telegram', async () => {
    const whereFn = vi.fn().mockResolvedValue([makeUserRow({ telegramBotToken: 'bot', telegramChatId: 'chat' })]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true, telegram: true } })]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetMonthlySpend.mockResolvedValue(100);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 1, checkedUsers: 1 });
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      ['email', 'telegram'],
    );
  });

  it('processes multiple users', async () => {
    const settings = [
      makeSettings({ userId: 'user-1', monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } }),
      makeSettings({ userId: 'user-2', monthlyBudgetLimit: 200, spendAlertsConfig: { email: true } }),
    ];
    const userRow1 = makeUserRow({ email: 'user1@test.com' });
    const userRow2 = makeUserRow({ email: 'user2@test.com' });

    let whereCallCount = 0;
    const whereFn = vi.fn().mockImplementation(() => {
      whereCallCount++;
      if (whereCallCount === 1) return Promise.resolve([userRow1]);
      return Promise.resolve([userRow2]);
    });
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve(settings);
    const innerFromResult = { innerJoin: innerJoinFn };
    let firstSelect = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (firstSelect) { firstSelect = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetMonthlySpend.mockResolvedValue(100);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result.checkedUsers).toBe(2);
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it('does not send alerts when spend is below all thresholds', async () => {
    const whereFn = vi.fn().mockResolvedValue([makeUserRow()]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } })]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetMonthlySpend.mockResolvedValue(10);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 1 });
  });

  it('uses alertEmail over user email when both are present', async () => {
    const whereFn = vi.fn().mockResolvedValue([makeUserRow({ alertEmail: 'alert@test.com' })]);
    const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const simpleFromResult = Promise.resolve([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } })]);
    const innerFromResult = { innerJoin: innerJoinFn };
    let first = true;
    const fromFn = vi.fn().mockImplementation(() => {
      if (first) { first = false; return simpleFromResult; }
      return innerFromResult;
    });
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetMonthlySpend.mockResolvedValue(100);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 1, checkedUsers: 1 });
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ ALERT_TO_EMAIL: 'alert@test.com' }),
      ['email'],
    );
  });
});
