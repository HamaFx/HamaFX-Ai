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

// Public barrel for @hamafx/ai. The route handler imports from here.

export { runChat, type RunChatArgs } from './agent';
export { tools, type ToolRegistry } from './tools';
export { buildSystemPrompt, type LiveSnapshot } from './prompt/system';
export { buildLiveSnapshot } from './context';
export * from './wait-until';
export * from './telegram/webhook';
export {
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
  getProvider,
  defaultModelFor,
  type ByokProviderSpec,
  type ByokProviderModels,
  type ModelDomain,
  type ModelSpec,
} from './byok-providers';
export {
  resolveChatModel,
  resolveModelForProvider,
  resolveVisionModel,
  resolveEmbeddingModel,
  derivePlannerModel,
  deriveTitleModel,
  testProviderKey,
  type ChatModelResolution,
  type VisionModelResolution,
  type EmbeddingModelResolution,
} from './model';
export {
  estimateCostUsd,
  dailySpendUsd,
  reservedSpendUsd,
  enforceDailyBudget,
  tryReserveBudget,
  applyBudgetDelta,
  getMonthlySpend,
  getProviderMonthlySpend,
  checkBudgetAlertsAndThresholds,
  DEFAULT_TURN_ESTIMATE_USD,
  BudgetExceededError,
} from './cost';
export {
  generateTitle,
  deterministicFallbackTitle,
  type GenerateTitleArgs,
  type GenerateTitleResult,
} from './title';
export { embedTexts, type EmbedTextsArgs, type EmbedResult } from './embeddings';
export {
  upsertArticles,
  listRecentArticles,
  listUpcomingEvents,
  latestArticleTimestampMs,
  backfillEmbeddings,
  countPendingEmbeddings,
} from './news-persistence';
export { upsertEvents, listFredEventsMissingActual, patchEventActual, parseFredEventId } from './calendar-persistence';
export {
  listThreads,
  getThread,
  createThread,
  updateThreadTitle,
  updateThreadPinnedSymbol,
  deleteThread,
  deleteAllThreads,
  listMessages,
  appendUserMessage,
  appendAssistantMessage,
  forkThread,
  deriveForkedTitle,
  type ForkThreadInput,
  type ForkThreadResult,
  recordTelemetry,
  recordToolTelemetry,
  type DbThread,
  type DbMessage,
  type TelemetryInput,
  type ToolTelemetryInput,
} from './persistence';

// Alerts
export {
  listAlerts,
  listEvaluable,
  getAlert,
  createAlert,
  updateAlert,
  markFired,
  markFiredSnoozed,
  markFiredForAlert,
  isInSnooze,
  deleteAlert,
  type CreateAlertInput,
  type UpdateAlertInput,
} from './alerts/persistence';
export {
  evaluateAlerts,
  decideMatch,
  describeRule,
  type EvaluatorEnv,
  type EvaluationResult,
  type RuleReading,
} from './alerts/evaluator';
export { deliverAlert, sendDirectNotification, type DeliveryResult } from './alerts/delivery';
export {
  simulateAlert,
  type SimCandle,
  type SimFire,
  type SimResult,
} from './alerts/simulate';

// Journal
export {
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  computeRMultiple,
  computeStats,
  summarize,
  type CreateJournalInput,
  type UpdateJournalInput,
} from './journal/persistence';

// Usage
export {
  listTelemetry,
  computeUsage,
  providerIdFromModel,
  type TelemetryRow,
  type UsageStats,
  type ModelBreakdown,
  type ProviderBreakdown,
  type DayBucket,
} from './usage';

// Snapshots (Phase 2)
export {
  computeDailySnapshot,
  previousUtcMidnight,
  type DailySnapshot,
  type ComputeDailySnapshotArgs,
} from './snapshots/compute';
export {
  upsertSnapshot,
  getLatestSnapshot,
  type SnapshotRow,
  type UpsertSnapshotArgs,
} from './snapshots/persistence';

// Briefings (Phase 2)
export {
  emitPreEvent,
  emitPostEvent,
  emitWeeklyReview,
  type BriefingsEnv,
} from './briefings/generate';
export {
  getOrCreateBriefingsThread,
  wasEmitted,
  recordEmitted,
  findHighImpactEventsInWindow,
} from './briefings/persistence';

// Phase 3 — Sharable snapshots
export {
  signShareToken,
  verifyShareToken,
  type ShareTokenPayload,
} from './share/sign';
export {
  createSnapshot,
  getSnapshot,
  getActiveSnapshot,
  type SnapshotRow as ShareSnapshotRow,
  type CreateSnapshotArgs as CreateShareSnapshotArgs,
} from './share/persistence';

// Phase 3 — CFTC CoT
export {
  upsertCoTReport,
  listCoTSamples,
  countCoTRows,
  buildCoTId,
  type UpsertCoTReportArgs,
} from './cot/persistence';

