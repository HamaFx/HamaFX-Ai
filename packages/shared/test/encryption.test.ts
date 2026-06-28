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

// Must mock server-only before the first import that pulls it in.
import { vi, beforeAll, describe, expect, it } from 'vitest';
vi.mock('server-only', () => ({}));

import {
  encryptByok,
  decryptByok,
  encryptWithPassword,
  decryptWithPassword,
  describeByok,
  configuredProviders,
  encryptSecret,
  decryptSecret,
  PROVIDER_IDS,
} from '../src/encryption';

const ENCRYPTION_SECRET = 'a'.repeat(64); // 32 bytes hex

beforeAll(() => {
  process.env.ENCRYPTION_SECRET = ENCRYPTION_SECRET;
});

// ---------------------------------------------------------------------------
// encryptByok / decryptByok
// ---------------------------------------------------------------------------
describe('encryptByok / decryptByok', () => {
  const payload = { openai: 'sk-test-key-12345', anthropic: 'sk-ant-test' };

  it('round-trips a BYOK payload', () => {
    const encrypted = encryptByok(payload);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.split('.')).toHaveLength(3);
    const decrypted = decryptByok(encrypted);
    expect(decrypted).toEqual(payload);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = encryptByok(payload);
    const b = encryptByok(payload);
    expect(a).not.toBe(b);
  });

  it('returns null when decrypting null / undefined', () => {
    expect(decryptByok(null)).toBeNull();
    expect(decryptByok(undefined)).toBeNull();
  });

  it('returns null for malformed encrypted string', () => {
    expect(decryptByok('not-enough-parts')).toBeNull();
    expect(decryptByok('too.many.parts.here')).toBeNull();
  });

  it('returns null for tampered ciphertext', () => {
    const encrypted = encryptByok(payload);
    const parts = encrypted.split('.');
    // Flip a bit in the ciphertext
    const tampered = [parts[0], parts[1]!.slice(0, -1) + '0', parts[2]!].join('.');
    expect(decryptByok(tampered)).toBeNull();
  });

  it('returns null with wrong key', () => {
    const encrypted = encryptByok(payload);
    process.env.ENCRYPTION_SECRET = 'b'.repeat(64);
    try {
      const result = decryptByok(encrypted);
      expect(result).toBeNull();
    } finally {
      process.env.ENCRYPTION_SECRET = ENCRYPTION_SECRET;
    }
  });

  it('handles empty object payload', () => {
    const encrypted = encryptByok({});
    const decrypted = decryptByok(encrypted);
    expect(decrypted).toEqual({});
  });

  it('handles single-key payload', () => {
    const payload = { google: 'test-key' };
    const encrypted = encryptByok(payload);
    const decrypted = decryptByok(encrypted);
    expect(decrypted).toEqual(payload);
  });

  it('throws when ENCRYPTION_SECRET is missing', () => {
    const original = process.env.ENCRYPTION_SECRET;
    delete process.env.ENCRYPTION_SECRET;
    try {
      expect(() => encryptByok(payload)).toThrow('ENCRYPTION_SECRET');
    } finally {
      process.env.ENCRYPTION_SECRET = original;
    }
  });

  it('throws when ENCRYPTION_SECRET is wrong length', () => {
    const original = process.env.ENCRYPTION_SECRET;
    process.env.ENCRYPTION_SECRET = 'tooshort';
    try {
      expect(() => encryptByok(payload)).toThrow('32 bytes');
    } finally {
      process.env.ENCRYPTION_SECRET = original;
    }
  });
});

