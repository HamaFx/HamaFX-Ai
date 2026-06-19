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

import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTO_GENERATED_SECRETS,
  SECRET_MIN_BYTES,
  generateSecret,
} from '../src/env-secrets';
import { parseServerEnv } from '../src/env';

const MINIMAL_ENV = {
  // At least one AI transport AND one DB URL must be configured.
  AI_GATEWAY_API_KEY: 'test-gateway-key',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
};

afterEach(() => {
  // Wipe any test-only envs we set so they don't bleed into other tests.
  for (const k of AUTO_GENERATED_SECRETS) delete process.env[k];
  delete process.env.NEXTAUTH_URL;
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
});

describe('generateSecret', () => {
  it('returns a hex string of 2 * bytes characters', () => {
    const s = generateSecret(16);
    expect(s).toMatch(/^[0-9a-f]{32}$/);
  });

  it('default length (32 bytes) is 64 hex chars', () => {
    expect(generateSecret()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a different value each call', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
  });
});

describe('AUTO_GENERATED_SECRETS', () => {
  it('contains the three auto-generatable secrets', () => {
    expect(AUTO_GENERATED_SECRETS).toEqual([
      'NEXTAUTH_SECRET',
      'ENCRYPTION_SECRET',
      'CRON_SECRET',
    ]);
  });

  it('SECRET_MIN_BYTES covers each secret with sufficient length', () => {
    for (const key of AUTO_GENERATED_SECRETS) {
      expect(SECRET_MIN_BYTES[key]).toBeGreaterThanOrEqual(16);
    }
  });
});

describe('parseServerEnv — dev mode secret ergonomics', () => {
  it('accepts missing secrets when NODE_ENV=development', () => {
    const env = parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'development' });
    // In dev the secrets are optional — the actual values are filled in
    // by the web app's loadOrGenerateDevSecrets() before this is called.
    // parseServerEnv itself does not autofill (that's a web-app concern
    // so it can persist to disk).
    expect(env.NODE_ENV).toBe('development');
    expect(env.NEXTAUTH_SECRET).toBeUndefined();
    expect(env.ENCRYPTION_SECRET).toBeUndefined();
    expect(env.CRON_SECRET).toBeUndefined();
  });

  it('accepts missing secrets when NODE_ENV=test', () => {
    const env = parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'test' });
    expect(env.NODE_ENV).toBe('test');
  });

  it('accepts present secrets in any environment', () => {
    const env = parseServerEnv({
      ...MINIMAL_ENV,
      NODE_ENV: 'development',
      NEXTAUTH_SECRET: 'a'.repeat(32),
      ENCRYPTION_SECRET: 'b'.repeat(32),
      CRON_SECRET: 'c'.repeat(20),
    });
    expect(env.NEXTAUTH_SECRET).toBe('a'.repeat(32));
    expect(env.ENCRYPTION_SECRET).toBe('b'.repeat(32));
    expect(env.CRON_SECRET).toBe('c'.repeat(20));
  });
});

describe('parseServerEnv — production requires secrets', () => {
  it('throws when NODE_ENV=production and secrets missing', () => {
    expect(() =>
      parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'production' }),
    ).toThrow(/NEXTAUTH_SECRET|ENCRYPTION_SECRET|CRON_SECRET/);
  });

  it('throws when only NEXTAUTH_SECRET is present in production', () => {
    expect(() =>
      parseServerEnv({
        ...MINIMAL_ENV,
        NODE_ENV: 'production',
        NEXTAUTH_SECRET: 'a'.repeat(32),
      }),
    ).toThrow(/ENCRYPTION_SECRET|CRON_SECRET/);
  });

  it('accepts production when all three secrets present', () => {
    const env = parseServerEnv({
      ...MINIMAL_ENV,
      NODE_ENV: 'production',
      NEXTAUTH_SECRET: 'a'.repeat(32),
      ENCRYPTION_SECRET: 'b'.repeat(32),
      CRON_SECRET: 'c'.repeat(20),
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.NEXTAUTH_SECRET).toBe('a'.repeat(32));
  });
});

describe('parseServerEnv — secret length validation', () => {
  it('rejects short NEXTAUTH_SECRET when provided', () => {
    expect(() =>
      parseServerEnv({
        ...MINIMAL_ENV,
        NODE_ENV: 'development',
        NEXTAUTH_SECRET: 'too-short',
      }),
    ).toThrow(/NEXTAUTH_SECRET/);
  });

  it('rejects short ENCRYPTION_SECRET when provided', () => {
    expect(() =>
      parseServerEnv({
        ...MINIMAL_ENV,
        NODE_ENV: 'development',
        ENCRYPTION_SECRET: 'too-short',
      }),
    ).toThrow(/ENCRYPTION_SECRET/);
  });

  it('rejects short CRON_SECRET when provided', () => {
    expect(() =>
      parseServerEnv({
        ...MINIMAL_ENV,
        NODE_ENV: 'development',
        CRON_SECRET: 'short',
      }),
    ).toThrow(/CRON_SECRET/);
  });
});