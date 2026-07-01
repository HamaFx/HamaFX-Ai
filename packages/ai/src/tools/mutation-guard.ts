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

import { validationError } from '@hamafx/shared';

import { getToolContext } from '../tool-context';

type MutationToolName = 'set_alert' | 'log_journal' | 'share_snapshot' | 'run_system_action';

const ALERT_INTENT_PATTERNS = [
  /\balert\b/i,
  /\bnotify\b/i,
  /\bnotification\b/i,
  /\bping me\b/i,
  /\bwarn me\b/i,
  /\bremind me\b/i,
  /\btell me when\b/i,
  /\blet me know when\b/i,
];

const JOURNAL_INTENT_PATTERNS = [
  /\bjournal\b/i,
  /\blog\b.*\b(trade|entry|setup|position)\b/i,
  /\brecord\b.*\b(trade|entry|setup|position)\b/i,
  /\bsave\b.*\b(trade|entry|setup|position)\b/i,
  /\badd\b.*\bjournal\b/i,
];

const SHARE_INTENT_PATTERNS = [
  /\bshare\b/i,
  /\bshareable\b/i,
  /\bshare link\b/i,
  /\bpublic link\b/i,
  /\bcreate\b.*\blink\b/i,
  /\bmake\b.*\blink\b/i,
  /\bsend\b.*\blink\b/i,
  /\bgive me\b.*\blink\b/i,
  /\blink to (?:this|that)\b/i,
];

const RUN_INTENT_PATTERNS = [
  /\b(run|execute|trigger|start|perform|do|sync|refresh)\b/i,
];

const RESONANCE_TARGET_PATTERNS = [
  /\bresonance\b/i,
  /\bfred\b/i,
  /\bmacro\b/i,
  /\bhistorical\b/i,
  /\bdata sync\b/i,
];

function normalizeUserText(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function latestUserText(): string {
  return normalizeUserText(getToolContext().latestUserMessageText);
}

function requireUserText(toolName: MutationToolName): string {
  const text = latestUserText();
  if (text.length === 0) {
    throw validationError(`${toolName} blocked: the latest user message was empty, so write intent could not be verified.`);
  }
  return text;
}

export function assertMutationIntent(
  toolName: MutationToolName,
  options?: { action?: string },
): void {
  const text = requireUserText(toolName);

  if (toolName === 'set_alert' && !matchesAny(text, ALERT_INTENT_PATTERNS)) {
    throw validationError(
      'set_alert blocked: the latest user message did not clearly ask to create an alert.',
    );
  }

  if (toolName === 'log_journal' && !matchesAny(text, JOURNAL_INTENT_PATTERNS)) {
    throw validationError(
      'log_journal blocked: the latest user message did not clearly ask to log or journal a trade.',
    );
  }

  if (toolName === 'share_snapshot' && !matchesAny(text, SHARE_INTENT_PATTERNS)) {
    throw validationError(
      'share_snapshot blocked: the latest user message must explicitly ask to create a share link or public snapshot.',
    );
  }

  if (toolName === 'run_system_action') {
    const action = options?.action ?? '';
    const askedToRun = matchesAny(text, RUN_INTENT_PATTERNS);
    const mentionedTarget =
      action === 'resonance_sync' && matchesAny(text, RESONANCE_TARGET_PATTERNS);

    if (!askedToRun || !mentionedTarget) {
      throw validationError(
        'run_system_action blocked: the latest user message must explicitly ask to run the resonance sync.',
      );
    }
  }
}
