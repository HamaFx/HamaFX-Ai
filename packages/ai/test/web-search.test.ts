import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withToolContext, type ToolContext } from '../src/tool-context';
import {
  buildSearchCacheKey,
  normalizeWebSearchResults,
  webSearchTool,
} from '../src/tools/web-search';

const execute = webSearchTool.execute as unknown as (
  input: unknown,
  options?: { abortSignal?: AbortSignal },
) => Promise<{
  status: string;
  provider: string | null;
  query: string;
  sources: Array<{ url: string; content?: string; domain: string }>;
  cacheHit: boolean;
  message?: string;
}>;

const baseEnv = {
  AI_GATEWAY_API_KEY: undefined,
  GOOGLE_GENERATIVE_AI_API_KEY: undefined,
  GOOGLE_VERTEX_PROJECT: undefined,
  GOOGLE_VERTEX_LOCATION: undefined,
  GOOGLE_APPLICATION_CREDENTIALS_JSON: undefined,
  GOOGLE_APPLICATION_CREDENTIALS: undefined,
  AI_DEFAULT_MODEL: 'test-model',
  AI_EMBEDDING_MODEL: 'test-embedding',
  MAX_DAILY_USD: 5,
  LOG_PROMPTS: false,
};

function makeContext(overrides: Record<string, unknown> = {}): ToolContext {
  return {
    threadId: 'thread-web-search-test',
    userId: 'user-web-search-test',
    env: { ...baseEnv, ...overrides } as never,
    signal: null,
    budget: { spent: 0, max: 5 },
    userSettings: {} as never,
  };
}

describe('web_search', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes valid HTTPS sources, deduplicates URLs, and strips markup', () => {
    const sources = normalizeWebSearchResults(
      'exa',
      [
        {
          title: ' Gold <b>outlook</b> ',
          url: 'https://example.com/gold',
          highlights: '<script>ignore()</script> Gold may rise.',
        },
        { title: 'duplicate', url: 'https://example.com/gold' },
        { title: 'unsafe', url: 'javascript:alert(1)' },
      ],
      5,
    );

    expect(sources).toHaveLength(1);
    expect(sources[0]!.domain).toBe('example.com');
    expect(sources[0]!.title).toBe('Gold outlook');
    expect(sources[0]!.content).not.toContain('<script>');
  });

  it('returns an explicit unavailable result when disabled', async () => {
    const result = await withToolContext(makeContext({ WEB_SEARCH_ENABLED: false }), () =>
      execute({ query: 'latest Federal Reserve decision' }),
    );

    expect(result.status).toBe('unavailable');
    expect(result.provider).toBeNull();
    expect(result.message).toContain('disabled');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses Exa and returns normalized citations', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              title: 'Fed statement',
              url: 'https://www.federalreserve.gov/newsevents.htm',
              highlight: 'The Federal Reserve held rates steady.',
              publishedDate: '2026-08-15T00:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await withToolContext(
      makeContext({
        WEB_SEARCH_ENABLED: true,
        WEB_SEARCH_PROVIDER: 'exa',
        EXA_API_KEY: 'exa-test-key',
      }),
      () => execute({ query: 'latest Federal Reserve decision', symbol: 'XAUUSD' }),
    );

    expect(result.status).toBe('success');
    expect(result.provider).toBe('exa');
    expect(result.sources[0]!.url).toContain('federalreserve.gov');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.exa.ai/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'exa-test-key' }),
      }),
    );
  });

  it('fails over to the next configured provider without changing the agent mode', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('upstream error', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                title: 'Macro news',
                url: 'https://example.com/macro',
                content: 'Macro context.',
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const result = await withToolContext(
      makeContext({
        WEB_SEARCH_ENABLED: true,
        WEB_SEARCH_PROVIDER: 'exa',
        WEB_SEARCH_FALLBACK_PROVIDERS: 'tavily',
        EXA_API_KEY: 'exa-test-key',
        TAVILY_API_KEY: 'tavily-test-key',
      }),
      () => execute({ query: 'latest macro context' }),
    );

    expect(result.status).toBe('success');
    expect(result.provider).toBe('tavily');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('enforces the per-turn call limit explicitly', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const context = makeContext({
      WEB_SEARCH_ENABLED: true,
      WEB_SEARCH_PROVIDER: 'exa',
      EXA_API_KEY: 'exa-test-key',
      WEB_SEARCH_MAX_CALLS_PER_TURN: 1,
    });

    const first = await withToolContext(context, () => execute({ query: 'first unique search' }));
    const second = await withToolContext(context, () => execute({ query: 'second unique search' }));

    expect(first.status).toBe('empty');
    expect(second.status).toBe('unavailable');
    expect(second.message).toContain('per-turn');
  });

  it('creates stable cache keys without storing API keys', () => {
    const first = buildSearchCacheKey(
      { query: ' Fed rates ', symbol: 'xauusd', topic: 'macro', recencyDays: 7, maxResults: 5 },
      'exa',
    );
    const second = buildSearchCacheKey(
      { query: 'fed rates', symbol: 'XAUUSD', topic: 'macro', recencyDays: 7, maxResults: 5 },
      'exa',
    );
    expect(first).toBe(second);
    expect(first).not.toContain('test-key');
  });
});
