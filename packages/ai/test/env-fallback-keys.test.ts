import { afterEach, describe, expect, it, vi } from 'vitest';

import { envFallbackKeys } from '../src/model-helpers';

const PROCESS_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'OPENROUTER_API_KEY',
  'XAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'IAMHC_API_KEY',
  'HCNSEC_API_KEY',
] as const;

function withoutProcessKeys(): () => void {
  const saved = new Map<string, string | undefined>();
  for (const key of PROCESS_ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  return () => {
    for (const key of PROCESS_ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

const validVertexJson = JSON.stringify({
  client_email: 'kestrel@test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----\n',
  project_id: 'test-project',
});

const malformedVertexJson = '{not-valid-json';

describe('envFallbackKeys', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes a structurally valid Vertex service-account value', () => {
    const restore = withoutProcessKeys();
    try {
      const keys = envFallbackKeys({
        GOOGLE_APPLICATION_CREDENTIALS_JSON: validVertexJson,
      });
      expect(keys.vertex).toBe(validVertexJson);
    } finally {
      restore();
    }
  });

  it('skips malformed Vertex service-account JSON so it cannot poison resolution', () => {
    const restore = withoutProcessKeys();
    try {
      const keys = envFallbackKeys({
        GOOGLE_APPLICATION_CREDENTIALS_JSON: malformedVertexJson,
      });
      expect(keys.vertex).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('skips Vertex JSON that parses but lacks the required credential fields', () => {
    const restore = withoutProcessKeys();
    try {
      const keys = envFallbackKeys({
        GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({ project_id: 'test' }),
      });
      expect(keys.vertex).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('still surfaces other operator keys when Vertex is skipped', () => {
    const restore = withoutProcessKeys();
    try {
      process.env.MISTRAL_API_KEY = 'mistral-test-key';
      const keys = envFallbackKeys({
        GOOGLE_APPLICATION_CREDENTIALS_JSON: malformedVertexJson,
      });
      expect(keys.vertex).toBeUndefined();
      expect(keys.mistral).toBe('mistral-test-key');
    } finally {
      restore();
    }
  });
});
