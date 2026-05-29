'use client';

import { Bot, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SettingsRow } from './settings-row';

export interface AIPrefs {
  fundamentalModel: string;
  technicalModel: string;
  summaryModel: string;
  customInstructions: string;
}

export const AI_PREFS_STORAGE_KEY = 'hamafx:ai-prefs';

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
      className="card-premium flex flex-col gap-1 p-4"
    >
      <header className="flex items-center gap-3 pb-2">
        <h2
          id="ai-prefs-heading"
          className="text-fg text-base font-semibold tracking-tight"
        >
          AI Preferences
        </h2>
        <p className="text-fg-subtle ml-auto text-[10px] uppercase tracking-wider">
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
}

function RowDivider() {
  return <div className="border-divider/60 -mx-4 my-1 border-t" />;
}
