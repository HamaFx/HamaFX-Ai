// SPDX-License-Identifier: Apache-2.0

'use client';

import { useMemo } from 'react';
import { IconArrowRight, IconSparkles } from '@tabler/icons-react';
import { m } from 'motion/react';
import type { UIMessage } from 'ai';

import { cn } from '@/lib/cn';

interface FollowUpSuggestionsProps {
  message: UIMessage;
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function FollowUpSuggestions({
  message,
  onSelect,
  disabled,
}: FollowUpSuggestionsProps) {
  const suggestions = useMemo(() => {
    const rawText = message.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => ('text' in p ? p.text : ''))
      .join(' ')
      .toLowerCase() ?? '';

    if (rawText.includes('cpi') || rawText.includes('nfp') || rawText.includes('fomc') || rawText.includes('news')) {
      return [
        'What is the historical price reaction during this release?',
        'What levels would invalidate this news bias?',
        'Show 15m order flow reaction levels',
      ];
    }

    if (rawText.includes('long') || rawText.includes('bullish') || rawText.includes('breakout')) {
      return [
        'Where is the next major liquidity target if this holds?',
        'What if DXY strengthens against this setup?',
        'Check higher timeframe 4H structure confirmation',
      ];
    }

    if (rawText.includes('short') || rawText.includes('bearish') || rawText.includes('sweep')) {
      return [
        'Where are buyers most likely to defend support?',
        'What is the optimal Risk-to-Reward on a pullback?',
        'Check institutional COT positioning on this pair',
      ];
    }

    return [
      'What is the key invalidation price for this idea?',
      'Check higher timeframe 4H structure confirmation',
      'What high-impact economic news is coming up next?',
    ];
  }, [message]);

  if (suggestions.length === 0) return null;

  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="mt-3 pt-2 border-t border-border/40 flex flex-col gap-1.5"
    >
      <div className="flex items-center gap-1.5 text-caption text-fg-subtle">
        <IconSparkles className="size-3 text-brand" />
        <span className="font-semibold uppercase tracking-wider text-[10px]">Suggested Follow-ups</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(prompt)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs text-left transition-all border',
              'border-border/70 bg-bg-elev-1 text-fg-muted hover:text-fg hover:border-brand/40 hover:bg-bg-elev-2 active:scale-95',
              'disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-1 focus-visible:ring-brand',
            )}
            title={prompt}
          >
            <span>{prompt}</span>
            <IconArrowRight className="size-3 text-fg-subtle group-hover:text-brand shrink-0" />
          </button>
        ))}
      </div>
    </m.div>
  );
}
