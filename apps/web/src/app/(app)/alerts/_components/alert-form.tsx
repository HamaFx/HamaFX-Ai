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
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { apiMutate } from '@/lib/api-client';
import { cn } from '@/lib/cn';

type RuleType = 'priceCross' | 'candleClose' | 'indicatorCross';

const alertSchema = z.object({
  rule: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('priceCross'),
      symbol: z.string().min(1, 'Symbol is required'),
      level: z.number({ invalid_type_error: 'Level must be a number' }).positive('Level must be positive'),
      direction: z.enum(['above', 'below']),
    }),
    z.object({
      type: z.literal('candleClose'),
      symbol: z.string().min(1, 'Symbol is required'),
      tf: z.string().min(1, 'Timeframe is required'),
      level: z.number({ invalid_type_error: 'Level must be a number' }).positive('Level must be positive'),
      direction: z.enum(['above', 'below']),
    }),
    z.object({
      type: z.literal('indicatorCross'),
      symbol: z.string().min(1, 'Symbol is required'),
      tf: z.string().min(1, 'Timeframe is required'),
      indicator: z.string().min(1, 'Indicator is required'),
      level: z.number({ invalid_type_error: 'Level must be a number' }).positive('Level must be positive'),
      direction: z.enum(['above', 'below']),
    }),
  ]),
  channels: z.array(z.enum(['email', 'telegram'])).min(1, 'At least one notification channel is required'),
  note: z.string().max(1000, 'Note must be under 1000 characters').nullable().optional(),
  snoozeHours: z.number().min(0).max(168).optional(),
});

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
  const [testing, setTesting] = useState(false);

  // Inline validation — tracks which fields have been blurred
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (field: string) => setTouched((prev) => new Set(prev).add(field));

  const [channels, setChannels] = useState<('email'|'telegram')[]>(['email']);
  // Phase C — UX_UPGRADE_PLAN.md item 17. Snooze window in hours
  // (0 = one-shot). Stored as a string so the input can show an
  // empty placeholder; parsed at submit time.
  const [snoozeHours, setSnoozeHours] = useState<string>('');

  const fieldErrors = useMemo(() => {
    const errs: Record<string, string | null> = {};
    const levelNum = Number(level);
    if (touched.has('level')) {
      if (!level) errs.level = 'Level is required';
      else if (!Number.isFinite(levelNum) || levelNum <= 0) errs.level = 'Enter a valid positive number';
    }
    if (type === 'indicatorCross' && touched.has('indicator')) {
      if (!indicator.trim()) errs.indicator = 'Indicator is required';
    }
    if (touched.has('channels') && channels.length === 0) {
      errs.channels = 'Select at least one delivery method';
    }
    if (touched.has('note') && note.length > 1000) {
      errs.note = 'Note must be under 1000 characters';
    }
    return errs;
  }, [level, indicator, channels, note, touched, type]);

  async function testAlert() {
    setTesting(true);
    setError(null);
    setTouched(new Set(['level', 'indicator', 'channels']));
    const parsedSnooze = snoozeHours ? Number(snoozeHours) : 0;
    const ruleObj =
      type === 'priceCross'
        ? { type: 'priceCross' as const, symbol, level: level ? Number(level) : NaN, direction }
        : type === 'candleClose'
          ? { type: 'candleClose' as const, symbol, tf, level: level ? Number(level) : NaN, direction }
          : {
              type: 'indicatorCross' as const,
              symbol,
              tf,
              indicator,
              level: level ? Number(level) : NaN,
              direction,
            };
    const validation = alertSchema.safeParse({
      rule: ruleObj,
      channels,
      note: note.trim() || null,
      snoozeHours: parsedSnooze,
    });
    if (!validation.success) {
      setTesting(false);
      setError(validation.error.errors[0]?.message ?? 'Invalid input');
      return;
    }
    try {
      const data = await apiMutate<{ count?: number; unsupported?: boolean }>('/api/alerts/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rule: validation.data.rule, lookbackDays: 90 }),
      });
      if (data.unsupported) {
        toast.success('Configuration valid', {
          description: 'Rule syntax is correct (preview not available for indicator rules)',
        });
      } else {
        const count = data.count ?? 0;
        toast.success('Configuration valid', {
          description: count > 0
            ? `Rule verified — would have triggered ${count} time${count === 1 ? '' : 's'} in 90 days`
            : 'Rule is valid (no historical triggers in 90-day lookback)',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Test failed';
      toast.error('Test failed', { description: message });
      setError(message);
    } finally {
      setTesting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const parsedSnooze = snoozeHours ? Number(snoozeHours) : 0;
    const ruleObj =
      type === 'priceCross'
        ? { type: 'priceCross' as const, symbol, level: level ? Number(level) : NaN, direction }
        : type === 'candleClose'
          ? { type: 'candleClose' as const, symbol, tf, level: level ? Number(level) : NaN, direction }
          : {
              type: 'indicatorCross' as const,
              symbol,
              tf,
              indicator,
              level: level ? Number(level) : NaN,
              direction,
            };

    const validation = alertSchema.safeParse({
      rule: ruleObj,
      channels,
      note: note.trim() || null,
      snoozeHours: parsedSnooze,
    });

    if (!validation.success) {
      setSubmitting(false);
      setError(validation.error.errors[0]?.message ?? 'Invalid input');
      return;
    }

    const data = validation.data;

    try {
      await apiMutate('/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rule: data.rule,
          channels: data.channels,
          note: data.note,
          snoozeHours: data.snoozeHours,
        }),
      });
      setLevel('');
      setNote('');
      toast.success('Alert created', { description: `${symbol} ${direction} ${data.rule.level}` });
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
          <span className="text-fg-subtle text-body-sm uppercase tracking-wide">Indicator</span>
          <div className="flex flex-wrap gap-2">
            {COMMON_INDICATORS.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => setIndicator(ind)}
                className={cn(
                  'border-border inline-flex min-h-[44px] items-center justify-center rounded-sm border px-4 text-xs font-medium transition-colors',
                  indicator === ind
                    ? 'bg-fg text-black border-border'
                    : 'bg-bg-elev-2 text-fg-muted hover:text-fg',
                )}
              >
                {ind}
              </button>
            ))}
          </div>
          <Input
            id="alert-indicator"
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            onBlur={() => touch('indicator')}
            placeholder="rsi:14, ema:50, macd:12,26,9"
            {...(fieldErrors.indicator ? { 'aria-describedby': 'alert-indicator-error' } : {})}
          />
          {fieldErrors.indicator ? <p id="alert-indicator-error" role="alert" className="text-danger text-xs">{fieldErrors.indicator}</p> : null}
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
        <label className="text-fg-subtle text-body-sm uppercase tracking-wide" htmlFor="alert-level">
          Level
        </label>
        <Input
          id="alert-level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          onBlur={() => touch('level')}
          inputMode="decimal"
          placeholder={symbol === 'XAUUSD' ? 'e.g. 2400' : 'e.g. 1.0850'}
          {...(fieldErrors.level ? { 'aria-describedby': 'alert-level-error' } : {})}
        />
        {fieldErrors.level ? <p id="alert-level-error" role="alert" className="text-danger text-xs">{fieldErrors.level}</p> : null}
      </div>

      {/* Phase B — UX_UPGRADE_PLAN.md item 10. Live preview of how
          often this rule would have fired historically. Debounced
          400ms so a power user typing the level doesn't spam the
          preview endpoint. The preview is informational only — it
          never blocks the create button. */}
      <PreviewCallout
        type={type}
        symbol={symbol}
        tf={tf}
        direction={direction}
        level={level}
      />

      <div className="flex flex-col gap-2">
        <span className="text-fg-subtle text-body-sm uppercase tracking-wide">Delivery Methods</span>
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
              onBlur={() => touch('channels')}
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
              onBlur={() => touch('channels')}
            />
            Telegram
          </label>
        </div>
        {fieldErrors.channels ? <p id="alert-channels-error" role="alert" className="text-danger text-xs">{fieldErrors.channels}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-fg-subtle text-body-sm uppercase tracking-wide" htmlFor="alert-note">
          Note (optional)
        </label>
        <Input
          id="alert-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => touch('note')}
          placeholder="why am I watching this level?"
          maxLength={280}
          {...(fieldErrors.note ? { 'aria-describedby': 'alert-note-error' } : {})}
        />
        {fieldErrors.note ? <p id="alert-note-error" role="alert" className="text-danger text-xs">{fieldErrors.note}</p> : null}
      </div>

      {/*
        Phase C — UX_UPGRADE_PLAN.md item 17. Snooze: if the
        alert fires, re-arm it after N hours instead of going
        inactive. Empty = one-shot (legacy default). 0 = also
        one-shot. The input is opt-in by design — most users
        won't change it; the placeholders guide the rest.
      */}
      <div className="flex flex-col gap-2">
        <label
          className="text-fg-subtle text-body-sm uppercase tracking-wide"
          htmlFor="alert-snooze"
        >
          Re-arm after (hours, 0 = one-shot)
        </label>
        <Input
          id="alert-snooze"
          type="number"
          min={0}
          max={168}
          step={1}
          value={snoozeHours}
          onChange={(e) => setSnoozeHours(e.target.value)}
          placeholder="leave empty for one-shot"
        />
      </div>

      {error ? <p id="alert-form-error" role="alert" className="text-danger text-sm">{error}</p> : null}

      <div className="flex flex-col gap-2 mt-2">
        <Button
          type="submit"
          disabled={submitting || !level}
          size="lg"
          loading={submitting}
          className="w-full"
        >
          {submitting ? 'Creating…' : 'Create alert'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={testing || !level}
          loading={testing}
          onClick={() => void testAlert()}
          className="w-full"
        >
          {testing ? 'Testing…' : 'Test Alert'}
        </Button>
      </div>
    </form>
  );
}

