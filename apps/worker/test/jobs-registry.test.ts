/**
 * Copyright 2026 HamaFX
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
