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

/**
 * Quick-prompt chips. Mounted inside the empty-state of the chat surface
 * rather than as a separate panel above the composer — the user sees one
 * inviting block instead of two competing surfaces.
 *
 * Phase A — UX_UPGRADE_PLAN.md item 3.
 *
 * The chip set now adapts to (a) the current trading session (derived
 * in lib/session.ts) and (b) whether the thread has a pinned symbol.
 * A no-symbol user sees session-aware prompts ("London open — bias on
 * majors?"); a user with XAUUSD pinned sees XAU-aware variants.
 *
 * Prompts are deterministic given (session, pin) so server-rendered
 * and client-rendered copies match exactly.
 */

import { useMemo, memo } from 'react';
import type { Symbol } from '@hamafx/shared';
import {IconChartBar, IconBell, IconCalendarEvent, IconChartLine, IconTrendingUp} from '@tabler/icons-react';

import { getSessionInfo, type TradingSession } from '@/lib/session';

interface QuickPromptsProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
  /** Optional pinned symbol from the active thread. */
  pinnedSymbol?: Symbol | null;
  /** Optional override for "now" — used by tests; defaults to new Date(). */
  now?: Date;
}

interface Prompt {
  icon: typeof IconChartBar;
  label: string;
  /** Icon foreground color class. */
  fg: string;
}

const NO_PIN_PROMPTS: Record<TradingSession, readonly Prompt[]> = {
  asian: [
    { icon: IconTrendingUp, label: "What's moving in Asia today?", fg: 'text-fg' },
    { icon: IconCalendarEvent, label: "Today's calendar", fg: 'text-accent' },
    { icon: IconChartLine, label: 'Top-down gold 4H→15M', fg: 'text-info' },
    { icon: IconChartBar, label: 'Show me the structure', fg: 'text-info' },
    { icon: IconBell, label: 'Alert gold above 2400', fg: 'text-warn' },
  ],
  london: [
    { icon: IconTrendingUp, label: 'London open — bias on majors?', fg: 'text-fg' },
    { icon: IconChartLine, label: 'Top-down EURUSD 4H→15M', fg: 'text-info' },
    { icon: IconChartBar, label: 'Show me the structure', fg: 'text-info' },
    { icon: IconCalendarEvent, label: "London session calendar", fg: 'text-accent' },
    { icon: IconBell, label: 'Alert EURUSD above 1.0900', fg: 'text-warn' },
  ],
  ny: [
    { icon: IconTrendingUp, label: 'NY session plan for XAUUSD', fg: 'text-fg' },
    { icon: IconChartLine, label: 'Top-down XAUUSD 4H→15M', fg: 'text-info' },
    { icon: IconChartBar, label: 'Show me the structure', fg: 'text-info' },
    { icon: IconCalendarEvent, label: "NY session calendar", fg: 'text-accent' },
    { icon: IconBell, label: 'Alert gold above 2400', fg: 'text-warn' },
  ],
  closed: [
    { icon: IconChartBar, label: 'How did today close?', fg: 'text-info' },
    { icon: IconTrendingUp, label: 'Daily bias recap', fg: 'text-fg' },
    { icon: IconChartLine, label: 'Top-down gold 4H→15M', fg: 'text-info' },
    { icon: IconCalendarEvent, label: "Tomorrow's calendar", fg: 'text-accent' },
    { icon: IconBell, label: 'Set an alert for tomorrow', fg: 'text-warn' },
  ],
  weekend: [
    { icon: IconTrendingUp, label: 'Weekly bias — what is your read?', fg: 'text-fg' },
    { icon: IconChartBar, label: 'Weekly structure recap', fg: 'text-info' },
    { icon: IconCalendarEvent, label: 'Next week calendar', fg: 'text-accent' },
    { icon: IconChartLine, label: 'Key levels to watch', fg: 'text-info' },
    { icon: IconBell, label: 'Set alert for Sunday open', fg: 'text-warn' },
  ],
};

