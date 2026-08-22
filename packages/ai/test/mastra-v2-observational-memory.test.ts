// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest';

import { kestrelMemoryOptions } from '../src/mastra-v2/memory';

const ENV = {} as never;

describe('kestrelMemoryOptions forceObservationalMemory', () => {
  afterEach(() => {
    delete process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY;
  });

  it('keeps observational memory off by default', () => {
    delete process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY;
    const options = kestrelMemoryOptions({ env: ENV });
    expect(options.observationalMemory).toBe(false);
  });

  it('enables observational memory when forceObservationalMemory is true', () => {
    delete process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY;
    const options = kestrelMemoryOptions({ env: ENV, forceObservationalMemory: true });
    expect(options.observationalMemory).toEqual({ scope: 'resource' });
  });

  it('enables observational memory when env var is set', () => {
    process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY = 'true';
    const options = kestrelMemoryOptions({ env: ENV });
    expect(options.observationalMemory).toEqual({ scope: 'resource' });
  });

  it('forceObservationalMemory takes priority over env=false', () => {
    process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY = 'false';
    const options = kestrelMemoryOptions({ env: ENV, forceObservationalMemory: true });
    expect(options.observationalMemory).toEqual({ scope: 'resource' });
  });

  it('semantic recall stays on by default', () => {
    delete process.env.ENABLE_MASTRA_SEMANTIC_RECALL;
    const options = kestrelMemoryOptions({ env: ENV });
    expect(options.semanticRecall).not.toBe(false);
  });

  it('working memory is always enabled and resource-scoped', () => {
    const options = kestrelMemoryOptions({ env: ENV, forceObservationalMemory: true });
    expect(options.workingMemory).toEqual({
      enabled: true,
      scope: 'resource',
      template: expect.any(String),
    });
  });
});
