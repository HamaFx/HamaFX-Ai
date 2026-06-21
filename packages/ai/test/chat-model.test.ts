/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { vi } from 'vitest';

// Phase E tests mock @hamafx/shared/encryption with a permisssive
// stub. We replicate that here so we can inject BYOK payloads via
// `__setByok` without round-tripping through AES-GCM.
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

import { beforeEach, describe, expect, it } from 'vitest';

import {
  BYOK_PROVIDERS,
  derivePlannerModel,
  deriveTitleModel,
  resolveChatModel,
} from '../src/model';

const ENV = {
  AI_GATEWAY_API_KEY: '',
  GOOGLE_GENERATIVE_AI_API_KEY: '',
  GOOGLE_VERTEX_PROJECT: '',
  GOOGLE_VERTEX_LOCATION: '',
  GOOGLE_APPLICATION_CREDENTIALS_JSON: '',
  GOOGLE_APPLICATION_CREDENTIALS: '',
  AI_DEFAULT_MODEL: 'google-vertex/gemini-2.5-flash',
} as const;

// Reach into the mock to set the BYOK payload for each test.
let __setByok!: (p: Record<string, string>) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod = await import('@hamafx/shared/encryption' as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
__setByok = (mod as any).__setByok;

beforeEach(() => {
  __setByok({});
});

describe('Phase F — resolveChatModel', () => {
  it('throws when no keys are configured', () => {
    __setByok({});
    expect(() =>
      resolveChatModel({ aiApiKeys: null, chatModel: null }, ENV),
    ).toThrow(/No AI API keys configured/);
  });

  it('honors userSettings.chatModel when set and valid', () => {
    __setByok({ anthropic: 'sk-ant-test' });
    const r = resolveChatModel(
      {
        aiApiKeys: null,
        chatModel: 'anthropic:claude-haiku-4-5',
      },
      ENV,
    );
    expect(r.providerId).toBe('anthropic');
    expect(r.bareModelId).toBe('claude-haiku-4-5');
    expect(r.modelId).toBe('anthropic/claude-haiku-4-5');
  });

  it('falls back to spec defaults when chatModel is null', () => {
    __setByok({ google: 'goog-test' });
    const r = resolveChatModel(
      { aiApiKeys: null, chatModel: null },
      ENV,
    );
    expect(r.providerId).toBe('google');
    expect(r.bareModelId).toBe(BYOK_PROVIDERS.google.defaultModels.technical);
    expect(r.modelId).toBe(
      `google/${BYOK_PROVIDERS.google.defaultModels.technical}`,
    );
  });

  it('falls back to spec defaults when chatModel is invalid (unknown provider)', () => {
    __setByok({ google: 'goog-test' });
    const r = resolveChatModel(
      { aiApiKeys: null, chatModel: 'mystery:gpt-5' },
      ENV,
    );
    // Invalid chatModel is silently ignored → spec defaults used.
    expect(r.providerId).toBe('google');
  });

  it('falls back to spec defaults when chatModel points at a provider with no key', () => {
    __setByok({ google: 'goog-test' });
    const r = resolveChatModel(
      { aiApiKeys: null, chatModel: 'anthropic:claude-sonnet-4-5' },
      ENV,
    );
    // Anthropic isn't configured; resolver falls back to google.
    expect(r.providerId).toBe('google');
  });

  it('falls back to spec defaults when chatModel has unknown bare model id', () => {
    __setByok({ anthropic: 'sk-ant-test' });
    const r = resolveChatModel(
      { aiApiKeys: null, chatModel: 'anthropic:gpt-99' },
      ENV,
    );
    // Unknown bare id is silently ignored → spec defaults used.
    expect(r.providerId).toBe('anthropic');
    expect(r.bareModelId).toBe(
      BYOK_PROVIDERS.anthropic.defaultModels.technical,
    );
  });

  it('respects PROVIDER_PRIORITY when multiple providers are configured', () => {
    __setByok({ anthropic: 'sk-ant', openai: 'sk-openai', google: 'goog' });
    const r = resolveChatModel(
      { aiApiKeys: null, chatModel: null },
      ENV,
    );
    // PROVIDER_PRIORITY starts with google → google wins.
    expect(r.providerId).toBe('google');
  });

  it('priority order: anthropic > openai when google is not configured', () => {
    __setByok({ anthropic: 'sk-ant', openai: 'sk-openai' });
    const r = resolveChatModel(
      { aiApiKeys: null, chatModel: null },
      ENV,
    );
    expect(r.providerId).toBe('anthropic');
  });

  it('priority order: openai alone wins over higher-priority providers', () => {
    __setByok({ openai: 'sk-openai' });
    const r = resolveChatModel(
      { aiApiKeys: null, chatModel: null },
      ENV,
    );
    expect(r.providerId).toBe('openai');
  });

  it('merges env-fallback keys with BYOK (env-only single-tenant case)', () => {
    // No BYOK set, but env has the Google key. Resolver picks google.
    __setByok({});
    const ENV_WITH_GOOGLE = {
      ...ENV,
      GOOGLE_GENERATIVE_AI_API_KEY: 'goog-env',
    };
    const r = resolveChatModel(
      { aiApiKeys: null, chatModel: null },
      ENV_WITH_GOOGLE,
    );
    expect(r.providerId).toBe('google');
  });
});

describe('Phase F — derivePlannerModel', () => {
  it('returns the same provider\'s summary model when user has chatModel set', () => {
    __setByok({ anthropic: 'sk-ant-test' });
    const r = derivePlannerModel(
      {
        aiApiKeys: null,
        chatModel: 'anthropic:claude-sonnet-4-5',
      },
      ENV,
    );
    expect(r).toBe(
      `anthropic/${BYOK_PROVIDERS.anthropic.defaultModels.summary}`,
    );
  });

  it('falls back to chat model when provider has no summary declared', () => {
    // If a provider spec omits `summary`, derivePlannerModel returns
    // the chat modelId itself (no cheap variant exists).
    __setByok({ google: 'goog' });
    // Monkey-patch the google spec for this test only.
    const original = BYOK_PROVIDERS.google.defaultModels.summary;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (BYOK_PROVIDERS.google.defaultModels as any).summary = null;
    try {
      const r = derivePlannerModel(
        { aiApiKeys: null, chatModel: null },
        ENV,
      );
      expect(r).toBe(`google/${BYOK_PROVIDERS.google.defaultModels.technical}`);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (BYOK_PROVIDERS.google.defaultModels as any).summary = original;
    }
  });

  it('returns null when no keys are configured', () => {
    __setByok({});
    expect(
      derivePlannerModel({ aiApiKeys: null, chatModel: null }, ENV),
    ).toBeNull();
  });
});

describe('Phase F — deriveTitleModel', () => {
  it('returns the same provider\'s summary model', () => {
    __setByok({ anthropic: 'sk-ant-test' });
    const r = deriveTitleModel(
      {
        aiApiKeys: null,
        chatModel: 'anthropic:claude-sonnet-4-5',
      },
      ENV,
    );
    expect(r).toBe(
      `anthropic/${BYOK_PROVIDERS.anthropic.defaultModels.summary}`,
    );
  });

  it('returns null when no keys are configured', () => {
    __setByok({});
    expect(
      deriveTitleModel({ aiApiKeys: null, chatModel: null }, ENV),
    ).toBeNull();
  });
});
