'use client';

// Quick-prompt chips shown below the composer when the thread is empty.
// Tapping a chip sends the prompt immediately.

interface QuickPromptsProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

const PROMPTS = [
  "What's the bias on gold?",
  'Top-down XAUUSD 4H→15M',
  "Today's calendar",
  'Show me the structure',
  'Set an alert for XAUUSD above 2400',
];

export function QuickPrompts({ onSelect, disabled }: QuickPromptsProps) {
  return (
    <div className="flex flex-wrap gap-2 px-3 pb-2">
      {PROMPTS.map((p) => (
        <button
          key={p}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(p)}
          className="border-border bg-bg-elev-2 text-fg-muted hover:text-fg hover:bg-bg-elev-1 focus-visible:ring-brand rounded-full border px-3 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          {p}
        </button>
      ))}
    </div>
  );
}
