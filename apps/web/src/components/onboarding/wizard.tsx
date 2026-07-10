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

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {IconCheck, IconChevronRight, IconEye, IconEyeOff, IconLoader2, IconBolt, IconRobot, IconUser} from '@tabler/icons-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProviderInfoDot } from '@/components/ui/provider-info-dot';
import type { ProviderMeta, ProviderPricingTier } from '@hamafx/shared';
import type { SymbolCatalogRow } from '@hamafx/db';
import { completeOnboardingAction } from '@/app/onboarding/actions';
import { withCsrf } from '@/lib/csrf';

interface OnboardingWizardProps {
  initialName: string;
  providers: ProviderMeta[];
  symbolsCatalog: SymbolCatalogRow[];
  initialProgress?: Record<string, unknown> | null;
}

export function OnboardingWizard({ initialName, providers, symbolsCatalog, initialProgress }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, startSubmit] = useTransition();
  const [nameError, setNameError] = useState<string | null>(null);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [tradingStyle, setTradingStyle] = useState<'scalper' | 'day_trader' | 'swing' | 'position'>('day_trader');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['XAUUSD', 'EURUSD', 'GBPUSD']);
  const [defaultSymbol, setDefaultSymbol] = useState('XAUUSD');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [testState, setTestState] = useState<
    { kind: 'idle' } | { kind: 'pending' } | { kind: 'ok' } | { kind: 'err'; message: string }
  >({ kind: 'idle' });
  const [, startTest] = useTransition();

  // Restore server-side progress on mount
  useEffect(() => {
    if (initialProgress) {
      const p = initialProgress;
      if (typeof p.step === 'number') setStep(p.step);
      if (typeof p.name === 'string') setName(p.name);
      if (typeof p.timezone === 'string') setTimezone(p.timezone);
      if (typeof p.defaultSymbol === 'string') setDefaultSymbol(p.defaultSymbol);
      if (typeof p.selectedProvider === 'string' || p.selectedProvider === null) {
        setSelectedProvider(p.selectedProvider);
      }
      if (typeof p.tradingStyle === 'string') setTradingStyle(p.tradingStyle as 'scalper' | 'day_trader' | 'swing' | 'position');
      if (Array.isArray(p.selectedSymbols)) setSelectedSymbols(p.selectedSymbols as string[]);
    }
  }, [initialProgress]);

  // Load saved wizard state on mount (API key intentionally excluded — in-memory only)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('hfx_onboarding_wizard');
      if (saved && !initialProgress) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.step === 'number') setStep(parsed.step);
        if (typeof parsed.name === 'string') setName(parsed.name);
        if (typeof parsed.timezone === 'string') setTimezone(parsed.timezone);
        if (typeof parsed.defaultSymbol === 'string') setDefaultSymbol(parsed.defaultSymbol);
        if (typeof parsed.selectedProvider === 'string' || parsed.selectedProvider === null) {
          setSelectedProvider(parsed.selectedProvider);
        }
        if (typeof parsed.tradingStyle === 'string') setTradingStyle(parsed.tradingStyle);
        if (Array.isArray(parsed.selectedSymbols)) setSelectedSymbols(parsed.selectedSymbols);
      }
    } catch (e) {
      console.warn('Failed to restore onboarding state', e);
    }
  }, [initialProgress]);

  // IconDeviceFloppy wizard state when any field changes (API key intentionally excluded)
  useEffect(() => {
    try {
      const state = { step, name, timezone, defaultSymbol, selectedProvider, tradingStyle, selectedSymbols };
      sessionStorage.setItem('hfx_onboarding_wizard', JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [step, name, timezone, defaultSymbol, selectedProvider, tradingStyle, selectedSymbols]);

  // Server-side progress save (debounced 2s, skip step 1)
  useEffect(() => {
    if (step <= 1) return;
    const timer = setTimeout(() => {
      fetch('/api/onboarding/save-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, name, timezone, defaultSymbol, selectedProvider, tradingStyle, selectedSymbols }),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [step, name, timezone, defaultSymbol, selectedProvider, tradingStyle, selectedSymbols]);

  function validateStep(s: number): string | null {
    switch (s) {
      case 1:
        if (name.trim().length < 2) return 'Please enter your name (at least 2 characters)';
        return null;
      case 3:
        if (selectedSymbols.length < 1) return 'Please select at least one symbol';
        return null;
      case 4:
        if (selectedProvider === null) return null;
        if (apiKey.trim().length < 8) return 'Please enter a valid API key (at least 8 characters)';
        return null;
      default:
        return null;
    }
  }

  const handleNext = () => {
    const error = validateStep(step);
    if (error) {
      if (step === 1) setNameError(error);
      if (step === 3) setSymbolsError(error);
      toast.error(error);
      return;
    }
    setNameError(null);
    setSymbolsError(null);
    setStep((s) => s + 1);
  };
  const handleBack = () => setStep((s) => s - 1);

  function handleTestKey() {
    if (!selectedProvider || apiKey.trim().length < 8) return;
    setTestState({ kind: 'pending' });
    startTest(async () => {
      try {
        const res = await fetch('/api/settings/test-provider', {
          method: 'POST',
          ...withCsrf({
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: selectedProvider, apiKey: apiKey.trim() }),
          }),
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

  function handleSubmit() {
    startSubmit(async () => {
      // IconDeviceFloppy trading style to localStorage preferences so the client app uses it
      try {
        const currentPrefs = JSON.parse(localStorage.getItem('hamafx:prefs') || '{}');
        localStorage.setItem('hamafx:prefs', JSON.stringify({
          ...currentPrefs,
          defaultSymbol: defaultSymbol || selectedSymbols[0] || 'XAUUSD',
          timeFormat: currentPrefs.timeFormat || '24h',
          reduceMotion: currentPrefs.reduceMotion || false,
          tradingStyle: tradingStyle,
        }));
      } catch {
        // ignore
      }

      const payload = {
        displayName: name,
        timezone,
        defaultSymbol: defaultSymbol || selectedSymbols[0] || 'XAUUSD',
        symbols: selectedSymbols,
        apiKeys: selectedProvider && apiKey.trim().length > 0
          ? { [selectedProvider]: apiKey.trim() }
          : {},
      };
      const fd = new FormData();
      fd.append('payload', JSON.stringify(payload));
      try {
        const res = await completeOnboardingAction(fd);
        if (res.ok) {
          sessionStorage.removeItem('hfx_onboarding_wizard');
          router.push('/chat');
          router.refresh();
        } else {
          toast.error(res.error || 'Failed to complete onboarding');
        }
      } catch (err) {
        console.error(err);
        toast.error('An unexpected error occurred');
      }
    });
  }

  const tierLabel = (tier: ProviderPricingTier) => {
    switch (tier) {
      case 'free': return 'Free tier';
      case 'low': return 'Low cost';
      case 'medium': return 'Paid';
      case 'high': return 'Premium';
    }
  };

  function handleSkip() {
    startSubmit(async () => {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({
        displayName: name,
        timezone,
        defaultSymbol: selectedSymbols[0] || 'XAUUSD',
        symbols: selectedSymbols,
        apiKeys: {},
      }));
      try {
        const res = await completeOnboardingAction(fd);
        if (res.ok) {
          sessionStorage.removeItem('hfx_onboarding_wizard');
          router.push('/chat');
          router.refresh();
        } else {
          toast.error(res.error || 'Failed to skip');
        }
      } catch (err) {
        console.error(err);
        toast.error('An unexpected error occurred');
      }
    });
  }

  return (
    <div className="border border-border bg-bg-elev-1 rounded-sm p-6">
      {/* Stepper */}
      <div className="mb-4 flex items-center justify-between" role="list" aria-label="Setup progress">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2" role="listitem">
            <div
              aria-current={step === i ? 'step' : undefined}
              aria-label={`Step ${i}: ${['Profile', 'Trading Style', 'Symbols', 'AI Provider', 'Review'][i - 1]}`}
              className={`flex size-8 items-center justify-center rounded-sm text-sm font-semibold transition-colors ${
                step >= i ? 'bg-fg text-black' : 'bg-bg-elev-1 text-fg-subtle'
              }`}
            >
              {step > i ? <IconCheck className="size-4" /> : i}
            </div>
            {i < 5 && (
              <div
                className={`h-px w-8 sm:w-16 transition-colors ${
                  step > i ? 'bg-fg' : 'bg-bg-elev-1-elevated'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={handleSkip}
          disabled={isSubmitting}
          className="text-xs text-fg-subtle hover:text-fg transition-colors"
        >
          Skip setup, explore first
        </button>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4">
          <div>
            <h2 className="text-xl font-semibold text-fg mb-1">Let's get to know you</h2>
            <p className="text-sm text-fg-subtle">Profile settings for your AI trading workspace.</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-fg">Display Name</label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(null); }}
              placeholder="Satoshi Nakamoto"
              autoFocus
            />
            {nameError && <p className="text-xs text-danger">{nameError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-fg">Timezone</label>
            <select
              className="h-10 w-full rounded-sm border border-border bg-bg-elev-1 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-fg cursor-pointer"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {Intl.supportedValuesOf('timeZone').map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <Button className="w-full" onClick={handleNext} disabled={!name.trim()}>
            Continue <IconChevronRight className="ml-2 size-4" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4">
          <div>
            <h2 className="text-xl font-semibold text-fg mb-1">Choose your Trading Style</h2>
            <p className="text-sm text-fg-subtle">This configures default timeframes and shapes AI suggestions.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: 'scalper', title: '📊 Scalper', timeframe: '1m - 15m', desc: 'Capture fast-paced price action and micro-trends.' },
              { id: 'day_trader', title: '📈 Day Trader', timeframe: '5m - 1H', desc: 'Intraday execution with clean daily closes.' },
              { id: 'swing', title: '🔄 Swing Trader', timeframe: '1H - 4H', desc: 'Hold positions for days to capture large swings.' },
              { id: 'position', title: '🏛 Position Trader', timeframe: 'Daily+', desc: 'Macro trends, long-term fundamentals.' },
            ].map((style) => {
              const active = tradingStyle === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setTradingStyle(style.id as 'scalper' | 'day_trader' | 'swing' | 'position')}
                  className={`text-left rounded-sm border p-4 transition-all hover:bg-bg-elev-2 flex flex-col gap-1.5 cursor-pointer relative ${
                    active
                      ? 'border-border bg-bg-elev-1 ring-1 ring-fg'
                      : 'border-border bg-bg-elev-1 hover:border-fg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-fg text-sm sm:text-base">{style.title}</span>
                    <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-sm bg-bg-elev-2 text-fg-subtle border border-border">
                      {style.timeframe}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-fg-subtle leading-[1.4]">
                    {style.desc}
                  </p>
                  {active && (
                    <span className="absolute bottom-3 right-3 text-fg">
                      <IconCheck className="size-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex gap-4">
            <Button variant="secondary" className="flex-1" onClick={handleBack}>
              Back
            </Button>
            <Button className="flex-1" onClick={handleNext}>
              Continue <IconChevronRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4">
          <div>
            <h2 className="text-xl font-semibold text-fg mb-1">Select Preferred Symbols</h2>
            <p className="text-sm text-fg-subtle">Choose the instruments you want in your default watchlist. Select at least one.</p>
            {symbolsError && <p className="mt-1 text-xs text-danger">{symbolsError}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
            {symbolsCatalog.map((sym) => {
              const active = selectedSymbols.includes(sym.symbol);
              return (
                <button
                  key={sym.symbol}
                  type="button"
                  onClick={() => {
                    if (active) {
                      if (selectedSymbols.length > 1) {
                        const updated = selectedSymbols.filter(s => s !== sym.symbol);
                        setSelectedSymbols(updated);
                        if (defaultSymbol === sym.symbol && updated.length > 0) {
                          setDefaultSymbol(updated[0]!);
                        }
                      } else {
                        toast.error('Select at least one symbol');
                      }
                    } else {
                      setSelectedSymbols([...selectedSymbols, sym.symbol]);
                    }
                  }}
                  className={`text-left rounded-sm border p-4 transition-all hover:bg-bg-elev-2 flex items-center justify-between cursor-pointer relative ${
                    active
                      ? 'border-border bg-bg-elev-1 ring-1 ring-fg'
                      : 'border-border bg-bg-elev-1 hover:border-fg-muted'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono font-semibold text-fg text-sm sm:text-base">{sym.symbol}</span>
                    <span className="text-xs text-fg-subtle">{sym.name} ({sym.category})</span>
                  </div>
                  <div className={`size-5 rounded-sm border flex items-center justify-center transition-colors ${
                    active ? 'bg-fg border-border text-black' : 'border-border bg-bg-elev-1'
                  }`}>
                    {active && <IconCheck className="size-3.5 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedSymbols.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-fg">Default Chart Symbol</label>
              <select
                className="h-10 w-full rounded-sm border border-border bg-bg-elev-1 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-fg cursor-pointer"
                value={defaultSymbol}
                onChange={(e) => setDefaultSymbol(e.target.value)}
              >
                {selectedSymbols.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-4">
            <Button variant="secondary" className="flex-1" onClick={handleBack}>
              Back
            </Button>
            <Button className="flex-1" onClick={handleNext} disabled={selectedSymbols.length === 0}>
              Continue <IconChevronRight className="ml-2 size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4">
          <div>
            <h2 className="text-xl font-semibold text-fg mb-1">Connect an AI Provider</h2>
            <p className="text-sm text-fg-subtle">
              HamaFX-Ai is BYOK (Bring Your Own IconKey). Pick a provider below and paste
              your API key. You can add more or change providers later in IconSettings.
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
                  className={`text-left rounded-sm border p-3 transition-colors ${
                    selected
                      ? 'border-border bg-bg-elev-2 ring-1 ring-fg'
                      : 'border-border bg-bg-elev-1 hover:border-fg-subtle'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="text-sm font-medium text-fg">{p.displayName}</div>
                      <ProviderInfoDot provider={p} />
                    </div>
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
            <div className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
              <label className="text-sm font-medium text-fg">
                API IconKey for {providers.find((p) => p.id === selectedProvider)?.displayName}
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
                    {revealed ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
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
                      <IconLoader2 className="mr-1 size-3 animate-spin" />
                      Testing
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
                {testState.kind === 'ok' && (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <IconCheck className="size-3" /> IconKey looks valid
                  </span>
                )}
                {testState.kind === 'err' && (
                  <span className="text-xs text-danger">{testState.message}</span>
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
              Continue <IconChevronRight className="ml-2 size-4" />
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
            className="text-xs text-fg-subtle hover:text-fg transition-colors text-center w-full mt-2"
          >
            Skip for now (configure later in IconSettings)
          </button>
        </div>
      )}

      {step === 5 && (
        <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4">
          <div>
            <h2 className="text-xl font-semibold text-fg mb-1">Review & Complete</h2>
            <p className="text-sm text-fg-subtle">
              Here is what we will configure for you:
            </p>
          </div>
          <ul className="list-disc list-inside text-sm text-fg space-y-1.5 border border-border bg-bg-elev-2 rounded-sm p-4">
            <li>Display name: <span className="text-fg-subtle">{name || '—'}</span></li>
            <li>Timezone: <span className="text-fg-subtle">{timezone}</span></li>
            <li>Trading style: <span className="text-fg-subtle capitalize">{tradingStyle.replace('_', ' ')}</span></li>
            <li>Watchlist: <span className="text-fg-subtle">{selectedSymbols.join(', ')}</span></li>
            <li>Default chart symbol: <span className="text-fg-subtle">{defaultSymbol}</span></li>
            <li>
              AI provider:{' '}
              <span className="text-fg-subtle">
                {selectedProvider
                  ? `${providers.find((p) => p.id === selectedProvider)?.displayName} (key saved)`
                  : 'skipped — set up later'}
              </span>
            </li>
          </ul>

          {/* Sample chat preview */}
          <details className="border border-border rounded-sm p-3">
            <summary className="cursor-pointer text-sm text-fg-muted hover:text-fg">
              Try a sample chat
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-xs text-fg-subtle">
                A preview of what HamaFX-Ai can do. After setup, you will be able to ask about any symbol.
              </p>
              <div className="flex flex-col gap-2 bg-bg-elev-2 rounded-sm p-3">
                <div className="flex items-start gap-2">
                  <div className="rounded-sm bg-bg-elev-3 p-1.5 mt-0.5">
                    <IconUser className="size-3 text-fg" />
                  </div>
                  <div className="flex-1 text-xs text-fg">
                    How is XAUUSD looking?
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="rounded-sm bg-bg-elev-2 p-1.5 mt-0.5">
                    <IconRobot className="size-3 text-fg" />
                  </div>
                  <div className="flex-1 text-xs text-fg leading-[1.4] space-y-1">
                    <p>
                      <span className="text-bull font-medium">XAUUSD</span> is showing mixed signals
                      on the 1H:
                    </p>
                    <ul className="list-disc list-inside text-fg-subtle">
                      <li>Price consolidating above <span className="text-fg tabular-nums">$2,650</span> support</li>
                      <li>RSI at 54 — neutral</li>
                      <li>MACD histogram flattening — momentum fading</li>
                    </ul>
                    <p>
                      Bias: <span className="text-bear font-medium">Bearish below $2,640</span> ·
                      IconKey resistance at <span className="tablibular-nums">$2,680</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </details>

          <div className="flex gap-4">
            <Button variant="secondary" className="flex-1" onClick={handleBack}>
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              <IconBolt className="mr-1 size-4" /> Finish Setup
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}