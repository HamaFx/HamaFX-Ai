import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

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

const mockLanguageModel = vi.fn(() => ({ modelId: 'mock-model' }));
vi.mock('@ai-sdk/google', () => ({
  google: vi.fn(() => mockLanguageModel()),
  createGoogleGenerativeAI: vi.fn(
    () => (modelId: string) => ({ modelId }),
  ),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ modelId })),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => (modelId: string) => ({ modelId })),
}));

vi.mock('@ai-sdk/google-vertex', () => ({
  createVertex: vi.fn(() => vi.fn(() => ({ modelId: 'vertex-mock' }))),
}));

const generateTextMock = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve([]),
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
  }),
  schema: {
    chatTelemetry: {},
    chatMessages: {},
  },
}));

import {
  BYOK_PROVIDERS,
  defaultModelFor,
  resolveChatModel,
  resolveEmbeddingModel,
  resolveModel,
  resolveModelForProvider,
  resolveVisionModel,
  testProviderKey,
} from '../src/model';

const ENV = {
  AI_GATEWAY_API_KEY: '',
  GOOGLE_GENERATIVE_AI_API_KEY: '',
  GOOGLE_VERTEX_PROJECT: '',
  GOOGLE_VERTEX_LOCATION: '',
  GOOGLE_APPLICATION_CREDENTIALS_JSON: '',
  GOOGLE_APPLICATION_CREDENTIALS: '',
  AI_EMBEDDING_MODEL: '',
} as const;

const mod = await import('@hamafx/shared/encryption' as never);
const __setByok = (mod as { __setByok: (p: Record<string, string>) => void }).__setByok;

beforeEach(() => {
  __setByok({});
  generateTextMock.mockReset();
});

describe('resolveModel — low-level model resolver', () => {
  it('returns LanguageModel for google-vertex/ prefix', () => {
    const env = {
      ...ENV,
      GOOGLE_VERTEX_PROJECT: 'my-project',
      GOOGLE_VERTEX_LOCATION: 'us-central1',
    };
    const result = resolveModel('google-vertex/gemini-2.5-flash', env);
    expect(result).not.toBeInstanceOf(String);
    expect(typeof result).toBe('object');
  });

  it('returns string model id when AI_GATEWAY_API_KEY is set', () => {
    const env = { ...ENV, AI_GATEWAY_API_KEY: 'gw-key' };
    const result = resolveModel('openai/gpt-4o', env);
    expect(result).toBe('openai/gpt-4o');
  });

  it('returns LanguageModel for google/ prefix with GOOGLE_GENERATIVE_AI_API_KEY', () => {
    const env = { ...ENV, GOOGLE_GENERATIVE_AI_API_KEY: 'ai-key' };
    const result = resolveModel('google/gemini-2.5-flash', env);
    expect(result).not.toBeInstanceOf(String);
    expect(typeof result).toBe('object');
  });

  it('throws when google/ prefix is used without key or gateway', () => {
    expect(() => resolveModel('google/gemini-2.5-flash', ENV)).toThrow(
      /GOOGLE_GENERATIVE_AI_API_KEY is required/,
    );
  });

  it('throws when no transport is configured for the prefix', () => {
    expect(() => resolveModel('unknown/model', ENV)).toThrow(
      /Cannot resolve model/,
    );
  });

  it('throws when google-vertex/ is used without project + location', () => {
    expect(() => resolveModel('google-vertex/gemini-2.5-flash', ENV)).toThrow(
      /GOOGLE_VERTEX_PROJECT/,
    );
  });

  it('gateway takes priority over google/ prefix', () => {
    const env = {
      ...ENV,
      AI_GATEWAY_API_KEY: 'gw-key',
      GOOGLE_GENERATIVE_AI_API_KEY: 'ai-key',
    };
    const result = resolveModel('google/gemini-2.5-flash', env);
    expect(result).toBe('google/gemini-2.5-flash');
  });
});

