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

const GOLD_PROMPTS: Record<TradingSession, readonly Prompt[]> = {
  asian: [
    { icon: TrendingUp, label: "Gold Asian range and key levels", bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
    { icon: CalendarDays, label: "Gold news impact today", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
    { icon: LineChart, label: 'Top-down XAUUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: BarChart3, label: 'XAUUSD Asian session structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: Bell, label: 'Alert gold break of recent high', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
  ],
  london: [
    { icon: TrendingUp, label: 'London open bias for XAUUSD', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
    { icon: LineChart, label: 'Top-down XAUUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: BarChart3, label: 'London session gold key levels', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: CalendarDays, label: "European news affecting gold", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
    { icon: Bell, label: 'Alert gold below London low', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
  ],
  ny: [
    { icon: TrendingUp, label: 'NY session plan for XAUUSD', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
    { icon: LineChart, label: 'Top-down XAUUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: BarChart3, label: 'Gold news & DXY correlation', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: CalendarDays, label: "NY session calendar for USD", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
    { icon: Bell, label: 'Alert gold above 2400', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
  ],
  closed: [
    { icon: BarChart3, label: 'How did gold close today?', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: TrendingUp, label: 'XAUUSD daily bias recap', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
    { icon: LineChart, label: 'Top-down gold 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: CalendarDays, label: "Tomorrow's gold news outlook", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
    { icon: Bell, label: 'Set an alert for gold tomorrow', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
  ],
  weekend: [
    { icon: TrendingUp, label: 'Gold weekly bias & structure', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
    { icon: BarChart3, label: 'Weekly gold COT report check', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: CalendarDays, label: 'Next week USD key events', bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
    { icon: LineChart, label: 'Gold key levels to watch next week', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
    { icon: Bell, label: 'Set gold alert for Sunday open', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
  ],
};

const PINNED_PROMPTS: Record<Symbol, Record<TradingSession, readonly Prompt[]>> = {
  XAUUSD: GOLD_PROMPTS,
  EURUSD: {
    asian: [
      { icon: TrendingUp, label: 'EURUSD Asia session read', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
      { icon: LineChart, label: 'Top-down EURUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: BarChart3, label: 'Show me the structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: CalendarDays, label: 'EUR calendar today', bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
      { icon: Bell, label: 'Alert EURUSD above 1.0900', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
    ],
    london: [
      { icon: TrendingUp, label: 'London open plan for EURUSD', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
      { icon: LineChart, label: 'Top-down EURUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: BarChart3, label: 'Show me the structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: CalendarDays, label: "EUR session calendar", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
      { icon: Bell, label: 'Alert EURUSD above 1.0900', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
    ],
    ny: [
      { icon: TrendingUp, label: 'NY open plan for EURUSD', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
      { icon: LineChart, label: 'Top-down EURUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: BarChart3, label: 'Show me the structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: CalendarDays, label: "NY session calendar", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
      { icon: Bell, label: 'Alert EURUSD above 1.0900', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
    ],
    closed: [
      { icon: BarChart3, label: 'EURUSD daily recap', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: TrendingUp, label: 'EURUSD daily bias', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
      { icon: LineChart, label: 'Top-down EURUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: CalendarDays, label: "Tomorrow's EUR calendar", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
      { icon: Bell, label: 'Set EURUSD alert for tomorrow', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
    ],
    weekend: [
      { icon: TrendingUp, label: 'EURUSD weekly bias', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
      { icon: BarChart3, label: 'EURUSD weekly structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: CalendarDays, label: 'Next week EUR calendar', bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
      { icon: LineChart, label: 'EURUSD key levels', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: Bell, label: 'Set EURUSD alert for Sunday open', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
    ],
  },
  GBPUSD: {
    asian: [
      { icon: TrendingUp, label: 'GBPUSD Asia session read', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
      { icon: LineChart, label: 'Top-down GBPUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: BarChart3, label: 'Show me the structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: CalendarDays, label: 'GBP calendar today', bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
      { icon: Bell, label: 'Alert GBPUSD above 1.2700', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
    ],
    london: [
      { icon: TrendingUp, label: 'London open plan for GBPUSD', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
      { icon: LineChart, label: 'Top-down GBPUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: BarChart3, label: 'Show me the structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: CalendarDays, label: "GBP session calendar", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
      { icon: Bell, label: 'Alert GBPUSD above 1.2700', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
    ],
    ny: [
      { icon: TrendingUp, label: 'NY open plan for GBPUSD', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
      { icon: LineChart, label: 'Top-down GBPUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: BarChart3, label: 'Show me the structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: CalendarDays, label: "NY session calendar", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
      { icon: Bell, label: 'Alert GBPUSD above 1.2700', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
    ],
    closed: [
      { icon: BarChart3, label: 'GBPUSD daily recap', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: TrendingUp, label: 'GBPUSD daily bias', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
      { icon: LineChart, label: 'Top-down GBPUSD 4H→15M', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: CalendarDays, label: "Tomorrow's GBP calendar", bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
      { icon: Bell, label: 'Set GBPUSD alert for tomorrow', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
    ],
    weekend: [
      { icon: TrendingUp, label: 'GBPUSD weekly bias', bg: 'oklch(78% 0.16 78 / 0.18)', fg: 'text-brand' },
      { icon: BarChart3, label: 'GBPUSD weekly structure', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: CalendarDays, label: 'Next week GBP calendar', bg: 'oklch(72% 0.18 295 / 0.18)', fg: 'text-accent' },
      { icon: LineChart, label: 'GBPUSD key levels', bg: 'oklch(74% 0.16 230 / 0.15)', fg: 'text-info' },
      { icon: Bell, label: 'Set GBPUSD alert for Sunday open', bg: 'oklch(82% 0.16 80 / 0.15)', fg: 'text-warn' },
    ],
  },
};

export const QuickPrompts = memo(function QuickPrompts({
  onSelect,
  disabled,
  pinnedSymbol,
  now,
}: QuickPromptsProps) {
  const session = useMemo(() => getSessionInfo(now ?? new Date()).session, [now]);
  const prompts = useMemo(() => {
    return pinnedSymbol && PINNED_PROMPTS[pinnedSymbol]
      ? PINNED_PROMPTS[pinnedSymbol][session]
      : NO_PIN_PROMPTS[session];
  }, [pinnedSymbol, session]);

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
            className="bg-bg-elev-1 border border-divider text-fg hover:bg-bg-elev-2 focus-visible:ring-brand flex h-16 items-center gap-3 rounded-2xl px-3 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <span
              className={`shrink-0 inline-flex size-10 items-center justify-center rounded-xl ${p.fg}`}
              style={{
                background: p.bg,
                boxShadow: 'var(--shadow-inset-edge-soft)',
              }}
            >
              <Icon className="size-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="line-clamp-2 leading-snug">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
});

QuickPrompts.displayName = 'QuickPrompts';
