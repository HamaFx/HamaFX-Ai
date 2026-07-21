import { describe, expect, it, vi, afterEach } from 'vitest';
import { rrfFuse, decayRow, ragRowToItem, memoryRowToItem, type RagRow } from '../src/rag';
import type { MemoryRow } from '../src/memory/memory-index';

function makeRagRow(overrides: Partial<RagRow> = {}): RagRow {
  return {
    id: 'r1',
    title: 'Test Article',
    summary: 'Summary text',
    url: 'https://example.com',
    source: 'test',
    publisher: null,
    publishedAt: new Date('2026-07-20T12:00:00Z'),
    sentiment: null,
    sentimentScore: null,
    similarity: 0.9,
    ...overrides,
  };
}

describe('rrfFuse', () => {
  it('returns empty array for empty input', () => {
    expect(rrfFuse([])).toEqual([]);
  });

  it('returns empty array when all rankings are empty', () => {
    expect(rrfFuse([[], []])).toEqual([]);
  });

  it('returns single ranking unchanged (sorted by RRF score)', () => {
    const rows = [
      makeRagRow({ id: 'a', similarity: 0.9 }),
      makeRagRow({ id: 'b', similarity: 0.7 }),
    ];
    const result = rrfFuse([rows]);
    // RRF score is 1/(K+rank). With K=60: first gets 1/61, second 1/62.
    // First should stay first.
    expect(result[0]!.id).toBe('a');
    expect(result[1]!.id).toBe('b');
  });

  it('fuses two rankings, boosting items appearing in both', () => {
    const listA = [
      makeRagRow({ id: 'shared', similarity: 0.9 }),
      makeRagRow({ id: 'only-a', similarity: 0.5 }),
      makeRagRow({ id: 'only-a2', similarity: 0.3 }),
    ];
    const listB = [
      makeRagRow({ id: 'shared', similarity: 0.85 }),
      makeRagRow({ id: 'only-b', similarity: 0.6 }),
    ];
    const result = rrfFuse([listA, listB]);
    // 'shared' appears in both and should get the highest combined score
    expect(result[0]!.id).toBe('shared');
    // All unique IDs should be present
    const ids = result.map(r => r.id);
    expect(ids).toContain('shared');
    expect(ids).toContain('only-a');
    expect(ids).toContain('only-a2');
    expect(ids).toContain('only-b');
  });

  it('preserves the highest similarity for duplicate rows', () => {
    const listA = [makeRagRow({ id: 'x', similarity: 0.9 })];
    const listB = [makeRagRow({ id: 'x', similarity: 0.2 })];
    const result = rrfFuse([listA, listB]);
    expect(result).toHaveLength(1);
    expect(result[0]!.similarity).toBe(0.9); // highest wins
  });

  it('uses fallback similarity 0.5 when bestSimilarity is 0', () => {
    // FTS rows have similarity=0; RRF gives them the dense similarity
    const dense = [makeRagRow({ id: 'x', similarity: 0 })];
    const result = rrfFuse([dense]);
    expect(result[0]!.similarity).toBe(0.5);
  });
});

describe('decayRow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies halflife decay to similarity', () => {
    vi.useFakeTimers();
    const now = new Date('2026-07-20T12:00:00Z').getTime();
    vi.setSystemTime(now);
    // Published exactly 7 days ago, halflife 7 days → factor = e^(-ln2 * 7/7) = 0.5
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const row = makeRagRow({ similarity: 1.0, publishedAt: sevenDaysAgo });
    const result = decayRow(row, 7);
    expect(result.similarity).toBe(0.5);
  });

  it('returns near-zero similarity for very old content', () => {
    vi.useFakeTimers();
    const now = new Date('2026-07-20T12:00:00Z').getTime();
    vi.setSystemTime(now);
    const longAgo = new Date(now - 70 * 24 * 60 * 60 * 1000);
    const row = makeRagRow({ similarity: 1.0, publishedAt: longAgo });
    const result = decayRow(row, 7);
    // e^(-ln2 * 10) ≈ 0.00098
    expect(result.similarity).toBeCloseTo(0.001, 2);
  });

  it('returns original similarity for content published right now (age=0)', () => {
    vi.useFakeTimers();
    const now = new Date('2026-07-20T12:00:00Z').getTime();
    vi.setSystemTime(now);
    const nowDate = new Date(now);
    const row = makeRagRow({ similarity: 0.8, publishedAt: nowDate });
    const result = decayRow(row, 7);
    expect(result.similarity).toBe(0.8);
  });

  it('does not mutate original row', () => {
    const row = makeRagRow({ similarity: 1.0 });
    const original = { ...row };
    decayRow(row, 7);
    expect(row.similarity).toBe(original.similarity);
  });
});

