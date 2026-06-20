'use client';

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

import { Bot, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { SettingsRow } from './settings-row';

export interface AIPrefs {
  fundamentalModel: string;
  technicalModel: string;
  summaryModel: string;
  customInstructions: string;
}

export const AI_PREFS_STORAGE_KEY = 'hamafx:ai-prefs';

/**
 * Phase A — UX_UPGRADE_PLAN.md item 6.
 * Preset prompts the user can apply with one tap. Each preset
 * REPLACES the current `customInstructions` field (with a confirm
 * if the field is non-empty) and writes through `update()` so the
 * change persists to localStorage immediately.
 *
 * Append mode (`appendPreset`) joins the preset text to the existing
 * value with a blank line separator — used by the "Append" button
 * next to each chip.
 */
export interface InstructionPreset {
  id: 'concise' | 'technical' | 'challenge' | 'sources' | 'risk';
  label: string;
  prompt: string;
}

export const INSTRUCTION_PRESETS: readonly InstructionPreset[] = [
  {
    id: 'concise',
    label: 'Be concise',
    prompt: 'Reply in 2-3 sentences max. Lead with the answer.',
  },
  {
    id: 'technical',
    label: 'Be technical',
    prompt:
      'Use precise terminology. Cite indicator names and timeframes explicitly. Show your reasoning.',
  },
  {
    id: 'challenge',
    label: 'Challenge my bias',
    prompt:
      'When I state a directional view, give me the strongest counter-argument before agreeing.',
  },
  {
    id: 'sources',
    label: 'Cite sources inline',
    prompt:
      'After every factual claim, cite the tool or data point that supports it.',
  },
  {
    id: 'risk',
    label: 'Risk-first',
    prompt:
      'For any trade idea, lead with position sizing, stop placement, and R:R. Bias toward capital preservation.',
  },
] as const;

/** Find a preset by id; returns null when not found. */
export function getPreset(id: string): InstructionPreset | null {
  return INSTRUCTION_PRESETS.find((p) => p.id === id) ?? null;
}

/** Join a preset's prompt to existing instructions with a blank line. */
export function appendPreset(current: string, presetId: string): string {
  const p = getPreset(presetId);
  if (!p) return current;
  const trimmed = current.trim();
  if (trimmed.length === 0) return p.prompt;
  return `${trimmed}\n\n${p.prompt}`;
}

const DEFAULTS: AIPrefs = {
  fundamentalModel: 'google-vertex/gemini-3.1-pro',
  technicalModel: 'google-vertex/gemini-3.5-flash',
  summaryModel: 'google-vertex/gemini-2.5-flash',
  customInstructions: '',
};

export function readAIPrefs(): AIPrefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(AI_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AIPrefs>;
    return {
      fundamentalModel: parsed.fundamentalModel || DEFAULTS.fundamentalModel,
      technicalModel: parsed.technicalModel || DEFAULTS.technicalModel,
      summaryModel: parsed.summaryModel || DEFAULTS.summaryModel,
      customInstructions: parsed.customInstructions || '',
    };
  } catch {
    return DEFAULTS;
  }
}

function writeAIPrefs(prefs: AIPrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota */
  }
}

