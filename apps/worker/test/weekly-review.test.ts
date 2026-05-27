import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hamafx/ai', () => ({
  emitWeeklyReview: vi.fn(),
}));

import * as ai from '@hamafx/ai';

import { runWeeklyReview } from '../src/jobs/weekly-review';
import { createLogger } from '../src/log';

const log = createLogger({ service: 'test', forceJson: true });

beforeEach(() => {
  vi.mocked(ai.emitWeeklyReview).mockReset();
});

describe('runWeeklyReview', () => {
  it('returns processed=1 when emitWeeklyReview emitted', async () => {
    vi.mocked(ai.emitWeeklyReview).mockResolvedValue({ emitted: true });
    const r = await runWeeklyReview({ log });
    expect(r.processed).toBe(1);
    expect(r.note).toBeUndefined();
  });

  it('returns processed=0 + reason when already emitted this week', async () => {
    vi.mocked(ai.emitWeeklyReview).mockResolvedValue({
      emitted: false,
      reason: 'already-emitted',
    });
    const r = await runWeeklyReview({ log });
    expect(r.processed).toBe(0);
    expect(r.note).toBe('already-emitted');
  });
});
