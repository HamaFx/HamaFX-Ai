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

// Phase 1.9 — "Today at a glance" hero.
//
// 2×2 (mobile) / 1×4 (desktop) strip above the dashboard fold. Each cell
// is a self-contained micro-summary: next event countdown, current
// trading session, open risk, and an AI nudge link to chat.
//
// Uses the shared `TimeProvider` so the countdown ticks without each
// cell starting its own interval. All numerals are `tabular-nums`.

import {IconClock, IconCompass, IconAlertTriangle, IconBolt} from '@tabler/icons-react';
import Link from 'next/link';
import type { JournalEntry, EconomicEvent, Symbol } from '@hamafx/shared';

import { useTime } from '@/components/providers/time-provider';
import { formatCountdown } from '@/lib/datetime';
import { cn } from '@/lib/cn';

interface TodayGlanceWidgetProps {
  events: EconomicEvent[];
  entries: JournalEntry[];
  /** Latest briefing body (first sentence becomes the nudge). */
  briefingNudge: string | null;
  /** Optional default symbol for the nudge CTA. */
  defaultSymbol?: Symbol;
}

export function TodayGlanceWidget({
  events,
  entries,
  briefingNudge,
  defaultSymbol = 'XAUUSD',
}: TodayGlanceWidgetProps) {
  return (
    <section
      role="status"
      aria-label="Today at a glance"
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      <CellNextEvent events={events} />
      <CellSession />
      <CellOpenRisk entries={entries} />
      <CellAiNudge briefingNudge={briefingNudge} defaultSymbol={defaultSymbol} />
    </section>
  );
}
// -----------------------------------------------------------------------
// Cell 1 — Next high-impact event countdown
// -----------------------------------------------------------------------

function CellNextEvent({ events }: { events: EconomicEvent[] }) {
  const { now } = useTime();
  const upcoming = events
    .filter((e) => e.date > now)
    .sort((a, b) => a.date - b.date)[0];

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-1.5 rounded-sm border p-3">
      <div className="text-fg-subtle flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider">
        <IconClock className="text-warn size-3.5" />
        Next event
      </div>
      {upcoming ? (
        <>
          <span className="text-fg line-clamp-2 text-body-sm font-semibold">{upcoming.title}</span>
          <span className="text-fg-muted text-caption tabular-nums">
            {formatCountdown(upcoming.date - now)}
          </span>
        </>
      ) : (
        <span className="text-fg-muted text-xs">No high-impact events today</span>
      )}
    </div>
  );
}


// -----------------------------------------------------------------------
// Cell 2 — Current trading session (UTC-based)
// -----------------------------------------------------------------------

function CellSession() {
  const { now } = useTime();
  const session = getSession(new Date(now));
  const active = session !== 'Closed' && session !== 'Weekend';
  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-1.5 rounded-sm border p-3">
      <div className="text-fg-subtle flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider">
        <IconCompass className="text-fg size-3.5" />
        Session
      </div>
      <span className="text-fg text-body-sm font-semibold">{session}</span>
      <span
        className={cn(
          'inline-flex w-fit items-center rounded-sm px-1.5 py-0.5 text-caption font-medium',
          active ? 'bg-success/10 text-success' : 'bg-fg-muted/10 text-fg-muted',
        )}
      >
        {active ? 'Active' : 'Closed'}
      </span>
    </div>
  );
}

/**
 * Maps the current UTC hour to one of the canonical trading sessions.
 * London + New York overlap 13:00–16:00 UTC — we keep "London" for the
 * overlap hour so the label matches what most retail desks print.
 */
function getSession(now: Date): 'Asian' | 'London' | 'New York' | 'Closed' | 'Weekend' {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return 'Weekend';
  const hour = now.getUTCHours();
  // Sydney 22:00–07:00 UTC + Tokyo 00:00–09:00 → Asian: 22:00–07:59
  if (hour >= 22 || hour < 8) return 'Asian';
  // London 08:00–17:00 UTC (including London/NY overlap at 13:00–16:59)
  if (hour >= 8 && hour < 17) return 'London';
  // New York 13:00–22:00 UTC (active after London closes: 17:00–21:59)
  if (hour >= 17 && hour < 22) return 'New York';
  return 'Closed';
}

// -----------------------------------------------------------------------
// Cell 3 — Open risk
// -----------------------------------------------------------------------

function CellOpenRisk({ entries }: { entries: JournalEntry[] }) {
  const open = entries.filter((e) => e.outcome === 'open');
  // Aggregate R-at-risk. With a stop+target, R = |entry - stop| / |entry - target|.
  // Without a target we fall back to 1R per open position.
  let totalR = 0;
  for (const e of open) {
    if (
      e.entry !== null &&
      e.stop !== null &&
      Math.abs(e.entry - e.stop) > 0
    ) {
      // R = capital-at-risk per position (1R each). The risk is defined by
      // |entry - stop|, which represents one R in the user's risk framework.
      totalR += 1;
    } else {
      totalR += 1;
    }
  }
  const totalRRounded = Math.round(totalR * 10) / 10;

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-1.5 rounded-sm border p-3">
      <div className="text-fg-subtle flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider">
        <IconAlertTriangle className="text-danger size-3.5" />
        Open risk
      </div>
      {open.length === 0 ? (
        <span className="text-fg-muted text-xs">No open positions</span>
      ) : (
        <span className="text-fg text-body-sm font-semibold tabular-nums">
          {open.length} {open.length === 1 ? 'position' : 'positions'} ·{' '}
          {totalRRounded}R at risk
        </span>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Cell 4 — AI nudge
// -----------------------------------------------------------------------

function CellAiNudge({
  briefingNudge,
  defaultSymbol,
}: {
  briefingNudge: string | null;
  defaultSymbol: Symbol;
}) {
  const nudge = briefingNudge ?? `Ask AI about today's bias for ${defaultSymbol}`;
  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-1.5 rounded-sm border p-3">
      <div className="text-fg-subtle flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider">
        <IconBolt className="text-fg size-3.5" />
        AI nudge
      </div>
      <p className="text-fg line-clamp-2 text-body-sm">{nudge}</p>
      <Link
        href="/chat"
        className="text-fg text-caption mt-auto inline-flex items-center gap-1 hover:underline"
      >
        Open chat <span aria-hidden>→</span>
      </Link>
    </div>
  );
}