// ---------------------------------------------------------------------------
// encryptWithPassword / decryptWithPassword
// ---------------------------------------------------------------------------
describe('encryptWithPassword / decryptWithPassword', () => {
  const password = 'my-strong-password-123!';

  it('round-trips a simple payload', () => {
    const payload = { secret: 'my-ultra-secret-value' };
    const encrypted = encryptWithPassword(payload, password);
    expect(typeof encrypted).toBe('string');
    // Format: salt.iv.ciphertext.authTag
    expect(encrypted.split('.')).toHaveLength(4);

    const decrypted = decryptWithPassword(encrypted, password);
    expect(decrypted).toEqual(payload);
  });

  it('returns null with wrong password', () => {
    const payload = { data: 'sensitive' };
    const encrypted = encryptWithPassword(payload, password);
    const result = decryptWithPassword(encrypted, 'wrong-password');
    expect(result).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(decryptWithPassword('too.few', password)).toBeNull();
    expect(decryptWithPassword('a.b.c.d.e', password)).toBeNull();
  });

  it('returns null for tampered ciphertext', () => {
    const payload = { x: 1 };
    const encrypted = encryptWithPassword(payload, password);
    const parts = encrypted.split('.');
    const tampered = [parts[0]!, parts[1]!, parts[2]!.slice(0, -2) + 'ff', parts[3]!].join('.');
    const result = decryptWithPassword(tampered, password);
    expect(result).toBeNull();
  });

  it('handles numeric and boolean payloads', () => {
    const payload = { count: 42, active: true, ratio: 3.14 };
    const encrypted = encryptWithPassword(payload, password);
    const decrypted = decryptWithPassword(encrypted, password);
    expect(decrypted).toEqual(payload);
  });

  it('produces different output each call (random salt + IV)', () => {
    const payload = { fixed: 'value' };
    const a = encryptWithPassword(payload, password);
    const b = encryptWithPassword(payload, password);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// describeByok / configuredProviders
// ---------------------------------------------------------------------------
describe('describeByok', () => {
  it('returns "none" for null payload', () => {
    expect(describeByok(null)).toBe('none');
  });

  it('returns "none" for empty payload', () => {
    expect(describeByok({})).toBe('none');
  });

  it('lists provider ids with non-empty keys', () => {
    const result = describeByok({ openai: 'sk-abc', anthropic: 'sk-xyz' });
    expect(result).toContain('openai');
    expect(result).toContain('anthropic');
  });

  it('skips empty-string keys', () => {
    const result = describeByok({ openai: '', anthropic: 'sk-xyz' });
    expect(result).not.toContain('openai');
    expect(result).toContain('anthropic');
  });
});

describe('configuredProviders', () => {
  it('returns empty array for null payload', () => {
    expect(configuredProviders(null)).toEqual([]);
  });

  it('returns empty array for empty payload', () => {
    expect(configuredProviders({})).toEqual([]);
  });

  it('returns matching ProviderId entries', () => {
    const result = configuredProviders({ openai: 'sk-abc', unknown_provider: 'test' } as any);
    expect(result).toEqual(['openai']);
  });

  it('filters out empty-string keys', () => {
    const result = configuredProviders({ openai: '', anthropic: 'sk-key' });
    expect(result).toEqual(['anthropic']);
  });

  it('only returns known PROVIDER_IDS', () => {
    const result = configuredProviders({
      openai: 'sk-key',
      vertex: 'sa-key',
      finnhub: 'fh-key',
    });
    for (const id of result) {
      expect(PROVIDER_IDS.includes(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// encryptSecret / decryptSecret (Phase 4 — SEC-3)
// ---------------------------------------------------------------------------
describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret string', () => {
    const plaintext = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
    const encrypted = encryptSecret(plaintext);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.split('.')).toHaveLength(3);
    expect(encrypted).not.toContain(plaintext);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = encryptSecret('test-token');
    const b = encryptSecret('test-token');
    expect(a).not.toBe(b);
  });

  it('returns null when decrypting null / undefined / empty', () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret(undefined)).toBeNull();
    expect(decryptSecret('')).toBeNull();
  });

  it('returns null for malformed encrypted strings', () => {
    expect(decryptSecret('not-encrypted')).toBeNull();
    expect(decryptSecret('aaaa.bbbb.cccc')).toBeNull();
    expect(
      decryptSecret('000000000000000000000000.aaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
    ).toBeNull();
  });
});
