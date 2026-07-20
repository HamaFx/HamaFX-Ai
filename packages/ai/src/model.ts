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

// Model resolver barrel — split from a monolithic ~762-line module into
// 6 focused sub-modules (architecture-audit P1-1, SRP compliance).
//
//   model-helpers.ts    — pure utilities (PROVIDER_PRIORITY, envFallbackKeys,
//                          supportsPromptCaching, parsePickedModelId)
//   model-chat.ts       — chat model resolution (resolveChatModel,
//                          resolveModelForProvider, derivePlannerModel,
//                          deriveTitleModel)
//   model-strategy.ts   — domain routing strategy map (MODEL_ROUTER,
//                          TIER_TO_DOMAIN, routeModelByDomain)
//   model-vision.ts     — vision model resolution (resolveVisionModel)
//   model-embedding.ts  — embedding model resolution (resolveEmbeddingModel)
//   model-override.ts   — explicit override resolution (resolveOverrideModel)
//
// Pattern: Factory + Strategy. MODEL_ROUTER implements the Strategy
// pattern; resolveChatModel/resolveVisionModel are Factory methods.

// ── Vertex AI factory (separate module since Phase F) ────────────────
export { resolveModel, getVertexGoogleSearchTool, type ResolveModelEnv } from './vertex-factory';

// ── Provider key tester ──────────────────────────────────────────────
export { testProviderKey } from './provider-tester';

// ── BYOK registry re-exports ─────────────────────────────────────────
export {
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
  defaultModelFor,
} from './byok-providers';
export type { ModelDomain, ByokProviderSpec } from './byok-providers';

// ── Helpers (pure utilities) ─────────────────────────────────────────
export {
  PROVIDER_PRIORITY,
  supportsPromptCaching,
} from './model-helpers';
// Note: envFallbackKeys and parsePickedModelId are internal —
// imported directly by sibling resolver modules (model-chat.ts,
// model-vision.ts, etc.) but NOT re-exported from the public barrel.

// ── Chat model resolution ────────────────────────────────────────────
export {
  resolveChatModel,
  resolveModelForProvider,
  derivePlannerModel,
  deriveTitleModel,
} from './model-chat';
export type { ChatModelResolution } from './model-chat';

// ── Strategy map (domain routing) ────────────────────────────────────
export {
  MODEL_ROUTER,
  TIER_TO_DOMAIN,
  routeModelByDomain,
} from './model-strategy';
export type {
  DomainRoutingContext,
  DomainRoutingStrategy,
} from './model-strategy';

// ── Vision model resolution ──────────────────────────────────────────
export { resolveVisionModel } from './model-vision';
export type { VisionModelResolution } from './model-vision';

// ── Embedding model resolution ───────────────────────────────────────
export { resolveEmbeddingModel } from './model-embedding';
export type { EmbeddingModelResolution } from './model-embedding';

// ── Override model resolution ────────────────────────────────────────
export { resolveOverrideModel } from './model-override';
export type { OverrideResolution } from './model-override';
