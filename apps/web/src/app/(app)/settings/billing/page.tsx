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

// /settings/billing — Billing & subscription management page.
// Shows plan cards, current subscription status, and payment history.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { listActivePlans, getUserSubscription, getUserPayments } from '@hamafx/db';
import { BillingPlans } from './_components/billing-plans';
import { PaymentHistory } from './_components/payment-history';
import { SubscriptionStatus } from './_components/subscription-status';

export const metadata: Metadata = { title: 'Billing | Settings | HamaFX' };
export const revalidate = 0;

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;

  const allPlans = await listActivePlans();
  const subscription = await getUserSubscription(userId);
  const payments = await getUserPayments(userId, 20);

  const currentPlan = subscription ? allPlans.find((p) => p.id === subscription.planId) ?? null : null;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Billing</h2>
        <p className="text-fg-subtle text-sm">Manage your subscription and payment method.</p>
      </div>

      <SubscriptionStatus
        subscription={subscription ? JSON.parse(JSON.stringify(subscription)) : null}
        currentPlan={currentPlan ? JSON.parse(JSON.stringify(currentPlan)) : null}
      />
      <BillingPlans
        plans={JSON.parse(JSON.stringify(allPlans))}
        currentPlanId={subscription?.planId ?? null}
      />
      <PaymentHistory payments={JSON.parse(JSON.stringify(payments))} />
    </div>
  );
}
