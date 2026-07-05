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

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import {IconAlertTriangle, IconMail, IconArrowRight} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateUsageSettingsAction } from '../../actions';

interface ProviderSpendItem {
  id: string;
  displayName: string;
  currentSpend: number;
  threshold: number | null;
}

interface UsageLimitsFormProps {
  initialMonthlyLimit: number | null;
  initialAlertConfig: { email?: boolean; telegram?: boolean };
  providers: ProviderSpendItem[];
}

export function UsageLimitsForm({
  initialMonthlyLimit,
  initialAlertConfig,
  providers,
}: UsageLimitsFormProps) {
  const [state, action, pending] = useActionState(
    async (prevState: { error: string; ok: boolean }, formData: FormData) => {
      const res = await updateUsageSettingsAction(formData);
      return {
        error: 'error' in res ? (res.error ?? '') : '',
        ok: res.ok,
      };
    },
    { error: '', ok: false }
  );

  useEffect(() => {
    if (state.ok) {
      toast.success('Usage limits and alerts updated successfully');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state.ok, state.error]);

  return (
    <form
      action={action}
      className="border border-border bg-bg-elev-1 rounded-sm p-5 flex flex-col gap-6"
    >
      <header className="flex items-center gap-3 border-b border-border pb-3">
        <IconAlertTriangle className="size-5 text-fg shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-fg">Limits & Alerts</h2>
          <p className="text-caption text-fg-subtle mt-0.5">
            Configure monthly spend caps, set thresholds per provider, and select alert channels.
          </p>
        </div>
      </header>

      {/* Monthly Budget Limit */}
      <div className="flex flex-col gap-2">
        <label htmlFor="monthlyBudgetLimit" className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
          Monthly Budget Limit (USD)
        </label>
        <Input
          id="monthlyBudgetLimit"
          name="monthlyBudgetLimit"
          type="number"
          min="0"
          placeholder="No monthly limit"
          defaultValue={initialMonthlyLimit ?? ''}
          className="max-w-[200px]"
        />
        <p className="text-caption text-fg-subtle">
          Total AI spent cap for the current calendar month. Chat will be blocked once reached.
        </p>
      </div>

      {/* Alert Channels */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
          Alert Channels (50%, 80%, 100% thresholds)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 border border-border bg-bg-elev-2/40 hover:bg-bg-elev-2 rounded-sm p-3 cursor-pointer select-none transition-colors">
            <input
              type="checkbox"
              name="emailAlert"
              defaultChecked={!!initialAlertConfig.email}
              className="size-4 accent-brand rounded-sm border-border cursor-pointer"
            />
            <div className="flex items-center gap-2">
              <IconMail className="size-4 text-fg-subtle" />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-fg">Email Alerts</span>
                <span className="text-xs text-fg-subtle mt-0.5">Alerts via Resend</span>
              </div>
            </div>
          </label>

          <label className="flex items-center gap-3 border border-border bg-bg-elev-2/40 hover:bg-bg-elev-2 rounded-sm p-3 cursor-pointer select-none transition-colors">
            <input
              type="checkbox"
              name="telegramAlert"
              defaultChecked={!!initialAlertConfig.telegram}
              className="size-4 accent-brand rounded-sm border-border cursor-pointer"
            />
            <div className="flex items-center gap-2">
              <IconArrowRight className="size-4 text-fg-subtle" />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-fg">Telegram Alerts</span>
                <span className="text-xs text-fg-subtle mt-0.5">Alerts via Telegram IconRobot</span>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Per-Provider Spending Thresholds */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
          Per-Provider Monthly Spending Thresholds
        </span>
        <div className="flex flex-col border border-border rounded-sm overflow-hidden divide-y divide-zinc-800/60">
          <div className="grid grid-cols-[1.5fr_1fr_1.2fr] gap-2 items-center bg-bg-elev-2 px-3 py-2 text-xs font-bold text-fg-muted uppercase tracking-wider">
            <span>Provider</span>
            <span className="text-right">Spend (MTD)</span>
            <span className="text-right">Threshold (USD)</span>
          </div>

          {providers.map((p) => {
            const hasExceeded = p.threshold ? p.currentSpend >= p.threshold : false;

            return (
              <div
                key={p.id}
                className="grid grid-cols-[1.5fr_1fr_1.2fr] gap-2 items-center px-3 py-2.5 text-xs transition-colors hover:bg-bg-elev-2/20"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-fg">{p.displayName}</span>
                  <span className="text-xs text-fg-subtle mt-0.5 font-mono">{p.id}</span>
                </div>
                <div className="text-right font-mono text-fg-subtle tabular-nums">
                  <span className={hasExceeded ? 'text-bear font-semibold' : ''}>
                    ${p.currentSpend.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-end items-center">
                  <div className="relative max-w-[100px] w-full">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle">$</span>
                    <Input
                      name={`threshold-${p.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="None"
                      defaultValue={p.threshold ?? ''}
                      aria-label={`Spending threshold for ${p.displayName}`}
                      className="pl-6 text-right font-mono text-xs h-8 pr-2"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" loading={pending} className="min-w-[120px]">
          IconDeviceFloppy Changes
        </Button>
      </div>
    </form>
  );
}
