// SPDX-License-Identifier: Apache-2.0

// Compatibility barrel: mode classification and historical opinion persistence
// remain available to existing UI/admin surfaces. Agent orchestration itself
// is implemented under packages/ai/src/mastra.

export {
  selectAgents,
  autoDetectMode,
  resolveMode,
  MODE_OPTIONS,
  type ModeMeta,
  type AnalysisMode,
  type ResolvedMode,
} from './modes';
export {
  saveAgentOpinions,
  listAgentOpinions,
  listMessageOpinions,
  type SaveOpinionsArgs,
} from './persistence';
