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

// Tests for the worker env loader. Pure-zod, no IO.

import { describe, expect, it } from 'vitest';

import { loadEnv, resolveDatabaseUrl } from '../src/env';

const VALID = {
  DATABASE_URL: 'postgres://user:pw@localhost:5432/db',
  NODE_ENV: 'test' as const,
};

describe('loadEnv', () => {
  it('accepts the minimal happy path', () => {
    const env = loadEnv(VALID as unknown as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe(VALID.DATABASE_URL);
    expect(env.BIQUOTE_HUB_URL).toBe('https://biquote.io/hubs/tick');
    expect(env.DEPLOYED_SHA).toBe('unknown');
    expect(env.NODE_ENV).toBe('test');
  });

  it('accepts POSTGRES_URL as an alternative to DATABASE_URL', () => {
    const env = loadEnv({
      POSTGRES_URL: 'postgres://user:pw@localhost:5432/db',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.POSTGRES_URL).toBe('postgres://user:pw@localhost:5432/db');
  });

  it('throws when neither DATABASE_URL nor POSTGRES_URL is set in production', () => {
    expect(() =>
      loadEnv({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL or POSTGRES_URL/);
  });

  it('allows missing DATABASE_URL in development (PGlite mode)', () => {
    const env = loadEnv({ NODE_ENV: 'development' } as unknown as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.POSTGRES_URL).toBeUndefined();
    expect(env.NODE_ENV).toBe('development');
  });

  it('rejects malformed URLs', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: 'not-a-url' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid worker environment/);
  });

  it('honors BIQUOTE_HUB_URL override when set', () => {
    const env = loadEnv({
      ...VALID,
      BIQUOTE_HUB_URL: 'https://biquote.example/hubs/tick',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.BIQUOTE_HUB_URL).toBe('https://biquote.example/hubs/tick');
  });

  it('makes healthcheck UUIDs optional (no-op in dev)', () => {
    const env = loadEnv(VALID as unknown as NodeJS.ProcessEnv);
    expect(env.HC_SIGNALR_UUID).toBeUndefined();
    expect(env.HC_BACKUP_DB_UUID).toBeUndefined();
  });

  it('treats empty HC UUIDs as undefined (operator can leave the row blank)', () => {
    const env = loadEnv({
      ...VALID,
      HC_SIGNALR_UUID: '',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.HC_SIGNALR_UUID).toBeUndefined();
  });
});

describe('resolveDatabaseUrl', () => {
  it('prefers DATABASE_URL over POSTGRES_URL', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://primary',
      POSTGRES_URL: 'postgres://secondary',
    } as unknown as NodeJS.ProcessEnv);
    expect(resolveDatabaseUrl(env)).toBe('postgres://primary');
  });

  it('falls through to POSTGRES_URL when DATABASE_URL is unset', () => {
    const env = loadEnv({
      POSTGRES_URL: 'postgres://only',
    } as unknown as NodeJS.ProcessEnv);
    expect(resolveDatabaseUrl(env)).toBe('postgres://only');
  });
});
