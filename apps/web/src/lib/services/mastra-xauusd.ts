// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import {
  runXauusdMastra,
  runXauusdMastraConversation,
  type RunXauusdMastraArgs,
  type XauusdMastraRunResult,
  type XauusdResearchReport,
} from '@kestrel/ai/mastra';
import { getThread, getUserWithSettings } from '@kestrel/db';
import { notFound } from '@kestrel/shared';

import { getServerEnv } from '@/lib/env';

export interface RunMastraXauusdResearchInput {
  userId: string;
  threadId: string;
  runId: string;
  prompt: string;
  modelOverride?: string | null;
  signal?: AbortSignal;
  telemetryKind?: 'mastra_xauusd_poc';
  followup?: boolean;
  priorReport?: XauusdResearchReport | null;
}

type MastraXauusdRunner = (args: RunXauusdMastraArgs) => Promise<XauusdMastraRunResult>;

async function executeMastraXauusdTurn(
  input: RunMastraXauusdResearchInput,
  runner: MastraXauusdRunner,
): Promise<XauusdMastraRunResult> {
  const thread = await getThread(input.userId, input.threadId);
  if (!thread) throw notFound('Thread not found');

  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) {
    throw new Error('User settings not found. Please complete onboarding.');
  }

  return runner({
    prompt: input.prompt,
    userId: input.userId,
    threadId: input.threadId,
    runId: input.runId,
    settings,
    env: getServerEnv(),
    ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.telemetryKind ? { telemetryKind: input.telemetryKind } : {}),
    ...(input.followup ? { followup: true } : {}),
    ...(input.priorReport ? { priorReport: input.priorReport } : {}),
  });
}

export function runMastraXauusdResearch(
  input: RunMastraXauusdResearchInput,
): Promise<XauusdMastraRunResult> {
  return executeMastraXauusdTurn(input, runXauusdMastra);
}

export function runMastraXauusdConversation(
  input: RunMastraXauusdResearchInput,
): Promise<XauusdMastraRunResult> {
  return executeMastraXauusdTurn(input, runXauusdMastraConversation);
}
