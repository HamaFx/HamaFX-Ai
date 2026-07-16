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

// Multi-Agent Orchestration — shared types.
//
// These types are used across the orchestrator, agents, context builder,
// and the streaming layer. Keeping them in one place avoids circular
// imports between agent files and the orchestrator.

import type { LiveSnapshot } from '../prompt/system';
import type { UserSettingsRow } from '@hamafx/db/schema';
import type { UIMessage } from 'ai';

// ── Analysis Modes ──────────────────────────────────────────────────────

export type AnalysisMode = 'single' | 'quick' | 'standard' | 'full' | 'auto';

/** Resolved mode after auto-detection (never 'auto'). */
export type ResolvedMode = 'single' | 'quick' | 'standard' | 'full';

// ── Agent Opinions ──────────────────────────────────────────────────────

export type AgentName = 'technical' | 'fundamental' | 'risk' | 'sentiment' | 'decision';
export type AgentBias = 'bullish' | 'bearish' | 'neutral';

/**
 * Structured opinion returned by a specialist agent.
 * The Decision agent does not produce an AgentOpinion — it produces
 * the final user-facing text directly.
 */
export interface AgentOpinion {
  agentName: AgentName;
  bias: AgentBias;
  confidence: number; // 0.0–1.0
  reasoning: string;
  rawData: Record<string, unknown>; // Full structured JSON output
  costUsd: number;
  latencyMs: number;
  model: string;
}

// ── Shared Context ──────────────────────────────────────────────────────

/**
 * Context shared across all specialist agents in a multi-agent turn.
 * Fetched ONCE by the orchestrator and passed to each agent's `run()`.
 *
 * This avoids redundant tool calls when 4 agents all need the same
 * candle data. Each agent receives the full context but its system
 * prompt tells it to focus only on its dimension.
 */
export interface SharedContext {
  /** Trading symbol, e.g. 'XAUUSD'. */
  symbol: string;
  /** Thread ID for tool context scoping. */
  threadId: string;
  /** User ID for tool context scoping. */
  userId: string;
  /** Live snapshot from buildLiveSnapshot — prices, session, health. */
  snapshot: LiveSnapshot;
  /** User's settings row (for model overrides, custom instructions, etc.). */
  userSettings: UserSettingsRow;
  /** Free-form custom instructions from user settings. */
  customInstructions?: string;
  /** The user's message that triggered this turn. */
  userMessage: UIMessage;
  /** Conversation history (compact, model-ready). */
  history: UIMessage[];
  /** AbortSignal for cancellation / timeout. */
  signal: AbortSignal | null;
  /** Server env slice for model resolution + tool execution. */
  env: MultiAgentEnv;
  /** Q4: Pre-fetched data block (candles, indicators, calendar, news)
   *  fetched once by buildSharedContext so specialists don't each
   *  re-fetch the same datasets. Injected into system prompts. */
  prefetchedData?: string;
}

/**
 * Env slice needed by the multi-agent pipeline.
 * Mirrors the RunChatArgs env but typed separately for clarity.
 */
import type { ServerEnv } from '@hamafx/shared';

export type MultiAgentEnv = Pick<
  ServerEnv,
  | 'AI_GATEWAY_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'GOOGLE_VERTEX_PROJECT'
  | 'GOOGLE_VERTEX_LOCATION'
  | 'GOOGLE_APPLICATION_CREDENTIALS_JSON'
  | 'GOOGLE_APPLICATION_CREDENTIALS'
  | 'AI_DEFAULT_MODEL'
  | 'AI_EMBEDDING_MODEL'
  | 'MAX_DAILY_USD'
  | 'MAX_TOOL_ITERATIONS'
  | 'LOG_PROMPTS'
> & {
  /** PERF-5: max concurrent specialist agents (default 3). */
  MULTI_AGENT_CONCURRENCY?: number;
};

// ── Progress Events (for streaming) ─────────────────────────────────────

export type ProgressEvent =
  | { type: 'specialists_start'; agents: AgentName[] }
  | { type: 'agent_start'; agent: AgentName }
  | { type: 'agent_done'; agent: AgentName; opinion: AgentOpinion }
  | { type: 'agent_error'; agent: AgentName; error: string }
  | { type: 'fusion_start' }
  | { type: 'fusion_done' };

// ── Multi-Agent Result ──────────────────────────────────────────────────

export interface MultiAgentResult {
  /** Decision agent's final response text (streamed to user). */
  finalText: string;
  /** All specialist opinions (for UI + persistence). */
  agentOpinions: AgentOpinion[];
  /** Total cost across all agents in USD. */
  totalCostUsd: number;
  /** Total latency in milliseconds. */
  totalLatencyMs: number;
  /** Resolved mode (never 'auto'). */
  mode: ResolvedMode;
  /** ID of the persisted assistant message (for opinion linking + telemetry). */
  messageId: string;
}

// ── Model Tier ──────────────────────────────────────────────────────────

export type ModelTier = 'fast' | 'mid' | 'strong';

/**
 * Maps agent names to their default model tier.
 * Technical/sentiment use fast (data-heavy, reasoning-light).
 * Fundamental/risk use mid (requires reasoning about relationships).
 * Decision uses strong (fusion requires sophisticated reasoning).
 */
export const AGENT_MODEL_TIER: Record<AgentName, ModelTier> = {
  technical: 'fast',
  fundamental: 'mid',
  risk: 'mid',
  sentiment: 'fast',
  decision: 'strong',
};

// ── Cost Estimates per Mode ─────────────────────────────────────────────

export const MODE_COST_ESTIMATE: Record<ResolvedMode, number> = {
  single: 0.01,
  quick: 0.015,
  standard: 0.025,
  full: 0.04,
};

// ── Agent Timeouts (ms) ─────────────────────────────────────────────────

export const AGENT_TIMEOUTS: Record<AgentName, number> = {
  technical: 15_000,
  fundamental: 15_000,
  risk: 15_000,
  sentiment: 10_000,
  decision: 30_000,
};