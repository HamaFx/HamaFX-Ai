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

// Public barrel for @hamafx/db.

export * from './schema/index';
export { getDb, getAdminDb, closeAdminDb, closeDb, withTenantDb, withTenantDbRO, withDbRetry, checkDbHealth, schema } from './client';
export { withUserScope } from './with-user-scope';
export { withRateLimit, type RateLimitResult } from './rate-limit';
export { runRetentionCleanup, runVacuumAnalyze, type RetentionConfig, type RetentionResult } from './retention';
export { getActiveUserIds } from './active-users';
export { checkAndIncrementDailyQuota, type DailyQuotaResult } from './provider-quota';
export {
  getSubscription,
  isSubscriptionActive,
  getEffectiveFeatures,
  getEffectiveTokenCap,
  countActiveAlerts,
  countJournalEntriesThisMonth,
  type SubscriptionWithPlan,
} from './queries/billing';
export { getUserWithSettings, type UserWithSettings } from './queries/user-settings';