// ----------------------------------------------------------------------
// <PreviewCallout> — debounced live preview of the rule.
//
// Phase B — UX_UPGRADE_PLAN.md item 10.
// Pure presentation; the actual simulation lives in
// packages/ai/src/alerts/simulate.ts and runs server-side via
// /api/alerts/preview. We send the candidate rule on every input
// change but debounce the fetch by 400ms so a power user typing
// the level doesn't hammer the endpoint.
// ----------------------------------------------------------------------

interface PreviewCalloutProps {
  type: RuleType;
  symbol: Symbol;
  tf: Timeframe;
  direction: 'above' | 'below';
  level: string;
}

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'empty' }
  | { kind: 'ok'; count: number; avgHoldMs: number };

function buildRule(p: {
  type: RuleType;
  symbol: Symbol;
  tf: Timeframe;
  direction: 'above' | 'below';
  level: string;
}): unknown | null {
  const numericLevel = Number(p.level);
  if (!Number.isFinite(numericLevel)) return null;
  if (p.type === 'priceCross') {
    return { type: 'priceCross', symbol: p.symbol, level: numericLevel, direction: p.direction };
  }
  if (p.type === 'candleClose') {
    return { type: 'candleClose', symbol: p.symbol, tf: p.tf, level: numericLevel, direction: p.direction };
  }
  return null;
}

