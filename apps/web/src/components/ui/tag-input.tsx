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

// Chip-based tag input with autocomplete, keyboard navigation, and validation.

import { IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  maxTags?: number;
  maxTagLength?: number;
  label?: string;
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Add tags…',
  maxTags = 10,
  maxTagLength = 40,
  label = 'Tags',
}: TagInputProps) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions
    .filter((s) => s.toLowerCase().startsWith(input.toLowerCase()) && !value.includes(s))
    .slice(0, 5);

  const add = useCallback(
    (raw: string) => {
      const tag = raw.trim().slice(0, maxTagLength);
      if (!tag) return;
      if (value.length >= maxTags) return;
      if (!value.includes(tag)) {
        onChange([...value, tag]);
      }
      setInput('');
      setHighlighted(0);
      inputRef.current?.focus();
    },
    [value, onChange, maxTags, maxTagLength],
  );

  const remove = useCallback(
    (tag: string) => {
      onChange(value.filter((t) => t !== tag));
    },
    [value, onChange],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        if (filtered.length > 0 && filtered[highlighted]) {
          add(filtered[highlighted]!);
        } else {
          add(input);
        }
        return;
      }
      if (e.key === 'Backspace' && !input && value.length > 0) {
        const last = value[value.length - 1];
        if (last) remove(last);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        setFocused(false);
        return;
      }
    },
    [input, value, filtered, highlighted, add, remove],
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    setHighlighted(0);
  }, [input]);

  return (
    <div className="flex flex-col gap-2" aria-label={label}>
      <label className="text-fg-subtle text-body-sm uppercase tracking-wide">{label}</label>
      <div ref={containerRef} className="relative">
        <div
          className={cn(
            'flex flex-wrap items-center gap-1.5 rounded-sm border bg-bg-elev-1 px-3 py-2 min-h-[44px] transition-all',
            focused ? 'border-border ring-2 ring-fg/10' : 'border-border',
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 bg-bg-elev-2 text-fg-muted rounded-sm px-2 py-0.5 text-body-sm"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={`Remove tag ${tag}`}
                className="text-fg-subtle hover:text-danger transition-colors"
              >
                <IconX className="size-3" />
              </button>
            </span>
          ))}
          <Input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKey}
            placeholder={value.length === 0 ? placeholder : ''}
            maxLength={maxTagLength}
            className="flex-1 min-w-[80px] border-0 bg-transparent p-0 text-fg placeholder:text-fg-subtle focus-visible:ring-0 focus-visible:ring-offset-0 h-auto"
          />
        </div>

        {focused && filtered.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-bg-elev-1 border border-border rounded-sm shadow-md overflow-hidden">
            {filtered.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => add(s)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-body-sm hover:bg-bg-elev-2 transition-colors',
                    i === highlighted && 'bg-bg-elev-2',
                  )}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <p className="text-caption text-fg-subtle">
          {value.length}/{maxTags} tags
        </p>
      )}
    </div>
  );
}
