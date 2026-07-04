import { test as base, expect, type Page } from '@playwright/test';

export const DEFAULT_USER = { email: 'test@example.com', password: 'password123' } as const;
export { test, expect };
