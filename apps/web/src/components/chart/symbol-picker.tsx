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

// Symbol picker with typeahead search. Shows the user's watchlist first,
// then all available symbols from @hamafx/shared. The search input filters
// across ALL symbols so users can navigate to a symbol not in their watchlist.

import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { BUILTIN_SYMBOLS, type Symbol } from '@hamafx/shared';

import { useTimeframe } from '@/hooks/use-tf';
import { cn } from '@/lib/cn';
import { Segmented } from '@/components/ui/segmented';

export function SymbolPicker({ active, watchlist }: { active: Symbol; watchlist: string[] }) {
  const [tf] = useTimeframe();
  const [query, setQuery] = useState('');

  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // IconSearch all BUILTIN_SYMBOLS (not just the old 3) by internal symbol or display name
    return BUILTIN_SYMBOLS
      .filter((s) =>
        !watchlist.includes(s.internal) &&
        (s.internal.toLowerCase().includes(q) || s.display.toLowerCase().includes(q)),
      )
      .map((s) => s.internal);
  }, [query, watchlist]);

  const showSearch = watchlist.length > 0 || query.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {showSearch ? (
        <div className="relative">
          <IconSearch
            aria-hidden="true"
            className="text-fg-subtle absolute left-3 top-1/2 size-4 -translate-y-1/2"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="IconSearch symbols…"
            className="bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle focus:border-border border-border h-11 w-full rounded-sm border pl-10 pr-4 text-sm focus:outline-none"
          />
        </div>
      ) : null}

      <Segmented<Symbol>
        as="link"
        label="Symbol"
        srLabel
        value={active}
        role="tablist"
        variant="accent"
        groupId="symbol-indicator"
        hrefFor={(s) => `/chart/${s}?tf=${tf}`}
        options={watchlist.map((s) => ({ value: s, label: s }))}
      />

      {query && filteredAll.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {filteredAll.map((s) => (
            <a
              key={s}
              href={`/chart/${s}?tf=${tf}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors',
                'text-fg-muted hover:text-fg hover:bg-bg-elev-2',
              )}
            >
              {s}
            </a>
          ))}
        </div>
      ) : null}

      {query && filteredAll.length === 0 && watchlist.every((s) => !s.toLowerCase().includes(query.trim().toLowerCase())) ? (
        <p className="text-fg-subtle px-3 py-2 text-center text-sm">No symbols match.</p>
      ) : null}
    </div>
  );
}
