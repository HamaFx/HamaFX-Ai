// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import { getFeatureFlag } from '@kestrel/db';

/** Database feature flag used for the gradual Mastra chat rollout. */
export const MASTRA_XAUUSD_CHAT_FLAG = 'mastra_xauusd_chat';

const XAUUSD_TERMS = /\b(?:xauusd|xau\/usd|gold)\b/i;
const OTHER_SYMBOL_TERMS = /\b(?:btc|bitcoin|eth|ethereum|eurusd|eur\/usd|gbpusd|gbp\/usd|usdjpy|usd\/jpy|silver|oil|nasdaq|spx|s&p\s*500)\b/i;
const MUTATING_TERMS = /\b(?:buy|sell|enter|exit|execute|place|open|close|trade|position|portfolio|journal|alert|notify|schedule|automate)\b/i;
const INJECTION_TERMS = /(?:ignore\s+(?:all\s+)?(?:previous|prior|above)?\s*instructions|system\s*:|developer\s*:|DAN\s+mode)\b/i;

export interface MastraChatRouteDecision {
  route: 'mastra' | 'legacy';
  reason:
    | 'disabled'
    | 'not-xauusd'
    | 'mixed-symbols'
    | 'mutating-request'
    | 'unsafe-request'
    | 'model-override'
    | 'enabled';
}

/**
 * Decide whether a user message is safe to consider for the read-only Mastra
 * XAUUSD agent. This is intentionally lexical and deterministic: a model must
 * not decide whether it is allowed to route itself.
 */
export function isMastraXauusdCandidate(prompt: string): boolean {
  return XAUUSD_TERMS.test(prompt)
    && !OTHER_SYMBOL_TERMS.test(prompt)
    && !MUTATING_TERMS.test(prompt)
    && !INJECTION_TERMS.test(prompt);
}

export function decideMastraXauusdChatRoute(args: {
  prompt: string;
  featureEnabled: boolean;
  hasModelOverride?: boolean;
}): MastraChatRouteDecision {
  if (!args.featureEnabled) return { route: 'legacy', reason: 'disabled' };
  if (!isMastraXauusdCandidate(args.prompt)) {
    return {
      route: 'legacy',
      reason: XAUUSD_TERMS.test(args.prompt)
        ? INJECTION_TERMS.test(args.prompt)
          ? 'unsafe-request'
          : OTHER_SYMBOL_TERMS.test(args.prompt)
            ? 'mixed-symbols'
            : 'mutating-request'
        : 'not-xauusd',
    };
  }
  if (args.hasModelOverride) return { route: 'legacy', reason: 'model-override' };
  return { route: 'mastra', reason: 'enabled' };
}

/**
 * Resolve the rollout flag. A local development env override is provided so
 * the feature can be exercised without changing the database; production
 * rollout remains controlled by the admin-managed database flag.
 */
export async function isMastraXauusdChatEnabled(): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_MASTRA_CHAT === 'true') {
    return true;
  }
  return getFeatureFlag(MASTRA_XAUUSD_CHAT_FLAG);
}
