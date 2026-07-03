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

// Phase E — Billing gate middleware for route handlers.
//
// Provides helpers to check a user's plan features before allowing access
// to gated functionality. Designed to be called early in route handlers,
// before the main logic runs.
//
// Usage:
//   import { checkFeature, checkAlertLimit, checkJournalLimit } from '@/lib/billing-gate';
//
//   const gate = await checkFeature(user.userId, 'ai_high_quota');
//   if (!gate.allowed) return gate.response;

import {
  getSubscription,
  getEffectiveFeatures,
  getEffectiveTokenCap,
  countActiveAlerts,
  countJournalEntriesThisMonth,
  type SubscriptionWithPlan,
} from '@hamafx/db';
import {
  hasFeature,
  FREE_PLAN_ALERT_LIMIT,
  FREE_PLAN_JOURNAL_MONTHLY_LIMIT,
  type FeatureKey,
} from '@hamafx/shared';

export interface BillingGateResult {
  allowed: boolean;
  response?: Response;
  subscription: SubscriptionWithPlan | null;
  features: string[];
}

/**
 * Check if the user's plan includes a specific feature.
 * Returns { allowed: true } if the feature is present.
 * Returns { allowed: false, response } with a 403 if not.
 */
export async function checkFeature(
  userId: string,
  feature: FeatureKey,
): Promise<BillingGateResult> {
  const sub = await getSubscription(userId);
  const features = getEffectiveFeatures(sub);

  if (hasFeature(features, feature)) {
    return { allowed: true, subscription: sub, features };
  }

  return {
    allowed: false,
    subscription: sub,
    features,
    response: Response.json(
      {
        error: {
          code: 'UPGRADE_REQUIRED',
          message: `This feature requires a higher plan. Upgrade at /settings/billing.`,
        },
      },
      { status: 403 },
    ),
  };
}

/**
 * Check if the user can create more alerts.
 * Free tier: max 5 active alerts.
 * Pro/Enterprise: unlimited (has 'alerts_unlimited' feature).
 */
export async function checkAlertLimit(
  userId: string,
): Promise<BillingGateResult> {
  const sub = await getSubscription(userId);
  const features = getEffectiveFeatures(sub);

  if (hasFeature(features, 'alerts_unlimited')) {
    return { allowed: true, subscription: sub, features };
  }

  const activeCount = await countActiveAlerts(userId);
  if (activeCount >= FREE_PLAN_ALERT_LIMIT) {
    return {
      allowed: false,
      subscription: sub,
      features,
      response: Response.json(
        {
          error: {
            code: 'ALERT_LIMIT_REACHED',
            message: `Free plan allows ${FREE_PLAN_ALERT_LIMIT} active alerts. Upgrade to Pro for unlimited alerts.`,
          },
        },
        { status: 403 },
      ),
    };
  }

  return { allowed: true, subscription: sub, features };
}

/**
 * Check if the user can create more journal entries this month.
 * Free tier: max 50 entries per month.
 * Pro/Enterprise: unlimited (has 'journal_full' feature).
 */
export async function checkJournalLimit(
  userId: string,
): Promise<BillingGateResult> {
  const sub = await getSubscription(userId);
  const features = getEffectiveFeatures(sub);

  if (hasFeature(features, 'journal_full')) {
    return { allowed: true, subscription: sub, features };
  }

  const monthlyCount = await countJournalEntriesThisMonth(userId);
  if (monthlyCount >= FREE_PLAN_JOURNAL_MONTHLY_LIMIT) {
    return {
      allowed: false,
      subscription: sub,
      features,
      response: Response.json(
        {
          error: {
            code: 'JOURNAL_LIMIT_REACHED',
            message: `Free plan allows ${FREE_PLAN_JOURNAL_MONTHLY_LIMIT} journal entries per month. Upgrade to Pro for unlimited entries.`,
          },
        },
        { status: 403 },
      ),
    };
  }

  return { allowed: true, subscription: sub, features };
}

/**
 * Get the effective monthly token cap for a user.
 * Returns null for unlimited (Enterprise).
 */
export async function getUserTokenCap(
  userId: string,
): Promise<number | null> {
  const sub = await getSubscription(userId);
  return getEffectiveTokenCap(sub);
}
