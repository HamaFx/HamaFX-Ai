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
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Loader2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProviderInfoDot } from '@/components/ui/provider-info-dot';
import type { ProviderMeta } from '@hamafx/shared';

interface ApiKeyCardProps {
  provider: ProviderMeta;
  /**
   * The current BYOK value for this provider. Empty string when the
   * user hasn't saved a key yet.
   *
   * For Vertex this is the raw service-account JSON (a long single
   * line after the user pasted the file). For all other providers
   * it's the opaque API key string.
   */
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
  } | undefined;
  /**
   * Phase D — api-keys page overhaul. Per-provider usage summary
   * for the last 30 days. When undefined (no usage yet, or the
   * provider hasn't been used), the card omits the usage widget.
   */
  usage?: {
    turns: number;
    costUsd: number;
  } | undefined;
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'ok' }
  | { kind: 'err'; message: string };

/**
 * Per-provider card on /settings/api-keys.
 *
 * Phase D — api-keys page overhaul: vertex uses a textarea (for the
 * JSON service account) instead of an input. The form action is the
 * same single FormData submit; the difference is local to this card.
 */
export function ApiKeyCard({ provider, currentValue, health, usage }: ApiKeyCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState(currentValue);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  const isVertex = provider.id === 'vertex';
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
        const data = (await res.json()) as { ok: boolean; error?: string };
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

  // Vertex key preview — show the project_id + client_email from the
  // parsed JSON to give the user a sanity check before they save.
  const vertexPreview = isVertex && isSet ? previewVertexJson(value.trim()) : null;

  return (
    <div className="border border-divider bg-bg-elev-1 rounded-lg p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <label
              htmlFor={`key-${provider.id}`}
              className="text-sm font-medium text-fg"
            >
              {provider.displayName}
            </label>
            <StatusPill
              isSet={isSet}
              health={health}
              testState={test}
            />
            <ProviderInfoDot provider={provider} side="top" />
            <UsageBadge usage={usage} />
          </div>
          <p className="text-xs text-fg-subtle">{provider.description}</p>
        </div>
        {isSet && test.kind !== 'pending' ? (
          <span
            className={
              test.kind === 'ok'
                ? 'flex items-center gap-1 text-xs text-emerald-400 shrink-0'
                : 'flex items-center gap-1 text-xs text-fg-subtle shrink-0'
            }
          >
            {test.kind === 'ok' && <CheckCircle2 className="size-3" />}
            {test.kind === 'ok' ? 'Looks valid' : test.kind === 'err' ? 'Last test failed' : 'Saved'}
          </span>
        ) : null}
      </div>

      {/* Vertex-specific JSON preview (when a value is entered). */}
      {isVertex && vertexPreview ? (
        <div className="text-caption text-fg-subtle border border-divider/60 bg-bg-elev-2 rounded px-3 py-2 flex flex-col gap-1">
          {vertexPreview.clientEmail ? (
            <span>
              <span className="text-fg-muted">client_email:</span>{' '}
              <span className="font-mono">{vertexPreview.clientEmail}</span>
            </span>
          ) : null}
          {vertexPreview.projectId ? (
            <span>
              <span className="text-fg-muted">project_id:</span>{' '}
              <span className="font-mono">{vertexPreview.projectId}</span>
            </span>
          ) : null}
          {vertexPreview.error ? (
            <span className="text-bear">{vertexPreview.error}</span>
          ) : null}
        </div>
      ) : null}

      {/* Input area — textarea for vertex, input for everyone else. */}
      {isVertex ? (
        <div className="relative">
          <textarea
            id={`key-${provider.id}`}
            name={provider.id}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (test.kind !== 'idle') setTest({ kind: 'idle' });
            }}
            placeholder={
              '{\n  "type": "service_account",\n  "project_id": "...",\n  "client_email": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n..."\n}'
            }
            spellCheck={false}
            autoComplete="off"
            rows={6}
            className="border border-divider bg-bg-elev-2 placeholder:text-fg-muted text-fg font-mono text-caption w-full rounded-md px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40 resize-y"
          />
        </div>
      ) : (
        <div className="relative">
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
            className="pr-20 font-mono"
          />
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="text-fg-muted hover:text-fg absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded transition-colors"
            aria-label={revealed ? 'Hide key' : 'Show key'}
          >
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      )}

      {/* Validation / test feedback. */}
      {test.kind === 'err' ? (
        <div className="flex items-start gap-2 text-xs text-bear">
          <XCircle className="size-3.5 mt-0.5 shrink-0" />
          <span className="break-words">{test.message}</span>
        </div>
      ) : null}
      {test.kind === 'ok' && dirty ? (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span>New value passes validation. Click Save to apply.</span>
        </div>
      ) : null}

      {/* Action row: test button. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-fg-subtle">
          {isVertex ? (
            <>Paste the service-account JSON from the GCP IAM console.</>
          ) : (
            <>Key is encrypted at rest with AES-256-GCM.</>
          )}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleTest}
          disabled={!isSet || test.kind === 'pending'}
          loading={test.kind === 'pending'}
        >
          {test.kind === 'pending' ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              Testing…
            </>
          ) : (
            'Test connection'
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * StatusPill — single small chip on the right of the provider name
 * summarising: set / not set / last-tested-failed. The bulk-test
 * response updates this via revalidatePath.
 */
function StatusPill({
  isSet,
  health,
  testState,
}: {
  isSet: boolean;
  health?: { ok: boolean; error: string | null; testedAt: string } | undefined;
  testState: TestState;
}) {
  if (!isSet) {
    return (
      <span className="rounded-full bg-bg-elev-2 px-2 py-0.5 text-caption font-medium text-fg-subtle">
        Not set
      </span>
    );
  }
  // Live test result takes precedence over the cached health snapshot.
  if (testState.kind === 'err') {
    return (
      <span className="rounded-full bg-bear/15 px-2 py-0.5 text-caption font-medium text-bear">
        Failed
      </span>
    );
  }
  if (testState.kind === 'ok') {
    return (
      <span className="rounded-full bg-bull/15 px-2 py-0.5 text-caption font-medium text-bull">
        OK
      </span>
    );
  }
  if (!health) {
    return (
      <span className="rounded-full bg-bg-elev-2 px-2 py-0.5 text-caption font-medium text-fg-subtle">
        Saved (untested)
      </span>
    );
  }
  if (!health.ok) {
    return (
      <span className="rounded-full bg-bear/15 px-2 py-0.5 text-caption font-medium text-bear">
        Failed <span className="opacity-60">·</span> {formatAge(health.testedAt)}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-bull/15 px-2 py-0.5 text-caption font-medium text-bull">
      OK <span className="opacity-60">·</span> {formatAge(health.testedAt)}
    </span>
  );
}

/**
 * UsageBadge — shows the 30-day cost + turn count for this provider
 * when usage is non-zero. Hidden when there's no usage so the card
 * header stays clean for fresh setups.
 */
function UsageBadge({
  usage,
}: {
  usage?: { turns: number; costUsd: number } | undefined;
}) {
  if (!usage || usage.turns === 0) return null;
  return (
    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-caption font-medium text-brand tabular-nums">
      {usage.turns} {usage.turns === 1 ? 'turn' : 'turns'} · $
      {usage.costUsd.toFixed(2)}
    </span>
  );
}

/**
 * Parse a (possibly-invalid) Vertex service-account JSON and surface
 * the two most useful fields — project_id and client_email — for the
 * user to sanity-check before saving. Returns null on parse error.
 */
function previewVertexJson(
  raw: string,
): { clientEmail?: string | undefined; projectId?: string | undefined; error?: string } {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const clientEmail =
      typeof obj.client_email === 'string' ? obj.client_email : undefined;
    const projectId =
      typeof obj.project_id === 'string' ? obj.project_id : undefined;
    if (!clientEmail && !projectId) {
      return {
        error: 'JSON parsed but missing client_email and project_id',
      };
    }
    return { clientEmail, projectId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}

/**
 * Convert an ISO timestamp to a short "5m ago" / "2h ago" / "3d ago"
 * label. Used in the status pill.
 */
function formatAge(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Re-export the Info icon so it's available to the file but tree-shaken
// if unused (it isn't used here directly; the ProviderInfoDot is).
void Info;
