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

// F4 — Context-window-aware token estimation.
//
// Before calling streamText, estimate the total token count of the
// conversation (system prompt + history messages) and compare against
// the resolved model's known context window. If the estimate exceeds
// 80% of the window, prepend a warning system note so the model can
// adapt. If it exceeds 95%, truncate older messages to stay within
// the window.
//
// Token estimation is a heuristic (4 chars ≈ 1 token for English)
// because we can't run a real tokenizer at runtime. The estimate is
// intentionally conservative (over-estimates) so we warn early.

/** Upper-bound token estimates for common models. */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Google Gemini — 1M token context (flash) / 2M (pro)
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.5-flash-lite': 1_000_000,
  'gemini-2.5-pro': 2_000_000,
  'gemini-3.5-flash': 1_000_000,
  // Anthropic Claude — 200K
  'claude-sonnet-4': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-sonnet-5': 200_000,
  'claude-opus-4-8': 200_000,
  'claude-fable-5': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-3.7-sonnet': 200_000,
  // OpenAI — 128K (GPT-4), 200K (GPT-4.1)
  'gpt-4o': 128_000,
  'gpt-4.1': 1_000_000,
  'gpt-4.1-mini': 1_000_000,
  'gpt-5.6-sol': 128_000,
  'gpt-5.6-terra': 128_000,
  'gpt-5.6-luna': 128_000,
  // xAI Grok
  'grok-4.5': 1_000_000,
  'grok-4.3': 128_000,
  // DeepSeek
  'deepseek-v4-pro': 128_000,
  'deepseek-v4-flash': 128_000,
};

/** Characters-per-token heuristic for English text. Conservative (lower = more tokens estimated). */
const CHARS_PER_TOKEN = 3.5;

/** Warn when estimate exceeds this fraction of the context window. */
const WARN_THRESHOLD = 0.8;

/** Truncate when estimate exceeds this fraction. */
const TRUNCATE_THRESHOLD = 0.95;

export interface TokenEstimateResult {
  /** Estimated total tokens (system + all messages). */
  estimatedTokens: number;
  /** Known context limit for this model, or null if unknown. */
  contextLimit: number | null;
  /** True when estimate exceeds 80% of known limit. */
  shouldWarn: boolean;
  /** True when estimate exceeds 95% of known limit. */
  shouldTruncate: boolean;
  /** Human-readable warning string, or null. */
  warningNote: string | null;
  /** Suggested number of messages to keep (only set when shouldTruncate). */
  suggestedKeepCount: number | null;
}

/**
 * Estimate token count for a conversation and compare against the
 * model's known context window. Returns structured guidance for the
 * caller (warn note, truncation suggestion).
 *
 * @param modelId - The resolved model id (e.g. "google/gemini-2.5-flash")
 * @param systemPrompt - The full system prompt string
 * @param messageCount - Number of conversational messages
 * @param totalChars - Sum of all message content lengths + system prompt
 */
export function estimateContextUsage(
  modelId: string,
  systemPromptChars: number,
  messageCount: number,
  totalContentChars: number,
): TokenEstimateResult {
  const estimatedTokens = Math.ceil(
    (systemPromptChars + totalContentChars) / CHARS_PER_TOKEN,
  );

  // Extract the bare model name from the qualified id.
  const bareModel = extractBareModel(modelId);
  const contextLimit = bareModel
    ? (MODEL_CONTEXT_LIMITS[bareModel] ?? null)
    : null;

  if (!contextLimit) {
    // Unknown model — can't estimate. Return safe defaults.
    return {
      estimatedTokens,
      contextLimit: null,
      shouldWarn: estimatedTokens > 100_000,
      shouldTruncate: estimatedTokens > 500_000,
      warningNote: estimatedTokens > 100_000
        ? `⚠️ This conversation is large (~${Math.round(estimatedTokens / 1000)}K tokens). Responses may be truncated.`
        : null,
      suggestedKeepCount: null,
    };
  }

  const ratio = estimatedTokens / contextLimit;
  const shouldWarn = ratio > WARN_THRESHOLD;
  const shouldTruncate = ratio > TRUNCATE_THRESHOLD;

  let warningNote: string | null = null;
  let suggestedKeepCount: number | null = null;

  if (shouldTruncate) {
    // Suggest keeping ~70% of messages to fit within window.
    const keepRatio = TRUNCATE_THRESHOLD / ratio;
    suggestedKeepCount = Math.max(4, Math.floor(messageCount * keepRatio));
    warningNote =
      `⚠️ Conversation history exceeds model context window (~${Math.round(estimatedTokens / 1000)}K / ${Math.round(contextLimit / 1000)}K tokens). ` +
      `Older messages have been trimmed. Consider starting a new thread for optimal performance.`;
  } else if (shouldWarn) {
    warningNote =
      `⚠️ Conversation is approaching the model's context limit (~${Math.round(estimatedTokens / 1000)}K / ${Math.round(contextLimit / 1000)}K tokens). ` +
      `Responses may become less detailed. Consider starting a new thread soon.`;
  }

  return {
    estimatedTokens,
    contextLimit,
    shouldWarn,
    shouldTruncate,
    warningNote,
    suggestedKeepCount,
  };
}

/**
 * Quick token estimate for a string. Use for per-message estimation.
 * Conservative: assumes ~3.5 chars per token (most English is ~4).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Extract the bare model name from a qualified model id.
 * "google/gemini-2.5-flash" → "gemini-2.5-flash"
 * "google-vertex/gemini-2.5-flash" → "gemini-2.5-flash"
 * "anthropic/claude-sonnet-4" → "claude-sonnet-4"
 */
function extractBareModel(modelId: string): string | null {
  const slash = modelId.lastIndexOf('/');
  if (slash >= 0) return modelId.slice(slash + 1);
  return modelId || null;
}
