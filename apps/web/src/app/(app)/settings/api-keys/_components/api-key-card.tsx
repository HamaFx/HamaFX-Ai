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
  Loader2,
  XCircle,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProviderInfoDot } from '@/components/ui/provider-info-dot';
import { withCsrf } from '@/lib/csrf';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { toast } from 'sonner';
import { formatRelative } from '@/lib/format';
import type { ProviderMeta } from '@hamafx/shared';

interface ApiKeyCardProps {
  provider: ProviderMeta;
  currentValue: string;
  keyUpdatedAt?: string | undefined;
  health?: {
    ok: boolean;
    error: string | null;
    testedAt: string;
    rateLimit?: {
      remainingRequests?: number;
      remainingTokens?: number;
      resetRequests?: string;
      resetTokens?: string;
    } | null;
  } | undefined;
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

const SETUP_INSTRUCTIONS: Record<string, {
  dashboardUrl: string;
  freeTier: string;
  rateLimits: string;
  howToGet: string;
}> = {
  google: {
    dashboardUrl: 'https://aistudio.google.com/',
    freeTier: 'Yes, generous free tier for Gemini Flash, Pro, and Flash-Lite models.',
    rateLimits: '15 RPM / 1.5M TPM (Flash), 2 RPM / 32k TPM (Pro) under free tier.',
    howToGet: 'Go to Google AI Studio, sign in with your Google account, and click "Get API key".',
  },
  vertex: {
    dashboardUrl: 'https://console.cloud.google.com/vertex-ai',
    freeTier: 'No free tier. Billed directly to your Google Cloud Project Project.',
    rateLimits: 'Determined by your GCP project quota limits.',
    howToGet: 'Create a Service Account in your GCP console, grant it the "Vertex AI User" role, create a JSON private key, and paste the entire JSON file content here.',
  },
  anthropic: {
    dashboardUrl: 'https://console.anthropic.com/',
    freeTier: 'No free tier, but new accounts sometimes receive $5 of trial credit.',
    rateLimits: 'Varies by tier. Tier 1 starts at 50 RPM / 20k TPM.',
    howToGet: 'Log in to the Anthropic Console, navigate to API Keys, and generate a new key.',
  },
  openai: {
    dashboardUrl: 'https://platform.openai.com/api-keys',
    freeTier: 'No free tier, requires a funded developer account.',
    rateLimits: 'Varies by tier. Tier 1 starts at 500 RPM / 20k TPM.',
    howToGet: 'Go to OpenAI Developer Platform, navigate to API Keys, and click "Create new secret key".',
  },
  groq: {
    dashboardUrl: 'https://console.groq.com/keys',
    freeTier: 'Yes, free tier is standard with requests per minute limits.',
    rateLimits: 'Varies per model. Typically 30 RPM / 14,400 RPD for large models.',
    howToGet: 'Create an account on the Groq Console, navigate to API Keys, and generate a key.',
  },
  mistral: {
    dashboardUrl: 'https://console.mistral.ai/api-keys/',
    freeTier: 'Free trial credits on sign up, then pay-as-you-go.',
    rateLimits: 'Starts at 5 requests/sec for trial tiers.',
    howToGet: 'Log in to Mistral Console, go to API Keys, and create a new key.',
  },
  openrouter: {
    dashboardUrl: 'https://openrouter.ai/keys',
    freeTier: 'Provides access to both free open-source models and premium models.',
    rateLimits: 'Varies depending on model and account credits.',
    howToGet: 'Go to OpenRouter, sign in, go to API keys under Settings, and create a key.',
  },
  xai: {
    dashboardUrl: 'https://console.x.ai/',
    freeTier: 'No free tier. Requires adding payment details.',
    rateLimits: 'Standard developer rate limits apply.',
    howToGet: 'Go to xAI Console, generate a new API key, and configure billing.',
  },
  deepseek: {
    dashboardUrl: 'https://platform.deepseek.com/api_keys',
    freeTier: 'No free tier, but extremely low pricing (under $0.30 per 1M tokens).',
    rateLimits: 'Standard limits are very generous.',
    howToGet: 'Create a DeepSeek account, go to API Keys in the developer dashboard, and create a key.',
  },
};

function ProviderLogo({ id }: { id: string }) {
  const baseClass = "size-5 text-fg shrink-0";
  switch (id) {
    case 'google':
    case 'vertex':
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="currentColor">
          <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.102 1.025 5.042 1.926l2.427-2.334C18.155 2.502 15.46 1 12.24 1 5.92 1 1 5.92 1 12.24s4.92 11.24 11.24 11.24c6.6 0 11-4.64 11-11.24 0-.756-.08-1.334-.18-1.955H12.24z" />
        </svg>
      );
    case 'openai':
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          <path d="M2 12h20" />
        </svg>
      );
    case 'anthropic':
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="currentColor">
          <path d="M12.4 3h-1.6L5.3 21h1.9l1.6-4.9h6.4l1.6 4.9h1.9L12.4 3zm-3.1 11.5l2.7-8.1 2.7 8.1H9.3z" />
        </svg>
      );
    case 'groq':
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case 'mistral':
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 20H4V4h5.5l2.5 4 2.5-4H20v16h-5.5L12 16l-2.5 4z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
  }
}

