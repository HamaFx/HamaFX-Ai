// SPDX-License-Identifier: Apache-2.0

import { cn } from '@/lib/cn';

interface Subscription {
  id: string;
  status: string;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  canceledAt: string | null;
  plan: { name: string; priceUsdCents: number } | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-success/10 text-success',
  trialing: 'bg-info/10 text-info',
  past_due: 'bg-warn/10 text-warn',
  canceled: 'bg-danger/10 text-danger',
  expired: 'bg-fg-muted/10 text-fg-subtle',
};

export function SubscriptionStatus({
  subscription,
  currentPlan,
}: {
  subscription: Subscription | null;
  currentPlan: { name: string; priceUsdCents: number } | null;
}) {
  if (!subscription || !currentPlan) {
    return (
      <div className="rounded-sm border border-border bg-bg-elev-1 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-fg font-medium">No active subscription</p>
            <p className="text-fg-subtle text-sm">You are on the Free tier.</p>
          </div>
          <span className="rounded-sm bg-fg-muted/10 px-3 py-1 text-xs font-medium text-fg-subtle">
            Free
          </span>
        </div>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[subscription.status] ?? STATUS_COLORS.expired;
  const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;

  return (
    <div className="rounded-sm border border-border bg-bg-elev-1 p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-fg font-medium">{currentPlan.name} Plan</p>
            <span className={cn('rounded-sm px-2.5 py-0.5 text-xs font-medium capitalize', statusColor)}>
              {subscription.status.replace('_', ' ')}
            </span>
          </div>
          {periodEnd && (
            <p className="text-fg-subtle text-sm">
              Next billing date: {periodEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>
        <p className="text-fg text-lg font-bold">
          ${currentPlan.priceUsdCents / 100}
          <span className="text-fg-subtle text-sm font-normal">/mo</span>
        </p>
      </div>
    </div>
  );
}


