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

// SRP: Provider key testing (extracted from model.ts).
//
// Tests the validity of a provider API key by making an actual LLM call.
// Separated from model resolution so it can be unit-tested and imported
// without pulling in all of model.ts.

import { generateText } from 'ai';
import type { ProviderId } from '@hamafx/shared/encryption';
import { BYOK_PROVIDERS } from './byok-providers';
import { extractRateLimits } from './rate-limits';
import { noteLlmRateLimit } from './llm-throttle';
import { isCircuitOpen } from './model-circuit-breaker';
import { telemetryConfig } from './telemetry';

/**
 * Strip a verbose AI SDK error down to the user-facing sentence.
 */
function extractErrorMessage(raw: string): string {
  const firstLine = raw.split('\n')[0]?.trim() ?? raw;
  return firstLine.replace(/\.+$/, '').slice(0, 160);
}

/**
 * Test the validity of a provider API key by instantiating a tiny request.
 * Returns null on success, an error message on failure.
 *
 * Used by the /api/settings/test-provider route to give the user feedback
 * without doing a full chat turn.
 */
export async function testProviderKey(
  providerId: ProviderId,
  apiKey: string,
): Promise<{ ok: true; rateLimit?: unknown } | { ok: false; error: string }> {
  const spec = BYOK_PROVIDERS[providerId];
  if (!spec) return { ok: false, error: `Unknown provider: ${providerId}` };

  // Length floor depends on the key shape.
  const minLen = providerId === 'vertex' ? 256 : 8;
  if (!apiKey || apiKey.length < minLen) {
    if (providerId === 'vertex') {
      return {
        ok: false,
        error: 'Vertex service-account JSON looks too short. Did you paste the whole file?',
      };
    }
    return { ok: false, error: 'API key is too short' };
  }

  // Provider-specific shape validation BEFORE we call factory().
  if (providerId === 'vertex') {
    try {
      const obj = JSON.parse(apiKey) as Record<string, unknown>;
      if (typeof obj.client_email !== 'string') {
        return { ok: false, error: 'Service account JSON is missing client_email' };
      }
      if (typeof obj.private_key !== 'string') {
        return { ok: false, error: 'Service account JSON is missing private_key' };
      }
      if (!obj.client_email.includes('@')) {
        return { ok: false, error: 'Service account JSON client_email is not an email' };
      }
      if (!obj.private_key.includes('BEGIN PRIVATE KEY')) {
        return { ok: false, error: 'Service account private_key is not a PEM key' };
      }
      if (!process.env.GOOGLE_VERTEX_PROJECT && typeof obj.project_id !== 'string') {
        return {
          ok: false,
          error:
            'Set GOOGLE_VERTEX_PROJECT env or include project_id in the service-account JSON',
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: `Service account JSON could not be parsed: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  }

  try {
    const builder = spec.factory(apiKey);
    const modelId = spec.defaultModels.fundamental;
    const model = builder(modelId);
    const result = await generateText({
      model,
      prompt: 'ping',
      maxOutputTokens: 1,
      ...telemetryConfig(),
      abortSignal: AbortSignal.timeout(5_000),
    });
    const rateLimit = extractRateLimits(result.response?.headers);
    if (rateLimit) noteLlmRateLimit(providerId, rateLimit);
    return { ok: true, rateLimit };
  } catch (err) {
    const message =
      err instanceof Error
        ? (err as { statusCode?: number; responseBody?: string }).statusCode !== undefined
          ? `HTTP ${(err as { statusCode?: number }).statusCode} — ${extractErrorMessage(err.message)}`
          : extractErrorMessage(err.message)
        : String(err);
    return { ok: false, error: message };
  }
}