export function ApiKeyCard({ provider, currentValue, health, usage, keyUpdatedAt }: ApiKeyCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState(currentValue);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [, startTransition] = useTransition();
  const [confirmNode, confirm] = useConfirm();

  const isVertex = provider.id === 'vertex';
  const dirty = value.trim() !== currentValue;
  const isSet = value.trim().length > 0;

  let keyAgeDays: number | null = null;
  if (keyUpdatedAt && isSet) {
    const t = new Date(keyUpdatedAt).getTime();
    if (Number.isFinite(t)) {
      const diffMs = Date.now() - t;
      keyAgeDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
  }

  function handleTest() {
    if (!isSet) return;
    setTest({ kind: 'pending' });
    startTransition(async () => {
      try {
        const res = await fetch('/api/settings/test-provider', {
          method: 'POST',
          ...withCsrf({
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: provider.id, apiKey: value.trim() }),
          }),
        });
        const text = await res.text();
        const looksLikeJson = text.trimStart().startsWith('{');
        let errorMessage: string;
        if (looksLikeJson) {
          try {
            const data = JSON.parse(text) as { ok: boolean; error?: string };
            if (!res.ok || !data.ok) {
              errorMessage = data.error ?? `HTTP ${res.status}`;
            } else {
              setTest({ kind: 'ok' });
              return;
            }
          } catch {
            errorMessage = `HTTP ${res.status}: ${text.slice(0, 120)}`;
          }
        } else {
          errorMessage = `HTTP ${res.status}: ${text.slice(0, 120)}`;
        }
        setTest({ kind: 'err', message: errorMessage });
      } catch (err) {
        setTest({
          kind: 'err',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  async function handleCopy() {
    if (!isSet) return;
    const ok = await confirm({
      title: 'Copy API Key to Clipboard?',
      description: 'API keys are highly sensitive. Storing them in the system clipboard makes them accessible to other applications running on your device. Proceed with caution.',
      confirmLabel: 'Copy Key',
      cancelLabel: 'Cancel',
      tone: 'default',
    });
    if (ok) {
      try {
        await navigator.clipboard.writeText(value.trim());
        toast.success('API Key copied to clipboard');
      } catch {
        toast.error('Failed to copy to clipboard');
      }
    }
  }

  // Vertex key preview
  const vertexPreview = isVertex && isSet ? previewVertexJson(value.trim()) : null;
  const instructions = SETUP_INSTRUCTIONS[provider.id];

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 't' || e.key === 'T') {
          if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
            return;
          }
          e.preventDefault();
          handleTest();
        }
      }}
      className="border border-zinc-800 bg-zinc-950 rounded-sm p-4 flex flex-col gap-3 focus:outline-none focus:ring-2 focus:ring-zinc-700"
    >
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ProviderLogo id={provider.id} />
            <label
              htmlFor={`key-${provider.id}`}
              className="text-sm font-medium text-fg"
            >
              {provider.displayName}
            </label>
            {provider.pricingTier === 'free' && (
              <span className="rounded-sm bg-bull/15 px-2 py-0.5 text-xs font-semibold text-emerald-500">
                Free
              </span>
            )}
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
                ? 'flex items-center gap-1 text-xs text-emerald-500 shrink-0'
                : 'flex items-center gap-1 text-xs text-fg-subtle shrink-0'
            }
          >
            {test.kind === 'ok' && <CheckCircle2 className="size-3" />}
            {test.kind === 'ok' ? 'Looks valid' : test.kind === 'err' ? 'Last test failed' : 'Saved'}
          </span>
        ) : null}
      </div>

      {keyAgeDays !== null && keyAgeDays >= 90 && (
        <div className="border border-warn/20 bg-warn/5 rounded-sm p-3 text-caption text-amber-500 flex items-start gap-2.5">
          <span className="shrink-0 text-sm">⚠️</span>
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-fg">Consider rotating your API key</span>
            <p className="text-fg-subtle text-xs">
              This key was last updated {keyAgeDays} days ago. Regular key rotation increases security.
            </p>
          </div>
        </div>
      )}

      {health?.rateLimit && (
        <div className="border border-zinc-800 bg-bg-elev-2/40 rounded-sm p-3 text-caption text-fg-subtle flex flex-col gap-1.5 shadow-sm">
          <div className="font-semibold text-fg flex items-center gap-1.5">
            <span>⏱️</span>
            <span>API Rate Limits</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mt-0.5">
            {health.rateLimit.remainingRequests !== undefined && (
              <div className="flex flex-col gap-0.5">
                <span className="text-fg-muted font-medium">Requests Remaining</span>
                <span className="font-mono text-fg font-semibold tabular-nums text-sm">
                  {health.rateLimit.remainingRequests}
                </span>
                {health.rateLimit.resetRequests && (
                  <span className="opacity-60 text-xs">Resets in {health.rateLimit.resetRequests}</span>
                )}
              </div>
            )}
            {health.rateLimit.remainingTokens !== undefined && (
              <div className="flex flex-col gap-0.5">
                <span className="text-fg-muted font-medium">Tokens Remaining</span>
                <span className="font-mono text-fg font-semibold tabular-nums text-sm">
                  {health.rateLimit.remainingTokens.toLocaleString()}
                </span>
                {health.rateLimit.resetTokens && (
                  <span className="opacity-60 text-xs">Resets in {health.rateLimit.resetTokens}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vertex-specific JSON preview (when a value is entered). */}
      {isVertex && vertexPreview ? (
        <div className="text-caption text-fg-subtle border border-zinc-800 bg-zinc-900 rounded px-3 py-2 flex flex-col gap-1">
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
            <span className="text-red-500">{vertexPreview.error}</span>
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
            className="border border-zinc-800 bg-zinc-900 placeholder:text-fg-muted text-fg font-mono text-caption w-full rounded-sm px-3 py-2 focus:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-700 resize-y"
          />
          {isSet && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-fg-muted hover:text-fg absolute right-3 bottom-3 inline-flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-zinc-800 border border-zinc-800"
              aria-label="Copy key to clipboard"
            >
              <Copy className="size-3.5" />
            </button>
          )}
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
            className="pr-24 font-mono"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {isSet && (
              <button
                type="button"
                onClick={handleCopy}
                className="text-fg-muted hover:text-fg inline-flex h-7 w-7 items-center justify-center rounded transition-colors"
                aria-label="Copy key to clipboard"
              >
                <Copy className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="text-fg-muted hover:text-fg inline-flex h-7 w-7 items-center justify-center rounded transition-colors"
              aria-label={revealed ? 'Hide key' : 'Show key'}
            >
              {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Validation / test feedback. */}
      {test.kind === 'err' ? (
        <div className="flex items-start gap-2 text-xs text-red-500">
          <XCircle className="size-3.5 mt-0.5 shrink-0" />
          <span className="break-words">{test.message}</span>
        </div>
      ) : null}
      {test.kind === 'ok' && dirty ? (
        <div className="flex items-center gap-2 text-xs text-emerald-500">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span>New value passes validation. Click Save to apply.</span>
        </div>
      ) : null}

      {/* Expandable setup instructions details. */}
      {instructions && (
        <details className="text-xs border border-zinc-900 rounded-sm overflow-hidden bg-zinc-900/50">
          <summary aria-label="Toggle setup instructions and limits" className="cursor-pointer select-none px-3 py-1.5 font-medium text-fg-subtle hover:text-fg transition-colors flex items-center justify-between">
            <span>Setup Instructions & Limits</span>
            <span className="text-xs">▼</span>
          </summary>
          <div className="p-3 border-t border-zinc-900 flex flex-col gap-2 bg-bg-elev-2/10">
            <div>
              <span className="font-semibold text-fg-muted">How to get:</span>{' '}
              <span className="text-fg-subtle">{instructions.howToGet}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <div>
                <span className="font-semibold text-fg-muted">Free tier:</span>{' '}
                <span className="text-fg-subtle">{instructions.freeTier}</span>
              </div>
              <div>
                <span className="font-semibold text-fg-muted">Rate limits:</span>{' '}
                <span className="text-fg-subtle">{instructions.rateLimits}</span>
              </div>
            </div>
            <div className="mt-1">
              <a
                href={instructions.dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-fg hover:underline font-semibold"
              >
                Go to {provider.displayName} Dashboard →
              </a>
            </div>
          </div>
        </details>
      )}

      {/* Action row: test button. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-fg-subtle">
          {isVertex ? (
            <>Paste the service-account JSON from the GCP IAM console.</>
          ) : (
            <>Key is encrypted at rest with AES-256-GCM. Press <kbd className="bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-xs">T</kbd> to test.</>
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
      {confirmNode}
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
      <span className="rounded-sm bg-zinc-900 px-2 py-0.5 text-caption font-medium text-fg-subtle">
        Not set
      </span>
    );
  }
  // Live test result takes precedence over the cached health snapshot.
  if (testState.kind === 'err') {
    return (
      <span className="rounded-sm bg-bear/15 px-2 py-0.5 text-caption font-medium text-red-500">
        Failed
      </span>
    );
  }
  if (testState.kind === 'ok') {
    return (
      <span className="rounded-sm bg-bull/15 px-2 py-0.5 text-caption font-medium text-emerald-500">
        OK
      </span>
    );
  }
  if (!health) {
    return (
      <span className="rounded-sm bg-zinc-900 px-2 py-0.5 text-caption font-medium text-fg-subtle">
        Saved (untested)
      </span>
    );
  }
  if (!health.ok) {
    return (
      <span className="rounded-sm bg-bear/15 px-2 py-0.5 text-caption font-medium text-red-500">
        Failed <span className="opacity-60">·</span> {formatRelative(health.testedAt)}
      </span>
    );
  }
  return (
    <span className="rounded-sm bg-bull/15 px-2 py-0.5 text-caption font-medium text-emerald-500">
      OK <span className="opacity-60">·</span> {formatRelative(health.testedAt)}
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
    <span className="rounded-sm bg-zinc-900 px-2 py-0.5 text-caption font-medium text-fg tabular-nums">
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

