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

import { useState, useTransition } from 'react';
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProviderMeta } from '@hamafx/shared';

interface ApiKeyCardProps {
  provider: ProviderMeta;
  currentValue: string;
  /**
   * Optional latest health snapshot from the server. Used to render
   * the badge in the card header. When undefined, the card omits the
   * badge (no test has been run yet).
   *
   * Phase A — UX_UPGRADE_PLAN.md item 7.
   */
  health?: {
    ok: boolean;
    error: string | null;
    testedAt: string;
  };
}

type TestState = { kind: 'idle' } | { kind: 'pending' } | { kind: 'ok' } | { kind: 'err'; message: string };

export function ApiKeyCard({ provider, currentValue, health }: ApiKeyCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState(currentValue);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();

  const dirty = value.trim() !== currentValue;
  const isSet = value.trim().length > 0;

  function handleTest() {
    if (!isSet) return;
    setTest({ kind: 'pending' });
    startTransition(async () => {
      try {
        const res = await fetch('/api/settings/test-provider', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: provider.id, apiKey: value.trim() }),
        });
        const data = await res.json() as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setTest({ kind: 'err', message: data.error ?? `HTTP ${res.status}` });
        } else {
          setTest({ kind: 'ok' });
        }
      } catch (err) {
        setTest({
          kind: 'err',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return (
    <div className="border border-divider bg-bg-elev-1 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <label
              htmlFor={`key-${provider.id}`}
              className="text-sm font-medium text-fg"
            >
              {provider.displayName}
            </label>
            <HealthBadge health={health} />
          </div>
          <p className="text-xs text-fg-subtle">{provider.description}</p>
        </div>
        {isSet && test.kind !== 'pending' && (
          <span
            className={
              test.kind === 'ok'
                ? 'flex items-center gap-1 text-xs text-emerald-400'
                : 'flex items-center gap-1 text-xs text-fg-subtle'
            }
          >
            {test.kind === 'ok' && <CheckCircle2 className="size-3" />}
            {test.kind === 'ok' ? 'Looks valid' : 'Saved'}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={`key-${provider.id}`}
            name={provider.id}
            type={revealed ? 'text' : 'password'}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (test.kind !== 'idle') setTest({ kind: 'idle' });
            }}
            placeholder={provider.keyHint}
            autoComplete="off"
            spellCheck={false}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-subtle hover:text-fg transition-colors"
            aria-label={revealed ? 'Hide key' : 'Show key'}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={!isSet || isPending}
          onClick={handleTest}
        >
          {isPending || test.kind === 'pending' ? (
            <>
              <Loader2 className="mr-1 size-3 animate-spin" />
              Testing
            </>
          ) : (
            'Test'
          )}
        </Button>
      </div>

      {test.kind === 'err' && (
        <div className="flex items-start gap-2 text-xs text-red-400">
          <XCircle className="size-3 mt-0.5 shrink-0" />
          <span>{test.message}</span>
        </div>
      )}

      {dirty && (
        <p className="text-xs text-amber-400">
          Unsaved changes — click Save Keys below to apply.
        </p>
      )}
    </div>
  );
}

/**
 * <HealthBadge> — colored dot showing the latest test result for a
 * provider. Pure presentation; tone logic lives in `getHealthTone`
 * below so it can be unit-tested without rendering React.
 *
 * Phase A — UX_UPGRADE_PLAN.md item 7.
 */
export type HealthTone = 'green' | 'yellow' | 'red' | 'grey';

interface HealthBadgeProps {
  health?: ApiKeyCardProps['health'];
}

/**
 * Pure helper — maps a health snapshot to a tone. Exported for tests.
 *   - undefined / no test  -> 'grey'  (never tested)
 *   - ok=true, fresh (<24h) -> 'green'
 *   - ok=true, stale (24-168h) -> 'yellow'
 *   - ok=true, very stale (>168h) -> 'grey' (treat as unknown)
 *   - ok=false, any time   -> 'red'
 */
export function getHealthTone(
  health: HealthBadgeProps['health'],
  now: Date = new Date(),
): HealthTone {
  if (!health) return 'grey';
  if (!health.ok) return 'red';
  const tested = new Date(health.testedAt);
  const ageMs = now.getTime() - tested.getTime();
  if (ageMs < 24 * 3600_000) return 'green';
  if (ageMs < 168 * 3600_000) return 'yellow';
  return 'grey';
}

function HealthBadge({ health }: HealthBadgeProps) {
  const tone = getHealthTone(health);
  const colorClass =
    tone === 'green'
      ? 'bg-bull'
      : tone === 'yellow'
        ? 'bg-warn'
        : tone === 'red'
          ? 'bg-bear'
          : 'bg-fg-subtle/40';

  const label =
    !health
      ? 'Not yet tested'
      : !health.ok
        ? `Test failed${health.error ? `: ${health.error}` : ''}`
        : `Last tested ${formatRelative(new Date(health.testedAt))}`;

  return (
    <span
      aria-label={label}
      title={label}
      className="inline-flex items-center"
    >
      <span
        aria-hidden="true"
        className={`inline-block size-2 rounded-full ${colorClass}`}
      />
    </span>
  );
}

function formatRelative(ms: number | Date): string {
  const date = typeof ms === 'number' ? new Date(ms) : ms;
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}