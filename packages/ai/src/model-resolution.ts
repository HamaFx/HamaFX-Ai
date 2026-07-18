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

// Model resolution helpers — extracted from agent.ts (MT-2).
//
// These are shared between the single-agent retry loop in agent.ts and
// the multi-agent orchestrator. Keeping them here avoids duplication
// and makes the fallback chain logic independently testable.

import type { ModelDomain } from './model';
import type { RoutingDomain } from './routing';
import type { ProviderId } from '@hamafx/shared/encryption';
import { decryptByok } from '@hamafx/shared/encryption';
import { BYOK_PROVIDERS } from './byok-providers';

// ---------------------------------------------------------------------------
// P2-6 — Domain-to-model-tier mapping.
//
// Maps a routing domain to the corresponding ModelDomain tier.
// 'generic' has no specific tier → falls back to 'technical'.
// ---------------------------------------------------------------------------

export function toModelDomain(domain: RoutingDomain): ModelDomain {
  return domain === 'generic' ? 'technical' : domain;
}

// ---------------------------------------------------------------------------
// P2-8 — Shared fallback provider walker.
//
// Walks the user's aiFallbackChain past the current provider, returns
// the first subsequent provider with a usable key. Picks the
// domain-appropriate model tier (fundamental→pro, summary→cheap, etc.)
// instead of always defaulting to 'technical'.
// ---------------------------------------------------------------------------

export function pickNextFallbackProvider(
  chain: string[],
  currentProviderId: ProviderId | string | undefined,
  decryptedByokKeys: ReturnType<typeof decryptByok> | null,
  envGoogleKey: string | undefined,
  routingDomain: RoutingDomain,
): { providerId: ProviderId; modelId: string | null } | null {
  const currentProvider: ProviderId | string = currentProviderId || 'google';
  const idx = chain.indexOf(currentProvider);
  const startIdx = idx === -1 ? -1 : idx;

  for (let i = startIdx + 1; i < chain.length; i++) {
    const pid = chain[i] as ProviderId;
    const key = decryptedByokKeys?.[pid] || (pid === 'google' ? envGoogleKey : undefined);

    if (typeof key === 'string' && key.trim().length > 0) {
      const spec = BYOK_PROVIDERS[pid];
      // Pick the domain-appropriate tier — not always 'technical'.
      const tier = toModelDomain(routingDomain);
      const modelId = spec?.defaultModels[tier] ?? spec?.defaultModels.technical ?? null;
      return { providerId: pid, modelId };
    }
  }
  return null;
}
