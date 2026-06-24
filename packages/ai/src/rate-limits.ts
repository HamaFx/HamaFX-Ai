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

export interface RateLimitData {
  remainingRequests?: number | undefined;
  remainingTokens?: number | undefined;
  resetRequests?: string | undefined;
  resetTokens?: string | undefined;
}

/**
 * Extracts standard rate limit header values (OpenAI, Anthropic, Groq)
 * in a case-insensitive manner.
 */
export function extractRateLimits(headers?: Record<string, string>): RateLimitData | undefined {
  if (!headers) return undefined;

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }

  let remainingRequests: number | undefined;
  let remainingTokens: number | undefined;
  let resetRequests: string | undefined;
  let resetTokens: string | undefined;

  // OpenAI & Groq
  if (normalized['x-ratelimit-remaining-requests'] !== undefined) {
    remainingRequests = parseInt(normalized['x-ratelimit-remaining-requests'], 10);
  }
  if (normalized['x-ratelimit-remaining-tokens'] !== undefined) {
    remainingTokens = parseInt(normalized['x-ratelimit-remaining-tokens'], 10);
  }
  if (normalized['x-ratelimit-reset-requests'] !== undefined) {
    resetRequests = normalized['x-ratelimit-reset-requests'];
  }
  if (normalized['x-ratelimit-reset-tokens'] !== undefined) {
    resetTokens = normalized['x-ratelimit-reset-tokens'];
  }

  // Anthropic
  if (normalized['anthropic-ratelimit-requests-remaining'] !== undefined) {
    remainingRequests = parseInt(normalized['anthropic-ratelimit-requests-remaining'], 10);
  }
  if (normalized['anthropic-ratelimit-tokens-remaining'] !== undefined) {
    remainingTokens = parseInt(normalized['anthropic-ratelimit-tokens-remaining'], 10);
  }
  if (normalized['anthropic-ratelimit-requests-reset'] !== undefined) {
    resetRequests = normalized['anthropic-ratelimit-requests-reset'];
  }
  if (normalized['anthropic-ratelimit-tokens-reset'] !== undefined) {
    resetTokens = normalized['anthropic-ratelimit-tokens-reset'];
  }

  if (
    remainingRequests === undefined &&
    remainingTokens === undefined &&
    resetRequests === undefined &&
    resetTokens === undefined
  ) {
    return undefined;
  }

  return {
    remainingRequests: remainingRequests !== undefined && !isNaN(remainingRequests) ? remainingRequests : undefined,
    remainingTokens: remainingTokens !== undefined && !isNaN(remainingTokens) ? remainingTokens : undefined,
    resetRequests,
    resetTokens,
  };
}
