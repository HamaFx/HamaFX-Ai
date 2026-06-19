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
import type { ByokProviderSpec } from '@hamafx/ai';

interface ApiKeyCardProps {
  provider: ByokProviderSpec;
  currentValue: string;
}

type TestState = { kind: 'idle' } | { kind: 'pending' } | { kind: 'ok' } | { kind: 'err'; message: string };

export function ApiKeyCard({ provider, currentValue }: ApiKeyCardProps) {
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
    <div className="card-premium p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`key-${provider.id}`}
            className="text-sm font-medium text-fg"
          >
            {provider.displayName}
          </label>
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