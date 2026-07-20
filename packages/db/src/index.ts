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
// PF-15 — Export `getDbRO` so consumers can route read queries to
// read replicas. `withTenantDbRO` also uses `getDbRO` internally.
export { getDb, getDbRO, getAdminDb, closeAdminDb, closeDb, closeReplicaDb, withTenantDb, withTenantDbRO, withDbRetry, checkDbHealth, schema, type DbClient } from './client';
export { withUserScope } from './with-user-scope';
export { traceQuery, withTracing } from './tracing';
export { withRateLimit, type RateLimitResult } from './rate-limit';
export { runRetentionCleanup, runVacuumAnalyze, type RetentionConfig, type RetentionResult } from './retention';
export { getActiveUserIds } from './active-users';
export { checkAndIncrementDailyQuota, type DailyQuotaResult } from './provider-quota';
// PF-01 — Query/repository layer barrel. Import via `queries` namespace
// or individual named exports for tree-shaking.
export {
  getSubscription,
  isSubscriptionActive,
  getEffectiveFeatures,
  getEffectiveTokenCap,
  countActiveAlerts,
  countJournalEntriesThisMonth,
  type SubscriptionWithPlan,
} from './queries/billing';
export { getUserWithSettings, updateUserSettingsField, listAllUserSettings, type UserWithSettings } from './queries/user-settings';
export {
  getThread,
  listThreads,
  createThread,
  updateThreadTitle,
  updateThreadPinnedSymbol,
  deleteThread,
  batchDeleteThreads,
  listMessages,
  appendUserMessage,
  appendAssistantMessage,
  countThreadMessages,
  type ThreadRow,
  type MessageRow,
  type CreateThreadInput,
  type CreateMessageInput,
} from './queries/threads';
export {
  listAlerts,
  getAlert,
  createAlert,
  updateAlert,
  deleteAlert,
  listActiveAlerts,
  markAlertFired,
  type AlertRow,
  type CreateAlertInput,
  type UpdateAlertInput,
} from './queries/alerts';
// PF-01 Phase 2 — Additional query helpers
export {
  listJournalEntries,
  getJournalEntry,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  countJournalEntriesByUser,
  type JournalRow,
  type CreateJournalInput,
} from './queries/journal';
export {
  listPushSubscriptions,
  getPushSubscriptionByEndpoint,
  createPushSubscription,
  deletePushSubscription,
  deletePushSubscriptionByEndpoint,
  type PushSubscriptionRow,
  type CreatePushSubscriptionInput,
} from './queries/push';
export {
  listCotReports,
  getCotReport,
  upsertCotReport,
  countCotReports,
  type CotReportRow,
  type CreateCotReportInput,
} from './queries/cot';
export {
  listOpenPositions,
  listAllPositions,
  getPosition,
  createPosition,
  closePosition,
  deletePosition,
  getPortfolioSettings,
  upsertPortfolioSettings,
  type PositionRow,
  type CreatePositionInput,
  type PortfolioSettingsRow,
} from './queries/portfolio';
export {
  listTelemetry,
  recordTelemetry,
  getDailySpend,
  type TelemetryRow,
} from './queries/telemetry';
export {
  listRecentArticles,
  listUpcomingEvents,
  listHighImpactEventsInWindow,
  listHighMediumEventsInWindow,
  listFredEventsMissingActual,
  type NewsArticleRow,
  type EconomicEventRow,
} from './queries/news-articles';
export {
  listUserSymbols,
  listDistinctSymbols,
  addUserSymbol,
  removeUserSymbol,
  type UserSymbolRow,
} from './queries/user-symbols';
export {
  getToolStats,
  type ToolStats,
} from './queries/tool-telemetry';
export {
  listActiveTenants,
  type OrganizationRow,
} from './queries/tenants';
export {
  claimNextPendingJob,
  getAnalysisJob,
  failStaleJobs,
  purgeOldJobs,
  type AnalysisJobRow,
} from './queries/analysis-jobs';
export {
  listDiagnosticTraces,
  getDiagnosticTrace,
  type DiagnosticTraceRow,
} from './queries/diagnostic-traces';
export {
  listFeatureFlags,
  upsertFeatureFlag,
  type FeatureFlagRow,
} from './queries/feature-flags';
export {
  listCronRuns,
  deleteOldCronRuns,
  type CronRunRow,
} from './queries/cron-runs';
export {
  lazyPurgeExpiredTokens,
} from './queries/verification-tokens';
export {
  getUserById,
  getUserPasswordHash,
  listUsersWithSettings,
  countUsers,
  type UserRow,
  type UserWithSettingsRow,
} from './queries/users';
export {
  listToolTelemetry,
} from './queries/chat-telemetry';
export {
  getWatchlistWithCatalog,
  isSymbolInCatalog,
  getNextDisplayOrder,
  reorderWatchlist,
  type WatchlistEntry,
} from './queries/watchlist';
export {
  resetOnboarding,
  type ResetMode,
} from './queries/onboarding';
export {
  getProviderHealthForUser,
  getUserApiKeys,
} from './queries/provider-tests';
export {
  listActivePlans,
  getPlan,
  getUserSubscription,
  getUserPayments,
  upsertSubscription,
  createPayment,
} from './queries/billing-extras';
export {
  getUserByEmail,
  userExistsByEmail,
  createUserWithSettings,
  incrementFailedLogins,
  resetLoginLockout,
  updateUserPassword,
  updatePasswordByEmail,
  createVerificationToken,
  findVerificationToken,
  deleteVerificationToken,
  verifyUserEmail,
  getTokenVersion,
  findSession,
  updateSessionLastActive,
  createUserSession,
  updateTwoFactorSecret,
  getTwoFactorSecret,
  setTwoFactorEnabled,
  updateUserApiKeys,
  createAuditLog,
  incrementTokenVersion,
  updateUserDisplayName,
  type AuthUserRow,
} from './queries/auth';
export {
  listUserSessions,
  revokeUserSession,
  deleteUserSessions,
  type SessionRow,
} from './queries/user-sessions';
export {
  findIpnEvent,
  insertIpnEvent,
  markIpnProcessed,
  updatePaymentStatus,
  getPaymentByNowpaymentsId,
  updateSubscriptionFromPayment,
} from './queries/ipn-events';
export {
  getRecentCandles,
  listActiveSymbols,
  type CandleRow,
} from './queries/candles';
export {
  listMtdAgentOpinions,
  type AgentOpinionRow,
} from './queries/agent-opinions';
export * as queries from './queries';
