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

// Phase E — Feature gating for billing plans.
//
// Each plan has a set of feature keys stored in the `plans.features` JSON
// array. This module provides the canonical feature list and a helper to
// check if a given plan's features include a specific feature key.
//
// Usage:
//   import { hasFeature, PLAN_FEATURES, type FeatureKey } from '@hamafx/shared/billing';
//
//   if (!hasFeature(userPlanFeatures, 'ai_high_quota')) {
//     return Response.json({ error: 'Upgrade to Pro for advanced AI' }, { status: 403 });
//   }

export const PLAN_FEATURES = {
  free: ['chat_basic', 'chart_basic', 'journal_basic'],
  pro: [
    'chat_advanced',
    'chart_advanced',
    'journal_full',
    'alerts_unlimited',
    'ai_high_quota',
  ],
  enterprise: [
    'chat_advanced',
    'chart_advanced',
    'journal_full',
    'alerts_unlimited',
    'ai_unlimited',
    'api_access',
  ],
} as const satisfies Record<string, readonly string[]>;

export type FeatureKey =
  | 'chat_basic'
  | 'chat_advanced'
  | 'chart_basic'
  | 'chart_advanced'
  | 'journal_basic'
  | 'journal_full'
  | 'alerts_unlimited'
  | 'ai_high_quota'
  | 'ai_unlimited'
  | 'api_access';

/**
 * Check if a plan's feature list includes the given feature.
 *
 * @param planFeatures The features array from the plan row (plans.features)
 * @param feature The feature key to check
 * @returns true if the feature is present
 */
export function hasFeature(planFeatures: string[] | null | undefined, feature: FeatureKey): boolean {
  if (!planFeatures) return false;
  return planFeatures.includes(feature);
}

/**
 * Get the plan name from a features array by matching against the canonical
 * PLAN_FEATURES map. Returns 'free' as the default/fallback.
 */
export function inferPlanName(planFeatures: string[] | null | undefined): string {
  if (!planFeatures) return 'free';
  for (const [name, features] of Object.entries(PLAN_FEATURES)) {
    if (features.every((f) => planFeatures.includes(f))) {
      return name;
    }
  }
  return 'free';
}

/**
 * Free plan alert limit — users on the free tier can have at most this many
 * active alerts. Pro/Enterprise have 'alerts_unlimited'.
 */
export const FREE_PLAN_ALERT_LIMIT = 5;

/**
 * Free plan journal entry limit — users on the free tier can have at most
 * this many journal entries per month. Pro/Enterprise have 'journal_full'.
 */
export const FREE_PLAN_JOURNAL_MONTHLY_LIMIT = 50;
