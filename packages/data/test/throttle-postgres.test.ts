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

import { closeDb, getDb } from '@hamafx/db';
import { providerThrottle } from '@hamafx/db/schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { tryReserve } from '../src/cache/throttle';

const testUrl = process.env.THROTTLE_TEST_DATABASE_URL;
const testConfirmation = 'I_UNDERSTAND_THIS_IS_A_TEST_DATABASE';
const runPostgresTest =
  process.env.RUN_PG_TESTS === 'true' &&
  Boolean(testUrl) &&
  process.env.THROTTLE_TEST_DATABASE_CONFIRM === testConfirmation;
const provider = `__throttle_regression_${process.pid}_${Date.now()}`;
const environmentKeys = ['DATABASE_URL', 'POSTGRES_URL', 'NODE_ENV', 'THROTTLE_BACKEND'] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof environmentKeys)[number], string | undefined>;
let databaseOpened = false;

function restoreEnvironment(): void {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function assertSafeTestUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('THROTTLE_TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }

  const localHost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  const databaseName = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  const postgresProtocol = parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:';
  const productionLooking = /(?:^|[_-])(prod|production|live)(?:$|[_-])/i.test(databaseName);
  const dedicatedTestDatabase = /(?:^|[_-])(test|testing|ci|dev|development|staging|local)(?:$|[_-])/i.test(databaseName);
  if (
    !postgresProtocol ||
    productionLooking ||
    (!localHost && !dedicatedTestDatabase) ||
    process.env.THROTTLE_TEST_DATABASE_CONFIRM !== testConfirmation
  ) {
    throw new Error(
      'Refusing to run the throttle integration test without an explicitly confirmed dedicated test database',
    );
  }
}

/**
 * Opt-in integration test for the exact postgres-js/Drizzle path used in
 * production. It is skipped unless both variables are explicitly supplied:
 *
 *   RUN_PG_TESTS=true
 *   THROTTLE_TEST_DATABASE_URL=postgres://.../dedicated-test-database
 *   THROTTLE_TEST_DATABASE_CONFIRM=I_UNDERSTAND_THIS_IS_A_TEST_DATABASE
 *
 * The test only touches its synthetic provider row and removes it afterward.
 */
describe.runIf(runPostgresTest)('tryReserve — PostgreSQL integration', () => {
  beforeAll(() => {
    if (!testUrl) throw new Error('THROTTLE_TEST_DATABASE_URL is required');
    if (process.env.THROTTLE_TEST_DATABASE_CONFIRM !== testConfirmation) {
      throw new Error(`Set THROTTLE_TEST_DATABASE_CONFIRM=${testConfirmation} to run this test`);
    }
    assertSafeTestUrl(testUrl);

    process.env.DATABASE_URL = testUrl;
    delete process.env.POSTGRES_URL;
    process.env.NODE_ENV = 'production';
    process.env.THROTTLE_BACKEND = 'postgres';
    getDb();
    databaseOpened = true;
  });

  afterAll(async () => {
    try {
      if (databaseOpened) {
        await getDb().delete(providerThrottle).where(eq(providerThrottle.provider, provider));
      }
    } finally {
      if (databaseOpened) await closeDb();
      restoreEnvironment();
    }
  });

  it('executes the typed conflict update and enforces the shared window limit', async () => {
    const cfg = { limit: 2, windowMs: 60_000 };

    expect(await tryReserve(provider, cfg)).toBe(true);
    expect(await tryReserve(provider, cfg)).toBe(true);
    expect(await tryReserve(provider, cfg)).toBe(false);
  });
});
