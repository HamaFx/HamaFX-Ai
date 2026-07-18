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

// Shared helpers for BYOK provider definitions. Imported by individual provider
// spec files to keep them focused on data declarations.

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ByokProviderSpec, ModelDomain } from './types';

/** Full capability set — vision + tools + jsonMode + streaming. */
export const CAPS_FULL = {
  vision: true,
  tools: true,
  jsonMode: true,
  streaming: true,
} as const;

/** Text-only capability set — tools + jsonMode + streaming (no vision). */
export const CAPS_TEXT = {
  tools: true,
  jsonMode: true,
  streaming: true,
} as const;

/** Shared factory for OpenAI-compatible chat APIs. */
export function openaiCompatibleFactory(
  name: string,
  baseURL: string,
  headers?: Record<string, string>,
): ByokProviderSpec['factory'] {
  return (apiKey) => {
    const provider = createOpenAICompatible({
      name,
      apiKey,
      baseURL,
      ...(headers ? { headers } : {}),
    });
    return (modelId) => provider(modelId);
  };
}

/**
 * Validate and freeze a provider spec. Throws at module load if
 * defaultModels point at unknown catalog entries — catches drift
 * before a user hits a 404 at runtime.
 */
export function defineProvider(spec: ByokProviderSpec): ByokProviderSpec {
  const catalog = new Set(spec.models.map((m) => m.modelId));
  for (const [domain, modelId] of Object.entries(spec.defaultModels) as Array<
    [ModelDomain, string | null]
  >) {
    if (modelId == null) continue;
    if (!catalog.has(modelId)) {
      throw new Error(
        `BYOK provider "${spec.id}": defaultModels.${domain}="${modelId}" is not in models[]`,
      );
    }
  }
  if (spec.supports.vision && !spec.defaultModels.vision) {
    throw new Error(
      `BYOK provider "${spec.id}": supports.vision=true but defaultModels.vision is null`,
    );
  }
  if (spec.supports.embedding && !spec.defaultModels.embedding) {
    throw new Error(
      `BYOK provider "${spec.id}": supports.embedding=true but defaultModels.embedding is null`,
    );
  }
  if (spec.defaultModels.vision) {
    const m = spec.models.find((x) => x.modelId === spec.defaultModels.vision);
    if (m && m.capabilities && m.capabilities.vision === false) {
      throw new Error(
        `BYOK provider "${spec.id}": default vision model "${spec.defaultModels.vision}" is not vision-capable`,
      );
    }
  }
  return spec;
}