describe('resolveModelForProvider', () => {
  it('returns ChatModelResolution for google provider with key', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveModelForProvider(
      'google',
      { aiApiKeys: null },
      ENV,
    );
    expect(result.providerId).toBe('google');
    expect(result.bareModelId).toBe(BYOK_PROVIDERS.google.defaultModels.technical);
    expect(result.modelId).toBe(
      `google/${BYOK_PROVIDERS.google.defaultModels.technical}`,
    );
    expect(result.model).toBeDefined();
  });

  it('returns ChatModelResolution for anthropic provider with key', () => {
    __setByok({ anthropic: 'sk-ant-test-key' });
    const result = resolveModelForProvider(
      'anthropic',
      { aiApiKeys: null },
      ENV,
    );
    expect(result.providerId).toBe('anthropic');
    expect(result.bareModelId).toBe(
      BYOK_PROVIDERS.anthropic.defaultModels.technical,
    );
    expect(result.modelId).toBe(
      `anthropic/${BYOK_PROVIDERS.anthropic.defaultModels.technical}`,
    );
  });

  it('throws when provider has no API key', () => {
    __setByok({ google: 'goog-key' });
    expect(() =>
      resolveModelForProvider('anthropic', { aiApiKeys: null }, ENV),
    ).toThrow(/No API key configured for provider: anthropic/);
  });

  it('throws for unknown provider id', () => {
    __setByok({ google: 'goog-key' });
    __setByok({ nonexistent: 'some-key-that-is-long-enough-for-test' });
    expect(() =>
      resolveModelForProvider(
        'nonexistent' as never,
        { aiApiKeys: null },
        ENV,
      ),
    ).toThrow(/Unknown provider/);
  });

  it('uses env fallback keys when BYOK is empty', () => {
    __setByok({});
    const env = { ...ENV, GOOGLE_GENERATIVE_AI_API_KEY: 'env-key' };
    const result = resolveModelForProvider('google', { aiApiKeys: null }, env);
    expect(result.providerId).toBe('google');
  });
});

describe('resolveChatModel — different providers', () => {
  it('returns google model when google key is configured', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveChatModel(
      { aiApiKeys: null, chatModel: null },
      ENV,
    );
    expect(result.providerId).toBe('google');
  });

  it('returns anthropic model when only anthropic key is configured', () => {
    __setByok({ anthropic: 'sk-ant-key' });
    const result = resolveChatModel(
      { aiApiKeys: null, chatModel: null },
      ENV,
    );
    expect(result.providerId).toBe('anthropic');
  });

  it('returns openai model when only openai key is configured', () => {
    __setByok({ openai: 'sk-openai-key' });
    const result = resolveChatModel(
      { aiApiKeys: null, chatModel: null },
      ENV,
    );
    expect(result.providerId).toBe('openai');
  });

  it('uses env fallback GOOGLE_GENERATIVE_AI_API_KEY when no BYOK is set', () => {
    const env = { ...ENV, GOOGLE_GENERATIVE_AI_API_KEY: 'env-key' };
    const result = resolveChatModel(
      { aiApiKeys: null, chatModel: null },
      env,
    );
    expect(result.providerId).toBe('google');
  });

  it('throws when no keys are configured at all', () => {
    expect(() =>
      resolveChatModel({ aiApiKeys: null, chatModel: null }, ENV),
    ).toThrow(/No AI API keys configured/);
  });

  it('honors explicit chatModel override when valid', () => {
    __setByok({ anthropic: 'sk-ant-key' });
    const result = resolveChatModel(
      { aiApiKeys: null, chatModel: 'anthropic:claude-sonnet-4-5' },
      ENV,
    );
    expect(result.providerId).toBe('anthropic');
    expect(result.bareModelId).toBe('claude-sonnet-4-5');
  });
});

describe('resolveVisionModel — vision-capable model', () => {
  it('returns vision model when anthropic is configured', () => {
    __setByok({ anthropic: 'sk-ant-test' });
    const result = resolveVisionModel(
      { aiApiKeys: null, visionModel: null },
      ENV,
    );
    expect(result.providerId).toBe('anthropic');
    expect(result.bareModelId).toBe(
      BYOK_PROVIDERS.anthropic.defaultModels.vision,
    );
  });

  it('returns vision model when google is configured', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveVisionModel(
      { aiApiKeys: null, visionModel: null },
      ENV,
    );
    expect(result.providerId).toBe('google');
    expect(result.bareModelId).toBe(
      BYOK_PROVIDERS.google.defaultModels.vision,
    );
  });

  it('skips providers without vision capability (deepseek)', () => {
    __setByok({ deepseek: 'sk-ds-key', google: 'a'.repeat(40) });
    const result = resolveVisionModel(
      { aiApiKeys: null, visionModel: null },
      ENV,
    );
    expect(result.providerId).toBe('google');
  });

  it('honors userSettings.visionModel when valid', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveVisionModel(
      {
        aiApiKeys: null,
        visionModel: 'google:gemini-2.5-pro',
      },
      ENV,
    );
    expect(result.providerId).toBe('google');
    expect(result.bareModelId).toBe('gemini-2.5-pro');
  });

  it('throws when no vision-capable provider is configured', () => {
    expect(() =>
      resolveVisionModel({ aiApiKeys: null, visionModel: null }, ENV),
    ).toThrow(/No vision-capable model available/);
  });
});