describe('ragRowToItem', () => {
  it('maps a RagRow to SearchKnowledgeItem', () => {
    const publishedAt = new Date('2026-07-20T12:00:00Z');
    const row = makeRagRow({
      id: 'abc',
      title: 'Gold Surges',
      summary: 'Gold prices rose...',
      url: 'https://news.com/gold',
      source: 'Reuters',
      publisher: 'Reuters',
      publishedAt,
      sentiment: 'positive',
      sentimentScore: 0.75,
      similarity: 0.88,
    });
    const item = ragRowToItem(row);
    expect(item.id).toBe('abc');
    expect(item.title).toBe('Gold Surges');
    expect(item.summary).toBe('Gold prices rose...');
    expect(item.url).toBe('https://news.com/gold');
    expect(item.source).toBe('Reuters');
    expect(item.publisher).toBe('Reuters');
    expect(item.publishedAt).toBe(publishedAt.getTime());
    expect(item.sentiment).toBe('positive');
    expect(item.sentimentScore).toBe(0.75);
    expect(item.similarity).toBe(0.88);
  });

  it('maps null sentiment to null', () => {
    const row = makeRagRow({ sentiment: null, sentimentScore: null });
    const item = ragRowToItem(row);
    expect(item.sentiment).toBeNull();
    expect(item.sentimentScore).toBeNull();
  });

  it('clamps similarity to [0, 1]', () => {
    const tooHigh = makeRagRow({ similarity: 1.5 });
    expect(ragRowToItem(tooHigh).similarity).toBe(1);

    const negative = makeRagRow({ similarity: -0.5 });
    expect(ragRowToItem(negative).similarity).toBe(0);
  });
});

describe('memoryRowToItem', () => {
  function makeMemoryRow(overrides: Partial<MemoryRow> = {}): MemoryRow {
    return {
      id: 'mem-1',
      kind: 'journal',
      sourceId: 'j-1',
      symbol: 'XAUUSD',
      text: 'Good trade setup',
      model: 'text-embedding-004',
      meta: {},
      similarity: 0.85,
      occurredAtMs: Date.now(),
      ...overrides,
    };
  }

  it('maps journal memory row to SearchKnowledgeItem', () => {
    const row = makeMemoryRow({ kind: 'journal', symbol: 'XAUUSD' });
    const item = memoryRowToItem(row);
    expect(item.id).toBe('mem:mem-1');
    expect(item.title).toBe('Journal · XAUUSD');
    expect(item.summary).toBe('Good trade setup');
    expect(item.source).toBe('journal');
    expect(item.url).toBe('');
    expect(item.similarity).toBe(0.85);
  });

  it('maps briefing memory row', () => {
    const row = makeMemoryRow({ kind: 'briefing', symbol: null });
    const item = memoryRowToItem(row);
    expect(item.title).toBe('Briefing');
    expect(item.source).toBe('briefing');
  });

  it('maps thread_synopsis memory row', () => {
    const row = makeMemoryRow({ kind: 'thread_synopsis', symbol: null });
    const item = memoryRowToItem(row);
    expect(item.title).toBe('Thread synopsis');
    expect(item.source).toBe('thread_synopsis');
  });

  it('clamps similarity to [0, 1]', () => {
    const row = makeMemoryRow({ similarity: 2.0 });
    expect(memoryRowToItem(row).similarity).toBe(1);

    const negRow = makeMemoryRow({ similarity: -0.5 });
    expect(memoryRowToItem(negRow).similarity).toBe(0);
  });
});
