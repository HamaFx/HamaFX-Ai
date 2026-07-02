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
import { CreditCard } from 'lucide-react';

import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq, desc } from 'drizzle-orm';
import { SettingsSection } from '../_components/settings-section';
import { BillingPlans } from './_components/billing-plans';
import { PaymentHistory } from './_components/payment-history';
import { SubscriptionStatus } from './_components/subscription-status';

export const metadata: Metadata = { title: 'Billing — Settings' };
export const revalidate = 0;

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  const db = getDb();

  // Fetch plans, subscription, and payments server-side.
  const allPlans = await db.select().from(schema.plans).where(eq(schema.plans.isActive, true));
  const subs = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.tenantId, userId)).limit(1);
  const payments = await db.select().from(schema.payments).where(eq(schema.payments.tenantId, userId)).orderBy(desc(schema.payments.createdAt)).limit(20);

  const subscription = subs[0] ?? null;
  const currentPlan = subscription ? allPlans.find((p) => p.id === subscription.planId) ?? null : null;

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        icon={<CreditCard className="size-4" />}
        title="Billing"
        description="Manage your subscription and payment method."
      >
        <SubscriptionStatus
          subscription={subscription ? JSON.parse(JSON.stringify(subscription)) : null}
          currentPlan={currentPlan ? JSON.parse(JSON.stringify(currentPlan)) : null}
        />
        <BillingPlans
          plans={JSON.parse(JSON.stringify(allPlans))}
          currentPlanId={subscription?.planId ?? null}
        />
        <PaymentHistory payments={JSON.parse(JSON.stringify(payments))} />
      </SettingsSection>
    </div>
  );
}
