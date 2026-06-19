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

// UI-only message parts (Phase 7c).
//
// These parts are produced server-side and persisted into a message's
// `parts` JSON, then rendered by the chat surface alongside text and
// tool parts. They are NOT part of the AI SDK's tool-call vocabulary —
// they're sentinel objects we emit ourselves so the chat experience can
// show planner output, citation warnings, and verification warnings
// inline without piggy-backing on a tool slot.
//
// `type` strings are namespaced with `data-` to avoid colliding with
// AI-SDK part types (`text`, `tool-*`, `file`, `reasoning`, etc.).
//
// Source of truth: packages/ai/src/planner.ts and the post-finish
// citation enforcer in packages/ai/src/agent.ts.

import { z } from 'zod';

import { TOOL_NAMES } from '../ai/tool-names';
import { SymbolSchema } from '../symbols';

// ---------------------------------------------------------------------------
// data-plan — collapsible "Thinking" UI part
// ---------------------------------------------------------------------------

export const PlanDomainSchema = z.enum([
  'fundamental',
  'technical',
  'summary',
  'vision',
  'generic',
]);
export type PlanDomain = z.infer<typeof PlanDomainSchema>;

export const UserPlanPartSchema = z.object({
  type: z.literal('data-plan'),
  domain: PlanDomainSchema,
  /** Ordered list of steps the planner expects to take. 0 means skipped. */
  steps: z.array(z.string()).max(8),
  /** Tool names the planner expects to invoke; informational only. */
  expectedTools: z.array(z.string()).max(8),
  /** One-line rationale captured for telemetry / debugging. */
  rationale: z.string(),
  /** Model id that produced this plan (empty when fallback). */
  modelId: z.string(),
  createdAt: z.number().int(),
});
export type UserPlanPart = z.infer<typeof UserPlanPartSchema>;

// ---------------------------------------------------------------------------
// data-citation-warning — emitted by the post-finish citation enforcer
// ---------------------------------------------------------------------------

export const CitationWarningPartSchema = z.object({
  type: z.literal('data-citation-warning'),
  /**
   * Phrases extracted from the assistant text that look like factual
   * claims (price tokens, event names, sentiment counts, etc.) but
   * weren't backed by a tool call in the same turn.
   */
  unsupportedClaims: z.array(z.string()).max(8),
  /** Tool names invoked during the turn — for quick context. */
  toolsInvoked: z.array(z.string()).max(20),
  /**
   * Stance: 'soft' renders as a tone-muted footer pill; 'strict' renders
   * as a tone-warning row. The enforcer always emits 'soft' today.
   */
  stance: z.enum(['soft', 'strict']),
  createdAt: z.number().int(),
});
export type CitationWarningPart = z.infer<typeof CitationWarningPartSchema>;

// ---------------------------------------------------------------------------
// data-verify-warning — emitted by the agent when verify_call disagreed
// ---------------------------------------------------------------------------

export const VerifyWarningPartSchema = z.object({
  type: z.literal('data-verify-warning'),
  symbol: SymbolSchema,
  side: z.enum(['long', 'short']),
  caveats: z.array(z.string()).max(6),
  createdAt: z.number().int(),
});
export type VerifyWarningPart = z.infer<typeof VerifyWarningPartSchema>;

// ---------------------------------------------------------------------------
// data-committee-report — emitted by the convene_committee tool
// ---------------------------------------------------------------------------

export const CommitteeVerdictSchema = z.object({
  persona: z.enum(['economist', 'technician', 'risk_manager']),
  verdict: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().min(1).max(10),
  keyPoints: z.array(z.string()).max(5),
  risk: z.string(),
  recommendation: z.string(),
  sources: z.array(z.string()).max(5).optional(),
});
export type CommitteeVerdict = z.infer<typeof CommitteeVerdictSchema>;

export const CommitteeReportPartSchema = z.object({
  type: z.literal('data-committee-report'),
  symbol: SymbolSchema,
  side: z.enum(['long', 'short']),
  entry: z.number(),
  stop: z.number().optional(),
  verdicts: z.array(CommitteeVerdictSchema).length(3),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  goNoGo: z.enum(['go', 'caution', 'no-go']),
  consensus: z.string(),
  createdAt: z.number().int(),
});
export type CommitteeReportPart = z.infer<typeof CommitteeReportPartSchema>;

// ---------------------------------------------------------------------------
// Union for the chat-surface dispatcher
// ---------------------------------------------------------------------------

export const UiPartSchema = z.discriminatedUnion('type', [
  UserPlanPartSchema,
  CitationWarningPartSchema,
  VerifyWarningPartSchema,
  CommitteeReportPartSchema,
]);
export type UiPart = z.infer<typeof UiPartSchema>;

void TOOL_NAMES; // re-exported elsewhere; this import keeps types coupled
