/**
 * Shared best-effort thread-title orchestration.
 *
 * Web chat services and the durable full-analysis worker both call this after
 * persisting the first assistant message of an untitled thread. It never
 * throws and never blocks: model failures fall back to a deterministic title,
 * and the untitled check is race-safe so a concurrent writer wins.
 */

import { getUserWithSettings } from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import type { ResolveModelEnv } from '../model';
import { deriveTitleModel } from '../model';
import { getThread, updateThreadTitle } from '../persistence';
import { generateThreadTitle } from './title';

const tilog = createCategorizedLogger('ai', { component: 'thread-title' });

export interface MaybeGenerateThreadTitleArgs {
  userId: string;
  threadId: string;
  /** Plain text of the first user message in the thread. */
  firstUser: string;
  /** Plain text of the assistant reply just persisted. */
  firstAssistant: string;
  env: ResolveModelEnv;
}

export async function maybeGenerateThreadTitle(
  args: MaybeGenerateThreadTitleArgs,
): Promise<void> {
  const { userId, threadId, firstUser, firstAssistant, env } = args;
  try {
    // Race-safe guard: only title threads that are still untitled.
    const thread = await getThread(userId, threadId);
    if (!thread || thread.titleSource != null) return;

    const { settings } = await getUserWithSettings(userId);
    const titleModelId = deriveTitleModel(
      { aiApiKeys: settings?.aiApiKeys ?? null, chatModel: settings?.chatModel ?? null },
      env,
    );
    if (!titleModelId) {
      // No resolvable model — persist the deterministic fallback so the
      // thread still gets a stable title.
      await updateThreadTitle(userId, threadId, firstUser.trim().slice(0, 60), 'fallback');
      return;
    }

    const result = await generateThreadTitle({
      userId,
      threadId,
      firstUser,
      firstAssistant,
      titleModelId,
      env,
    });
    await updateThreadTitle(userId, threadId, result.title, result.source);
    tilog.debug(
      { threadId, source: result.source, reason: result.reason },
      'thread title generated',
    );
  } catch (error) {
    tilog.warn(
      { threadId, error: error instanceof Error ? error.message : String(error) },
      'thread title generation failed (thread stays untitled)',
    );
  }
}
