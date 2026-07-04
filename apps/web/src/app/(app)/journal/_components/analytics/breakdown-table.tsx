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

// Reusable sortable breakdown table for by-symbol / by-session / by-hour / by-day / by-tag stats.

import { useMemo, useState } from 'react';

import { cn } from '@/lib/cn';

interface BreakdownRow {
  label: string;
  trades: number;
  winRate: number;
  totalR: number;
  expectancy?: number;
}

interface BreakdownTableProps {
  title: string;
  data: readonly BreakdownRow[];
  sortBy?: 'trades' | 'winRate' | 'totalR' | 'expectancy';
}

type SortKey = 'label' | 'trades' | 'winRate' | 'totalR' | 'expectancy';
type SortDir = 'asc' | 'desc';

export function BreakdownTable({ title, data, sortBy = 'totalR' }: BreakdownTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: sortBy,
    dir: 'desc',
  });

  const rows = useMemo(() => {
    const sorted = [...data];
    sorted.sort((a, b) => {
      const { key, dir } = sort;
      let aVal: number | string;
      let bVal: number | string;
      if (key === 'label') {
        aVal = a.label;
        bVal = b.label;
      } else if (key === 'expectancy') {
        aVal = a.expectancy ?? 0;
        bVal = b.expectancy ?? 0;
      } else {
        aVal = a[key];
        bVal = b[key];
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;
      return dir === 'asc' ? aNum - bNum : bNum - aNum;
    });
    return sorted;
  }, [data, sort]);

  const header = (key: SortKey, label: string, numeric = true) => {
    const active = sort.key === key;
    const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return (
      <th
        scope="col"
        role="columnheader"
        aria-sort={ariaSort}
        className={cn(
          'text-left text-caption font-bold uppercase tracking-wider text-fg-subtle py-2 px-3 cursor-pointer select-none',
          numeric && 'text-right',
        )}
        onClick={() =>
          setSort((prev) => ({
            key,
            dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
          }))
        }
      >
        {label}
      </th>
    );
  };

  return (
    <div
      className="border border-border bg-bg-elev-1 rounded-sm overflow-hidden"
      role="table"
      aria-label={title}
    >
      <div className="px-3 py-2 border-b border-border">
        <span className="text-body-sm font-semibold text-fg">{title}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-bg-elev-2">
          <tr>
            {header('label', 'Label', false)}
            {header('trades', 'Trades')}
            {header('winRate', 'Win Rate')}
            {header('totalR', 'Total R')}
            {header('expectancy', 'Expectancy')}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-divider last:border-b-0">
              <td className="py-2 px-3 text-fg font-medium">{row.label}</td>
              <td className="py-2 px-3 text-right text-fg-muted tabular-nums">{row.trades}</td>
              <td
                className={cn(
                  'py-2 px-3 text-right tabular-nums font-medium',
                  row.winRate > 0.55 ? 'text-bull' : row.winRate < 0.4 ? 'text-bear' : 'text-fg-muted',
                )}
              >
                {(row.winRate * 100).toFixed(0)}%
              </td>
              <td
                className={cn(
                  'py-2 px-3 text-right tabular-nums font-medium',
                  row.totalR > 0 ? 'text-bull' : row.totalR < 0 ? 'text-bear' : 'text-fg-muted',
                )}
              >
                {row.totalR > 0 ? '+' : ''}
                {row.totalR.toFixed(2)}R
              </td>
              <td className="py-2 px-3 text-right text-fg-muted tabular-nums">
                {row.expectancy !== undefined ? `${row.expectancy > 0 ? '+' : ''}${row.expectancy.toFixed(2)}R` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
