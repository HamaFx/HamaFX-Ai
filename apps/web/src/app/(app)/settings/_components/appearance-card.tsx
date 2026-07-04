'use client';

import { useCallback, useEffect, useState } from 'react';
import { Segmented } from '@/components/ui/segmented';
import { updateUIPrefsAction, updateLocaleAction } from '../actions';
import { SettingsRow } from './settings-row';

type Theme = 'light' | 'dark' | 'system';

const LOCALES: { value: string; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文' },
  { value: 'ar-AE', label: 'العربية' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'ja', label: '日本語' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
];

function applyTheme(theme: Theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

export function AppearanceCard({ initialTheme, initialLocale }: { initialTheme?: string | null; initialLocale?: string }) {
  const [theme, setTheme] = useState<Theme>((initialTheme ?? 'system') as Theme);
  const [locale, setLocale] = useState(initialLocale ?? 'en');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleThemeChange = useCallback((value: string) => {
    setTheme(value as Theme);
    updateUIPrefsAction({ theme: value });
  }, []);

  const handleLocaleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocale(e.target.value);
    updateLocaleAction(e.target.value);
  }, []);

  return (
    <section className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-1 p-4" aria-labelledby="appearance-heading">
      <div className="flex items-center justify-between">
        <h2 id="appearance-heading" className="text-fg text-base font-semibold tracking-tight">Appearance</h2>
        <p className="text-fg-subtle text-caption uppercase tracking-wider">Theme</p>
      </div>
      <SettingsRow
        label="Theme"
        description="Choose your preferred color scheme"
        action={
          <Segmented
            value={theme}
            onChange={handleThemeChange}
            role="radiogroup"
            variant="solid"
            size="sm"
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        }
      />
      <SettingsRow
        label="Locale"
        description="Language and date/number formatting"
        action={
          <select
            value={locale}
            onChange={handleLocaleChange}
            aria-label="Locale"
            className="border border-border bg-bg-elev-2 text-fg rounded-sm px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fg"
          >
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        }
      />
    </section>
  );
}
