// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import { runXauusdMastra } from '@kestrel/ai/mastra';
import { getThread, getUserWithSettings } from '@kestrel/db';
import { notFound } from '@kestrel/shared';
import { getServerEnv } from '@/lib/env';

export interface RunMastraXauusdResearchInput {
  userId: string;
  threadId: string;
  runId: string;
  prompt: string;
  signal?: AbortSignal;
  telemetryKind?: 'mastra_xauusd_poc' | 'mastra_xauusd_shadow';
}

export async function runMastraXauusdResearch(input: RunMastraXauusdResearchInput) {
  const thread = await getThread(input.userId, input.threadId);
  if (!thread) throw notFound('Thread not found');

  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) {
    throw new Error('User settings not found. Please complete onboarding.');
  }

  return runXauusdMastra({
    prompt: input.prompt,
    userId: input.userId,
    threadId: input.threadId,
    runId: input.runId,
    settings,
    env: getServerEnv(),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.telemetryKind ? { telemetryKind: input.telemetryKind } : {}),
  });
}
