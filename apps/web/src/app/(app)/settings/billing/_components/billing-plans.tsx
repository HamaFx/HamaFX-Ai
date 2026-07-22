// SPDX-License-Identifier: Apache-2.0

'use client';

import { useState } from 'react';
import {IconCheck, IconLoader2} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';

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
      const res = await fetchCsrf('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-fg text-sm font-semibold">Available Plans</h3>
      {error && (
        <div className="rounded-sm border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
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
                  ? 'border-border bg-bg-elev-1'
                  : 'border-border bg-bg-elev-1 hover:border-border/20',
              )}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-fg font-semibold">{plan.name}</h4>
                {isCurrent && (
                  <span className="rounded-sm bg-bg-elev-2 px-2 py-0.5 text-xs font-medium text-fg">
                    Current
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-fg">{price}</p>
              <ul className="flex flex-col gap-1.5 text-sm text-fg-subtle">
                {(plan.features ?? []).map((feat) => (
                  <li key={feat} className="flex items-center gap-2">
                    <IconCheck className="size-3.5 text-fg" />
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
                    <IconLoader2 className="size-4 animate-spin" />
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
