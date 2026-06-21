/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Phase D2 tests mock @hamafx/shared/encryption with a permissive
// stub so we can inject BYOK payloads via __setByok without
// round-tripping through AES-GCM.
let byokPayload: Record<string, string> = {};
vi.mock('@hamafx/shared/encryption', () => ({
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
  ],
  decryptByok: () => byokPayload,
  encryptByok: () => '',
  configuredProviders: (keys: Record<string, unknown>) =>
    Object.keys(keys) as never[],
  __setByok: (p: Record<string, string>) => {
    byokPayload = p;
  },
}));

import {
  resolveVisionModel,
  resolveEmbeddingModel,
} from '../src/model';

const ENV = {
  AI_GATEWAY_API_KEY: '',
  GOOGLE_GENERATIVE_AI_API_KEY: '',
  GOOGLE_VERTEX_PROJECT: '',
  GOOGLE_VERTEX_LOCATION: '',
  GOOGLE_APPLICATION_CREDENTIALS_JSON: '',
  GOOGLE_APPLICATION_CREDENTIALS: '',
  AI_VISION_MODEL: '',
  AI_EMBEDDING_MODEL: '',
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod = await import('@hamafx/shared/encryption' as any);
const __setByok = (p: Record<string, string>) => mod.__setByok(p);

beforeEach(() => {
  __setByok({});
});

describe('resolveVisionModel — Phase D2 user-pickable vision', () => {
  it('honors user_settings.visionModel when set + valid + vision-capable', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveVisionModel(
      {
        aiApiKeys: 'encrypted' as never,
        visionModel: 'google:gemini-2.5-pro',
      },
      ENV,
    );
    expect(result.providerId).toBe('google');
    expect(result.bareModelId).toBe('gemini-2.5-pro');
    expect(result.modelId).toBe('google/gemini-2.5-pro');
  });

  it('falls back to env.AI_VISION_MODEL when no user pick', () => {
    // Operator-set vision id uses the AI_GATEWAY_API_KEY or Vertex
    // path. Use a Vertex-prefixed id (no GOOGLE_GENERATIVE_AI_API_KEY
    // needed) so resolveModel can route via the configured provider.
    __setByok({ vertex: 'sa-json-blob' });
    const result = resolveVisionModel(
      { aiApiKeys: 'encrypted' as never, visionModel: null },
      {
        ...ENV,
        GOOGLE_VERTEX_PROJECT: 'fake-project',
        GOOGLE_VERTEX_LOCATION: 'us-central1',
        GOOGLE_APPLICATION_CREDENTIALS_JSON: '{"client_email":"x","private_key":"y"}',
        AI_VISION_MODEL: 'google-vertex/gemini-2.5-pro',
      },
    );
    expect(result.bareModelId).toBe('gemini-2.5-pro');
  });

  it('falls back to spec.defaultModels.vision of the priority-ordered configured provider', () => {
    __setByok({ anthropic: 'a'.repeat(40) });
    const result = resolveVisionModel(
      { aiApiKeys: 'encrypted' as never, visionModel: null },
      ENV,
    );
    // Anthropic supports vision; its spec.defaultModels.vision is set.
    expect(result.providerId).toBe('anthropic');
    expect(result.bareModelId).toBeTruthy();
  });

  it('skips priority providers that do not support vision', () => {
    // DeepSeek + Google. DeepSeek has no vision support; resolver
    // should fall through to Google (which does).
    __setByok({ deepseek: 'a'.repeat(40), google: 'b'.repeat(40) });
    const result = resolveVisionModel(
      { aiApiKeys: 'encrypted' as never, visionModel: null },
      ENV,
    );
    expect(result.providerId).toBe('google');
  });

  it('throws when no vision-capable provider is configured', () => {
    __setByok({});
    expect(() =>
      resolveVisionModel(
        { aiApiKeys: 'encrypted' as never, visionModel: null },
        ENV,
      ),
    ).toThrow(/No vision-capable model available/);
  });

  it('silently ignores an invalid user pick (falls through to env or spec)', () => {
    __setByok({ google: 'a'.repeat(40) });
    // Pick targets a model that doesn't exist in google's catalog.
    const result = resolveVisionModel(
      {
        aiApiKeys: 'encrypted' as never,
        visionModel: 'google:nonexistent-model',
      },
      ENV,
    );
    // Falls through to spec.defaultModels.vision of google.
    expect(result.providerId).toBe('google');
    expect(result.bareModelId).toBeTruthy();
  });
});

describe('resolveEmbeddingModel — Phase D2 user-pickable embedding', () => {
  it('honors user_settings.embeddingModel when set + valid + embedding-capable', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveEmbeddingModel(
      {
        aiApiKeys: 'encrypted' as never,
        embeddingModel: 'google:text-embedding-004',
      },
      ENV,
    );
    expect(result).toBe('google/text-embedding-004');
  });

  it('falls back to env.AI_EMBEDDING_MODEL when no user pick', () => {
    const result = resolveEmbeddingModel(
      { aiApiKeys: 'encrypted' as never, embeddingModel: null },
      { ...ENV, AI_EMBEDDING_MODEL: 'openai/text-embedding-3-large' },
    );
    expect(result).toBe('openai/text-embedding-3-large');
  });

  it('falls back to spec.defaultModels.embedding of the priority-ordered configured provider', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveEmbeddingModel(
      { aiApiKeys: 'encrypted' as never, embeddingModel: null },
      ENV,
    );
    expect(result).toMatch(/^google\//);
  });

  it('skips providers that do not support embedding', () => {
    // Anthropic + Google. Anthropic lacks embedding; resolver should
    // land on google.
    __setByok({ anthropic: 'a'.repeat(40), google: 'b'.repeat(40) });
    const result = resolveEmbeddingModel(
      { aiApiKeys: 'encrypted' as never, embeddingModel: null },
      ENV,
    );
    expect(result).toMatch(/^google\//);
  });

  it('returns the hardcoded universal default when nothing is configured', () => {
    __setByok({});
    const result = resolveEmbeddingModel(
      { aiApiKeys: 'encrypted' as never, embeddingModel: null },
      ENV,
    );
    expect(result).toBe('openai/text-embedding-3-small');
  });

  it('silently ignores an invalid user pick (falls through to env)', () => {
    __setByok({ google: 'a'.repeat(40) });
    // Pick targets a model that doesn't exist in google's catalog.
    const result = resolveEmbeddingModel(
      {
        aiApiKeys: 'encrypted' as never,
        embeddingModel: 'google:nonexistent-model',
      },
      ENV,
    );
    // Falls through to google's spec.defaultModels.embedding.
    expect(result).toMatch(/^google\//);
  });
});