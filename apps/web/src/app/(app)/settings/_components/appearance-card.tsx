'use client';

import { useCallback, useState } from 'react';
import { updateLocaleAction } from '../actions';
import { SettingsRow } from './settings-row';

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

export function AppearanceCard({ initialLocale }: { initialTheme?: string | null; initialLocale?: string }) {
  const [locale, setLocale] = useState(initialLocale ?? 'en');

  const handleLocaleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocale(e.target.value);
    updateLocaleAction(e.target.value);
  }, []);

  return (
    <section className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-1 p-4" aria-labelledby="appearance-heading">
      <div className="flex items-center justify-between">
        <h2 id="appearance-heading" className="text-fg text-base font-semibold tracking-tight">Appearance</h2>
        <p className="text-fg-subtle text-caption uppercase tracking-wider">Locale</p>
      </div>
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
