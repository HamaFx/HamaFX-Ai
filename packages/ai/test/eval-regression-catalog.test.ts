/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

interface RegressionCase {
  id?: unknown;
  prompt?: unknown;
  expectedTools?: unknown;
  forbiddenTools?: unknown;
  expectedAgents?: unknown;
  quality?: unknown;
}

async function loadCatalog(): Promise<RegressionCase[]> {
  const path = fileURLToPath(new URL('../src/eval/regression-cases.json', import.meta.url));
  const raw = await readFile(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('regression catalog must be an array');
  return parsed as RegressionCase[];
}

describe('offline regression catalog', () => {
  it('contains exactly 50 unique, runnable case definitions', async () => {
    const cases = await loadCatalog();
    const ids = cases.map((item) => item.id);

    expect(cases).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
    for (const item of cases) {
      expect(typeof item.id).toBe('string');
      expect(typeof item.prompt).toBe('string');
      expect(String(item.prompt).length).toBeGreaterThan(10);
    }
  });

  it('covers tool selection, agent lifecycle, grounding, and safety checks', async () => {
    const cases = await loadCatalog();
    const withExpectedTools = cases.filter((item) => Array.isArray(item.expectedTools));
    const withForbiddenTools = cases.filter((item) => Array.isArray(item.forbiddenTools));
    const withAgents = cases.filter((item) => Array.isArray(item.expectedAgents));
    const withQuality = cases.filter((item) => item.quality !== undefined);

    expect(withExpectedTools.length).toBeGreaterThanOrEqual(20);
    expect(withForbiddenTools.length).toBeGreaterThanOrEqual(10);
    expect(withAgents.length).toBeGreaterThanOrEqual(3);
    expect(withQuality.length).toBeGreaterThanOrEqual(30);
  });
});
