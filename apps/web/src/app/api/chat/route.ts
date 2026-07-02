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
import * as Sentry from '@sentry/nextjs';
import { providerUnavailable } from '@hamafx/shared';
import { withRateLimit } from '@hamafx/db';
import { z } from 'zod';
import type { UIMessage } from 'ai';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { createRequestLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  const log = createRequestLogger(req, user);
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
      const { runMultiAgentChat, resolveMode, extractUserMessageText, ProgressTracker, progressToSSE } = await import('@hamafx/ai');
      const { getDb, schema } = await import('@hamafx/db');
      const { eq } = await import('drizzle-orm');

      const db = getDb();
      const [userSettings, userRow] = await Promise.all([
        db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, user.userId)).then((rows) => rows[0]),
        db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, user.userId)).then((rows) => rows[0]),
      ]);

      if (!userSettings) return errorResponse(new Error('User settings not found. Please complete onboarding.'));

      const displayName = userRow?.name?.trim() || (userRow?.email ? userRow.email.split('@')[0] : null);
      const userText = extractUserMessageText(last as UIMessage);
      const resolvedMode = resolveMode(analysisMode, userText);

      if (resolvedMode !== 'single') {
        // Generate a message ID for the assistant response so opinions
        // can be persisted and linked to it.
        const assistantMessageId = crypto.randomUUID();

        // Set up SSE streaming with progress events + final text.
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const tracker = new ProgressTracker(resolvedMode, resolvedMode === 'quick' ? ['technical'] : resolvedMode === 'standard' ? ['technical', 'fundamental'] : ['technical', 'fundamental', 'risk', 'sentiment']);

            const enqueueProgress = () => {
              const part = tracker.buildPart();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
            };

            try {
              const result = await runMultiAgentChat({
                threadId: body.threadId, userId: user.userId, userMessage: last as UIMessage, history: body.messages as UIMessage[],
                userSettings, displayName: displayName ?? null, ...(customInstructions ? { customInstructions } : {}),
                env: {
                  AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
                  GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT, GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
                  GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
                  GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
                  AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL, AI_EMBEDDING_MODEL: env.AI_EMBEDDING_MODEL,
                  MAX_DAILY_USD: env.MAX_DAILY_USD, MAX_TOOL_ITERATIONS: env.MAX_TOOL_ITERATIONS, LOG_PROMPTS: env.LOG_PROMPTS,
                },
                ...(req.signal ? { signal: req.signal } : { signal: null }), analysisMode,
                messageId: assistantMessageId,
                onProgress: (event) => {
                  tracker.update(event);
                  // Also send individual progress events for granular client handling
                  controller.enqueue(encoder.encode(progressToSSE(event)));
                  enqueueProgress();
                },
              });

              // Stream the final text as text parts
              const textData = { type: 'text', text: result.finalText };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(textData)}\n\n`));

              // Send metadata (cost, latency, opinions, mode)
              const metaData = { type: 'metadata', data: { agentOpinions: result.agentOpinions, mode: result.mode, totalCostUsd: result.totalCostUsd, totalLatencyMs: result.totalLatencyMs, messageId: assistantMessageId } };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(metaData)}\n\n`));

              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } catch (err) {
              Sentry.captureException(err, {
                tags: { component: 'chat', mode: 'multi-agent', route: '/api/chat' },
                extra: { threadId: body.threadId, userId: user.userId },
              });
              log.error('multi-agent chat failed', { err: String(err), threadId: body.threadId, mode: resolvedMode });
              const errorMessage = err instanceof BudgetExceededError
                ? 'Daily AI budget exceeded. Please try again tomorrow.'
                : 'Internal error';
              const errorData = { type: 'error', error: errorMessage };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
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
      return errorResponse(
        providerUnavailable(
          `Daily AI budget exceeded ($${err.spent.toFixed(2)} / $${err.max.toFixed(2)}). Resets at UTC midnight.`,
          { code: 'BUDGET_EXCEEDED', spent: err.spent, max: err.max },
        ),
        req,
      );
    }
    // OBS-01 (Phase 5.3): Log the error via pino before delegating to errorResponse
    log.error('chat agent failed', { err: String(err), threadId: body.threadId });
    // OBS-01 (Phase 5): Explicitly capture chat errors with chat-specific tags.
    // errorResponse() captures with generic 'api' tags; this ensures the chat
    // hot path is always visible in Sentry with the right component tag.
    Sentry.captureException(err, {
      tags: { component: 'chat', mode: 'single', route: '/api/chat' },
      extra: { threadId: body.threadId, userId: user.userId },
    });
    return errorResponse(err, req);
  }
});
