export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

let _userIdCounter = 0;

export function makeUser(overrides?: Partial<MockUser>): MockUser {
  _userIdCounter++;
  return {
    id: overrides?.id ?? `test-user-${_userIdCounter}`,
    name: overrides?.name ?? `Test User ${_userIdCounter}`,
    email: overrides?.email ?? `testuser${_userIdCounter}@example.com`,
    role: overrides?.role ?? 'user',
  };
}

export function makeSession(userId: string): { user: MockUser; expires: string } {
  return {
    user: {
      id: userId,
      name: 'Test User',
      email: `testuser-${userId}@example.com`,
      role: 'user',
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

export function resetUserCounter(): void {
  _userIdCounter = 0;
}
