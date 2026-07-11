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

'use client';

// Phase 1.6 — Stats widget (4-cell stat grid).
//
// Computes win rate, total R, average R, and active position count from
// journal entries and renders them via the existing StatCard surface so
// styling stays consistent across the app.

import { useMemo } from 'react';
import {IconActivity, IconCurrencyDollar, IconPercentage, IconTrendingUp} from '@tabler/icons-react';
import type { JournalEntry } from '@hamafx/shared';

import { StatCard, type StatCardProps } from '@/components/ui/stat-card';

interface StatsWidgetProps {
  entries: readonly JournalEntry[];
}

type MetricCell = StatCardProps;

export function StatsWidget({ entries }: StatsWidgetProps) {
  const metrics = useMemo(() => {
    const open = entries.filter((e) => e.outcome === 'open');
    const closed = entries.filter((e) => e.outcome !== 'open');

    const totalR = closed.reduce((sum, e) => sum + (e.rMultiple ?? 0), 0);
    const winCount = closed.filter((e) => e.outcome === 'win').length;
    const winRate = closed.length > 0 ? (winCount / closed.length) * 100 : 0;
    const avgR = closed.length > 0 ? totalR / closed.length : 0;

    // Last 10 closed trades (newest → oldest) for the cumulative sparkline.
    const sparkSource = closed.slice(-10).reverse();
    let cumulative = 0;
    const sparkline = sparkSource.map((e) => {
      cumulative += e.rMultiple ?? 0;
      return cumulative;
    });

    const cells: MetricCell[] = [
      {
        label: 'Cumulative R',
        value: `${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`,
        tone: totalR > 0 ? 'bull' : totalR < 0 ? 'bear' : 'fg',
        icon: <IconCurrencyDollar />,
        ...(sparkline.length >= 2 ? { sparkline } : {}),
      },
      {
        label: 'Win rate',
        value: closed.length > 0 ? `${winRate.toFixed(0)}%` : '—',
        tone: winRate >= 50 ? 'bull' : winRate > 0 ? 'muted' : 'bear',
        icon: <IconPercentage />,
      },
      {
        label: 'Avg R',
        value: closed.length > 0 ? `${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R` : '—',
        tone: avgR > 0 ? 'bull' : avgR < 0 ? 'bear' : 'muted',
        icon: <IconTrendingUp />,
      },
      {
        label: 'Active',
        value: String(open.length),
        tone: 'fg',
        icon: <IconActivity />,
      },
    ];

    return cells;
  }, [entries]);

  return (
    <section
      aria-label="Trading stats"
      className="grid grid-cols-2 gap-3"
    >
      {metrics.map((m) => (
        <StatCard
          key={m.label}
          label={m.label}
          value={m.value}
          tone={m.tone ?? 'fg'}
          icon={m.icon}
          {...(m.sparkline && m.sparkline.length >= 2
            ? { sparkline: m.sparkline }
            : {})}
        />
      ))}
    </section>
  );
}
