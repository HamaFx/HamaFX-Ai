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
