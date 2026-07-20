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

// GET /api/billing/portal — returns the user's subscription, plans, and payments.
// Auth required.

import { listActivePlans, getUserSubscription, getUserPayments } from '@hamafx/db';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const allPlans = await listActivePlans();
    const subscription = await getUserSubscription(user.userId);
    const payments = await getUserPayments(user.userId, 20);

    let currentPlan = null;
    if (subscription) {
      currentPlan = allPlans.find((p) => p.id === subscription.planId) ?? null;
    }

    return Response.json({
      plans: allPlans,
      subscription: subscription ? { ...subscription, plan: currentPlan } : null,
      payments,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
