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
import { toast } from 'sonner';
import type { ProviderMeta } from '@hamafx/shared';
import type { SymbolCatalogRow } from '@hamafx/db';
import { completeOnboardingAction } from '@/app/onboarding/actions';
import { withCsrf } from '@/lib/csrf';

import { WizardStepper } from './_components/wizard-stepper';
import { WizardStepProfile } from './_components/wizard-step-profile';
import { WizardStepStyle } from './_components/wizard-step-style';
import { WizardStepSymbols } from './_components/wizard-step-symbols';
import { WizardStepProvider } from './_components/wizard-step-provider';
import { WizardStepReview } from './_components/wizard-step-review';
import type { TradingStyle, TestState } from './_components/wizard-types';

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
  const [tradingStyle, setTradingStyle] = useState<TradingStyle>('day_trader');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['XAUUSD', 'EURUSD', 'GBPUSD']);
  const [defaultSymbol, setDefaultSymbol] = useState('XAUUSD');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const [, startTest] = useTransition();

  // Wrappers that reset test state when provider/key changes.
  function handleSelectProvider(id: string | null) {
    setSelectedProvider(id);
    setTestState({ kind: 'idle' });
  }

  function handleChangeApiKey(value: string) {
    setApiKey(value);
    if (testState.kind !== 'idle') setTestState({ kind: 'idle' });
  }

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
      if (typeof p.tradingStyle === 'string') setTradingStyle(p.tradingStyle as TradingStyle);
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

  // Save wizard state when any field changes (API key intentionally excluded)
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
      fetch('/api/onboarding/save-progress', withCsrf({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, name, timezone, defaultSymbol, selectedProvider, tradingStyle, selectedSymbols }),
      })).catch((err) => {
        console.warn('onboarding save-progress failed', err);
      });
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
        tradingStyle,
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

  function handleSkip() {
    startSubmit(async () => {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({
        displayName: name,
        timezone,
        defaultSymbol: selectedSymbols[0] || 'XAUUSD',
        symbols: selectedSymbols,
        tradingStyle,
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

  function handleSkipProvider() {
    setSelectedProvider(null);
    setApiKey('');
    setTestState({ kind: 'idle' });
    handleNext();
  }

  return (
    <div className="border border-border bg-bg-elev-1 rounded-sm p-6">
      <WizardStepper step={step} />

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
        <WizardStepProfile
          name={name}
          setName={(v) => { setName(v); setNameError(null); }}
          nameError={nameError}
          timezone={timezone}
          setTimezone={setTimezone}
          onNext={handleNext}
        />
      )}

      {step === 2 && (
        <WizardStepStyle
          tradingStyle={tradingStyle}
          setTradingStyle={setTradingStyle}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {step === 3 && (
        <WizardStepSymbols
          symbolsCatalog={symbolsCatalog}
          selectedSymbols={selectedSymbols}
          setSelectedSymbols={setSelectedSymbols}
          defaultSymbol={defaultSymbol}
          setDefaultSymbol={setDefaultSymbol}
          symbolsError={symbolsError}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {step === 4 && (
        <WizardStepProvider
          providers={providers}
          selectedProvider={selectedProvider}
          setSelectedProvider={handleSelectProvider}
          apiKey={apiKey}
          setApiKey={handleChangeApiKey}
          revealed={revealed}
          setRevealed={setRevealed}
          testState={testState}
          onTestKey={handleTestKey}
          onNext={handleNext}
          onBack={handleBack}
          onSkipProvider={handleSkipProvider}
        />
      )}

      {step === 5 && (
        <WizardStepReview
          name={name}
          timezone={timezone}
          tradingStyle={tradingStyle}
          selectedSymbols={selectedSymbols}
          defaultSymbol={defaultSymbol}
          selectedProvider={selectedProvider}
          providers={providers}
          isSubmitting={isSubmitting}
          onBack={handleBack}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
