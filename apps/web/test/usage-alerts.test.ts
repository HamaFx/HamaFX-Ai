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
  getUserWithSettings: vi.fn(),
}));

vi.mock('@hamafx/ai', () => ({
  getMonthlySpend: vi.fn(),
  getProviderMonthlySpend: vi.fn(),
  sendDirectNotification: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b, op: 'eq' }),
}));

import { getDb, getUserWithSettings } from '@hamafx/db';
import { getMonthlySpend, getProviderMonthlySpend, sendDirectNotification } from '@hamafx/ai';

import { checkAllUsageAlerts, resetSentAlerts } from '../src/lib/usage-alerts';

const mockDb = vi.mocked(getDb);
const mockGetUserWithSettings = vi.mocked(getUserWithSettings);
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
  } as Record<string, unknown>;
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    name: null,
    email: 'user@example.com',
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  resetSentAlerts();
});

describe('checkAllUsageAlerts', () => {
  it('returns zeros when there are no user settings', async () => {
    const fromFn = vi.fn().mockResolvedValue([]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 0 });
  });

  it('skips users without budget limit or thresholds', async () => {
    const fromFn = vi.fn().mockResolvedValue([makeSettings()]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 0 });
  });

  it('skips users without alert config channels', async () => {
    const fromFn = vi.fn().mockResolvedValue([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: {} })]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 0 });
  });

  it('skips users with alert config but no reachable channels', async () => {
    const fromFn = vi.fn().mockResolvedValue([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } })]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: makeSettings({ alertEmail: null }),
      user: makeUser({ email: null }),
    } as never);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 1 });
  });

  it('sends alert when monthly spend exceeds limit (100%)', async () => {
    const settings = makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } });
    const fromFn = vi.fn().mockResolvedValue([settings]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: makeSettings({ alertEmail: 'user@example.com' }),
      user: makeUser({ email: 'user@example.com' }),
    } as never);
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
    const settings = makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } });
    const fromFn = vi.fn().mockResolvedValue([settings]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: makeSettings({ alertEmail: 'user@example.com' }),
      user: makeUser({ email: 'user@example.com' }),
    } as never);
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
    const settings = makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } });
    const fromFn = vi.fn().mockResolvedValue([settings]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: makeSettings({ alertEmail: 'user@example.com' }),
      user: makeUser({ email: 'user@example.com' }),
    } as never);
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
    const settings = makeSettings({ providerSpendingThresholds: { openai: 50 }, spendAlertsConfig: { email: true } });
    const fromFn = vi.fn().mockResolvedValue([settings]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: makeSettings({ alertEmail: 'user@example.com' }),
      user: makeUser({ email: 'user@example.com' }),
    } as never);
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
    const settings = makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { telegram: true } });
    const fromFn = vi.fn().mockResolvedValue([settings]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: makeSettings({ telegramBotToken: 'bot-token', telegramChatId: 'chat-id' }),
      user: makeUser({ email: 'user@example.com' }),
    } as never);
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
    const settings = makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true, telegram: true } });
    const fromFn = vi.fn().mockResolvedValue([settings]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: makeSettings({ alertEmail: 'user@example.com', telegramBotToken: 'bot', telegramChatId: 'chat' }),
      user: makeUser({ email: 'user@example.com' }),
    } as never);
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
    const fromFn = vi.fn().mockResolvedValue(settings);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);

    let callCount = 0;
    mockGetUserWithSettings.mockImplementation((async () => {
      callCount++;
      if (callCount === 1) {
        return { settings: makeSettings({ alertEmail: 'user1@test.com' }), user: makeUser({ email: 'user1@test.com' }) } as never;
      }
      return { settings: makeSettings({ alertEmail: 'user2@test.com' }), user: makeUser({ email: 'user2@test.com' }) } as never;
    }) as never);

    mockGetMonthlySpend.mockResolvedValue(100);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result.checkedUsers).toBe(2);
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it('does not send alerts when spend is below all thresholds', async () => {
    const settings = makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } });
    const fromFn = vi.fn().mockResolvedValue([settings]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: makeSettings({ alertEmail: 'user@example.com' }),
      user: makeUser({ email: 'user@example.com' }),
    } as never);
    mockGetMonthlySpend.mockResolvedValue(10);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 1 });
  });

  it('uses alertEmail over user email when both are present', async () => {
    const settings = makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } });
    const fromFn = vi.fn().mockResolvedValue([settings]);
    mockDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: fromFn }) } as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: makeSettings({ alertEmail: 'alert@test.com' }),
      user: makeUser({ email: 'user@test.com' }),
    } as never);
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
