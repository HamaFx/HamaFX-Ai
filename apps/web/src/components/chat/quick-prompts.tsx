'use client';

// Static glass quick-prompt chips. No entrance animations to avoid
// layout shift on first paint.

interface QuickPromptsProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

const PROMPTS: ReadonlyArray<{ text: string; emoji: string }> = [
  { emoji: '📊', text: "What's the bias on gold?" },
  { emoji: '🔍', text: 'Top-down XAUUSD 4H→15M' },
  { emoji: '📅', text: "Today's calendar" },
  { emoji: '🌊', text: 'Show me the structure' },
  { emoji: '🔔', text: 'Alert XAUUSD above 2400' },
];

export function QuickPrompts({ onSelect, disabled }: QuickPromptsProps) {
  return (
    <div className="flex flex-wrap gap-2 px-3 pb-2">
      {PROMPTS.map((p) => (
        <button
          key={p.text}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(p.text)}
          className={
            'glass-subtle text-fg-muted hover:text-fg hover:bg-bg-elev-2 ' +
            'focus-visible:ring-brand inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 ' +
            'text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50'
          }
        >
          <span aria-hidden="true">{p.emoji}</span>
          <span>{p.text}</span>
        </button>
      ))}
    </div>
  );
}
