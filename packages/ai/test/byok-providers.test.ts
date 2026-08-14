/**
 * Copyright 2026 Kestrel
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

import { describe, expect, it } from 'vitest';
import {
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
  defaultModelFor,
  getProvider,
} from '../src/byok-providers';
import { PROVIDER_IDS } from '@kestrel/shared/byok';
import {
  normalizeHcnsecDsmlToolCalls,
  normalizeHcnsecJsonPayload,
  normalizeHcnsecToolArguments,
  normalizeHcnsecSse,
} from '../src/_providers/helpers';

describe('BYOK_PROVIDERS', () => {
  it('contains every id from PROVIDER_IDS', () => {
    for (const id of PROVIDER_IDS) {
      expect(BYOK_PROVIDERS[id]).toBeDefined();
    }
  });

  it('every spec has all required fields', () => {
    for (const spec of BYOK_PROVIDERS_LIST) {
      expect(spec.id).toBeTruthy();
      expect(spec.displayName).toBeTruthy();
      expect(spec.familyName).toBeTruthy();
      expect(spec.keyHint).toBeTruthy();
      expect(spec.description).toBeTruthy();
      expect(['free', 'low', 'medium', 'high']).toContain(spec.pricingTier);
      expect(spec.defaultModels.fundamental).toBeTruthy();
      expect(spec.defaultModels.technical).toBeTruthy();
      expect(spec.defaultModels.summary).toBeTruthy();
      expect(typeof spec.factory).toBe('function');
      expect(Array.isArray(spec.models)).toBe(true);
      expect(spec.models.length).toBeGreaterThan(0);
      // defaultModels must resolve to catalog entries (defineProvider also enforces this).
      for (const domain of ['fundamental', 'technical', 'summary', 'vision', 'embedding'] as const) {
        const id = spec.defaultModels[domain];
        if (id == null) continue;
        expect(spec.models.some((m) => m.modelId === id)).toBe(true);
      }
    }
  });

  it('free-tier providers are tagged free', () => {
    const free = BYOK_PROVIDERS_LIST.filter((p) => p.pricingTier === 'free').map((p) => p.id);
    // We expect at least Google and Groq to be free.
    expect(free).toContain('google');
    expect(free).toContain('groq');
  });

  it('factory returns a function that builds a language model', () => {
    for (const spec of BYOK_PROVIDERS_LIST) {
      // Vertex is special-cased: the factory returns a closure
      // that parses the JSON key INSIDE the inner call. Other
      // providers defer auth errors to the actual API call.
      // We can't easily generate a valid service-account JSON
      // in this test, so we only verify the smoke-test path
      // for non-vertex providers.
      if (spec.id === 'vertex') continue;
      const builder = spec.factory('test-key-that-is-long-enough');
      expect(typeof builder).toBe('function');
      expect(() => builder('test-model')).not.toThrow();
    }
  });

  it('vertex factory parses the JSON key lazily (inside the closure)', () => {
    const builder = BYOK_PROVIDERS.vertex.factory('not-valid-json');
    expect(typeof builder).toBe('function');
    expect(() => builder('gemini-2.5-flash')).toThrow(/JSON/);
  });
});

describe('HCNSEC provider', () => {
  it('uses the documented OpenAI-compatible endpoint and conservative defaults', () => {
    const spec = BYOK_PROVIDERS.hcnsec;
    expect(spec.baseURL).toBe('https://api.hcnsec.cn/v1');
    expect(spec.docsUrl).toBe('https://hcnote.cn/2026/07/12/12831.html');
    expect(spec.defaultModels).toMatchObject({
      fundamental: 'DeepSeek-V4-Flash',
      technical: 'DeepSeek-V4-Flash',
      summary: 'Qwen3.6-27B',
      vision: null,
      embedding: null,
    });
    expect(spec.supports).toEqual({ vision: false, embedding: false });
  });
});

describe('HCNSEC DSML normalization', () => {
  it('converts DeepSeek DSML text into executable tool calls', () => {
    const raw = 'I will pull the 15m data. <｜｜DSML｜｜tool_calls> <｜｜DSML｜｜invoke name="get_candles"> <｜｜DSML｜｜parameter name="symbol" string="true">XAUUSD</｜｜DSML｜｜parameter> <｜｜DSML｜｜parameter name="timeframe" string="true">15m</｜｜DSML｜｜parameter> <｜｜DSML｜｜parameter name="limit" string="false">100</｜｜DSML｜｜parameter> </｜｜DSML｜｜invoke> <｜｜DSML｜｜invoke name="get_indicators"> <｜｜DSML｜｜parameter name="symbol" string="true">XAUUSD</｜｜DSML｜｜parameter> <｜｜DSML｜｜parameter name="timeframe" string="true">15m</｜｜DSML｜｜parameter> </｜｜DSML｜｜invoke> </｜｜DSML｜｜tool_calls>';
    const normalized = normalizeHcnsecDsmlToolCalls(raw);

    expect(normalized?.content).toBe('I will pull the 15m data.');
    expect(normalized?.toolCalls).toHaveLength(2);
    expect(normalized?.toolCalls[0]).toMatchObject({
      function: {
        name: 'get_candles',
        arguments: JSON.stringify({ symbol: 'XAUUSD', tf: '15m', count: 100 }),
      },
    });
    expect(normalized?.toolCalls[1]).toMatchObject({
      function: {
        name: 'get_indicators',
        arguments: JSON.stringify({
          symbol: 'XAUUSD',
          tf: '15m',
          indicators: [
            { kind: 'rsi', params: {} },
            { kind: 'macd', params: {} },
            { kind: 'ema', params: { period: 20 } },
            { kind: 'ema', params: { period: 50 } },
          ],
        }),
      },
    });
  });

  it('normalizes HCNSEC tool aliases for ordinary OpenAI tool calls', () => {
    const args = normalizeHcnsecToolArguments(
      'get_candles',
      JSON.stringify({ symbol: 'XAUUSD', timeframe: '4h', limit: 100 }),
    );
    expect(JSON.parse(args)).toEqual({ symbol: 'XAUUSD', tf: '4h', count: 100 });
  });

  it('normalizes DSML in non-streaming chat responses', () => {
    const payload = {
      choices: [{
        message: {
          role: 'assistant',
          content: '<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="get_price"><｜｜DSML｜｜parameter name="symbol" string="true">XAUUSD</｜｜DSML｜｜parameter></｜｜DSML｜｜invoke></｜｜DSML｜｜tool_calls>',
        },
        finish_reason: 'stop',
      }],
    };
    const normalized = normalizeHcnsecJsonPayload(payload) as {
      choices: Array<{ finish_reason: string; message: { content: string | null; tool_calls: Array<{ function: { name: string; arguments: string } }> } }>;
    };
    expect(normalized.choices[0]?.finish_reason).toBe('tool_calls');
    expect(normalized.choices[0]?.message.content).toBeNull();
    expect(normalized.choices[0]?.message.tool_calls[0]).toMatchObject({
      function: { name: 'get_price', arguments: JSON.stringify({ symbol: 'XAUUSD' }) },
    });
  });
});

describe('HCNSEC stream normalization', () => {
  it('combines split tool metadata into an SDK-compatible first chunk', () => {
    const raw = [
      `data: ${JSON.stringify({ id: 'req-1', model: 'DeepSeek-V4-Flash', choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'reasoning ' }, finish_reason: null }] })}`,
      `data: ${JSON.stringify({ id: 'req-1', model: 'DeepSeek-V4-Flash', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', function: { arguments: '{"symbol":' } }] }, finish_reason: null }] })}`,
      `data: ${JSON.stringify({ id: 'req-1', model: 'DeepSeek-V4-Flash', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: 'get_price', arguments: '"XAUUSD"}' } }] }, finish_reason: 'tool_calls' }] })}`,
      'data: [DONE]',
    ].join('\n\n');

    const normalized = normalizeHcnsecSse(raw);
    const firstEvent = normalized.split('\n\n')[0]?.replace(/^data: /, '');
    const parsed = JSON.parse(firstEvent ?? '{}') as {
      choices?: Array<{ delta?: { reasoning_content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }>;
    };
    const delta = parsed.choices?.[0]?.delta;
    expect(delta?.reasoning_content).toBe('reasoning ');
    expect(delta?.tool_calls?.[0]).toMatchObject({
      id: 'call-1',
      function: { name: 'get_price', arguments: '{"symbol":"XAUUSD"}' },
    });
    expect(normalized).toContain('data: [DONE]');
  });
});

describe('getProvider', () => {
  it('returns the spec for known ids', () => {
    expect(getProvider('google').id).toBe('google');
    expect(getProvider('anthropic').id).toBe('anthropic');
  });

  it('throws for unknown ids', () => {
    expect(() => getProvider('not-a-provider' as never)).toThrow(/Unknown BYOK provider/);
  });
});

describe('defaultModelFor', () => {
  it('returns the right model id per provider/domain', () => {
    expect(defaultModelFor('google', 'fundamental')).toMatch(/gemini/);
    expect(defaultModelFor('anthropic', 'fundamental')).toMatch(/claude/);
    expect(defaultModelFor('openai', 'technical')).toMatch(/gpt/);
  });

  it('returns null for providers without an embedding model', () => {
    expect(defaultModelFor('anthropic', 'embedding')).toBeNull();
    expect(defaultModelFor('deepseek', 'embedding')).toBeNull();
  });

  it('returns null for providers without a vision model', () => {
    expect(defaultModelFor('deepseek', 'vision')).toBeNull();
  });

  it('returns null for unknown provider ids', () => {
    expect(defaultModelFor('not-real' as never, 'technical')).toBeNull();
  });
});

describe('BYOK_PROVIDERS_LIST', () => {
  it('has the same length as PROVIDER_IDS', () => {
    expect(BYOK_PROVIDERS_LIST.length).toBe(PROVIDER_IDS.length);
  });

  it('contains every id exactly once', () => {
    const seen = new Set<string>();
    for (const spec of BYOK_PROVIDERS_LIST) {
      expect(seen.has(spec.id)).toBe(false);
      seen.add(spec.id);
    }
    expect(seen.size).toBe(PROVIDER_IDS.length);
  });
});