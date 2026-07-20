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

// P0-1 — Extracted from agent.ts. Resolves the chat model for a retry
// attempt: respects model overrides, provider budget thresholds, and
// domain-based routing. Was previously a ~60-line inner function in
// runChatInner that captured closure variables.

import type { LanguageModel } from 'ai';
import type { RunChatArgs } from '../types';
import type { UserSettingsRow } from '@hamafx/db/schema';
import type { ProviderId } from '@hamafx/shared/encryption';
import { checkBudgetAlertsAndThresholds } from '../cost';
import {
  resolveChatModel,
  resolveOverrideModel,
  resolveModelForProvider,
} from '../model';
import { toModelDomain } from '../model-resolution';
import type { RoutingDecision } from '../routing';
import { createCategorizedLogger } from '@hamafx/shared/logger';
import { PROVIDER_IDS } from '@hamafx/shared/byok';

const alog = createCategorizedLogger('ai', { component: 'resolve-model' });

/**
 * Context needed by resolveModelForTurn that was previously captured
 * by the closure in runChatInner.
 */
export interface ResolveModelContext {
  /** Current model override being attempted (may change across retries). */
  currentModelOverride: string | null | undefined;
  /** User settings snapshot. */
  settings: UserSettingsRow;
  /** Runtime env (needed for model resolution). */
  env: RunChatArgs['env'];
  /** Whether non-essential tools have been disabled this turn. */
  nonEssentialDisabled: boolean;
  /** Set of provider IDs already budget-checked this turn. */
  checkedProviders: Set<string>;
  /** The authenticated user ID. */
  userId: string;
  /** The routing decision from routeTurn(). */
  routing: RoutingDecision;
}

export interface ResolveModelResult {
  resolvedModel: LanguageModel;
  resolvedModelId: string;
  providerId: ProviderId;
  nonEssentialDisabled: boolean;
}

/**
 * P0-1 — Extracted from agent.ts.
 *
 * Resolves the model for the current retry attempt (respects override
 * or routing domain). Also checks provider budget thresholds.
 * Throws on budget blocks or provider threshold violations; the caller
 * converts those into fallback decisions in the catch block.
 *
 * All closure-captured variables from runChatInner are now explicit
 * parameters in `ResolveModelContext`.
 */
export async function resolveModelForTurn(
  ctx: ResolveModelContext,
): Promise<ResolveModelResult> {
  const { currentModelOverride, settings, env, nonEssentialDisabled, checkedProviders, userId, routing } = ctx;
  const domainParam = toModelDomain(routing.domain);
  let resolvedModel: LanguageModel;
  let resolvedModelId: string;
  let providerId: ProviderId;

  if (typeof currentModelOverride === 'string' && currentModelOverride.length > 0) {
    const resolved = resolveOverrideModel({
      override: currentModelOverride,
      userSettings: settings,
      env,
    });
    if (resolved) {
      resolvedModel = resolved.model;
      resolvedModelId = resolved.modelId;
      providerId = resolved.providerId;
    } else {
      alog.warn('Model override not resolved — falling back', {
        override: currentModelOverride,
      });
      const sep = currentModelOverride.indexOf(':');
      const possibleProviderId = (sep >= 0 ? currentModelOverride.slice(0, sep) : currentModelOverride) as ProviderId;
      if (PROVIDER_IDS.includes(possibleProviderId)) {
        const res = resolveModelForProvider(possibleProviderId, settings, env);
        resolvedModel = res.model;
        resolvedModelId = res.modelId;
        providerId = res.providerId;
      } else {
        const res = resolveChatModel(settings, env, domainParam);
        resolvedModel = res.model;
        resolvedModelId = res.modelId;
        providerId = res.providerId;
      }
    }
  } else {
    const res = resolveChatModel(settings, env, domainParam);
    resolvedModel = res.model;
    resolvedModelId = res.modelId;
    providerId = res.providerId;
  }

  // P5: skip budget check if we already checked this provider this turn.
  let budgetCheck: Awaited<ReturnType<typeof checkBudgetAlertsAndThresholds>>;
  if (providerId && checkedProviders.has(providerId)) {
    budgetCheck = { blocked: false, nonEssentialDisabled };
  } else {
    if (providerId) checkedProviders.add(providerId);
    budgetCheck = await checkBudgetAlertsAndThresholds(userId, providerId);
  }
  if (budgetCheck.blocked) {
    if (budgetCheck.blockedReason?.includes('Monthly budget limit reached')) {
      throw new Error(budgetCheck.blockedReason);
    } else {
      throw new Error(`PROVIDER_THRESHOLD_EXCEEDED: ${budgetCheck.blockedReason}`);
    }
  }

  return { resolvedModel, resolvedModelId, providerId, nonEssentialDisabled: budgetCheck.nonEssentialDisabled };
}
