// SPDX-License-Identifier: Apache-2.0

import 'server-only';

/**
 * Server-only API boundary.
 *
 * API controllers should validate HTTP input and call services rather than
 * importing domain packages directly. This boundary is the composition edge
 * for endpoints that have not yet acquired a dedicated domain service. It
 * deliberately contains no HTTP logic; it only exposes the established
 * package APIs through the web application's service layer.
 */

// AI agent and persistence APIs.
export {
  BYOK_PROVIDERS,
  testProviderKey,
  runMultiAgentChat,
  resolveMode,
  extractUserMessageText,
  ProgressTracker,
  computeUsage,
  getDb,
  getSentimentService,
  getNoiseConfig,
  saveNoiseConfig,
  getRouteConfig,
  saveRouteConfig,
  evaluateAlerts,
  emitPostEvent,
  emitPreEvent,
  emitWeeklyReview,
  findHighImpactEventsInWindow,
  upsertEvents,
  upsertCoTReport,
  backfillEmbeddings,
  countPendingEmbeddings,
  latestArticleTimestampMs,
  upsertArticles,
  listRecentArticles,
  computeDailySnapshot,
  previousUtcMidnight,
  upsertSnapshot,
  listFredEventsMissingActual,
  parseFredEventId,
  patchEventActual,
  savePushSubscription,
  deletePushSubscriptionByEndpoint,
  PushSubscriptionConflictError,
  getEntry,
  reviewTrade,
  handleTelegramWebhook,
  telegramApiCall,
  createLinkCode,
  getBotLink,
  unlinkBot,
  listAgentOpinions,
} from '@hamafx/ai';

// These persistence functions use the supported AI persistence subpath so the
// global package lint rule cannot accidentally reintroduce barrel coupling.
export {
  getThread,
  createThread,
  listThreads,
  listMessages,
  forkThread,
} from '@hamafx/ai/persistence';
export { runChat } from '@hamafx/ai/agent';
export { BudgetExceededError } from '@hamafx/ai/cost';

// Database queries and infrastructure used by controllers that do not yet
// have a dedicated domain service.
export {
  withRateLimit,
  batchDeleteThreads,
  getAnalysisJob,
  getActiveUserIds,
  runRetentionCleanup,
  lazyPurgeExpiredTokens,
  getUserWithSettings,
  updateUserSettingsField,
  getUserApiKeys,
  getUserById,
  createUserWithSettings,
  findVerificationToken,
  deleteVerificationToken,
  verifyUserEmail,
  listActivePlans,
  getPlan,
  getUserSubscription,
  getUserPayments,
  upsertSubscription,
  createPayment,
  createJournalEntry,
  claimCheckoutAttempt,
  saveCheckoutInvoice,
  completeCheckoutAttempt,
  failCheckoutAttempt,
  claimIpnEvent,
  getPaymentByNowpaymentsId,
  markIpnFailed,
  markIpnProcessed,
  recordBillingWebhookFailure,
  updatePaymentStatus,
  updateSubscriptionFromPayment,
  countStaleBillingWebhookFailures,
  claimBillingWebhookReplay,
  markBillingWebhookReplayed,
  releaseBillingWebhookReplay,
  getDiagnosticTrace,
  listDiagnosticTraces,
  listToolTelemetry,
  listAdminAuditLogs,
  listCronRuns,
  deleteOldCronRuns,
  listUserSymbols,
  resetOnboarding,
  getWatchlistWithCatalog,
  isSymbolInCatalog,
  getNextDisplayOrder,
  reorderWatchlist,
  addUserSymbol,
  removeUserSymbol,
  schema,
} from '@hamafx/db';

// Market-data adapters and provider-specific cron helpers.
export {
  getCandles,
  getCandlesWithMeta,
  getPriceWithMeta,
  fetchNews,
  fetchUpcomingEvents,
  ProviderError,
  marketDataProviders,
} from '@hamafx/data';
export { fetchObservations, fredMeta } from '@hamafx/data/providers/fred';
export { fetchLatestRows, parseCftcInt, toCftcName } from '@hamafx/data/providers/cftc';

// Shared domain values, schemas, errors, and server-only helpers.
export {
  SYMBOLS,
  ALL_SYMBOLS,
  BUILTIN_SYMBOLS,
  DEFAULT_WATCHLIST_SYMBOLS,
  SymbolSchema,
  NoiseConfigSchema,
  RouteConfigSchema,
  CreatePositionInputSchema,
  ClosePositionInputSchema,
  AppError,
  conflict,
  validationError,
  providerUnavailable,
  AnalysisQueuedEventSchema,
  ChatStreamEventSchema,
  logStreamHub,
  pickAiEnv,
} from '@hamafx/shared';
export { configuredProviders, decryptByok, PROVIDER_IDS } from '@hamafx/shared/encryption';
export { REQUIRED_HEALTH_ENV_VARS } from '@hamafx/shared/env-secrets';
export { traceIdStorage } from '@hamafx/shared/logger';

// Type-only facade exports used by a few server controllers.
export type { TelegramUpdate } from '@hamafx/ai';
export type { ProviderId, NoiseConfig, RouteConfig, Symbol } from '@hamafx/shared';
export type { UIMessage } from 'ai';
