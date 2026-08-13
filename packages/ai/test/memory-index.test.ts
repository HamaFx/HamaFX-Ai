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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockValues, mockInsert, mockEmbedTexts } = vi.hoisted(() => {
  const mockValues = vi.fn();
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  const mockEmbedTexts = vi.fn();
  return { mockValues, mockInsert, mockEmbedTexts };
});

vi.mock('@kestrel/db', () => ({
  schema: {
    memoryEmbeddings: {
      userId: {},
      kind: {},
      sourceId: {},
    },
  },
  withTenantDb: vi.fn(),
}));

vi.mock('../src/db', () => ({
  getDb: () => ({ insert: mockInsert }),
}));

vi.mock('../src/embeddings', () => ({
  embedTexts: mockEmbedTexts,
  vectorLiteral: vi.fn(),
}));

vi.mock('../src/cost', () => ({
  dailySpendUsd: vi.fn(),
}));

import { rememberThreadSynopsis } from '../src/memory/memory-index';

describe('rememberThreadSynopsis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedTexts.mockResolvedValue({
      embeddings: [[0.1, 0.2]],
      model: 'test-embedding-model',
    });
    mockValues.mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('stores the synopsis under the authenticated user', async () => {
    await rememberThreadSynopsis({
      threadId: 'thread-a',
      userId: 'user-a',
      synopsis: 'Gold rejected resistance after the London session.',
      insights: [],
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        sourceId: 'thread-a',
        kind: 'thread_synopsis',
      }),
    );
  });
});