// Phase 3 — Web Push
export {
  listPushSubscriptions,
  savePushSubscription,
  deletePushSubscription,
  deletePushSubscriptionByEndpoint,
  type PushSubscriptionRow,
  type SavePushSubscriptionArgs,
} from './push/persistence';
export { sendWebPush, type SendWebPushResult, type VapidEnv } from './push/send';


// Phase 7a — domain routing + rolling thread summary
export { routeTurn, type RoutingDecision, type RoutingDomain } from './routing';
export { compactThread, type CompactResult } from './memory/thread-summary';

// Phase 7b — memory index
export {
  rememberJournalEntry,
  rememberBriefing,
  rememberThreadSynopsis,
  searchMemory,
  countMemory,
  type MemoryKind,
  type MemoryRow,
} from './memory/memory-index';
export {
  runMemoryQuery,
  memoryRowToItem,
  type RunMemoryQueryArgs,
} from './rag';

// Phase 7c — planner, citation enforcement, tool catalogue
export { runPlanner, type PlanResult, type PlannerEnv } from './planner';
export { enforceCitations } from './verification';
export { buildToolCatalogue, type CatalogueEntry } from './catalogue';

// Langfuse / OpenTelemetry instrumentation
export { initLangfuse, shutdownLangfuse } from './instrumentation';

export { extractRateLimits, type RateLimitData } from './rate-limits';

// STAB-06: Exponential-backoff retry helper.
export { withRetry, type RetryOptions } from './retry';

// Multi-Agent Orchestration
export {
  runMultiAgentChat,
  type RunMultiAgentArgs,
  selectAgents,
  autoDetectMode,
  resolveMode,
  MODE_OPTIONS,
  type ModeMeta,
  type AnalysisMode,
  type ResolvedMode,
  type AgentName,
  type AgentBias,
  type AgentOpinion,
  type SharedContext,
  type MultiAgentResult,
  type ProgressEvent,
  type MultiAgentEnv,
  type ModelTier,
  AGENT_MODEL_TIER,
  MODE_COST_ESTIMATE,
  AGENT_TIMEOUTS,
  buildSharedContext,
  buildSharedSystemPrompt,
  extractUserMessageText,
  saveAgentOpinions,
  listAgentOpinions,
  listMessageOpinions,
  type SaveOpinionsArgs,
  ProgressTracker,
  type AgentProgressPart,
  progressToSSE,
  createMultiAgentStreamResponse,
  BaseAgent,
  TechnicalAgent,
  FundamentalAgent,
  RiskAgent,
  SentimentAgent,
  DecisionAgent,
} from './multi-agent';

// F1 — Decision Signal Tracking + Outcome Evaluation
export {
  extractDecisionSignal,
  type ExtractionContext,
  evaluateSignal,
  candlesToDailyBars,
  createDecisionSignal,
  listSignals,
  getSignal,
  listSignalsNeedingEvaluation,
  recordOutcome,
  recordUnable,
  maybeCloseSignal,
  recordFeedback,
  computeSignalStats,
  evaluatePendingSignals,
  type CronEvaluationResult,
  type DecisionSignalPayload,
  type DailyBar,
  type OutcomeResult,
  type UnableResult,
  type SignalForEvaluation,
} from './decision-signals';

// F5 — Run Diagnostics with Secret Redaction
export {
  withDiagnostics,
  getDiagnosticContext,
  recordStep,
  completeStep,
  recordError,
  exportDiagnosticContext,
  redactSecrets,
  redactString,
  type RunDiagnosticContext,
  type DiagnosticStep,
  type DiagnosticError,
} from './diagnostics';

// F2 — Portfolio Management
export {
  createPosition,
  listOpenPositions,
  listAllPositions,
  getPosition,
  closePosition,
  deletePosition,
  getPortfolioSettings,
  savePortfolioSettings,
  computePnL,
  getOpenPositionsWithPnL,
  getPortfolioRiskReport,
} from './portfolio';

// F3 — Social Sentiment Integration
export {
  SocialSentimentService,
  getSentimentService,
  resetSentimentService,
  type SentimentEnv,
} from './sentiment';

// F4 — Notification Noise Control
export {
  evaluateNoise,
  hashContent,
  isQuietHours,
  InMemoryNoiseState,
  DbNoiseState,
  getNoiseConfig,
  saveNoiseConfig,
  getRouteConfig,
  saveRouteConfig,
  type NoiseState,
} from './notifications';

// F7 — Bot Platform with Commands
export {
  BotDispatcher,
  getBotDispatcher,
  parseCommand,
  createLinkCode,
  resolveLinkCode,
  resolveBotUser,
  unlinkBot,
  getBotLink,
  type BotCommand,
  type BotContext,
  type BotResponse,
  type BotPlatform,
  type ParsedCommand,
} from './bot';