const MODEL_OPTIONS = [
  { value: 'google-vertex/gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
  { value: 'google-vertex/gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'google-vertex/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

export function AIPrefsCard() {
  const [prefs, setPrefs] = useState<AIPrefs>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs(readAIPrefs());
    setHydrated(true);
  }, []);

  function update<K extends keyof AIPrefs>(key: K, value: AIPrefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    writeAIPrefs(next);
  }

  if (!hydrated) return null;

  return (
    <section
      aria-labelledby="ai-prefs-heading"
      className="border border-divider bg-bg-elev-1 rounded-lg flex flex-col gap-1 p-4"
    >
      <header className="flex items-center gap-3 pb-2">
        <h2
          id="ai-prefs-heading"
          className="text-fg text-base font-semibold tracking-tight"
        >
          AI Preferences
        </h2>
        <p className="text-fg-subtle ml-auto text-caption uppercase tracking-wider">
          Saved on this device
        </p>
      </header>

      <SettingsRow
        icon={<Bot className="size-4" />}
        label="Fundamental Model"
        description="Used for complex reasoning and macro news."
        stack
        action={
          <select
            value={prefs.fundamentalModel}
            onChange={(e) => update('fundamentalModel', e.target.value)}
            className="border-divider/60 bg-bg-elev-2 text-fg rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<Bot className="size-4" />}
        label="Technical Model"
        description="Used for chart analysis and indicators."
        stack
        action={
          <select
            value={prefs.technicalModel}
            onChange={(e) => update('technicalModel', e.target.value)}
            className="border-divider/60 bg-bg-elev-2 text-fg rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<Bot className="size-4" />}
        label="Summary Model"
        description="Used for simple list formatting and summaries."
        stack
        action={
          <select
            value={prefs.summaryModel}
            onChange={(e) => update('summaryModel', e.target.value)}
            className="border-divider/60 bg-bg-elev-2 text-fg rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        }
      />

      <RowDivider />

      <div className="flex flex-col gap-2 pt-2 pb-1">
        <label htmlFor="custom-instructions" className="text-fg text-sm font-medium">
          Custom Instructions
        </label>
        <p className="text-fg-muted text-xs">
          Appended to the AI's core instructions. Use this to change its formatting, personality, or behavior.
        </p>

        {/* Phase A — UX_UPGRADE_PLAN.md item 6.
            Preset chips. Each chip replaces the textarea content
            (after a confirm if non-empty); the + button on the chip
            appends instead. The Clear button empties the field. */}
        <div className="flex flex-wrap items-center gap-2">
          {INSTRUCTION_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="border-divider bg-bg-elev-2 inline-flex items-center overflow-hidden rounded-full border text-caption"
            >
              <button
                type="button"
                onClick={() => applyPreset(preset.id, 'replace')}
                aria-label={`Apply preset "${preset.label}" (replace existing instructions)`}
                className="hover:bg-bg-elev-3 text-fg-muted hover:text-fg px-3 py-1 transition-colors"
              >
                <Sparkles className="mr-1 inline size-3 align-text-bottom" aria-hidden="true" />
                {preset.label}
              </button>
              <button
                type="button"
                onClick={() => applyPreset(preset.id, 'append')}
                aria-label={`Append preset "${preset.label}" to existing instructions`}
                title="Append to existing"
                className="border-divider/60 text-fg-subtle hover:text-fg hover:bg-bg-elev-3 -ml-px border-l px-2 py-1 transition-colors"
              >
                +
              </button>
            </div>
          ))}
          {prefs.customInstructions.length > 0 ? (
            <button
              type="button"
              onClick={() => update('customInstructions', '')}
              className="text-fg-subtle hover:text-fg ml-1 inline-flex items-center gap-1 px-2 py-1 text-caption transition-colors"
              aria-label="Clear custom instructions"
            >
              <X className="size-3" aria-hidden="true" />
              Clear
            </button>
          ) : null}
        </div>

        <textarea
          id="custom-instructions"
          value={prefs.customInstructions}
          onChange={(e) => update('customInstructions', e.target.value)}
          placeholder="e.g. Always respond in bullet points. Do not use emojis."
          rows={3}
          className="border-divider/60 bg-bg-elev-2 text-fg placeholder:text-fg-muted rounded-lg border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
        />
      </div>
    </section>
  );

  /**
   * Apply a preset. `mode === 'replace'` overwrites the textarea
   * (with a confirm prompt if the field is non-empty). `mode ===
   * 'append'` joins the preset text to the existing value.
   */
  function applyPreset(presetId: string, mode: 'replace' | 'append') {
    if (mode === 'append') {
      update('customInstructions', appendPreset(prefs.customInstructions, presetId));
      return;
    }
    if (
      prefs.customInstructions.trim().length > 0 &&
      !window.confirm('Replace your existing custom instructions with this preset?')
    ) {
      return;
    }
    const preset = getPreset(presetId);
    if (preset) update('customInstructions', preset.prompt);
  }
}

function RowDivider() {
  return <div className="border-divider/60 -mx-4 my-1 border-t" />;
}