function generatePinnedPrompts(symbol: string, session: TradingSession): readonly Prompt[] {
  const s = symbol.toUpperCase();
  switch (session) {
    case 'asian':
      return [
        { icon: IconTrendingUp, label: `${s} Asian range and key levels`, fg: 'text-fg' },
        { icon: IconCalendarEvent, label: `${s} news impact today`, fg: 'text-accent' },
        { icon: IconChartLine, label: `Top-down ${s} 4H→15M`, fg: 'text-info' },
        { icon: IconChartBar, label: `${s} Asian session structure`, fg: 'text-info' },
        { icon: IconBell, label: `Alert ${s} break of recent high`, fg: 'text-warn' },
      ];
    case 'london':
      return [
        { icon: IconTrendingUp, label: `London open bias for ${s}`, fg: 'text-fg' },
        { icon: IconChartLine, label: `Top-down ${s} 4H→15M`, fg: 'text-info' },
        { icon: IconChartBar, label: `London session ${s} key levels`, fg: 'text-info' },
        { icon: IconCalendarEvent, label: `European news affecting ${s}`, fg: 'text-accent' },
        { icon: IconBell, label: `Alert ${s} below London low`, fg: 'text-warn' },
      ];
    case 'ny':
      return [
        { icon: IconTrendingUp, label: `NY session plan for ${s}`, fg: 'text-fg' },
        { icon: IconChartLine, label: `Top-down ${s} 4H→15M`, fg: 'text-info' },
        { icon: IconChartBar, label: `${s} news & market correlation`, fg: 'text-info' },
        { icon: IconCalendarEvent, label: `NY session calendar for USD`, fg: 'text-accent' },
        { icon: IconBell, label: `Alert ${s} break of high`, fg: 'text-warn' },
      ];
    case 'closed':
      return [
        { icon: IconChartBar, label: `How did ${s} close today?`, fg: 'text-info' },
        { icon: IconTrendingUp, label: `${s} daily bias recap`, fg: 'text-fg' },
        { icon: IconChartLine, label: `Top-down ${s} 4H→15M`, fg: 'text-info' },
        { icon: IconCalendarEvent, label: `Tomorrow's ${s} news outlook`, fg: 'text-accent' },
        { icon: IconBell, label: `Set an alert for ${s} tomorrow`, fg: 'text-warn' },
      ];
    case 'weekend':
      return [
        { icon: IconTrendingUp, label: `${s} weekly bias & structure`, fg: 'text-fg' },
        { icon: IconChartBar, label: `Weekly ${s} sentiment & COT check`, fg: 'text-info' },
        { icon: IconCalendarEvent, label: `Next week ${s} news calendar`, fg: 'text-accent' },
        { icon: IconChartLine, label: `${s} key levels to watch next week`, fg: 'text-info' },
        { icon: IconBell, label: `Set ${s} alert for Sunday open`, fg: 'text-warn' },
      ];
  }
}

export const QuickPrompts = memo(function QuickPrompts({
  onSelect,
  disabled,
  pinnedSymbol,
  now,
}: QuickPromptsProps) {
  const sessionInfo = useMemo(() => getSessionInfo(now ?? new Date()), [now]);
  const session = sessionInfo.session;
  const sessionPrefix = session === 'london' ? 'London session is live — '
    : session === 'ny' ? 'NY session is live — '
    : session === 'asian' ? 'Asian session is live — '
    : '';
  const prompts = useMemo(() => {
    const base = pinnedSymbol
      ? generatePinnedPrompts(pinnedSymbol, session)
      : NO_PIN_PROMPTS[session];
    if (!sessionPrefix) return base;
    return (base as readonly Prompt[]).map((p, i) => ({
      ...p,
      label: i === 0 ? `${sessionPrefix}${p.label}` : p.label,
    }));
  }, [pinnedSymbol, session, sessionPrefix]);


  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {prompts.map((p) => {
        const Icon = p.icon;
        return (
          <button
            key={p.label}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(p.label)}
            className="border border-border bg-bg-elev-1 text-fg hover:bg-bg-elev-3 focus-visible:ring-fg flex h-14 items-center gap-3 rounded-sm px-4 py-3 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <span
              className={`shrink-0 inline-flex size-8 items-center justify-center rounded-sm border border-border bg-bg-elev-2 text-fg-muted`}
            >
              <Icon className="size-4" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="line-clamp-2 leading-snug">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
});

QuickPrompts.displayName = 'QuickPrompts';
