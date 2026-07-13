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

// U3 — Semantic routing via cheap LLM classification.
//
// The keyword-based routeTurn() in routing.ts is fast and deterministic,
// but misses paraphrased questions ("Is gold going up because of the
// Fed?" → fundamental keywords don't match). This module adds an optional
// AI classifier that runs BEFORE keyword scoring, using the same
// summary-tier model as the planner (~$0.0001 per call).
//
// Design:
//   - classifyTurnLLM() calls the planner model with structured JSON output
//   - Feature-flagged via env AI_SEMANTIC_ROUTING_ENABLED
//   - 2-second timeout → falls back to keyword scoring
//   - In-memory LRU cache for identical messages (60s TTL)
//   - Confidence threshold of 0.7 → borderline classifications use keyword fallback

import { generateObject } from 'ai';
import { z } from 'zod';
import { resolveModel, type ResolveModelEnv } from './model';

const ClassificationSchema = z.object({
  domain: z.enum(['fundamental', 'technical', 'summary', 'vision', 'generic']),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(200),
});

export type SemanticRoutingDomain = z.infer<typeof ClassificationSchema>['domain'];

export interface SemanticClassification {
  domain: SemanticRoutingDomain;
  confidence: number;
  /** Human-readable rationale for telemetry / debugging. */
  rationale: string;
}

/** A model id string resolvable by the AI SDK (e.g. "google-vertex/gemini-2.5-flash-lite"). */
type ModelIdString = string;

/** Classification cache entry — purged after TTL. */
interface CacheEntry {
  result: SemanticClassification;
  at: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds
const CACHE_MAX_ENTRIES = 200;

const _classifiedCache = new Map<string, CacheEntry>();

function cacheGet(key: string): SemanticClassification | null {
  const entry = _classifiedCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    _classifiedCache.delete(key);
    return null;
  }
  return entry.result;
}

function cacheSet(key: string, result: SemanticClassification): void {
  if (_classifiedCache.size >= CACHE_MAX_ENTRIES) {
    // Evict oldest entry (simple LRU — Map iteration order is insertion order).
    const first = _classifiedCache.keys().next().value;
    if (first !== undefined) _classifiedCache.delete(first);
  }
  _classifiedCache.set(key, { result, at: Date.now() });
}

/**
 * Classify a user message into a routing domain using a cheap LLM call.
 *
 * Returns null when:
 *   - The LLM call fails (network, timeout, auth, etc.)
 *   - The output doesn't validate against the schema
 *   - Confidence is below the threshold
 *
 * The caller should fall back to keyword scoring on null.
 */
export async function classifyTurnLLM(
  userText: string,
  modelId: ModelIdString,
  env: ResolveModelEnv,
  signal?: AbortSignal | null,
): Promise<SemanticClassification | null> {
  const cacheKey = `${modelId}:${userText.slice(0, 200)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // 2-second timeout — the call should take <500ms with a flash-lite
  // model, so 2s is generous. Falls back to keyword scoring on timeout.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const model = resolveModel(modelId, env);
    // Guard: resolveModel returns string in gateway mode, but generateObject
    // requires a LanguageModel instance. Fall back on string-return.
    if (typeof model === 'string') return null;

    const result = await generateObject({
      model,
      schema: ClassificationSchema,
      system: `Classify a forex trading question into exactly one domain. Respond with JSON only.

DOMAINS:
- fundamental: macro, Fed, CPI, NFP, geopolitics, yields, "why" questions
- technical: charts, RSI, MACD, support/resistance, candles, indicators, levels
- summary: news recap, calendar, "what's on today", journal stats, "list X"
- vision: the user attached an image/chart screenshot (not applicable here)
- generic: greetings, vague questions, anything that doesn't fit the above

EXAMPLES:
"Why is gold rallying after FOMC?" → fundamental, confidence=0.95
"What's the RSI on EURUSD 1h?" → technical, confidence=0.95
"Summarize today's news" → summary, confidence=0.95
"hi" → generic, confidence=0.95
"Should I buy gold here with stop at 2620?" → technical, confidence=0.80`,
      prompt: `Classify this question: "${userText}"`,
      maxOutputTokens: 30,
      abortSignal: controller.signal,
    });

    const classification: SemanticClassification = {
      domain: result.object.domain,
      confidence: result.object.confidence,
      rationale: result.object.rationale,
    };

    if (classification.confidence >= 0.7) {
      cacheSet(cacheKey, classification);
      return classification;
    }
    return null;
  } catch {
    // Any failure → null (caller falls back to keyword scoring).
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
