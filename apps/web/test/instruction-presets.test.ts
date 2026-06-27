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

import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/app/(app)/settings/actions', () => ({
  updateAiPrefsAction: vi.fn(),
}));

import {
  appendPreset,
  getPreset,
  INSTRUCTION_PRESETS,
} from '../src/app/(app)/settings/_components/ai-prefs-card';

describe('INSTRUCTION_PRESETS — shape and IDs', () => {
  it('exposes exactly 5 presets with the documented ids', () => {
    const ids = INSTRUCTION_PRESETS.map((p) => p.id);
    expect(ids).toEqual(['concise', 'technical', 'challenge', 'sources', 'risk']);
  });

  it('every preset has a non-empty label and prompt', () => {
    for (const preset of INSTRUCTION_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.prompt.length).toBeGreaterThan(0);
    }
  });

  it('preset ids are unique (no duplicates)', () => {
    const ids = INSTRUCTION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getPreset — lookup by id', () => {
  it('returns the matching preset for a known id', () => {
    const preset = getPreset('concise');
    expect(preset).not.toBeNull();
    expect(preset?.id).toBe('concise');
    expect(preset?.label).toBe('Be concise');
  });

  it('returns null for an unknown id', () => {
    expect(getPreset('nope')).toBeNull();
  });

  it('returns null for the empty string', () => {
    expect(getPreset('')).toBeNull();
  });
});

describe('appendPreset — pure string helper', () => {
  it('returns the preset prompt when the current value is empty', () => {
    expect(appendPreset('', 'concise')).toBe('Reply in 2-3 sentences max. Lead with the answer.');
  });

  it('returns the preset prompt when the current value is whitespace only', () => {
    // A user with only spaces in the textarea shouldn't get a
    // blank-line artefact on first append.
    expect(appendPreset('   \n  ', 'risk')).toBe(
      'For any trade idea, lead with position sizing, stop placement, and R:R. Bias toward capital preservation.',
    );
  });

  it('joins preset text to existing instructions with a blank line', () => {
    const out = appendPreset('Be polite.', 'concise');
    expect(out).toBe('Be polite.\n\nReply in 2-3 sentences max. Lead with the answer.');
  });

  it('trims trailing whitespace before joining', () => {
    const out = appendPreset('Be polite.   \n  ', 'concise');
    // We don't want "polite.\n\n  \n\nReply..." with a stray indent
    // between the user's text and the preset separator.
    expect(out).toBe('Be polite.\n\nReply in 2-3 sentences max. Lead with the answer.');
  });

  it('returns the original value when the preset id is unknown', () => {
    const original = 'Be polite.';
    expect(appendPreset(original, 'nonexistent')).toBe(original);
  });
});
