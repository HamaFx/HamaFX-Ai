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

// Plain BYOK types — no node:crypto, no `server-only` import. Re-exported
// from `@hamafx/shared/encryption` for backwards compatibility with code
// that already imports them from there.
//
// Keeping the types in their own file lets test files (which run in plain
// Node, not a server-component bundler) reference the provider list
// without tripping the server-only guard.

export const PROVIDER_IDS = [
  'google',
  'anthropic',
  'openai',
  'groq',
  'mistral',
  'openrouter',
  'xai',
  'deepseek',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ByokPayload {
  google?: string;
  anthropic?: string;
  openai?: string;
  groq?: string;
  mistral?: string;
  openrouter?: string;
  xai?: string;
  deepseek?: string;
}

/**
 * Pricing tier for a provider — used by the UI to group free vs paid
 * cards and show appropriate cost hints.
 */
export type ProviderPricingTier = 'free' | 'low' | 'medium' | 'high';

/**
 * Client-safe subset of the runtime `ByokProviderSpec` from
 * `@hamafx/ai`. Stripped of `factory` (function — can't cross the
 * RSC server→client boundary) and `defaultModels` (server-only
 * defaults — only the agent needs them). The server component
 * projects the full spec into this shape before passing props.
 *
 * Keep this in sync with the prop types accepted by client
 * components (ApiKeyCard, OnboardingWizard provider picker).
 */
export interface ProviderMeta {
  id: string;
  displayName: string;
  familyName: string;
  keyHint: string;
  description: string;
  pricingTier: ProviderPricingTier;
}