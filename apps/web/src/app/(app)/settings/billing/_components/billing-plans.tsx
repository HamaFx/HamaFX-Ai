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

'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Plan {
  id: string;
  name: string;
  priceUsdCents: number;
  payCurrency: string | null;
  interval: string;
  features: string[] | null;
  monthlyTokenCap: number | null;
}

export function BillingPlans({ plans, currentPlanId }: { plans: Plan[]; currentPlanId: string | null }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(planId: string) {
    setError(null);
    setLoading(planId);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? 'Checkout failed');
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setLoading(null);
    }
  }

  function getCsrfToken(): string {
    const match = document.cookie.match(/hfx_csrf=([^;]+)/);
    return match?.[1] ?? '';
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-fg text-sm font-semibold">Available Plans</h3>
      {error && (
        <div className="rounded-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const price = plan.priceUsdCents === 0 ? 'Free' : `$${(plan.priceUsdCents / 100).toFixed(0)}/${plan.interval}`;
          return (
            <div
              key={plan.id}
              className={cn(
                'flex flex-col gap-3 rounded-sm border p-4 transition-colors',
                isCurrent
                  ? 'border-zinc-700 bg-zinc-950'
                  : 'border-border bg-surface hover:border-zinc-700/20',
              )}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-fg font-semibold">{plan.name}</h4>
                {isCurrent && (
                  <span className="rounded-sm bg-zinc-900 px-2 py-0.5 text-xs font-medium text-fg">
                    Current
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-fg">{price}</p>
              <ul className="flex flex-col gap-1.5 text-sm text-fg-subtle">
                {(plan.features ?? []).map((feat) => (
                  <li key={feat} className="flex items-center gap-2">
                    <Check className="size-3.5 text-fg" />
                    {feat.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
              {!isCurrent && plan.priceUsdCents > 0 && (
                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={loading !== null}
                  className="mt-auto inline-flex items-center justify-center gap-2 rounded-sm bg-fg px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-fg/90 disabled:opacity-50"
                >
                  {loading === plan.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </button>
              )}
              {!isCurrent && plan.priceUsdCents === 0 && (
                <span className="mt-auto text-sm text-fg-subtle">Free tier — no payment needed</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
