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

import { BudgetExceededError, runChat } from '@hamafx/ai';
import { providerUnavailable } from '@hamafx/shared';
import { withRateLimit } from '@hamafx/db';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHAT_RATE_LIMIT = Number(process.env.AI_CHAT_RATE_LIMIT ?? '30');

const BodySchema = z.object({
  threadId: z.string().uuid(),
  modelOverride: z.string().min(1).max(120).nullable().optional(),
  analysisMode: z.enum(['single', 'quick', 'standard', 'full', 'auto']).optional(),
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
  const rl = await withRateLimit(user.userId, 'ai_chat', CHAT_RATE_LIMIT);
  if (!rl.allowed) {
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: `Too many chat turns (${rl.count}/${rl.limit} per minute). Slow down.` } },
      { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': '0' } },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try { body = await parseJsonBody(req, BodySchema); } catch (err) { return errorResponse(err); }

  const last = body.messages.at(-1);
  if (!last || last.role !== 'user') {
    return Response.json({ error: { code: 'VALIDATION', message: 'last message must be from the user' } }, { status: 400 });
  }

  let env: ReturnType<typeof getServerEnv>;
  try { env = getServerEnv(); } catch (err) { return errorResponse(err); }

  const aiPrefsHeader = req.headers.get('X-AI-Prefs');
  let customInstructions: string | undefined;
  if (aiPrefsHeader) {
    try {
      const prefs = JSON.parse(aiPrefsHeader) as { customInstructions?: unknown };
      if (typeof prefs.customInstructions === 'string') customInstructions = prefs.customInstructions;
    } catch { /* ignore */ }
  }

  try {
    // Multi-Agent Orchestration — route to multi-agent pipeline if
    // analysisMode is provided and not 'single'. When 'auto', the
    // orchestrator auto-detects based on the user's message.
    const analysisMode = body.analysisMode ?? 'single';

    if (analysisMode !== 'single') {
      const { runMultiAgentChat, resolveMode, extractUserMessageText } = await import('@hamafx/ai');
      const { getDb, schema } = await import('@hamafx/db');
      const { eq } = await import('drizzle-orm');

      const db = getDb();
      const [userSettings, userRow] = await Promise.all([
        db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, user.userId)).then((rows) => rows[0]),
        db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, user.userId)).then((rows) => rows[0]),
      ]);

      if (!userSettings) return errorResponse(new Error('User settings not found. Please complete onboarding.'));

      const displayName = userRow?.name?.trim() || (userRow?.email ? userRow.email.split('@')[0] : null);
      const userText = extractUserMessageText(last as any);
      const resolvedMode = resolveMode(analysisMode, userText);

      if (resolvedMode !== 'single') {
        const result = await runMultiAgentChat({
          threadId: body.threadId, userId: user.userId, userMessage: last as any, history: body.messages as any[],
          userSettings, displayName, ...(customInstructions ? { customInstructions } : {}),
          env: {
            AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
            GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT, GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
            GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
            GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
            AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL, AI_EMBEDDING_MODEL: env.AI_EMBEDDING_MODEL,
            MAX_DAILY_USD: env.MAX_DAILY_USD, MAX_TOOL_ITERATIONS: env.MAX_TOOL_ITERATIONS, LOG_PROMPTS: env.LOG_PROMPTS,
          },
          ...(req.signal ? { signal: req.signal } : {}), analysisMode,
        });

        return new Response(JSON.stringify({ text: result.finalText, agentOpinions: result.agentOpinions, mode: result.mode, totalCostUsd: result.totalCostUsd, totalLatencyMs: result.totalLatencyMs }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    const result = await runChat({
      threadId: body.threadId, userId: user.userId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userMessage: last as any,
      ...(body.modelOverride !== undefined && body.modelOverride !== null ? { modelOverride: body.modelOverride } : {}),
      ...(customInstructions ? { customInstructions } : {}),
      env: {
        AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
        GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT, GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
        GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
        GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
        AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL, AI_EMBEDDING_MODEL: env.AI_EMBEDDING_MODEL,
        MAX_DAILY_USD: env.MAX_DAILY_USD, MAX_TOOL_ITERATIONS: env.MAX_TOOL_ITERATIONS, LOG_PROMPTS: env.LOG_PROMPTS,
      },
      ...(req.signal ? { signal: req.signal } : {}),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return errorResponse(providerUnavailable(`Daily AI budget exceeded ($${err.spent.toFixed(2)} / $${err.max.toFixed(2)}). Resets at UTC midnight.`, { code: 'BUDGET_EXCEEDED', spent: err.spent, max: err.max }));
    }
    return errorResponse(err);
  }
});
