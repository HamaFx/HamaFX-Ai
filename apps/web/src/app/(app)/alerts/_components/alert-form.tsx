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

// Mobile-first alert creation form. Three rule types share most fields;
// we render conditional inputs for `tf` (candle/indicator) and
// `indicator` (indicator-only).
//
// All controls clear the 44pt minimum: Segmented uses h-10 buttons,
// indicator pills are min-h 44, and the "Create alert" CTA is the size-md
// (h-12) primary button so it lives in the thumb zone at the bottom of
// the drawer.
import { SYMBOLS, TIMEFRAMES, type Symbol, type Timeframe } from '@hamafx/shared';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { fetchCsrf } from '@/lib/csrf';
import { cn } from '@/lib/cn';
type RuleType = 'priceCross' | 'candleClose' | 'indicatorCross';

interface AlertFormProps {
  /** Defaults to the first symbol — most users land here from /chart and
   *  expect that symbol to be pre-selected. */
  initialSymbol?: Symbol;
  onCreated?: () => void;
}

const COMMON_INDICATORS = ['rsi:14', 'ema:50', 'ema:200', 'sma:50', 'atr:14'] as const;

export function AlertForm({ initialSymbol, onCreated }: AlertFormProps) {
  const [type, setType] = useState<RuleType>('priceCross');
  const [symbol, setSymbol] = useState<Symbol>(initialSymbol ?? 'XAUUSD');
  const [tf, setTf] = useState<Timeframe>('1h');
  const [indicator, setIndicator] = useState<string>('rsi:14');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [level, setLevel] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [channels, setChannels] = useState<('email'|'telegram')[]>(['email']);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const numericLevel = Number(level);
    if (!Number.isFinite(numericLevel)) {
      setSubmitting(false);
      setError('Level must be a number');
      return;
    }

    const rule =
      type === 'priceCross'
        ? { type: 'priceCross' as const, symbol, level: numericLevel, direction }
        : type === 'candleClose'
          ? { type: 'candleClose' as const, symbol, tf, level: numericLevel, direction }
          : {
              type: 'indicatorCross' as const,
              symbol,
              tf,
              indicator,
              level: numericLevel,
              direction,
            };

    try {
      const res = await fetchCsrf('/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rule,
          channels: channels.length > 0 ? channels : ['email'],
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      setLevel('');
      setNote('');
      toast.success('Alert created', { description: `${symbol} ${direction} ${numericLevel}` });
      onCreated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed';
      toast.error('Create failed', { description: message });
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-4 pb-4">
      <Segmented<RuleType>
        label="When"
        value={type}
        onChange={setType}
        role="radiogroup"
        variant="solid"
        size="md"
        options={[
          { value: 'priceCross', label: 'price' },
          { value: 'candleClose', label: 'candle close' },
          { value: 'indicatorCross', label: 'indicator' },
        ]}
      />

      <Segmented<Symbol>
        label="Symbol"
        value={symbol}
        onChange={setSymbol}
        role="radiogroup"
        variant="solid"
        size="md"
        options={SYMBOLS.map((s) => ({ value: s, label: s }))}
      />

      {type !== 'priceCross' ? (
        <Segmented<Timeframe>
          label="Timeframe"
          value={tf}
          onChange={setTf}
          role="radiogroup"
          variant="solid"
          size="md"
          options={TIMEFRAMES.map((t) => ({ value: t, label: t }))}
        />
      ) : null}

      {type === 'indicatorCross' ? (
        <div className="flex flex-col gap-2">
          <span className="text-fg-subtle text-[11px] uppercase tracking-wide">Indicator</span>
          <div className="flex flex-wrap gap-2">
            {COMMON_INDICATORS.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => setIndicator(ind)}
                className={cn(
                  'border-border inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 text-xs font-medium transition-colors',
                  indicator === ind
                    ? 'bg-brand text-brand-fg border-brand'
                    : 'bg-bg-elev-2 text-fg-muted hover:text-fg',
                )}
              >
                {ind}
              </button>
            ))}
          </div>
          <Input
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            placeholder="rsi:14, ema:50, macd:12,26,9"
          />
        </div>
      ) : null}

      <Segmented
        label="Direction"
        value={direction}
        onChange={setDirection}
        role="radiogroup"
        variant="solid"
        size="md"
        options={[
          { value: 'above', label: 'above ↑' },
          { value: 'below', label: 'below ↓' },
        ]}
      />

      <div className="flex flex-col gap-2">
        <label className="text-fg-subtle text-[11px] uppercase tracking-wide" htmlFor="alert-level">
          Level
        </label>
        <Input
          id="alert-level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          inputMode="decimal"
          placeholder={symbol === 'XAUUSD' ? 'e.g. 2400' : 'e.g. 1.0850'}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-fg-subtle text-[11px] uppercase tracking-wide">Delivery Methods</span>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
            <input
              type="checkbox"
              className="accent-brand size-4 cursor-pointer"
              checked={channels.includes('email')}
              onChange={(e) => {
                const c = 'email';
                setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c));
              }}
            />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
            <input
              type="checkbox"
              className="accent-brand size-4 cursor-pointer"
              checked={channels.includes('telegram')}
              onChange={(e) => {
                const c = 'telegram';
                setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c));
              }}
            />
            Telegram
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-fg-subtle text-[11px] uppercase tracking-wide" htmlFor="alert-note">
          Note (optional)
        </label>
        <Input
          id="alert-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="why am I watching this level?"
          maxLength={280}
        />
      </div>

      {error ? <p className="text-bear text-sm">{error}</p> : null}

      <Button
        type="submit"
        disabled={submitting || !level}
        size="lg"
        loading={submitting}
        className="mt-2"
      >
        {submitting ? 'Creating…' : 'Create alert'}
      </Button>
    </form>
  );
}