function PreviewCallout(props: PreviewCalloutProps) {
  const [state, setState] = useState<PreviewState>({ kind: 'idle' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Destructure so the useEffect deps array is unambiguous.
  const { type, symbol, tf, direction, level } = props;

  useEffect(() => {
    // Cancel any pending fetch when the inputs change.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (type === 'indicatorCross') {
      setState({ kind: 'unsupported' });
      return;
    }
    const rule = buildRule({ type, symbol, tf, direction, level });
    if (!rule) {
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'loading' });
    timerRef.current = setTimeout(async () => {
      try {
        const data = await apiMutate<{
          count?: number;
          avgHoldMs?: number;
          unsupported?: boolean;
        }>('/api/alerts/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rule, lookbackDays: 90 }),
        });
        if (data.unsupported) {
          setState({ kind: 'unsupported' });
          return;
        }
        if (typeof data.count !== 'number' || data.count === 0) {
          setState({ kind: 'empty' });
          return;
        }
        setState({
          kind: 'ok',
          count: data.count,
          avgHoldMs: typeof data.avgHoldMs === 'number' ? data.avgHoldMs : 0,
        });
      } catch {
        setState({ kind: 'empty' });
      }
    }, 400);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [type, symbol, tf, direction, level]);

  if (state.kind === 'idle' || state.kind === 'loading') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-sm border p-3 text-body-sm',
        state.kind === 'ok'
          ? 'border-info/30 bg-info/10 text-fg-muted'
          : 'border-border bg-bg-elev-1/40 text-fg-subtle',
      )}
    >
      {state.kind === 'unsupported' ? (
        <p>Preview unavailable for indicator rules (v1).</p>
      ) : state.kind === 'empty' ? (
        <p>No historical fires in the last 90 days for this level.</p>
      ) : (
        <p>
          Would have fired{' '}
          <span className="text-fg font-semibold tabular-nums">{state.count}</span>{' '}
          time{state.count === 1 ? '' : 's'} in the last 90 days.
          {state.avgHoldMs > 0 ? (
            <>
              {' '}
              Average hold:{' '}
              <span className="text-fg tabular-nums">
                {formatDuration(state.avgHoldMs)}
              </span>
              .
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  const day = Math.round(hr / 24);
  return `${day}d`;
}
