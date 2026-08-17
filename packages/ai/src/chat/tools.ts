/**
 * Copyright 2026 Kestrel
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

// P0-2 — Extracted from agent.ts. Resolves the active tool menu for a turn:
// domain filter → plan-tier gating → non-essential trimming → Vertex Google
// Search grounding (fundamental domain only). Keeps agent.ts free of tool
// wiring so the registry + by-domain policy stay the single source of truth.

import type { Tool } from 'ai';

import { getVertexGoogleSearchTool, type ResolveModelEnv } from '../model';
import { domainToolFilter, type RoutingDomain } from '../tools/by-domain';

export interface ResolveActiveToolsArgs {
  routingDomain: RoutingDomain;
  userPlanTier: string | undefined;
  nonEssentialDisabled: boolean;
  env: ResolveModelEnv;
  userId: string;
}

export function resolveActiveTools(args: ResolveActiveToolsArgs): Record<string, Tool> {
  const { routingDomain, userPlanTier, nonEssentialDisabled, env, userId } = args;

  const activeTools = domainToolFilter(routingDomain, userPlanTier) as Record<string, Tool>;

  // Budget-degraded turns drop the expensive committee/backtest tools.
  if (nonEssentialDisabled) {
    delete activeTools.convene_committee;
    delete activeTools.replay_setup;
  }

  // Fundamental turns on a Vertex deployment gain Google Search grounding.
  if (routingDomain === 'fundamental' && env.GOOGLE_VERTEX_PROJECT) {
    return { ...activeTools, googleSearch: getVertexGoogleSearchTool(env, userId) };
  }

  return activeTools;
}
