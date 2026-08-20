// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import { evaluateMastraCapability, type MastraCapabilityMode } from '@kestrel/ai/mastra';
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

export interface MastraCanonicalChatRouteDecision {
  route: 'mastra' | 'legacy';
  reason:
    | 'disabled'
    | 'model-override'
    | 'mutating-request'
    | 'unsafe-request'
    | 'specialized-request'
    | 'enabled';
}

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

export function decideMastraCanonicalChatRoute(args: {
  featureEnabled: boolean;
  prompt: string;
  hasModelOverride?: boolean;
  hasCurrentReport?: boolean;
}): MastraCanonicalChatRouteDecision {
  if (!args.featureEnabled) return { route: 'legacy', reason: 'disabled' };
  if (args.hasModelOverride) return { route: 'legacy', reason: 'model-override' };
  if (INJECTION_TERMS.test(args.prompt)) return { route: 'legacy', reason: 'unsafe-request' };
  if (MUTATING_TERMS.test(args.prompt)) return { route: 'legacy', reason: 'mutating-request' };
  if (!isMastraCanonicalCandidate(args.prompt, args.hasCurrentReport)) {
    return { route: 'legacy', reason: 'specialized-request' };
  }
  return { route: 'mastra', reason: 'enabled' };
}

export interface MastraChatRouteDecision {
  route: 'mastra' | 'legacy';
  reason:
    | 'disabled'
    | 'not-xauusd'
    | 'mixed-symbols'
    | 'mutating-request'
    | 'unsafe-request'
    | 'model-override'
    | 'capability-policy'
    | 'enabled';
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

export function decideMastraXauusdChatRoute(args: {
  prompt: string;
  featureEnabled: boolean;
  hasModelOverride?: boolean;
  hasCurrentReport?: boolean;
  analysisMode?: MastraCapabilityMode;
}): MastraChatRouteDecision {
  if (!args.featureEnabled) return { route: 'legacy', reason: 'disabled' };
  const reportFollowup =
    args.hasCurrentReport === true && isMastraXauusdFollowupCandidate(args.prompt);
  if (!isMastraXauusdCandidate(args.prompt) && !reportFollowup) {
    return {
      route: 'legacy',
      reason: INJECTION_TERMS.test(args.prompt)
        ? 'unsafe-request'
        : MUTATING_TERMS.test(args.prompt)
          ? 'mutating-request'
          : XAUUSD_TERMS.test(args.prompt)
            ? OTHER_SYMBOL_TERMS.test(args.prompt)
              ? 'mixed-symbols'
              : 'mutating-request'
            : 'not-xauusd',
    };
  }
  const capability = evaluateMastraCapability({
    capabilityId:
      mastraXauusdChatKind(args.prompt, args.hasCurrentReport) === 'research'
        ? 'xauusd-research'
        : 'xauusd-conversation',
    symbol: 'XAUUSD',
    mode: args.analysisMode ?? 'single',
    hasModelOverride: args.hasModelOverride,
    mutationRequested: false,
    confirmed: false,
  });
  if (!capability.allowed) {
    return {
      route: 'legacy',
      reason: capability.reason === 'model-override' ? 'model-override' : 'capability-policy',
    };
  }
  return { route: 'mastra', reason: 'enabled' };
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

export interface MastraModeRouteDecision {
  route: 'mastra' | 'legacy';
  reason: MastraChatRouteDecision['reason'] | 'unsupported-mode';
  symbol?: string;
}

export function decideMastraModeRoute(args: {
  prompt: string;
  featureEnabled: boolean;
  mode: MastraCapabilityMode;
  hasModelOverride?: boolean;
}): MastraModeRouteDecision {
  if (!args.featureEnabled) return { route: 'legacy', reason: 'disabled' };
  if (!['single', 'quick', 'standard', 'full'].includes(args.mode)) {
    return { route: 'legacy', reason: 'unsupported-mode' };
  }
  if (args.hasModelOverride) return { route: 'legacy', reason: 'model-override' };
  const symbol = extractMastraSymbol(args.prompt);
  const mentionedSymbols = ALL_SYMBOLS.filter((candidate) =>
    args.prompt.toUpperCase().includes(candidate),
  );
  if (!symbol || !isMastraSymbolCandidate(args.prompt)) {
    return {
      route: 'legacy',
      reason: INJECTION_TERMS.test(args.prompt)
        ? 'unsafe-request'
        : MUTATING_TERMS.test(args.prompt)
          ? 'mutating-request'
          : mentionedSymbols.length > 1
            ? 'mixed-symbols'
            : 'not-xauusd',
    };
  }
  const capability = evaluateMastraCapability({
    capabilityId: 'symbol-research',
    symbol,
    mode: args.mode,
    hasModelOverride: args.hasModelOverride,
    mutationRequested: false,
    confirmed: false,
  });
  return capability.allowed
    ? { route: 'mastra', reason: 'enabled', symbol }
    : { route: 'legacy', reason: 'capability-policy', symbol };
}
