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

// model.ts pulls in @hamafx/shared/encryption which contains
// `import 'server-only'` — that throws at import time, not at
// runtime, so a plain test import fails. Mock the encryption module
// with permissive stubs (we don't exercise the AES path here).
vi.mock('@hamafx/shared/encryption', () => ({
  decryptByok: (_payload: string | null | undefined) => null,
  encryptByok: (payload: unknown) => JSON.stringify(payload),
  configuredProviders: () => [] as string[],
  PROVIDER_IDS: [
    'google',
    'vertex',
    'anthropic',
    'openai',
    'groq',
    'mistral',
    'openrouter',
    'xai',
    'deepseek',
  ] as const,
  describeByok: () => 'none',
}));

import { describe, expect, it } from 'vitest';

import { testProviderKey } from '../src/model';

/**
 * Build a service-account JSON object shaped like Google's IAM
 * exports. The private_key is a real (well, synthetic) PEM block
 * — the long Lorem-style base64 in the middle is enough to
 * satisfy our length check (256 char floor on the BYOK key).
 *
 * `overrides` lets a test REPLACE fields, or DELETE them entirely:
 *   - `makeVertexJson({ client_email: 'foo@bar' })` -> replaces
 *     client_email with foo@bar
 *   - `makeVertexJson({ client_email: undefined })` -> deletes the
 *     client_email field from the result (used by the shape
 *     validation tests to assert the missing-field error path).
 *
 * Why a string sentinel? Object.assign + spread can't delete a
 * property; the cleanest signal is `undefined`. We strip
 * undefined-valued overrides before serialising.
 */
function makeVertexJson(overrides: Record<string, string | undefined> = {}): string {
  const base: Record<string, string> = {
    type: 'service_account',
    project_id: 'hamafx-test-project',
    private_key_id: 'abc123def456',
    private_key:
      '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDSynthetic\n-----END PRIVATE KEY-----\n',
    client_email: 'hamafx-test@hamafx-test-project.iam.gserviceaccount.com',
    client_id: '111111111111111111111',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url:
      'https://www.googleapis.com/robot/v1/metadata/x509/hamafx-test',
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete base[k];
    } else {
      base[k] = v;
    }
  }
  return JSON.stringify(base);
}

describe('Phase D — testProviderKey (vertex)', () => {
  it('rejects too-short input', async () => {
    const r = await testProviderKey('vertex', 'short');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.toLowerCase()).toContain('too short');
    }
  });

  it('rejects invalid JSON', async () => {
    // Pad with valid-length garbage so the length floor passes
    // and we hit the JSON.parse path.
    const garbage = 'not-json ' + 'x'.repeat(260);
    const r = await testProviderKey('vertex', garbage);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.toLowerCase()).toContain('parse');
    }
  });

  it('rejects JSON missing client_email', async () => {
    const noEmail = makeVertexJson({ client_email: undefined });
    // Sanity check the helper: client_email really was deleted,
    // not just renamed. We check the parsed object rather than
    // string-searching (private_key_id also matches the substring
    // 'private_key' which would give a false positive).
    const parsed = JSON.parse(noEmail) as Record<string, unknown>;
    expect(parsed.client_email).toBeUndefined();
    const r = await testProviderKey('vertex', noEmail);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('client_email');
    }
  });

  it('rejects JSON missing private_key', async () => {
    const noKey = makeVertexJson({ private_key: undefined });
    const parsed = JSON.parse(noKey) as Record<string, unknown>;
    expect(parsed.private_key).toBeUndefined();
    const r = await testProviderKey('vertex', noKey);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('private_key');
    }
  });

  it('rejects when client_email is not an email', async () => {
    const bad = makeVertexJson({ client_email: 'not-an-email' });
    const r = await testProviderKey('vertex', bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('email');
    }
  });

  it('rejects when private_key is not a PEM block', async () => {
    const bad = makeVertexJson({ private_key: 'this-is-not-a-pem-block' });
    const r = await testProviderKey('vertex', bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('PEM');
    }
  });

  it('rejects when project_id is missing AND GOOGLE_VERTEX_PROJECT is unset', async () => {
    // The synthetic JSON has project_id, so to test this branch
    // we strip it AND mock GOOGLE_VERTEX_PROJECT to be empty.
    const original = process.env.GOOGLE_VERTEX_PROJECT;
    delete process.env.GOOGLE_VERTEX_PROJECT;
    try {
      const noProject = makeVertexJson({ project_id: undefined });
      const r = await testProviderKey('vertex', noProject);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.toLowerCase()).toContain('project');
      }
    } finally {
      if (original !== undefined) process.env.GOOGLE_VERTEX_PROJECT = original;
    }
  });
});
