import { describe, expect, it } from 'vitest';

import { JOBS } from '../src/jobs';

describe('JOBS registry', () => {
  it('exposes the embedding-backfill job', () => {
    expect(JOBS['embedding-backfill']).toBeDefined();
    expect(JOBS['embedding-backfill']?.run).toBeTypeOf('function');
    expect(JOBS['embedding-backfill']?.description).toContain('Embed');
  });

  it('every registered job has both run + description', () => {
    for (const [name, def] of Object.entries(JOBS)) {
      expect(def.run, `${name} missing run`).toBeTypeOf('function');
      expect(typeof def.description, `${name} missing description`).toBe('string');
    }
  });
});
