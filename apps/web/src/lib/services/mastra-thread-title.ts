// SPDX-License-Identifier: Apache-2.0

import 'server-only';

/**
 * Web-side entry point for best-effort LLM thread titles.
 *
 * Thin wrapper: injects the validated server env into the shared AI-package
 * orchestration (`@kestrel/ai/mastra`). Fire-and-forget safe — never blocks
 * the chat response and never throws.
 */

import { maybeGenerateThreadTitle as aiMaybeGenerateThreadTitle } from '@kestrel/ai/mastra';

import { getServerEnv } from '@/lib/env';

export type MaybeGenerateThreadTitleArgs = Omit<
  Parameters<typeof aiMaybeGenerateThreadTitle>[0],
  'env'
>;

export async function maybeGenerateThreadTitle(
  args: MaybeGenerateThreadTitleArgs,
): Promise<void> {
  return aiMaybeGenerateThreadTitle({ ...args, env: getServerEnv() });
}
