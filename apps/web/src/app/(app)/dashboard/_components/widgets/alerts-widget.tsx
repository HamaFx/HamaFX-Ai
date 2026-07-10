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

// Phase 1.6 — Alerts widget.
//
// Compact list of the user's active alert rules. Mirrors the markup on
// /alerts page but slimmer (max 5 rows, no actions). Links to the full
// alerts page for management.

import Link from 'next/link';
import { IconBell } from '@tabler/icons-react';
import type { Alert } from '@hamafx/shared';

import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

interface AlertsWidgetProps {
  alerts: readonly Alert[];
  limit?: number;
}

function summariseRule(alert: Alert): string {
  const r = alert.rule;
  switch (r.type) {
    case 'priceCross':
      return `${r.direction} ${r.level}`;
    case 'candleClose':
      return `${r.direction} ${r.level} (close)`;
    case 'indicatorCross':
      return `${r.direction} ${r.level} (${r.indicator})`;
  }
}

export function AlertsWidget({ alerts, limit = 5 }: AlertsWidgetProps) {
  const rows = alerts.slice(0, limit);

  return (
    <section
      aria-label="Active alerts"
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconBell className="text-fg-subtle size-4" />
          <span className="text-fg text-body-sm font-semibold">Alerts</span>
          {rows.length > 0 ? (
            <span className="text-fg-subtle text-caption tabular-nums">
              {rows.length}
            </span>
          ) : null}
        </div>
        <Link href="/alerts" className="text-fg-subtle hover:text-fg text-caption">
          Manage
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconBell className="size-5" />}
          title="No alerts set"
          description="Create price or indicator alerts to get notified on your phone or email."
          tone="muted"
          bare
          className="py-4"
        />
      ) : (
        <ul className="flex flex-col">
          {rows.map((a) => (
            <li
              key={a.id}
              className="border-divider flex items-center justify-between gap-3 border-b py-2 last:border-0"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-fg text-body-sm font-semibold">
                  {a.rule.symbol}
                </span>
                <span className="text-fg-subtle text-caption truncate">
                  {summariseRule(a)}
                </span>
              </div>
              <span
                className={cn(
                  'text-caption font-bold px-1.5 py-0.5 rounded-sm shrink-0',
                  a.active ? 'bg-success/10 text-success' : 'bg-fg-muted/10 text-fg-muted',
                )}
              >
                {a.active ? 'Armed' : 'Paused'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
