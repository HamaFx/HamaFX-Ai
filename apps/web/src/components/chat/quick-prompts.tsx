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
import { BarChart3, Bell, CalendarDays, LineChart, TrendingUp } from 'lucide-react';

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
  icon: typeof BarChart3;
  label: string;
  /** Background tint behind the icon. */
  bg: string;
  /** Icon foreground color class. */
  fg: string;
}

const NO_PIN_PROMPTS: Record<TradingSession, readonly Prompt[]> = {
  asian: [
    { icon: TrendingUp, label: "What's moving in Asia today?", bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
    { icon: CalendarDays, label: "Today's calendar", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
    { icon: LineChart, label: 'Top-down gold 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: BarChart3, label: 'Show me the structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: Bell, label: 'Alert gold above 2400', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
  ],
  london: [
    { icon: TrendingUp, label: 'London open — bias on majors?', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
    { icon: LineChart, label: 'Top-down EURUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: BarChart3, label: 'Show me the structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: CalendarDays, label: "London session calendar", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
    { icon: Bell, label: 'Alert EURUSD above 1.0900', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
  ],
  ny: [
    { icon: TrendingUp, label: 'NY session plan for XAUUSD', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
    { icon: LineChart, label: 'Top-down XAUUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: BarChart3, label: 'Show me the structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: CalendarDays, label: "NY session calendar", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
    { icon: Bell, label: 'Alert gold above 2400', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
  ],
  closed: [
    { icon: BarChart3, label: 'How did today close?', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: TrendingUp, label: 'Daily bias recap', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
    { icon: LineChart, label: 'Top-down gold 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: CalendarDays, label: "Tomorrow's calendar", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
    { icon: Bell, label: 'Set an alert for tomorrow', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
  ],
  weekend: [
    { icon: TrendingUp, label: 'Weekly bias — what is your read?', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
    { icon: BarChart3, label: 'Weekly structure recap', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: CalendarDays, label: 'Next week calendar', bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
    { icon: LineChart, label: 'Key levels to watch', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: Bell, label: 'Set alert for Sunday open', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
  ],
};

function generatePinnedPrompts(symbol: string, session: TradingSession): readonly Prompt[] {
  const s = symbol.toUpperCase();
  switch (session) {
    case 'asian':
      return [
        { icon: TrendingUp, label: `${s} Asian range and key levels`, bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
        { icon: CalendarDays, label: `${s} news impact today`, bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
        { icon: LineChart, label: `Top-down ${s} 4H→15M`, bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
        { icon: BarChart3, label: `${s} Asian session structure`, bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
        { icon: Bell, label: `Alert ${s} break of recent high`, bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
      ];
    case 'london':
      return [
        { icon: TrendingUp, label: `London open bias for ${s}`, bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
        { icon: LineChart, label: `Top-down ${s} 4H→15M`, bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
        { icon: BarChart3, label: `London session ${s} key levels`, bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
        { icon: CalendarDays, label: `European news affecting ${s}`, bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
        { icon: Bell, label: `Alert ${s} below London low`, bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
      ];
    case 'ny':
      return [
        { icon: TrendingUp, label: `NY session plan for ${s}`, bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
        { icon: LineChart, label: `Top-down ${s} 4H→15M`, bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
        { icon: BarChart3, label: `${s} news & market correlation`, bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
        { icon: CalendarDays, label: `NY session calendar for USD`, bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
        { icon: Bell, label: `Alert ${s} break of high`, bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
      ];
    case 'closed':
      return [
        { icon: BarChart3, label: `How did ${s} close today?`, bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
        { icon: TrendingUp, label: `${s} daily bias recap`, bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
        { icon: LineChart, label: `Top-down ${s} 4H→15M`, bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
        { icon: CalendarDays, label: `Tomorrow's ${s} news outlook`, bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
        { icon: Bell, label: `Set an alert for ${s} tomorrow`, bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
      ];
    case 'weekend':
      return [
        { icon: TrendingUp, label: `${s} weekly bias & structure`, bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
        { icon: BarChart3, label: `Weekly ${s} sentiment & COT check`, bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
        { icon: CalendarDays, label: `Next week ${s} news calendar`, bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
        { icon: LineChart, label: `${s} key levels to watch next week`, bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
        { icon: Bell, label: `Set ${s} alert for Sunday open`, bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
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
            className="border border-zinc-800 bg-zinc-950 text-fg hover:bg-zinc-900 hover:border-zinc-700 focus-visible:ring-fg flex h-14 items-center gap-3 rounded-sm px-3 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <span
              className={`shrink-0 inline-flex size-8 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-fg-muted`}
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
