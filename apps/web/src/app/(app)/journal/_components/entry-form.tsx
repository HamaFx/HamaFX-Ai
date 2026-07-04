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

import { JournalEntrySchema, SYMBOLS, type Symbol, type TradeSide } from '@hamafx/shared';
import type { JournalEntry } from '@hamafx/shared';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { TagInput } from '@/components/ui/tag-input';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';
import {IconCamera, IconX} from '@tabler/icons-react';

const entrySchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  side: z.enum(['long', 'short']),
  entry: z.number({ invalid_type_error: 'Entry price must be a number' }).positive('Entry price must be positive'),
  stop: z.number().positive('Stop loss must be positive').nullable().optional(),
  target: z.number().positive('IconTarget must be positive').nullable().optional(),
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
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
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
    if (!Number.isFinite(n) || n <= 0) return 'IconTarget must be positive';
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

  async function handleScreenshotPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingScreenshot(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`IconUpload HTTP ${res.status}`);
      const data = (await res.json()) as { url?: string };
      if (data.url) setScreenshotUrl(data.url);
    } catch {
      toast.error('Screenshot upload failed');
    } finally {
      setUploadingScreenshot(false);
    }
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
      screenshotUrl,
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
      setScreenshotUrl(null);
      toast.success('Trade logged', { description: `${symbol} ${side} @ ${data.entry}` });
      onCreated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed';
      toast.error('IconDeviceFloppy failed', { description: message });
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

      {/* Screenshot attachment */}
      <div className="flex flex-col gap-2">
        <label className="text-fg-subtle text-body-sm uppercase tracking-wide">
          Chart Screenshot
        </label>
        {screenshotUrl ? (
          <div className="relative inline-block">
            <Image
              src={screenshotUrl}
              alt="Trade chart"
              width={80}
              height={80}
              className="h-20 rounded-md object-cover border border-border"
              unoptimized
            />
            <button
              type="button"
              onClick={() => setScreenshotUrl(null)}
              className="absolute -top-2 -right-2 rounded-sm bg-bg-elev-3 border border-border p-0.5 text-fg-muted hover:text-fg"
              aria-label="Remove screenshot"
            >
              <IconX className="size-3.5" />
            </button>
          </div>
        ) : (
          <label
            className={cn(
              'flex items-center justify-center gap-2 rounded-sm border border-dashed border-border p-3 text-xs text-fg-subtle hover:border-border hover:text-fg transition-colors cursor-pointer',
              uploadingScreenshot && 'opacity-60 pointer-events-none',
            )}
          >
            <IconCamera className="size-4" />
            {uploadingScreenshot ? 'Uploading…' : 'Add screenshot'}
            <input
              type="file"
              accept="image/*"
              onChange={handleScreenshotPick}
              className="sr-only"
              disabled={uploadingScreenshot}
            />
          </label>
        )}
      </div>

      <TagInput
        value={tags}
        onChange={setTags}
        suggestions={useTagSuggestions()}
        placeholder="Add tags (e.g. London breakout, trend continuation)"
      />

      {error ? <p className="text-bear text-sm">{error}</p> : null}

      <Button
        type="submit"
        size="lg"
        disabled={busy || !entry}
        loading={busy}
        className="mt-2"
      >
        {busy ? 'Saving…' : 'IconDeviceFloppy entry'}
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

function useTagSuggestions() {
  const { data: allEntries } = useQuery<JournalEntry[]>({
    queryKey: ['journal', 'all-tags'],
    queryFn: async () => {
      const res = await fetch('/api/journal?limit=500');
      if (!res.ok) return [];
      const data = (await res.json()) as { entries: unknown[] };
      return data.entries
        .map((e) => {
          const parsed = JournalEntrySchema.safeParse(e);
          return parsed.success ? parsed.data : null;
        })
        .filter((e): e is JournalEntry => e !== null);
    },
    staleTime: 60_000,
  });

  return useMemo(() => {
    const set = new Set<string>();
    allEntries?.forEach((e) => e.tags?.forEach((t: string) => set.add(t)));
    return Array.from(set).sort();
  }, [allEntries]);
}
