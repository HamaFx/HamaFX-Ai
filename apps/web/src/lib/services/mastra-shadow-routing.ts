// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import { getFeatureFlag } from '@kestrel/db';

import { isMastraXauusdCandidate } from './mastra-chat-routing';

/** Database feature flag for non-blocking legacy-vs-Mastra comparisons. */
export const MASTRA_XAUUSD_SHADOW_FLAG = 'mastra_xauusd_shadow';

export type MastraShadowDecision = {
  enabled: boolean;
  reason:
    | 'disabled'
    | 'non-report-mode'
    | 'model-override'
    | 'mastra-already-attempted'
    | 'not-xauusd'
    | 'eligible';
};

/**
 * Shadow mode deliberately has a separate gate from the production Mastra
 * route. It never decides whether the user-facing request may use Mastra;
 * it only decides whether a legacy response may be compared in the background.
 */
export function decideMastraXauusdShadow(args: {
  prompt: string;
  featureEnabled: boolean;
  analysisMode: string;
  hasModelOverride: boolean;
  mastraAlreadyAttempted: boolean;
}): MastraShadowDecision {
  if (!args.featureEnabled) return { enabled: false, reason: 'disabled' };
  if (args.analysisMode !== 'single' && args.analysisMode !== 'auto') {
    return { enabled: false, reason: 'non-report-mode' };
  }
  if (args.hasModelOverride) return { enabled: false, reason: 'model-override' };
  if (args.mastraAlreadyAttempted) return { enabled: false, reason: 'mastra-already-attempted' };
  if (!isMastraXauusdCandidate(args.prompt)) return { enabled: false, reason: 'not-xauusd' };
  return { enabled: true, reason: 'eligible' };
}

/** Resolve the shadow flag; unknown or failing flags are disabled. */
export async function isMastraXauusdShadowEnabled(): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_MASTRA_SHADOW === 'true') {
    return true;
  }
  try {
    return await getFeatureFlag(MASTRA_XAUUSD_SHADOW_FLAG);
  } catch {
    return false;
  }
}

