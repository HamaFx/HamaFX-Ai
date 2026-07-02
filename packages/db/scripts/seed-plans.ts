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

// Seed the three billing plans: Free ($0), Pro ($15/mo), Enterprise ($49/mo).
//
// Amounts are placeholders — the owner must confirm actual pricing
// (see docs/review/10-billing-nowpayments-integration-plan.md §7 Open Questions #1).
//
// Run with:
//   pnpm --filter @hamafx/db tsx scripts/seed-plans.ts
// or against a local PGlite / Postgres via:
//   npx tsx packages/db/scripts/seed-plans.ts

import { eq } from 'drizzle-orm';

// This script is meant to be run from the @hamafx/db package.
// Import the schema and client directly.
import { plans } from '../src/schema/billing';
import { getDb } from '../src/client';

const SEED_PLANS = [
  {
    name: 'Free',
    priceUsdCents: 0,
    payCurrency: null,
    interval: 'monthly' as const,
    features: ['chat_basic', 'chart_basic', 'journal_basic'],
    monthlyTokenCap: 100_000,
    nowpaymentsPlanId: null,
  },
  {
    name: 'Pro',
    priceUsdCents: 1500,
    payCurrency: 'usdt',
    interval: 'monthly' as const,
    features: [
      'chat_advanced',
      'chart_advanced',
      'journal_full',
      'alerts_unlimited',
      'ai_high_quota',
    ],
    monthlyTokenCap: 1_000_000,
    nowpaymentsPlanId: null, // Set after creating the recurring plan in NOWPayments dashboard
  },
  {
    name: 'Enterprise',
    priceUsdCents: 4900,
    payCurrency: 'usdt',
    interval: 'monthly' as const,
    features: [
      'chat_advanced',
      'chart_advanced',
      'journal_full',
      'alerts_unlimited',
      'ai_unlimited',
      'api_access',
    ],
    monthlyTokenCap: null, // unlimited
    nowpaymentsPlanId: null, // Set after creating the recurring plan in NOWPayments dashboard
  },
];

async function seedPlans() {
  const db = getDb();

  for (const plan of SEED_PLANS) {
    // Upsert by name — if the plan already exists, update it.
    const existing = await db.select().from(plans).where(eq(plans.name, plan.name)).limit(1);

    if (existing.length > 0) {
      await db
        .update(plans)
        .set({
          priceUsdCents: plan.priceUsdCents,
          payCurrency: plan.payCurrency,
          interval: plan.interval,
          features: plan.features,
          monthlyTokenCap: plan.monthlyTokenCap,
          nowpaymentsPlanId: plan.nowpaymentsPlanId,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(plans.name, plan.name));
      console.log(`[seed] Updated plan: ${plan.name}`);
    } else {
      await db.insert(plans).values({
        name: plan.name,
        priceUsdCents: plan.priceUsdCents,
        payCurrency: plan.payCurrency,
        interval: plan.interval,
        features: plan.features,
        monthlyTokenCap: plan.monthlyTokenCap,
        nowpaymentsPlanId: plan.nowpaymentsPlanId,
      });
      console.log(`[seed] Created plan: ${plan.name}`);
    }
  }

  console.log('[seed] Done — 3 plans seeded (Free, Pro, Enterprise).');
}

seedPlans().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
