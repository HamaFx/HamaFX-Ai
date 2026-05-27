'use client';

// Quick-prompt cards rendered when the thread is empty. Larger tap targets
// (≥56px) and a clean grid layout that fits the full-screen chat aesthetic.

import { BarChart3, Bell, CalendarDays, LineChart, TrendingUp } from 'lucide-react';

interface QuickPromptsProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

const PROMPTS = [
  {
    icon: TrendingUp,
    label: "What's the bias on gold?",
    color: 'oklch(78% 0.16 78 / 0.18)',
    iconColor: 'text-brand',
  },
  {
    icon: LineChart,
    label: 'Top-down XAUUSD 4H→15M',
    color: 'oklch(74% 0.2 152 / 0.15)',
    iconColor: 'text-bull',
  },
  {
    icon: CalendarDays,
    label: "Today's calendar",
    color: 'oklch(72% 0.18 295 / 0.18)',
    iconColor: 'text-info',
  },
  {
    icon: BarChart3,
    label: 'Show me the structure',
    color: 'oklch(72% 0.16 200 / 0.15)',
    iconColor: 'text-info',
  },
  {
    icon: Bell,
    label: 'Alert XAUUSD above 2400',
    color: 'oklch(80% 0.16 80 / 0.15)',
    iconColor: 'text-warn',
  },
];

export function QuickPrompts({ onSelect, disabled }: QuickPromptsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 px-3 pb-3">
      {PROMPTS.map((p) => {
        const Icon = p.icon;
        return (
          <button
            key={p.label}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(p.label)}
            className={
              'glass-subtle text-fg hover:bg-bg-elev-2 ' +
              'focus-visible:ring-brand flex min-h-[60px] items-center gap-2.5 rounded-2xl px-3.5 py-2.5 ' +
              'text-left text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50'
            }
          >
            <span
              className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg ${p.iconColor}`}
              style={{
                background: p.color,
                boxShadow: 'inset 0 1px 0 0 oklch(100% 0 0 / 0.06)',
              }}
            >
              <Icon className="size-4" strokeWidth={2} />
            </span>
            <span className="line-clamp-2 leading-snug">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
