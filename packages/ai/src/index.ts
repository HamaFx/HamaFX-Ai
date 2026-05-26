// Public barrel for @hamafx/ai. The route handler imports from here.

export { runChat, type RunChatArgs } from './agent';
export { tools, type ToolRegistry } from './tools';
export { buildSystemPrompt, type LiveSnapshot } from './prompt/system';
export { buildLiveSnapshot } from './context';
export {
  estimateCostUsd,
  dailySpendUsd,
  enforceDailyBudget,
  BudgetExceededError,
} from './cost';
export { embedTexts, type EmbedTextsArgs, type EmbedResult } from './embeddings';
export {
  upsertArticles,
  listRecentArticles,
  listUpcomingEvents,
  backfillEmbeddings,
  countPendingEmbeddings,
} from './news-persistence';
export { upsertEvents } from './calendar-persistence';
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
  type DbThread,
  type DbMessage,
  type TelemetryInput,
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
