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
  parseServerEnv,
  resolveDatabaseUrl,
  resolveDirectDatabaseUrl,
  ServerEnvSchema,
} from '../src/env';
import { AUTO_GENERATED_SECRETS, generateSecret, SECRET_MIN_BYTES } from '../src/env-secrets';

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
    expect(AUTO_GENERATED_SECRETS).toEqual(['NEXTAUTH_SECRET', 'ENCRYPTION_SECRET', 'CRON_SECRET']);
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
    expect(() => parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'production' })).toThrow(
      /NEXTAUTH_SECRET|ENCRYPTION_SECRET|CRON_SECRET/,
    );
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

describe('parseServerEnv — database URL variants', () => {
  it('accepts POSTGRES_URL as alternative to DATABASE_URL', () => {
    const env = parseServerEnv({
      AI_GATEWAY_API_KEY: 'test-key',
      POSTGRES_URL: 'postgres://user:pass@localhost:5432/db',
      NODE_ENV: 'test',
    });
    expect(env.POSTGRES_URL).toBe('postgres://user:pass@localhost:5432/db');
  });

  it('rejects when neither DATABASE_URL nor POSTGRES_URL is set', () => {
    expect(() =>
      parseServerEnv({
        AI_GATEWAY_API_KEY: 'test-key',
        NODE_ENV: 'test',
      }),
    ).toThrow(/DATABASE_URL|POSTGRES_URL/);
  });

  it('prefers DATABASE_URL over POSTGRES_URL', () => {
    const env = parseServerEnv({
      AI_GATEWAY_API_KEY: 'test-key',
      DATABASE_URL: 'postgres://a:pass@localhost:5432/db',
      POSTGRES_URL: 'postgres://b:pass@localhost:5432/db',
      NODE_ENV: 'test',
    });
    expect(env.DATABASE_URL).toBe('postgres://a:pass@localhost:5432/db');
  });
});

describe('parseServerEnv — AI transport variants', () => {
  it('accepts Google Vertex AI transport', () => {
    const env = parseServerEnv({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      GOOGLE_VERTEX_PROJECT: 'my-project',
      GOOGLE_VERTEX_LOCATION: 'us-central1',
      NODE_ENV: 'test',
    });
    expect(env.GOOGLE_VERTEX_PROJECT).toBe('my-project');
  });

  it('accepts Google Generative AI transport', () => {
    const env = parseServerEnv({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
      NODE_ENV: 'test',
    });
    expect(env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('test-key');
  });

  it('rejects when no AI transport is configured', () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
        NODE_ENV: 'test',
      }),
    ).toThrow(/AI_GATEWAY_API_KEY/);
  });

  it('rejects Vertex AI when location is missing', () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
        GOOGLE_VERTEX_PROJECT: 'my-project',
        NODE_ENV: 'test',
      }),
    ).toThrow(/AI_GATEWAY_API_KEY/);
  });
});

describe('parseServerEnv — defaults and transforms', () => {
  it('defaults NODE_ENV to development', () => {
    const env = parseServerEnv({
      AI_GATEWAY_API_KEY: 'test-key',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    });
    expect(env.NODE_ENV).toBe('development');
  });

  it('coerces MAX_DAILY_USD from string', () => {
    const env = parseServerEnv({
      ...MINIMAL_ENV,
      NODE_ENV: 'test',
      MAX_DAILY_USD: '10',
    });
    expect(env.MAX_DAILY_USD).toBe(10);
  });

  it('coerces MAX_TOOL_ITERATIONS from string', () => {
    const env = parseServerEnv({
      ...MINIMAL_ENV,
      NODE_ENV: 'test',
      MAX_TOOL_ITERATIONS: '12',
    });
    expect(env.MAX_TOOL_ITERATIONS).toBe(12);
  });

  it('transforms LOG_PROMPTS="1" to boolean true', () => {
    const env = parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'test', LOG_PROMPTS: '1' });
    expect(env.LOG_PROMPTS).toBe(true);
  });

  it('transforms LOG_PROMPTS="0" to boolean false', () => {
    const env = parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'test', LOG_PROMPTS: '0' });
    expect(env.LOG_PROMPTS).toBe(false);
  });

  it('defaults LOG_PROMPTS to false', () => {
    const env = parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'test' });
    expect(env.LOG_PROMPTS).toBe(false);
  });

  it('transforms BYOK_ENABLED="true" to boolean true', () => {
    const env = parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'test', BYOK_ENABLED: 'true' });
    expect(env.BYOK_ENABLED).toBe(true);
  });

  it('transforms MULTI_USER_ENABLED="1" to boolean true', () => {
    const env = parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'test', MULTI_USER_ENABLED: '1' });
    expect(env.MULTI_USER_ENABLED).toBe(true);
  });

  it('transforms UNLIMITED_SYMBOLS="false" to boolean false', () => {
    const env = parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'test', UNLIMITED_SYMBOLS: 'false' });
    expect(env.UNLIMITED_SYMBOLS).toBe(false);
  });

  it('defaults AI_DEFAULT_MODEL', () => {
    const env = parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'test' });
    expect(env.AI_DEFAULT_MODEL).toBe('google-vertex/gemini-2.5-flash');
  });

  it('defaults AI_TITLE_MODEL', () => {
    const env = parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'test' });
    expect(env.AI_TITLE_MODEL).toBe('google-vertex/gemini-2.5-flash-lite');
  });

  it('defaults NEXT_PUBLIC_APP_URL', () => {
    const env = parseServerEnv({ ...MINIMAL_ENV, NODE_ENV: 'test' });
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
  });
});

