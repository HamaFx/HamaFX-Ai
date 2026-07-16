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

// Public barrel for the multi-agent orchestration module.

export { runMultiAgentChat, type RunMultiAgentArgs } from './orchestrator';
export { selectAgents, autoDetectMode, resolveMode, MODE_OPTIONS, type ModeMeta } from './modes';
export type { AnalysisMode, ResolvedMode, AgentName, AgentBias, AgentOpinion, SharedContext, MultiAgentResult, ProgressEvent, MultiAgentEnv, ModelTier } from './types';
export { AGENT_MODEL_TIER, MODE_COST_ESTIMATE, AGENT_TIMEOUTS } from './types';
export { buildSharedContext, buildSharedSystemPrompt, extractUserMessageText } from './context';
export { saveAgentOpinions, listAgentOpinions, listMessageOpinions, type SaveOpinionsArgs } from './persistence';
export { ProgressTracker, type AgentProgressPart, progressToSSE } from './stream';
export { BaseAgent } from './agents/base-agent';
export { TechnicalAgent } from './agents/technical-agent';
export { FundamentalAgent } from './agents/fundamental-agent';
export { RiskAgent } from './agents/risk-agent';
export { SentimentAgent } from './agents/sentiment-agent';
export { DecisionAgent } from './agents/decision-agent';