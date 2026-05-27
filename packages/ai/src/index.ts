// Public barrel for @hamafx/ai. The route handler imports from here.

export { runChat, type RunChatArgs } from './agent';
export { tools, type ToolRegistry } from './tools';
export { buildSystemPrompt, type LiveSnapshot } from './prompt/system';
export { buildLiveSnapshot } from './context';
export { estimateCostUsd, dailySpendUsd, enforceDailyBudget, BudgetExceededError } from './cost';
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
  backfillEmbeddings,
  countPendingEmbeddings,
} from './news-persistence';
export { upsertEvents, listFredEventsMissingActual, patchEventActual, parseFredEventId } from './calendar-persistence';
export {
  listThreads,
  getThread,
  createThread,
  updateThreadTitle,
  deleteThread,
  listMessages,
  appendUserMessage,
  appendAssistantMessage,
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
export { deliverAlert, type DeliveryResult } from './alerts/delivery';

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
  type TelemetryRow,
  type UsageStats,
  type ModelBreakdown,
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

// Auto-Journal (Phase 2)
export { parseJournalShortcut, type JournalShortcut } from './journal/auto-parse';

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
