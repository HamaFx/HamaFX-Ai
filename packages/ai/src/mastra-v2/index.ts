// SPDX-License-Identifier: Apache-2.0

/**
 * Public barrel for the Kestrel Mastra v2 foundation (Phases 0–2).
 *
 * Later phases add: durable execution (Phase 3), streaming agents (Phase 4),
 * guardrails (Phase 5), evals (Phase 6), mutation approvals (Phase 7), and
 * observability unification (Phase 8) — all registered through
 * `./registry.ts` so the capability policy stays the single fail-closed gate.
 */

export {
  createMastraStorage,
  initializeMastraStorage,
  mastraDirectConnectionString,
  mastraSslOptions,
  pruneMastraStorage,
  type MastraStorageKind,
  type MastraStorageResult,
} from './storage';
export {
  MastraPinoLogger,
  createRunLogger,
  logWorkflowEnd,
  logWorkflowError,
  logWorkflowStart,
  type RunStepLogIdentity,
  type WorkflowStepLogArgs,
} from './logger';
export {
  createMastraObservability,
  flushMastraObservability,
  isLangfuseConfigured,
  langfuseBaseUrl,
  langfuseSamplingRatio,
  langfuseTraceUrl,
  mastraTraceTags,
  runTracingOptions,
  shutdownMastraObservability,
  type MastraRunTraceIdentity,
} from './telemetry';
export {
  createKestrelMastra,
  getKestrelMastra,
  initializeKestrelMastra,
  _resetKestrelMastra,
  _setKestrelMastraForTest,
  MASTRA_DEFAULT_HOST,
  MASTRA_DEFAULT_PORT,
  type KestrelMastra,
  type KestrelMastraOptions,
} from './instance';
export {
  MASTRA_WORKFLOW_IDS,
  providerFromModel,
  summarizeWorkflowRunState,
  toMastraRunView,
  workflowIdForKind,
  type MastraRunScoreView,
  type MastraRunView,
  type RunTelemetryRow,
  type WorkflowRunStatusView,
} from './observability-view';
export {
  createKestrelEmbedder,
  createKestrelMemory,
  createKestrelVectorStore,
  getKestrelVectorStore,
  kestrelMemoryOptions,
  _resetKestrelVectorStore,
  KESTREL_MEMORY_LAST_MESSAGES,
  KESTREL_MEMORY_SEMANTIC_TOP_K,
  KESTREL_WORKING_MEMORY_TEMPLATE,
  type CreateKestrelMemoryArgs,
  type KestrelEmbedderArgs,
} from './memory';
export {
  backfillThreadHistoryIfNeeded,
  memoryCallOptions,
  prepareKestrelMemory,
  seedWorkingMemoryFromSettings,
  type MemoryCallOptionsArgs,
  type PrepareKestrelMemoryArgs,
  type PreparedKestrelMemory,
  type WorkingMemorySeedArgs,
} from './context';
export { tryWorkflowClaimLock } from './advisory-lock';
export {
  assertMastraRegistryComplete,
  mastraRegistrationFor,
  resolveMastraAgent,
  resolveMastraWorkflow,
  MASTRA_COMPONENT_REGISTRY,
  MastraComponentKindMismatchError,
  MastraComponentNotRegisteredError,
  type MastraComponentRegistration,
  type MastraCapabilityRegistrationId,
} from './registry';
export {
  buildConversationGuardrails,
  buildGuardrailInputProcessors,
  buildResearchGuardrails,
  type GuardrailOptions,
  type GuardrailStrategy,
} from './guardrails';
export {
  buildConversationScorers,
  buildCustomScorers,
  buildPrebuiltScorers,
  buildResearchScorers,
  createDeterministicScorer,
  resolveJudgeModel,
  PREBUILT_SCORER_IDS,
  type BuiltScorers,
  type BuildScorersOptions,
  type ScorerId,
  type ScorerSampling,
} from './evals/scorers';
export {
  createCitationScorer,
  createGroundingScorer,
  CUSTOM_SCORER_IDS,
  type CitationScorerRunInput,
  type GroundingScorerRunInput,
} from './evals/custom';
export {
  createMastraEvalGate,
  createScoreThresholdGate,
  recordsToGateObserved,
  type MastraGateScoreInput,
} from './evals/gate';
export {
  listScoresForRun,
  toScoreRecord,
  type ScoreRecord,
} from './evals/scores';
export {
  loadLegacyEvalCases,
  migrateLegacyEvalCasesToDatasets,
  runDatasetExperiment,
  DATASET_IDS,
  DATASET_LABELS,
  type DatasetExperimentSummary,
  type DatasetMigrationSummary,
  type EvalDatasetId,
  type RunDatasetExperimentOptions,
} from './evals/datasets';
export {
  createSymbolResearchWorkflow,
  MastraModeStrictFailureError,
  MastraAnalysisModeSchema,
  MastraModeOpinionSchema,
  MastraSpecialistNameSchema,
  REQUEST_CONTEXT_SCHEMA,
  SPECIALISTS_BY_MODE,
  SymbolResearchWorkflowInputSchema,
  SymbolResearchWorkflowOutputSchema,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type MastraSpecialistName,
  type SymbolResearchWorkflowDeps,
} from './workflows/symbol-research';
export {
  createXauusdReportWorkflow,
  XauusdReportWorkflowInputSchema,
  XauusdReportWorkflowOutputSchema,
  type XauusdReportWorkflowDeps,
} from './workflows/xauusd-report';
export {
  createMutationWorkflow,
  runMutationWorkflow,
  MutationInputSchema,
  MutationKindSchema,
  MutationOutputSchema,
  MutationResumeSchema,
  MutationSuspendPayloadSchema,
  type MutationExecutor,
  type MutationExecutorResult,
  type MutationInput,
  type MutationKind,
  type MutationOutput,
  type MutationResumeInput,
  type MutationSuspendPayload,
  type MutationWorkflowDeps,
  type RunMutationResult,
} from './workflows/mutation';