describe('resolveEmbeddingModel — embedding model', () => {
  it('returns google embedding model when google is configured', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveEmbeddingModel(
      { aiApiKeys: null, embeddingModel: null },
      ENV,
    );
    expect(result).toBe(
      `google/${BYOK_PROVIDERS.google.defaultModels.embedding}`,
    );
  });

  it('returns openai embedding model when openai is configured', () => {
    __setByok({ openai: 'sk-openai' });
    const result = resolveEmbeddingModel(
      { aiApiKeys: null, embeddingModel: null },
      ENV,
    );
    expect(result).toMatch(/^openai\//);
  });

  it('returns env AI_EMBEDDING_MODEL when set', () => {
    const env = { ...ENV, AI_EMBEDDING_MODEL: 'custom/embedding-model' };
    const result = resolveEmbeddingModel(
      { aiApiKeys: null, embeddingModel: null },
      env,
    );
    expect(result).toBe('custom/embedding-model');
  });

  it('returns universal default when nothing is configured', () => {
    const result = resolveEmbeddingModel(
      { aiApiKeys: null, embeddingModel: null },
      ENV,
    );
    expect(result).toBe('openai/text-embedding-3-small');
  });

  it('skips providers without embedding capability (anthropic)', () => {
    __setByok({ anthropic: 'sk-ant', google: 'a'.repeat(40) });
    const result = resolveEmbeddingModel(
      { aiApiKeys: null, embeddingModel: null },
      ENV,
    );
    expect(result).toMatch(/^google\//);
  });

  it('honors userSettings.embeddingModel when valid', () => {
    __setByok({ google: 'a'.repeat(40) });
    const result = resolveEmbeddingModel(
      {
        aiApiKeys: null,
        embeddingModel: 'google:text-embedding-004',
      },
      ENV,
    );
    expect(result).toBe('google/text-embedding-004');
  });
});

describe('testProviderKey — key validation', () => {
  it('rejects unknown provider with friendly message', async () => {
    const result = await testProviderKey('nonexistent' as never, 'some-key');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Unknown provider');
    }
  });

  it('rejects too-short key for non-vertex provider', async () => {
    const result = await testProviderKey('openai', 'ab');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('too short');
    }
  });

  it('rejects too-short vertex key', async () => {
    const result = await testProviderKey('vertex', 'short');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('too short');
    }
  });

  function padVertexJson(obj: Record<string, unknown>): string {
    let raw = JSON.stringify(obj);
    while (raw.length < 260) {
      raw = raw.slice(0, -1) + ',"padding":"' + 'x'.repeat(50) + '"}';
    }
    return raw;
  }

  it('rejects vertex JSON without client_email', async () => {
    const payload = padVertexJson({
      private_key: '-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----\n',
    });
    const result = await testProviderKey('vertex', payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('client_email');
    }
  });

  it('rejects vertex JSON without private_key', async () => {
    const payload = padVertexJson({
      client_email: 'test@test.iam.gserviceaccount.com',
    });
    const result = await testProviderKey('vertex', payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('private_key');
    }
  });

  it('rejects vertex JSON with invalid client_email', async () => {
    const payload = padVertexJson({
      client_email: 'not-an-email',
      private_key: '-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----\n',
    });
    const result = await testProviderKey('vertex', payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('email');
    }
  });

  it('rejects vertex JSON with non-PEM private_key', async () => {
    const payload = padVertexJson({
      client_email: 'test@test.iam.gserviceaccount.com',
      private_key: 'not-a-pem-key',
    });
    const result = await testProviderKey('vertex', payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('PEM');
    }
  });

  it('returns ok=false when generateText throws', async () => {
    const apiError = new Error('Provider API error: 401 Unauthorized') as Error & {
      statusCode?: number;
    };
    apiError.statusCode = 401;
    generateTextMock.mockRejectedValueOnce(apiError);

    const result = await testProviderKey(
      'google',
      'a'.repeat(40),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('401');
    }
  });

  it('returns ok=true when generateText resolves', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'ok' });

    const result = await testProviderKey(
      'openai',
      'sk-abcdefghijklmnopqrstuvwxyz1234567890',
    );
    expect(result.ok).toBe(true);
    expect(generateTextMock).toHaveBeenCalledOnce();
  });
});

describe('defaultModelFor', () => {
  it('returns the fundamental model for google', () => {
    expect(defaultModelFor('google', 'fundamental')).toBe(
      BYOK_PROVIDERS.google.defaultModels.fundamental,
    );
  });

  it('returns the vision model for anthropic', () => {
    expect(defaultModelFor('anthropic', 'vision')).toBe(
      BYOK_PROVIDERS.anthropic.defaultModels.vision,
    );
  });

  it('returns null for unknown provider', () => {
    expect(defaultModelFor('unknown' as never, 'fundamental')).toBeNull();
  });

  it('returns null for deepseek vision (no vision model)', () => {
    expect(defaultModelFor('deepseek', 'vision')).toBeNull();
  });
});
