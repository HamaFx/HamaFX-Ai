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

// New journal-entry form. Mobile-first: stacked, all tap targets ≥ 44px,
// CTA is the size-lg primary button so it sits in the thumb zone of the
// drawer.

import { SYMBOLS, type Symbol, type TradeSide } from '@hamafx/shared';
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { X, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';

const entrySchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  side: z.enum(['long', 'short']),
  entry: z.number({ invalid_type_error: 'Entry price must be a number' }).positive('Entry price must be positive'),
  stop: z.number().positive('Stop loss must be positive').nullable().optional(),
  target: z.number().positive('Target must be positive').nullable().optional(),
  size: z.number().positive('Size must be positive').nullable().optional(),
  notes: z.string().max(5000, 'Notes must be under 5000 characters').nullable().optional(),
  tags: z.array(z.string()).optional(),
});
interface EntryFormProps {
  onCreated?: () => void;
}

export function EntryForm({ onCreated }: EntryFormProps) {
  const [symbol, setSymbol] = useState<Symbol>('XAUUSD');
  const [side, setSide] = useState<TradeSide>('long');
  const [entry, setEntry] = useState<string>('');
  const [stop, setStop] = useState<string>('');
  const [target, setTarget] = useState<string>('');
  const [size, setSize] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({
    entry: null,
    stop: null,
    target: null,
  });

  function validateEntry(v: string): string | null {
    const n = Number(v);
    if (!v) return 'Entry price is required';
    if (!Number.isFinite(n) || n <= 0) return 'Entry must be positive';
    return null;
  }

  function validateStop(v: string): string | null {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 'Stop must be positive';
    const entryNum = Number(entry);
    if (Number.isFinite(entryNum)) {
      if (side === 'long' && n >= entryNum) return 'Long stop must be below entry';
      if (side === 'short' && n <= entryNum) return 'Short stop must be above entry';
    }
    return null;
  }

  function validateTarget(v: string): string | null {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 'Target must be positive';
    const entryNum = Number(entry);
    if (Number.isFinite(entryNum)) {
      if (side === 'long' && n <= entryNum) return 'Long target must be above entry';
      if (side === 'short' && n >= entryNum) return 'Short target must be below entry';
    }
    return null;
  }

  function setFieldError(field: string, err: string | null) {
    setFieldErrors((prev) => ({ ...prev, [field]: err }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const parsed = {
      symbol,
      side,
      entry: entry ? Number(entry) : NaN,
      stop: stop ? Number(stop) : null,
      target: target ? Number(target) : null,
      size: size ? Number(size) : null,
      notes: notes.trim() || null,
      tags,
    };

    const validation = entrySchema.safeParse(parsed);
    if (!validation.success) {
      setBusy(false);
      setError(validation.error.errors[0]?.message ?? 'Invalid input');
      return;
    }

    const data = validation.data;

    // Field-level sanity check: long stops must be below entry, short above.
    if (data.stop !== null && data.stop !== undefined) {
      if (side === 'long' && data.stop >= data.entry) {
        setBusy(false);
        setError('Long stop must be below entry');
        return;
      }
      if (side === 'short' && data.stop <= data.entry) {
        setBusy(false);
        setError('Short stop must be above entry');
        return;
      }
    }

    try {
      const res = await fetchCsrf('/api/journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          symbol: data.symbol,
          side: data.side,
          openedAt: Date.now(),
          entry: data.entry,
          stop: data.stop,
          target: data.target,
          size: data.size,
          notes: data.notes,
          tags: data.tags,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      setEntry('');
      setStop('');
      setTarget('');
      setSize('');
      setNotes('');
      setTags([]);
      toast.success('Trade logged', { description: `${symbol} ${side} @ ${data.entry}` });
      onCreated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed';
      toast.error('Save failed', { description: message });
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-4 pb-4">
      <Segmented<Symbol>
        label="Symbol"
        value={symbol}
        onChange={setSymbol}
        role="radiogroup"
        variant="solid"
        size="md"
        options={SYMBOLS.map((s) => ({ value: s, label: s }))}
      />

      <Segmented<TradeSide>
        label="Side"
        value={side}
        onChange={(v) => {
          setSide(v);
          setFieldError('stop', stop ? validateStop(stop) : null);
          setFieldError('target', target ? validateTarget(target) : null);
        }}
        role="radiogroup"
        variant="tone"
        size="md"
        options={[
          { value: 'long', label: 'long ↑', tone: 'bull' },
          { value: 'short', label: 'short ↓', tone: 'bear' },
        ]}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Entry"
          value={entry}
          setValue={(v) => { setEntry(v); setFieldError('entry', null); }}
          required
          error={fieldErrors.entry ?? null}
          onBlur={() => setFieldError('entry', validateEntry(entry))}
        />
        <Field
          label="Stop (optional)"
          value={stop}
          setValue={(v) => { setStop(v); setFieldError('stop', null); }}
          error={fieldErrors.stop ?? null}
          onBlur={() => setFieldError('stop', validateStop(stop))}
        />
        <Field
          label="Target (optional)"
          value={target}
          setValue={(v) => { setTarget(v); setFieldError('target', null); }}
          error={fieldErrors.target ?? null}
          onBlur={() => setFieldError('target', validateTarget(target))}
        />
        <Field label="Size in lots (optional)" value={size} setValue={setSize} />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-fg-subtle text-body-sm uppercase tracking-wide" htmlFor="notes">
          Notes (optional)
        </label>
        <Input
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="thesis, news context, levels of interest…"
          maxLength={5000}
        />
      </div>

      <TagInput value={tags} onChange={setTags} />

      {error ? <p className="text-bear text-sm">{error}</p> : null}

      <Button
        type="submit"
        size="lg"
        disabled={busy || !entry}
        loading={busy}
        className="mt-2"
      >
        {busy ? 'Saving…' : 'Save entry'}
      </Button>
    </form>
  );
}

function Field({
  label,
  value,
  setValue,
  required,
  error,
  onBlur,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  required?: boolean;
  error?: string | null | undefined;
  onBlur?: () => void;
}) {
  const showError = error !== undefined && error !== null;
  const id = label.toLowerCase().replace(/[^a-z]/g, '-');
  return (
    <div className="flex flex-col gap-2">
      <label className="text-fg-subtle text-body-sm uppercase tracking-wide" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onBlur}
        inputMode="decimal"
        required={required}
        error={!!error}
      />
      {showError ? <p className="text-bear text-xs mt-0.5">{error}</p> : null}
    </div>
  );
}

const COMMON_TAGS = [
  'SMC', 'FOMC', 'Breakout', 'Reversal', 'Continuation',
  'News', 'Support', 'Resistance', 'Trend', 'Range',
  'PinBar', 'Engulfing', 'Momentum', 'Scalp', 'Swing',
  'ICT', 'Supply', 'Demand', 'Fibonacci', 'Divergence',
];

function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = COMMON_TAGS.filter(
    (t) => t.toLowerCase().includes(input.toLowerCase()) && !value.includes(t)
  );

  const add = useCallback((tag: string) => {
    if (!value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput('');
  }, [value, onChange]);

  const remove = useCallback((tag: string) => {
    onChange(value.filter((t) => t !== tag));
  }, [value, onChange]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !value.includes(trimmed)) {
        if (filtered.length > 0 && filtered[0] && filtered[0].toLowerCase() === trimmed.toLowerCase()) {
          add(filtered[0]);
        } else {
          add(trimmed);
        }
      }
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      const last = value[value.length - 1];
      if (last) remove(last);
    }
  }, [input, value, filtered, add, remove]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-fg-subtle text-body-sm uppercase tracking-wide">
        Tags (optional)
      </label>
      <div ref={containerRef} className="relative">
        <div className={cn(
          'flex flex-wrap gap-1.5 rounded-xl border bg-bg-elev-1/60 px-3 py-2 min-h-12 items-center transition-all duration-200',
          focused ? 'border-brand/60 shadow-[0_0_0_3px_oklch(78%_0.16_78/0.12)]' : 'border-divider'
        )}>
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-brand/15 text-brand px-2.5 py-0.5 text-xs font-bold uppercase ring-1 ring-brand/30"
            >
              #{tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                className="inline-flex size-4 items-center justify-center rounded-full hover:bg-brand/25 transition-colors"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="size-2.5" strokeWidth={3} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKey}
            placeholder={value.length === 0 ? 'SMC, FOMC, Breakout...' : ''}
            className="flex-1 min-w-[100px] bg-transparent text-base text-fg placeholder:text-fg-subtle focus:outline-none h-7"
            maxLength={50}
          />
        </div>
        {focused && filtered.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full rounded-xl border border-divider bg-bg-elev-2 shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
            {filtered.slice(0, 8).map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => add(tag)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-fg hover:bg-bg-elev-3 transition-colors text-left cursor-pointer"
                >
                  <Plus className="size-3.5 text-fg-muted shrink-0" />
                  <span className="font-medium">{tag}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <p className="text-xs text-fg-subtle">{value.length} tag{value.length !== 1 ? 's' : ''} selected</p>
      )}
    </div>
  );
}
