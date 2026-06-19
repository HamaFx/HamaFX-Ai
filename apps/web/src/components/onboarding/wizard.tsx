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

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ChevronRight } from 'lucide-react';
import { completeOnboardingAction } from '@/app/onboarding/actions';

export function OnboardingWizard({ initialName }: { initialName: string }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [defaultSymbol, setDefaultSymbol] = useState('XAUUSD');

  const handleNext = () => setStep((s) => s + 1);

  const handleSubmit = async () => {
    setLoading(true);
    const fd = new FormData();
    fd.append('name', name);
    fd.append('timezone', timezone);
    fd.append('defaultSymbol', defaultSymbol);

    try {
      await completeOnboardingAction(fd);
      router.push('/chat');
      router.refresh();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="card-premium p-6">
      <div className="mb-8 flex items-center justify-between">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex size-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                step >= i ? 'bg-brand text-black' : 'bg-surface text-fg-subtle'
              }`}
            >
              {step > i ? <Check className="size-4" /> : i}
            </div>
            {i < 3 && (
              <div
                className={`h-px w-12 sm:w-24 transition-colors ${
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
            <Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>
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
            <h2 className="text-xl font-semibold text-fg mb-1">Bring Your Own Key (BYOK)</h2>
            <p className="text-sm text-fg-subtle">
              HamaFX-Ai is BYOK. You'll need to provide your own API keys for the AI models (OpenAI, Anthropic, or Google) to use the copilot features. You can set this up later in Settings.
            </p>
          </div>
          
          <div className="rounded-lg border border-surface-elevated bg-surface p-4">
            <p className="text-sm text-fg font-medium mb-2">We'll head to the Settings page next.</p>
            <ul className="list-disc list-inside text-sm text-fg-subtle space-y-1">
              <li>Add your API keys securely</li>
              <li>Configure Telegram alerts</li>
              <li>Customize your watchlist</li>
            </ul>
          </div>

          <div className="flex gap-4">
            <Button variant="secondary" className="flex-1" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button className="flex-1" onClick={handleSubmit} loading={loading}>
              Finish Setup
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
