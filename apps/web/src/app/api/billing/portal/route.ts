// SPDX-License-Identifier: Apache-2.0

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
