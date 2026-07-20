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

const mockGetUserWithSettings = vi.hoisted(() => vi.fn());
const mockListAllUserSettings = vi.hoisted(() => vi.fn());
const mockGetMonthlySpend = vi.hoisted(() => vi.fn());
const mockGetProviderMonthlySpend = vi.hoisted(() => vi.fn());
const mockSendNotification = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/db', () => ({
  getDb: vi.fn(),
  listAllUserSettings: mockListAllUserSettings,
  getUserWithSettings: mockGetUserWithSettings,
  schema: { userSettings: 'userSettings', users: 'users' },
}));

vi.mock('@hamafx/ai', () => ({
  getMonthlySpend: mockGetMonthlySpend,
  getProviderMonthlySpend: mockGetProviderMonthlySpend,
  sendDirectNotification: mockSendNotification,
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b, op: 'eq' }),
  sql: (strings: TemplateStringsArray, ..._values: unknown[]) => ({ sql: strings.join('?') }),
}));

import { checkAllUsageAlerts, resetSentAlerts } from '../src/lib/usage-alerts';

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
    mockListAllUserSettings.mockResolvedValue([]);
    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 0 });
  });

  it('skips users without budget limit or thresholds', async () => {
    mockListAllUserSettings.mockResolvedValue([makeSettings()] as never);
    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 0 });
  });

  it('skips users without alert config channels', async () => {
    mockListAllUserSettings.mockResolvedValue([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: {} })] as never);
    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 0 });
  });

  it('sends alert when monthly spend exceeds limit (100%)', async () => {
    mockListAllUserSettings.mockResolvedValue([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } })] as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: makeSettings({ alertEmail: 'user@example.com' }),
      user: makeUser({ email: 'user@example.com' }),
    } as never);
    mockGetMonthlySpend.mockResolvedValue(100);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 1, checkedUsers: 1 });
  });

  it('does not send alerts when spend is below all thresholds', async () => {
    mockListAllUserSettings.mockResolvedValue([makeSettings({ monthlyBudgetLimit: 100, spendAlertsConfig: { email: true } })] as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: makeSettings({ alertEmail: 'user@example.com' }),
      user: makeUser({ email: 'user@example.com' }),
    } as never);
    mockGetMonthlySpend.mockResolvedValue(10);
    mockSendNotification.mockResolvedValue(undefined);

    const result = await checkAllUsageAlerts();
    expect(result).toEqual({ alertsSent: 0, checkedUsers: 1 });
  });
});
