// SPDX-License-Identifier: Apache-2.0

/**
 * Phase 5 guardrails — Mastra input processors applied to every chat-facing
 * agent through `inputProcessors`.
 *
 * - `UnicodeNormalizer`: strips control characters, collapses whitespace, NFC
 *   normalizes user input before it reaches the model.
 * - `PromptInjectionDetector`: LLM-based detection of injection, jailbreak,
 *   and system-override attempts. Uses a fast-tier model resolved via the
 *   existing BYOK resolver. Strategy: `block` on research paths (no partial
 *   answer), `rewrite` on conversation paths (neutralize while preserving
 *   intent).
 *
 * The deterministic regex-based `isMastraPromptUnsafe` in the route remains
 * the zero-cost first line of defense; the LLM detector catches variants the
 * regex missed.
 */

import { PromptInjectionDetector, UnicodeNormalizer } from '@mastra/core/processors';
import type { LanguageModel } from 'ai';
import type { UserSettingsRow } from '@kestrel/db/schema';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { resolveChatModel } from '../model';
import type { ResolveModelEnv } from '../vertex-factory';

const glog = createCategorizedLogger('ai', { component: 'mastra-guardrails' });

export type GuardrailStrategy = 'block' | 'rewrite';

export interface GuardrailOptions {
  /** User settings for BYOK model resolution. */
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>;
  /** Environment for model resolution. */
  env: ResolveModelEnv;
  /**
   * Injection-handling strategy:
   * - `block`: reject the turn (research paths — no partial answer)
   * - `rewrite`: neutralize the injection while preserving intent (conversation)
   */
  strategy: GuardrailStrategy;
  /** Confidence threshold (0–1). Default: 0.7. */
  threshold?: number;
}

/**
 * Build the Mastra input processors for a chat agent. The outer array places
 * the UnicodeNormalizer first so the detector sees clean text.
 *
 * Returns `null` when no BYOK model is available (detector cannot run).
 */
export function buildGuardrailInputProcessors(
  options: GuardrailOptions,
): { processors: Array<UnicodeNormalizer | PromptInjectionDetector>; warnings: string[] } {
  const warnings: string[] = [];
  const normalizer = new UnicodeNormalizer({
    stripControlChars: true,
    preserveEmojis: true,
    collapseWhitespace: true,
    trim: true,
  });

  let resolution: { model: LanguageModel } | null = null;
  try {
    // Resolve the user's fast-tier model for the injection detector. Fall
    // back to the operator's default if no BYOK key is configured.
    resolution = resolveChatModel(
      { aiApiKeys: options.settings.aiApiKeys, chatModel: options.settings.chatModel },
      options.env,
      'technical',
    );
  } catch (error) {
    glog.warn('PromptInjectionDetector: no model available; injection detection disabled', {
      error: error instanceof Error ? error.message : String(error),
    });
    warnings.push('PromptInjectionDetector: no model available; injection detection disabled');
  }

  if (!resolution) {
    return { processors: [normalizer], warnings };
  }

  const detector = new PromptInjectionDetector({
    model: resolution.model as never,
    threshold: options.threshold ?? 0.7,
    strategy: options.strategy,
    detectionTypes: ['injection', 'jailbreak', 'system-override'],
    lastMessageOnly: true,
    includeScores: true,
    onDetection: (event) => {
      if (event.flagged) {
        glog.warn('Prompt injection detected by LLM guardrail', {
          input: event.input.slice(0, 200),
          strategyApplied: event.strategyApplied,
          reason: event.detectionResult.reason,
          scores: event.detectionResult.categories,
        });
      }
    },
  });

  return { processors: [normalizer, detector], warnings: [] };
}

/**
 * Convenience — build conversation-path guardrails (rewrite strategy).
 */
export function buildConversationGuardrails(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): { processors: Array<UnicodeNormalizer | PromptInjectionDetector>; warnings: string[] } {
  return buildGuardrailInputProcessors({ settings, env, strategy: 'rewrite' });
}

/**
 * Convenience — build research-path guardrails (block strategy).
 */
export function buildResearchGuardrails(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): { processors: Array<UnicodeNormalizer | PromptInjectionDetector>; warnings: string[] } {
  return buildGuardrailInputProcessors({ settings, env, strategy: 'block' });
}