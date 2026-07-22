// SPDX-License-Identifier: Apache-2.0

import { vi } from 'vitest';

/**
 * Mocks the `auth()` function from NextAuth to return a specific user session.
 * Ensure you call `vi.mock('@/auth')` at the top of your test file before using this.
 *
 * @param userId The ID of the user to mock in the session
 */
export function mockNextAuthSession(userId: string) {
  const authMock = async () => ({
    user: {
      id: userId,
      email: `testuser-${userId}@example.com`,
    },
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
  });

  return authMock;
}

/**
 * Mocks legacy authentication mode bypass for tests.
 */
export function mockLegacyMode() {
  process.env.AUTH_MODE = 'legacy';
  return async () => ({
    user: {
      id: '__system__',
      email: 'system@hamafx.local',
    },
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
  });
}
