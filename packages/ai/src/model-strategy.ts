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

// P1-1 — Extracted from model.ts. Domain-based model routing via
// strategy map (MODEL_ROUTER). OCP-compliant: adding a new domain
// means adding a strategy entry — the dispatch function stays unchanged.
//
// Dependency: model-chat.ts (resolveChatModel, ChatModelResolution).

import type { UserSettingsRow } from '@hamafx/db/schema';
import type { ResolveModelEnv } from './vertex-factory';
import type { ModelDomain } from './byok-providers';
import { resolveChatModel, type ChatModelResolution } from './model-chat';

/**
 * Context passed to each domain routing strategy. */
export interface DomainRoutingContext {
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>;
  env: ResolveModelEnv;
}

/**
 * A strategy that resolves a LanguageModel for a given domain.
 * Each strategy is a self-contained unit that knows how to pick
 * the right model tier for its domain.
 */
export interface DomainRoutingStrategy {
  /** Human-readable description for telemetry / debugging. */
  description: string;
  /** Resolve the model for this domain. */
  resolve: (ctx: DomainRoutingContext) => ChatModelResolution;
}

/**
 * Strategy map — domain → model resolution strategy.
 *
 * Every chat-routable domain has an entry here. Adding a new domain
 * (e.g., `sentiment`) requires adding an entry to this map — the
 * dispatch function remains unchanged (OCP compliance).
 *
 * Each strategy calls `resolveChatModel` with the appropriate
 * domain tier, which lets the BYOK provider system pick the
 * user's preferred model for that capability tier.
 */
export const MODEL_ROUTER: Record<ModelDomain, DomainRoutingStrategy> = {
  fundamental: {
    description: 'Uses the strongest reasoning model — macro/news/catalyst analysis.',
    resolve: (ctx) => resolveChatModel(ctx.userSettings, ctx.env, 'fundamental'),
  },
  technical: {
    description: 'Uses the mid-tier model — chart/indicator/structure analysis.',
    resolve: (ctx) => resolveChatModel(ctx.userSettings, ctx.env, 'technical'),
  },
  summary: {
    description: 'Uses the cheapest/lite model — recaps, summaries, listings.',
    resolve: (ctx) => resolveChatModel(ctx.userSettings, ctx.env, 'summary'),
  },
  vision: {
    description: 'Uses a vision-capable model — image/chart analysis.',
    resolve: (ctx) => resolveChatModel(ctx.userSettings, ctx.env, 'vision'),
  },
  embedding: {
    description: 'Embedding resolution — use resolveEmbeddingModel() instead.',
    resolve: () => {
      throw new Error(
        'MODEL_ROUTER.embedding is not supported. Use resolveEmbeddingModel() for embedding model resolution.',
      );
    },
  },
};

/**
 * Map ModelTier → ModelDomain for the multi-agent system.
 * Replaces the switch statement in base-agent.ts with a lookup map.
 */
export const TIER_TO_DOMAIN: Record<string, ModelDomain> = {
  fast: 'summary' as const,
  mid: 'technical' as const,
  strong: 'fundamental' as const,
};

/**
 * Resolve a model for a given domain using the MODEL_ROUTER strategy map.
 *
 * This is the primary entry point for domain-based model selection.
 * It replaces the previous if/else chain with a strategy map,
 * making the routing open for extension (add a strategy) and closed
 * for modification (don't edit this function).
 *
 * NOTE: This function is named `routeModelByDomain` (not `routeTurn`)
 * to avoid a name collision with `routeTurn` in routing.ts, which
 * classifies user messages into a routing domain. Both names are
 * exported from the model.ts barrel.
 *
 * Throws if the domain has no registered strategy.
 */
export function routeModelByDomain(
  domain: ModelDomain,
  ctx: DomainRoutingContext,
): ChatModelResolution {
  const strategy = MODEL_ROUTER[domain];
  if (!strategy) {
    throw new Error(
      `No model routing strategy registered for domain: "${domain}". ` +
      `Available domains: ${(Object.keys(MODEL_ROUTER) as ModelDomain[]).join(', ')}.`,
    );
  }
  return strategy.resolve(ctx);
}
