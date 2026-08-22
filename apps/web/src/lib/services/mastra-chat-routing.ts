// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import { ALL_SYMBOLS, isKnownSymbol, normalizeSymbol } from '@kestrel/shared';

const CANONICAL_SYMBOL_PATTERN = new RegExp(`\\b(?:${ALL_SYMBOLS.join('|')})\\b`, 'gi');

const XAUUSD_TERMS = /\b(?:xauusd|xau\/usd|gold)\b/i;
const OTHER_SYMBOL_TERMS =
  /\b(?:btc|bitcoin|eth|ethereum|eurusd|eur\/usd|gbpusd|gbp\/usd|usdjpy|usd\/jpy|silver|oil|nasdaq|spx|s&p\s*500)\b/i;
const MUTATING_TERMS =
  /\b(?:buy|sell|enter|exit|execute|place|open|close|trade|position|portfolio|journal|alert|notify|schedule|automate)\b/i;
const INJECTION_TERMS =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior|above)?\s*instructions|system\s*:|developer\s*:|DAN\s+mode)\b/i;
const DEEP_RESEARCH_TERMS =
  /\b(?:analy[sz]e|analysis|outlook|forecast|predict|technical|fundamental|macro|structure|indicator|level|setup|bullish|bearish|bias|scenario|support|resistance|volatility)\b/i;

/** Return true when the request must not enter a read-only Mastra agent. */
export function isMastraPromptUnsafe(prompt: string): boolean {
  return MUTATING_TERMS.test(prompt) || INJECTION_TERMS.test(prompt);
}

/**
 * Safe boundary for the generic conversational runner. Specialized market
 * analysis must reach its verified packet/report path instead of being
 * consumed by the generic canonical agent first.
 */
export function isMastraCanonicalCandidate(prompt: string, hasCurrentReport = false): boolean {
  if (MUTATING_TERMS.test(prompt) || INJECTION_TERMS.test(prompt)) return false;
  if (extractMastraSymbol(prompt) !== null || DEEP_RESEARCH_TERMS.test(prompt)) return false;
  if (hasCurrentReport && isMastraXauusdFollowupCandidate(prompt)) return false;
  return true;
}

/**
 * Decide whether a user message is safe to consider for the read-only Mastra
 * XAUUSD agent. This is intentionally lexical and deterministic: a model must
 * not decide whether it is allowed to route itself.
 */
export function isMastraXauusdCandidate(prompt: string): boolean {
  return (
    XAUUSD_TERMS.test(prompt) &&
    !OTHER_SYMBOL_TERMS.test(prompt) &&
    !MUTATING_TERMS.test(prompt) &&
    !INJECTION_TERMS.test(prompt)
  );
}

/** Classify the Mastra Single-mode execution contract without using a model. */
export type MastraXauusdChatKind = 'research' | 'conversation';

export function mastraXauusdChatKind(
  prompt: string,
  hasCurrentReport = false,
): MastraXauusdChatKind {
  if (hasCurrentReport && isMastraXauusdFollowupCandidate(prompt)) return 'conversation';
  return DEEP_RESEARCH_TERMS.test(prompt) ? 'research' : 'conversation';
}

/** Follow-ups inherit XAUUSD scope from the saved report but remain read-only. */
export function isMastraXauusdFollowupCandidate(prompt: string): boolean {
  return (
    /\b(?:why|explain|how|what\s+changed|based\s+on|according\s+to|invalidation|trigger|scenario|risk|report|analysis|you\s+said)\b/i.test(
      prompt,
    ) &&
    !OTHER_SYMBOL_TERMS.test(prompt) &&
    !MUTATING_TERMS.test(prompt) &&
    !INJECTION_TERMS.test(prompt)
  );
}

/** Return the one canonical symbol explicitly mentioned by a safe prompt. */
export function extractMastraSymbol(prompt: string): string | null {
  if (prompt.toLowerCase().includes('gold')) return 'XAUUSD';
  const explicitSymbols = ALL_SYMBOLS.filter((symbol) => prompt.toUpperCase().includes(symbol));
  if (explicitSymbols.length > 1) return null;
  if (explicitSymbols.length === 1) return explicitSymbols[0]!;
  if (/\\bgold\\b/i.test(prompt)) return 'XAUUSD';
  const matches = [...prompt.matchAll(CANONICAL_SYMBOL_PATTERN)].map((match) =>
    normalizeSymbol(match[0] ?? ''),
  );
  const unique = [...new Set(matches)].filter(isKnownSymbol);
  return unique.length === 1 ? unique[0]! : null;
}

/** Generalized read-only symbol eligibility for Quick/Standard/Full Mastra modes. */
export function isMastraSymbolCandidate(prompt: string): boolean {
  return (
    extractMastraSymbol(prompt) !== null &&
    !MUTATING_TERMS.test(prompt) &&
    !INJECTION_TERMS.test(prompt)
  );
}


