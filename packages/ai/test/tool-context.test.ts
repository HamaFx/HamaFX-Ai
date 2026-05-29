// Phase 3 hardening §1 — AsyncLocalStorage-backed tool context.
//
// Module-global state used to back the per-turn tool context, which
// caused cross-talk between concurrent chat turns on a warm Lambda.
// The new contract is `withToolContext(ctx, fn)` + `getToolContext()`;
// concurrent runs see their own context via async_hooks propagation.

import { describe, expect, it } from 'vitest';

import { getToolContext, maybeGetToolContext, withToolContext, type ToolContext } from '../src/tool-context';

function makeContext(threadId: string, spent = 0): ToolContext {
  return {
    threadId,
    env: {
      AI_GATEWAY_API_KEY: 'test',
      GOOGLE_GENERATIVE_AI_API_KEY: 'test',
      GOOGLE_VERTEX_PROJECT: undefined,
      GOOGLE_VERTEX_LOCATION: undefined,
      GOOGLE_APPLICATION_CREDENTIALS_JSON: undefined,
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      AI_DEFAULT_MODEL: 'google/gemini-2.5-flash',
      AI_VISION_MODEL: 'google/gemini-2.5-pro',
      AI_SUMMARY_MODEL: 'google/gemini-2.5-flash',
      AI_EMBEDDING_MODEL: 'openai/text-embedding-3-small',
      MAX_DAILY_USD: 5,
      LOG_PROMPTS: false,
    },
    signal: null,
    budget: { spent, max: 5 },
  } as ToolContext;
}

describe('withToolContext / getToolContext', () => {
  it('exposes the active context inside the run scope', async () => {
    await withToolContext(makeContext('thread-A'), async () => {
      const ctx = getToolContext();
      expect(ctx.threadId).toBe('thread-A');
    });
  });

  it('throws when called outside any run scope', () => {
    expect(() => getToolContext()).toThrow(/outside withToolContext/);
  });

  it('maybeGetToolContext returns null outside a run scope', () => {
    expect(maybeGetToolContext()).toBeNull();
  });

  it('keeps two concurrent runs isolated', async () => {
    const seenA: string[] = [];
    const seenB: string[] = [];

    const a = withToolContext(makeContext('thread-A'), async () => {
      // Yield a couple of times so B can interleave.
      await new Promise((r) => setTimeout(r, 5));
      seenA.push(getToolContext().threadId);
      await new Promise((r) => setTimeout(r, 5));
      seenA.push(getToolContext().threadId);
    });

    const b = withToolContext(makeContext('thread-B'), async () => {
      await new Promise((r) => setTimeout(r, 1));
      seenB.push(getToolContext().threadId);
      await new Promise((r) => setTimeout(r, 7));
      seenB.push(getToolContext().threadId);
    });

    await Promise.all([a, b]);

    // Each run only ever observed its own threadId, despite the
    // interleaving setTimeouts.
    expect(seenA).toEqual(['thread-A', 'thread-A']);
    expect(seenB).toEqual(['thread-B', 'thread-B']);
  });

  it('propagates context through deeply nested awaits', async () => {
    let observed = '';
    await withToolContext(makeContext('thread-deep'), async () => {
      // Multiple async layers; ALS preserves through each await.
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      await (async () => {
        await Promise.resolve();
        observed = getToolContext().threadId;
      })();
    });
    expect(observed).toBe('thread-deep');
  });

  it('exposes the cached budget snapshot for downstream LLM helpers', async () => {
    await withToolContext(makeContext('thread-budget', 0.42), async () => {
      const ctx = getToolContext();
      expect(ctx.budget.spent).toBeCloseTo(0.42);
      expect(ctx.budget.max).toBe(5);
    });
  });
});
