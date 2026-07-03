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

import { isKnownSymbol, type Symbol } from '@hamafx/shared';
import { Clock, Sparkles, TrendingUp } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';

import { SettingsRow } from './settings-row';
import { updateUIPrefsAction } from '../actions';

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

export function PreferencesCard({
  watchlist = ['XAUUSD', 'EURUSD', 'GBPUSD'],
  initialPrefs,
}: {
  watchlist?: string[];
  initialPrefs?: { defaultSymbol?: string | null; timeFormat?: string | null; reduceMotion?: boolean | null };
}) {
  const [prefs, setPrefs, hydrated] = useLocalStorage<Prefs>(STORAGE_KEY, DEFAULTS);

  // Seed localStorage from server value on first hydration if no local data
  useEffect(() => {
    if (hydrated && initialPrefs) {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        const merged: Prefs = {
          defaultSymbol: (initialPrefs.defaultSymbol ?? DEFAULTS.defaultSymbol) as Symbol,
          timeFormat: (initialPrefs.timeFormat ?? DEFAULTS.timeFormat) as '12h' | '24h',
          reduceMotion: initialPrefs.reduceMotion ?? DEFAULTS.reduceMotion,
        };
        setPrefs(merged);
      }
    }
  }, [hydrated, initialPrefs, setPrefs]);

  const update = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }, [setPrefs]);

  // Apply on mount and updates so a hard refresh and cross-tab sync respect the saved value.
  useEffect(() => {
    if (hydrated) {
      document.documentElement.dataset.reduceMotion = prefs.reduceMotion ? 'force' : 'auto';
      
      // Sanitize defaultSymbol from localStorage using isSymbol and ensuring it is present in the watchlist
      if (!isKnownSymbol(prefs.defaultSymbol) || !watchlist.includes(prefs.defaultSymbol)) {
        const defaultSym = watchlist.includes('XAUUSD') ? 'XAUUSD' : (watchlist[0] || DEFAULTS.defaultSymbol);
        // Avoid infinite updates if it is already matching
        if (prefs.defaultSymbol !== defaultSym) {
          update('defaultSymbol', defaultSym);
        }
      }
    }
  }, [prefs.reduceMotion, prefs.defaultSymbol, hydrated, watchlist, update]);

  function syncToDb<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    update(key, value);
    const payload: Record<string, unknown> = {};
    payload[key] = value;
    updateUIPrefsAction(payload as Parameters<typeof updateUIPrefsAction>[0]);
  }

  return (
    <section
      aria-labelledby="prefs-heading"
      className="border border-divider bg-bg-elev-1 rounded-lg flex flex-col gap-1 p-4"
    >
      <header className="flex items-center gap-3 pb-2">
        <h2
          id="prefs-heading"
          className="text-fg text-base font-semibold tracking-tight"
        >
          Preferences
        </h2>
        <p className="text-fg-subtle ml-auto text-caption uppercase tracking-wider">
          Saved to account
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
            onChange={(s) => syncToDb('defaultSymbol', s)}
            role="radiogroup"
            variant="solid"
            size="sm"
            options={watchlist.map((s) => ({ value: s, label: s.replace('USD', '') }))}
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
            onChange={(t) => syncToDb('timeFormat', t)}
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
              syncToDb('reduceMotion', v);
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