describe('ServerEnvSchema — validation via safeParse', () => {
  it('rejects invalid URL for SUPABASE_URL', () => {
    const result = ServerEnvSchema.safeParse({
      ...MINIMAL_ENV,
      NODE_ENV: 'test',
      SUPABASE_URL: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive MAX_DAILY_USD', () => {
    const result = ServerEnvSchema.safeParse({
      ...MINIMAL_ENV,
      NODE_ENV: 'test',
      MAX_DAILY_USD: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer MAX_TOOL_ITERATIONS', () => {
    const result = ServerEnvSchema.safeParse({
      ...MINIMAL_ENV,
      NODE_ENV: 'test',
      MAX_TOOL_ITERATIONS: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('resolveDatabaseUrl', () => {
  it('returns DATABASE_URL when set', () => {
    const url = resolveDatabaseUrl({ DATABASE_URL: 'postgres://a:pass@localhost:5432/db' });
    expect(url).toBe('postgres://a:pass@localhost:5432/db');
  });

  it('falls back to POSTGRES_URL when DATABASE_URL is missing', () => {
    const url = resolveDatabaseUrl({ POSTGRES_URL: 'postgres://b:pass@localhost:5432/db' });
    expect(url).toBe('postgres://b:pass@localhost:5432/db');
  });

  it('throws when neither is set', () => {
    expect(() => resolveDatabaseUrl({})).toThrow(/DATABASE_URL.*POSTGRES_URL/);
  });

  it('prefers DATABASE_URL when both are set', () => {
    const url = resolveDatabaseUrl({
      DATABASE_URL: 'postgres://a:pass@localhost:5432/db1',
      POSTGRES_URL: 'postgres://b:pass@localhost:5432/db2',
    });
    expect(url).toBe('postgres://a:pass@localhost:5432/db1');
  });
});

describe('resolveDirectDatabaseUrl', () => {
  it('prefers DIRECT_URL when set', () => {
    const url = resolveDirectDatabaseUrl({
      DIRECT_URL: 'postgres://direct:pass@localhost:5432/db',
      POSTGRES_URL_NON_POOLING: 'postgres://np:pass@localhost:5432/db',
      DATABASE_URL: 'postgres://pooled:pass@localhost:5432/db',
      POSTGRES_URL: 'postgres://fallback:pass@localhost:5432/db',
    });
    expect(url).toBe('postgres://direct:pass@localhost:5432/db');
  });

  it('falls back through the non-pooled and legacy URL variants', () => {
    expect(
      resolveDirectDatabaseUrl({
        POSTGRES_URL_NON_POOLING: 'postgres://np:pass@localhost:5432/db',
        DATABASE_URL: 'postgres://pooled:pass@localhost:5432/db',
        POSTGRES_URL: 'postgres://fallback:pass@localhost:5432/db',
      }),
    ).toBe('postgres://np:pass@localhost:5432/db');

    expect(
      resolveDirectDatabaseUrl({
        DATABASE_URL: 'postgres://pooled:pass@localhost:5432/db',
        POSTGRES_URL: 'postgres://fallback:pass@localhost:5432/db',
      }),
    ).toBe('postgres://pooled:pass@localhost:5432/db');

    expect(
      resolveDirectDatabaseUrl({
        POSTGRES_URL: 'postgres://fallback:pass@localhost:5432/db',
      }),
    ).toBe('postgres://fallback:pass@localhost:5432/db');
  });

  it('throws when no direct-capable URL is available', () => {
    expect(() => resolveDirectDatabaseUrl({})).toThrow(
      /DIRECT_URL.*POSTGRES_URL_NON_POOLING.*DATABASE_URL.*POSTGRES_URL/,
    );
  });
});
