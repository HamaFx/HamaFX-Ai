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

// Citation oracle — deterministic measure of how many price/event claims in
// assistant text are backed by supporting tool calls. Extracted from the eval
// runner so the Mastra custom scorers can reuse it without pulling the whole
// runner module (fs, crypto, network client) into the web bundle.

/** Tools that can support a numeric price claim (mirrors the eval runner). */
export const NUMERIC_SUPPORT_TOOLS: ReadonlySet<string> = new Set([
  'get_price', 'get_candles', 'get_indicators', 'get_market_structure',
  'forecast_volatility', 'analyze_technical', 'analyze_fundamental',
  'get_session_levels', 'get_intermarket', 'compute_position_health',
  'compute_risk', 'replay_setup',
]);

/** Tools that can support an event claim (mirrors the eval runner). */
export const EVENT_SUPPORT_TOOLS: ReadonlySet<string> = new Set([
  'get_news', 'get_calendar', 'analyze_fundamental', 'web_search', 'search_knowledge',
]);

/** Price claims: instrument token within 100 chars of a numeric quote. */
const INSTRUMENT_PRICE_CLAIM_GLOBAL =
  /\b(?:xauusd|gold|eurusd|gbpusd|usdjpy|btcusdt)\b[^.!?\n]{0,100}\b(?:\d{1,5}\.\d{2,5}|0\.\d{3,6})\b/gi;

/** Event claims: macro/central-bank event tokens. */
const EVENT_CLAIM_GLOBAL =
  /\b(?:cpi|nfp|fomc|ecb|boe|federal reserve|rate decision|central bank)\b/gi;

export interface CitationToolCall {
  name: string;
}

/**
 * Compute the citation score (0..1) for assistant text given the tools called
 * during the turn. A response with no detectable claims scores 1.0.
 */
export function computeCitationScore(text: string, toolCalls: readonly CitationToolCall[]): number {
  const calledTools = new Set(toolCalls.map((t) => t.name));
  const numericClaims = countMatches(text, INSTRUMENT_PRICE_CLAIM_GLOBAL);
  const eventClaims = countMatches(text, EVENT_CLAIM_GLOBAL);
  const totalClaims = numericClaims + eventClaims;
  if (totalClaims === 0) return 1;

  const numericSupported = hasAnyTool(calledTools, NUMERIC_SUPPORT_TOOLS) ? numericClaims : 0;
  const eventSupported = hasAnyTool(calledTools, EVENT_SUPPORT_TOOLS) ? eventClaims : 0;
  return (numericSupported + eventSupported) / totalClaims;
}

function countMatches(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function hasAnyTool(calledTools: Set<string>, supportedTools: ReadonlySet<string>): boolean {
  for (const tool of calledTools) {
    if (supportedTools.has(tool)) return true;
  }
  return false;
}
