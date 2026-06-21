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

// /api/chat — streaming chat endpoint. Receives a UI messages array from
// `useChat`, runs the agent, and streams back the SDK's UI-message stream
// for the client to consume.
//
// Phase A: extracts userId from the NextAuth session and passes it to runChat.
// Phase B: per-user rate limit on chat (default: 30 turns / minute).

import { BudgetExceededError, runChat } from '@hamafx/ai';
import { providerUnavailable } from '@hamafx/shared';
import { withRateLimit } from '@hamafx/db';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Phase B: 30 chat turns per minute per user is the default. Tunable
// via env if the deployment needs a different ceiling.
const CHAT_RATE_LIMIT = Number(process.env.AI_CHAT_RATE_LIMIT ?? '30');

const BodySchema = z.object({
  threadId: z.string().uuid(),
  modelOverride: z.string().min(1).max(120).nullable().optional(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().default(''),
        parts: z.array(z.unknown()).default([]),
      }),
    )
    .min(1),
});

export const POST = withAuth<void>(async (req, { user }) => {
  // Phase B — per-user rate limit. Counts rejected attempts too so a
  // bursty client can't avoid the cap by retrying.
  const rl = await withRateLimit(user.userId, 'ai_chat', CHAT_RATE_LIMIT);
  if (!rl.allowed) {
    return Response.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Too many chat turns (${rl.count}/${rl.limit} per minute). Slow down.`,
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  const last = body.messages.at(-1);
  if (!last || last.role !== 'user') {
    return Response.json(
      { error: { code: 'VALIDATION', message: 'last message must be from the user' } },
      { status: 400 },
    );
  }

  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch (err) {
    return errorResponse(err);
  }

  // Parse client AI preferences if provided. Only `customInstructions`
  // is honoured — the older `fundamentalModel` / `technicalModel` /
  // `summaryModel` fields were planner-only overrides (see the
  // routing.ts comments) and have been removed from the General
  // Settings card; the canonical per-turn model lives in
  // `user_settings.default_models` (set via /settings/models).
  // We still accept the legacy keys so an old localStorage value
  // doesn't crash the parser; we just ignore them.
  const aiPrefsHeader = req.headers.get('X-AI-Prefs');
  let customInstructions: string | undefined;
  if (aiPrefsHeader) {
    try {
      const prefs = JSON.parse(aiPrefsHeader) as {
        customInstructions?: unknown;
        // Legacy fields — read and discarded.
        fundamentalModel?: unknown;
        technicalModel?: unknown;
        summaryModel?: unknown;
      };
      if (typeof prefs.customInstructions === 'string') {
        customInstructions = prefs.customInstructions;
      }
    } catch {
      // ignore invalid json
    }
  }

  try {
    const result = await runChat({
      threadId: body.threadId,
      userId: user.userId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userMessage: last as any,
      ...(body.modelOverride !== undefined && body.modelOverride !== null
        ? { modelOverride: body.modelOverride }
        : {}),
      ...(customInstructions ? { customInstructions } : {}),
      env: {
        AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
        GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT,
        GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
        GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
        GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
        AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL,
        AI_VISION_MODEL: env.AI_VISION_MODEL,
        AI_EMBEDDING_MODEL: env.AI_EMBEDDING_MODEL,
        MAX_DAILY_USD: env.MAX_DAILY_USD,
        MAX_TOOL_ITERATIONS: env.MAX_TOOL_ITERATIONS,
        LOG_PROMPTS: env.LOG_PROMPTS,
      },
      ...(req.signal ? { signal: req.signal } : {}),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return errorResponse(
        providerUnavailable(
          `Daily AI budget exceeded ($${err.spent.toFixed(2)} / $${err.max.toFixed(2)}). Resets at UTC midnight.`,
          { code: 'BUDGET_EXCEEDED', spent: err.spent, max: err.max },
        ),
      );
    }
    return errorResponse(err);
  }
});