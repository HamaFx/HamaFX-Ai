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

import {IconBolt, IconX} from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { useLocalStorage } from '@/hooks/use-local-storage';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { updateAiPrefsAction } from '../actions';

export interface AIPrefs {
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
  const safeCurrent = typeof current === 'string' ? trimmed : '';
  if (safeCurrent.length === 0) return p.prompt;
  return `${safeCurrent}\n\n${p.prompt}`;
}

const DEFAULTS: AIPrefs = {
  customInstructions: '',
};

/**
 * Card on /settings → "AI Preferences".
 *
 * Owns two distinct concerns:
 *   1. Custom instructions — appended to the AI's system prompt on
 *      every chat turn. Works today.
 *   2. (No longer here) Per-domain model selectors. The previous
 *      version of this card exposed fundamentalModel / technicalModel
 *      / summaryModel selectors, but those values were only consumed
 *      by the plan-then-act planner and the title-generation path —
 *      not the main chat turn. The actual chat-turn model lives in
 *      `user_settings.default_models` (DB) and is set via the
 *      /settings/models browser.
 *
 *      Removing the misleading selectors here; users who want to
 *      change the chat model follow the "Manage models →" link below.
 */
let _aiSyncTimer: ReturnType<typeof setTimeout> | undefined;

export function AIPrefsCard({ initialCustomInstructions }: { initialCustomInstructions?: string | null }) {
  const [prefs, setPrefs, hydrated] = useLocalStorage<AIPrefs>(AI_PREFS_STORAGE_KEY, DEFAULTS);
  const [confirmEl, confirm] = useConfirm();

  // Always sync server value to localStorage (DB is source of truth).
  // Resolves drift from cross-device DB changes or cleared localStorage.
  const serverInstructions = initialCustomInstructions ?? '';
  useEffect(() => {
    if (hydrated && serverInstructions !== (prefs?.customInstructions ?? '')) {
      setPrefs((prev) => ({ ...prev, customInstructions: serverInstructions }));
    }
    // prefs and setPrefs deliberately excluded to avoid infinite sync loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, serverInstructions]);

  const customInstructions = hydrated
    ? (prefs?.customInstructions ?? '')
    : (initialCustomInstructions ?? '');

  function update<K extends keyof AIPrefs>(key: K, value: AIPrefs[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  function handleInstructionsChange(value: string) {
    update('customInstructions', value);
    if (_aiSyncTimer) clearTimeout(_aiSyncTimer);
    _aiSyncTimer = setTimeout(() => {
      updateAiPrefsAction(value);
    }, 500);
  }

  if (!hydrated) return null;

  return (
    <section
      aria-labelledby="ai-prefs-heading"
      className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-4"
    >
      <header className="flex items-center gap-3 pb-1">
        <h2
          id="ai-prefs-heading"
          className="text-fg text-base font-semibold tracking-tight"
        >
          AI Preferences
        </h2>
        <Link
          href="/settings/models"
          className="text-fg-subtle hover:text-fg ml-auto inline-flex items-center gap-1 text-caption font-medium transition-colors"
        >
          Manage models
          <span aria-hidden="true">→</span>
        </Link>
      </header>

      <p className="text-fg-muted text-xs">
        Model choices are server-side and apply to every chat turn. Use the header link above to manage which models handle each kind of analysis.
      </p>

      <div className="flex flex-col gap-2 pt-1 pb-1">
        <label
          htmlFor="custom-instructions"
          className="text-fg text-sm font-medium"
        >
          Custom instructions
        </label>
        <p className="text-fg-muted text-xs">
          Appended to the AI&rsquo;s core instructions on every turn.
          Use this to change formatting, personality, or behaviour.
        </p>

        {/* Phase A — UX_UPGRADE_PLAN.md item 6.
            Preset chips. Each chip replaces the textarea content
            (after a confirm if non-empty); the + button on the chip
            appends instead. The Clear button empties the field. */}
        <div className="flex flex-wrap items-center gap-2">
          {INSTRUCTION_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="border-border bg-bg-elev-2 inline-flex items-center overflow-hidden rounded-sm border text-caption"
            >
              <button
                type="button"
                onClick={() => applyPreset(preset.id, 'replace')}
                aria-label={`Apply preset "${preset.label}" (replace existing instructions)`}
                className="hover:bg-bg-elev-3 text-fg-muted hover:text-fg px-3 py-1 transition-colors"
              >
                <IconBolt className="mr-1 inline size-3 align-text-bottom" aria-hidden="true" />
                {preset.label}
              </button>
              <button
                type="button"
                onClick={() => applyPreset(preset.id, 'append')}
                aria-label={`Append preset "${preset.label}" to existing instructions`}
                title="Append to existing"
                className="border-border text-fg-subtle hover:text-fg hover:bg-bg-elev-3 -ml-px border-l px-2 py-1 transition-colors"
              >
                +
              </button>
            </div>
          ))}
          {customInstructions.length > 0 ? (
            <button
              type="button"
              onClick={() => { update('customInstructions', ''); updateAiPrefsAction(''); }}
              className="text-fg-subtle hover:text-fg ml-1 inline-flex items-center gap-1 px-2 py-1 text-caption transition-colors"
              aria-label="Clear custom instructions"
            >
              <IconX className="size-3" aria-hidden="true" />
              Clear
            </button>
          ) : null}
        </div>

        <textarea
          id="custom-instructions"
          value={customInstructions}
          onChange={(e) => handleInstructionsChange(e.target.value)}
          placeholder="e.g. Always respond in bullet points. Do not use emojis."
          rows={3}
          className="border-border bg-bg-elev-2 text-fg placeholder:text-fg-muted rounded-sm border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-fg resize-none"
        />
      </div>

      <p className="text-fg-subtle text-caption uppercase tracking-wider">
        Saved to account
      </p>
      {confirmEl}
    </section>
  );

  /**
   * Apply a preset. `mode === 'replace'` overwrites the textarea
   * (with a confirm prompt if the field is non-empty). `mode ===`
   * 'append'` joins the preset text to the existing value.
   */
  async function applyPreset(presetId: string, mode: 'replace' | 'append') {
    let newValue: string;
    if (mode === 'append') {
      newValue = appendPreset(customInstructions, presetId);
    } else {
      if (customInstructions.trim().length > 0) {
        const ok = await confirm({
          title: 'Replace custom instructions?',
          description: 'Replace your existing custom instructions with this preset?',
          confirmLabel: 'Replace',
          tone: 'danger',
        });
        if (!ok) return;
      }
      const preset = getPreset(presetId);
      newValue = preset ? preset.prompt : customInstructions;
    }
    update('customInstructions', newValue);
    await updateAiPrefsAction(newValue);
  }
}
