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

// Preferences card — local, browser-scoped settings. Personal app, no
// per-user DB row needed — these live in localStorage and are read by
// the relevant surfaces on demand.
//
// Currently exposes:
//   - Default symbol (XAUUSD / EURUSD / GBPUSD) → seeds /chart on first
//     visit and the chat composer placeholder
//   - Time format (12h vs 24h)
//   - Reduced motion override (auto vs always reduced)
//
// More toggles can land here without touching the layout — the
// SettingsRow primitive handles all the geometry.

import { type Symbol } from '@hamafx/shared';
import { Clock, Sparkles, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';

import { SettingsRow } from './settings-row';

interface Prefs {
  defaultSymbol: Symbol;
  timeFormat: '12h' | '24h';
  reduceMotion: boolean;
}

const STORAGE_KEY = 'hamafx:prefs';

const DEFAULTS: Prefs = {
  defaultSymbol: 'XAUUSD',
  timeFormat: '24h',
  reduceMotion: false,
};

function read(): Prefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      defaultSymbol:
        parsed.defaultSymbol === 'XAUUSD' ||
        parsed.defaultSymbol === 'EURUSD' ||
        parsed.defaultSymbol === 'GBPUSD'
          ? parsed.defaultSymbol
          : DEFAULTS.defaultSymbol,
      timeFormat: parsed.timeFormat === '12h' ? '12h' : '24h',
      reduceMotion: parsed.reduceMotion === true,
    };
  } catch {
    return DEFAULTS;
  }
}

function write(prefs: Prefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    // Apply the reduce-motion override immediately by toggling a body
    // attribute that the global CSS can read.
    document.documentElement.dataset.reduceMotion = prefs.reduceMotion ? 'force' : 'auto';
  } catch {
    /* quota */
  }
}

export function PreferencesCard() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = read();
    setPrefs(initial);
    setHydrated(true);
    // Apply on mount so a hard refresh respects the saved value.
    document.documentElement.dataset.reduceMotion = initial.reduceMotion ? 'force' : 'auto';
  }, []);

  function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    write(next);
  }

  return (
    <section
      aria-labelledby="prefs-heading"
      className="card-premium flex flex-col gap-1 p-4"
    >
      <header className="flex items-center gap-3 pb-2">
        <h2
          id="prefs-heading"
          className="text-fg text-base font-semibold tracking-tight"
        >
          Preferences
        </h2>
        <p className="text-fg-subtle ml-auto text-[10px] uppercase tracking-wider">
          Saved on this device
        </p>
      </header>

      <SettingsRow
        icon={<TrendingUp className="size-4" />}
        label="Default symbol"
        description="Used when /chart loads without a symbol query"
        stack
        action={
          <Segmented<Symbol>
            value={prefs.defaultSymbol}
            onChange={(s) => update('defaultSymbol', s)}
            role="radiogroup"
            variant="solid"
            size="sm"
            options={[
              { value: 'XAUUSD', label: 'XAU' },
              { value: 'EURUSD', label: 'EUR' },
              { value: 'GBPUSD', label: 'GBP' },
            ]}
          />
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<Clock className="size-4" />}
        label="Time format"
        description="Affects timestamps in news and the calendar"
        stack
        action={
          <Segmented<'12h' | '24h'>
            value={prefs.timeFormat}
            onChange={(t) => update('timeFormat', t)}
            role="radiogroup"
            variant="solid"
            size="sm"
            options={[
              { value: '12h', label: '12h' },
              { value: '24h', label: '24h' },
            ]}
          />
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<Sparkles className="size-4" />}
        label="Reduced motion"
        description="Force-disable animations regardless of system preference"
        action={
          <Switch
            checked={prefs.reduceMotion}
            onCheckedChange={(v) => {
              update('reduceMotion', v);
              if (hydrated) {
                toast.success(v ? 'Motion reduced' : 'Motion restored');
              }
            }}
            srLabel="Reduce motion"
          />
        }
      />
    </section>
  );
}

function RowDivider() {
  return <div className="border-divider/60 -mx-4 my-1 border-t" />;
}
