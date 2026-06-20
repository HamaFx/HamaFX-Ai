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
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProviderMeta, ProviderPricingTier } from '@hamafx/shared';
import { completeOnboardingAction } from '@/app/onboarding/actions';

interface OnboardingWizardProps {
  initialName: string;
  providers: ProviderMeta[];
}

export function OnboardingWizard({ initialName, providers }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [defaultSymbol, setDefaultSymbol] = useState('XAUUSD');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [testState, setTestState] = useState<
    { kind: 'idle' } | { kind: 'pending' } | { kind: 'ok' } | { kind: 'err'; message: string }
  >({ kind: 'idle' });
  const [, startTest] = useTransition();

  const handleNext = () => setStep((s) => s + 1);
  const handleBack = () => setStep((s) => s - 1);

  function handleTestKey() {
    if (!selectedProvider || apiKey.trim().length < 8) return;
    setTestState({ kind: 'pending' });
    startTest(async () => {
      try {
        const res = await fetch('/api/settings/test-provider', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: selectedProvider, apiKey: apiKey.trim() }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setTestState({ kind: 'err', message: data.error ?? `HTTP ${res.status}` });
        } else {
          setTestState({ kind: 'ok' });
        }
      } catch (err) {
        setTestState({
          kind: 'err',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  async function handleSubmit() {
    setLoading(true);
    const payload = {
      displayName: name,
      timezone,
      defaultSymbol,
      apiKeys: selectedProvider && apiKey.trim().length > 0
        ? { [selectedProvider]: apiKey.trim() }
        : {},
    };
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    try {
      await completeOnboardingAction(fd);
      router.push('/chat');
      router.refresh();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  // Pricing labels shown on the provider cards.
  const tierLabel = (tier: ProviderPricingTier) => {
    switch (tier) {
      case 'free': return 'Free tier';
      case 'low': return 'Low cost';
      case 'medium': return 'Paid';
      case 'high': return 'Premium';
    }
  };

  return (
    <div className="border border-divider bg-bg-elev-1 rounded-lg p-6">
      {/* Stepper */}
      <div className="mb-8 flex items-center justify-between">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex size-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                step >= i ? 'bg-brand text-black' : 'bg-surface text-fg-subtle'
              }`}
            >
              {step > i ? <Check className="size-4" /> : i}
            </div>
            {i < 4 && (
              <div
                className={`h-px w-12 sm:w-20 transition-colors ${
                  step > i ? 'bg-brand' : 'bg-surface-elevated'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4">
          <div>
            <h2 className="text-xl font-semibold text-fg mb-1">Let's get to know you</h2>
            <p className="text-sm text-fg-subtle">What should your AI copilot call you?</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-fg">Display Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Satoshi Nakamoto"
              autoFocus
            />
          </div>
          <Button className="w-full" onClick={handleNext} disabled={!name.trim()}>
            Continue <ChevronRight className="ml-2 size-4" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4">
          <div>
            <h2 className="text-xl font-semibold text-fg mb-1">Trading Preferences</h2>
            <p className="text-sm text-fg-subtle">Set up your local timezone and primary market.</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-fg">Timezone</label>
            <Input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="UTC"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-fg">Default Symbol</label>
            <select
              className="h-10 w-full rounded-md border border-surface-elevated bg-bg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand"
              value={defaultSymbol}
              onChange={(e) => setDefaultSymbol(e.target.value)}
            >
              <option value="XAUUSD">Gold (XAUUSD)</option>
              <option value="EURUSD">Euro (EURUSD)</option>
              <option value="GBPUSD">Pound (GBPUSD)</option>
              <option value="BTCUSD">Bitcoin (BTCUSD)</option>
            </select>
          </div>
          <div className="flex gap-4">
            <Button variant="secondary" className="flex-1" onClick={handleBack}>
              Back
            </Button>
            <Button className="flex-1" onClick={handleNext}>
              Continue <ChevronRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4">
          <div>
            <h2 className="text-xl font-semibold text-fg mb-1">Connect an AI Provider</h2>
            <p className="text-sm text-fg-subtle">
              HamaFX-Ai is BYOK (Bring Your Own Key). Pick a provider below and paste
              your API key. You can add more or change providers later in Settings.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
            {providers.map((p) => {
              const selected = selectedProvider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedProvider(p.id);
                    setTestState({ kind: 'idle' });
                  }}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    selected
                      ? 'border-brand bg-brand/10 ring-1 ring-brand'
                      : 'border-surface-elevated bg-surface hover:border-fg-subtle'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-medium text-fg">{p.displayName}</div>
                    <div className="text-xs text-fg-subtle">{tierLabel(p.pricingTier)}</div>
                  </div>
                  <div className="mt-1 text-xs text-fg-subtle line-clamp-2">
                    {p.description}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedProvider && (
            <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
              <label className="text-sm font-medium text-fg">
                API Key for {providers.find((p) => p.id === selectedProvider)?.displayName}
              </label>
              <div className="relative">
                <Input
                  type={revealed ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    if (testState.kind !== 'idle') setTestState({ kind: 'idle' });
                  }}
                  placeholder={providers.find((p) => p.id === selectedProvider)?.keyHint}
                  autoComplete="off"
                  spellCheck={false}
                  className="pr-20"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRevealed((r) => !r)}
                    className="p-1 text-fg-subtle hover:text-fg transition-colors"
                    aria-label={revealed ? 'Hide key' : 'Show key'}
                  >
                    {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={apiKey.trim().length < 8 || testState.kind === 'pending'}
                  onClick={handleTestKey}
                >
                  {testState.kind === 'pending' ? (
                    <>
                      <Loader2 className="mr-1 size-3 animate-spin" />
                      Testing
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
                {testState.kind === 'ok' && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Check className="size-3" /> Key looks valid
                  </span>
                )}
                {testState.kind === 'err' && (
                  <span className="text-xs text-red-400">{testState.message}</span>
                )}
              </div>
            </div>
          )}

          {!selectedProvider && (
            <p className="text-xs text-fg-subtle">
              Tip: choose a free-tier provider to try things out without spending.
            </p>
          )}

          <div className="flex gap-4">
            <Button variant="secondary" className="flex-1" onClick={handleBack}>
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleNext}
              disabled={!selectedProvider || apiKey.trim().length < 8}
            >
              Continue <ChevronRight className="ml-2 size-4" />
            </Button>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedProvider(null);
              setApiKey('');
              setTestState({ kind: 'idle' });
              handleNext();
            }}
            className="text-xs text-fg-subtle hover:text-fg transition-colors"
          >
            Skip for now (configure later in Settings)
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4">
          <div>
            <h2 className="text-xl font-semibold text-fg mb-1">All set!</h2>
            <p className="text-sm text-fg-subtle">
              Here's what we'll configure for you:
            </p>
          </div>
          <ul className="list-disc list-inside text-sm text-fg space-y-1">
            <li>Display name: <span className="text-fg-subtle">{name || '—'}</span></li>
            <li>Timezone: <span className="text-fg-subtle">{timezone}</span></li>
            <li>Default symbol: <span className="text-fg-subtle">{defaultSymbol}</span></li>
            <li>
              AI provider:{' '}
              <span className="text-fg-subtle">
                {selectedProvider
                  ? `${providers.find((p) => p.id === selectedProvider)?.displayName} (key saved)`
                  : 'skipped — set up later'}
              </span>
            </li>
            <li>Watchlist seeded with XAUUSD, EURUSD, GBPUSD</li>
          </ul>
          <div className="flex gap-4">
            <Button variant="secondary" className="flex-1" onClick={handleBack}>
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              loading={loading}
              disabled={loading}
            >
              <Sparkles className="mr-1 size-4" /> Finish Setup
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}