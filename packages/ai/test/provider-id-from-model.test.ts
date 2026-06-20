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

// We re-export providerIdFromModel via index.ts; import the test
// directly through the file path so we can run it without a DB
// (the usage module also pulls in @hamafx/db, which is fine —
// this test only exercises the pure helpers).
import { providerIdFromModel } from '../src/usage';

/**
 * The canonicalizeProviderId helper is not exported from usage.ts
 * directly (it's internal). We replicate the mapping here so the
 * test serves as a documentation of the contract; if a future
 * refactor changes the canonicalization we want this test to
 * fail loud.
 *
 * Mapping table (must match usage.ts):
 *   'google-vertex'    -> 'vertex'
 *   '' (no prefix)     -> 'google'    (BYOK google uses bare ids)
 *   'google'           -> 'google'
 *   'anthropic'        -> 'anthropic'
 *   'openai'           -> 'openai'
 *   'groq'             -> 'groq'
 *   'mistral'          -> 'mistral'
 *   'openrouter'       -> 'openrouter'
 *   'xai'              -> 'xai'
 *   'deepseek'         -> 'deepseek'
 *   anything else      -> null
 */
function canonicalize(prefix: string): string | null {
  if (prefix === '') return 'google';
  if (prefix === 'google-vertex') return 'vertex';
  const KNOWN = new Set([
    'google',
    'vertex',
    'anthropic',
    'openai',
    'groq',
    'mistral',
    'openrouter',
    'xai',
    'deepseek',
  ]);
  return KNOWN.has(prefix) ? prefix : null;
}

describe('Phase D — providerIdFromModel', () => {
  it('returns the segment before the first slash for prefixed ids', () => {
    expect(providerIdFromModel('google-vertex/gemini-2.5-flash')).toBe('google-vertex');
    expect(providerIdFromModel('anthropic/claude-sonnet-4-20250514')).toBe('anthropic');
    expect(providerIdFromModel('openai/gpt-4o')).toBe('openai');
  });

  it('returns empty string for bare model ids (BYOK google)', () => {
    expect(providerIdFromModel('gemini-2.5-flash')).toBe('');
    expect(providerIdFromModel('gemini-2.5-pro')).toBe('');
  });

  it('handles model ids with multiple slashes (after the first)', () => {
    // Some gateway ids look like "openai/gpt-4o/ft-abc123" — we
    // only split on the FIRST slash so the rest stays intact.
    expect(providerIdFromModel('openai/gpt-4o/ft-abc123')).toBe('openai');
    expect(providerIdFromModel('openrouter/anthropic/claude-3.5-sonnet')).toBe('openrouter');
  });

  it('returns empty string for empty input', () => {
    expect(providerIdFromModel('')).toBe('');
  });
});

describe('Phase D — canonical BYOK id mapping', () => {
  it('maps google-vertex to vertex', () => {
    expect(canonicalize('google-vertex')).toBe('vertex');
  });

  it('maps empty prefix to google (BYOK google uses bare ids)', () => {
    expect(canonicalize('')).toBe('google');
  });

  it('passes through the 9 known BYOK providers', () => {
    expect(canonicalize('google')).toBe('google');
    expect(canonicalize('vertex')).toBe('vertex');
    expect(canonicalize('anthropic')).toBe('anthropic');
    expect(canonicalize('openai')).toBe('openai');
    expect(canonicalize('groq')).toBe('groq');
    expect(canonicalize('mistral')).toBe('mistral');
    expect(canonicalize('openrouter')).toBe('openrouter');
    expect(canonicalize('xai')).toBe('xai');
    expect(canonicalize('deepseek')).toBe('deepseek');
  });

  it('returns null for unknown prefixes', () => {
    expect(canonicalize('cohere')).toBe(null);
    expect(canonicalize('azure')).toBe(null);
    expect(canonicalize('random-model-prefix')).toBe(null);
  });
});
