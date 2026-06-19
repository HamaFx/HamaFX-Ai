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
