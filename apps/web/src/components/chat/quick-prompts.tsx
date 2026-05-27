'use client';

// Quick-prompt cards rendered when the thread is empty.
//
// Mobile-first sizing on the 8-pt grid:
//   - card height:   64px (h-16) — comfortable thumb-zone target
//   - icon tile:     40×40 (size-10) — clearly tappable
//   - inner gap:     12 (gap-3)
//   - outer gap:     8  (gap-2 in grid)
//
// Color is semantic, not decorative: bias→brand, structure→info,
// calendar→accent, alert→warn.

import { BarChart3, Bell, CalendarDays, LineChart, TrendingUp } from 'lucide-react';

interface QuickPromptsProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

interface Prompt {
  icon: typeof BarChart3;
  label: string;
  /** Background tint behind the icon. */
  bg: string;
  /** Icon foreground color class. */
  fg: string;
}

const PROMPTS: readonly Prompt[] = [
  {
    icon: TrendingUp,
    label: "What's the bias on gold?",
    bg: 'oklch(78% 0.16 78 / 0.18)',
    fg: 'text-brand',
  },
  {
    icon: LineChart,
    label: 'Top-down XAUUSD 4H→15M',
    bg: 'oklch(74% 0.16 230 / 0.15)',
    fg: 'text-info',
  },
  {
    icon: BarChart3,
    label: 'Show me the structure',
    bg: 'oklch(74% 0.16 230 / 0.15)',
    fg: 'text-info',
  },
  {
    icon: CalendarDays,
    label: "Today's calendar",
    bg: 'oklch(72% 0.18 295 / 0.18)',
    fg: 'text-accent',
  },
  {
    icon: Bell,
    label: 'Alert XAUUSD above 2400',
    bg: 'oklch(82% 0.16 80 / 0.15)',
    fg: 'text-warn',
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
            className="glass-subtle text-fg hover:bg-bg-elev-2 focus-visible:ring-brand flex h-16 items-center gap-3 rounded-2xl px-3 text-left text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50"
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
}
