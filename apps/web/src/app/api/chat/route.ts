// SPDX-License-Identifier: Apache-2.0

// /api/chat — streaming chat endpoint. Receives a UI messages array from
// `useChat`, runs the agent, and streams back the SDK's UI-message stream
// for the client to consume.

import * as Sentry from '@sentry/nextjs';
import type { UIMessage } from 'ai';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { createRequestLogger } from '@/lib/logger';
import {
  AnalysisQueuedEventSchema,
  BudgetExceededError,
  ChatStreamEventSchema,
  extractUserMessageText,
  getThread,
  listMessages,
  getUserWithSettings,
  pickAiEnv,
  ProgressTracker,
  providerUnavailable,
  resolveMode,
  runChat,
  runMultiAgentChat,
  enqueueAnalysisJob,
  flushLangfuse,
  traceIdStorage,
  withRateLimit,
  withDiagnostics,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// M6 (RELIABILITY_AUDIT_REPORT.md) — hard timeout just before Vercel's
// 60s maxDuration so the function can return a clean error instead of
// being killed mid-response. 55s leaves 5s of headroom for response
// serialization and error handling.
const ROUTE_TIMEOUT_MS = 55_000;

const CHAT_RATE_LIMIT = Number(process.env.AI_CHAT_RATE_LIMIT ?? '30');

/** OBS-1: Read the current diagnostic traceId from AsyncLocalStorage. */
function getDiagnosticTraceId(): string | null {
  return traceIdStorage.getStore() ?? null;
}

function persistedMessagesToUi(rows: Awaited<ReturnType<typeof listMessages>>): UIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role === 'assistant' || row.role === 'system' ? row.role : 'user',
    parts: Array.isArray(row.parts) && row.parts.length > 0
      ? row.parts as UIMessage['parts']
      : [{ type: 'text' as const, text: row.content }],
  } as UIMessage));
}

const BodySchema = z.object({
  threadId: z.string().uuid(),
  modelOverride: z.string().min(1).max(120).nullable().optional(),
  analysisMode: z.enum(['single', 'quick', 'standard', 'full', 'auto']).optional(),
  messages: z
    .array(
      z.object({
        id: z.string().max(200),
        role: z.enum(['user', 'assistant', 'system']),
        // M-10: Cap individual message content at 50k chars to prevent
        // memory exhaustion from extremely long messages.
        content: z.string().max(50_000, 'Message too long').default(''),
        parts: z.array(z.unknown()).max(50, 'Too many message parts').default([]),
      }),
    )
    .min(1)
    .max(100, 'Too many messages'),
});

export const POST = withAuth<void>(async (req, { user }) => {
  const log = createRequestLogger(req, user);
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

  const aiPrefsHeader = req.headers.get('X-AI-Prefs');
  let customInstructions: string | undefined;
  if (aiPrefsHeader) {
    try {
      const prefs = JSON.parse(aiPrefsHeader) as { customInstructions?: unknown };
      if (typeof prefs.customInstructions === 'string')
        customInstructions = prefs.customInstructions;
    } catch {
      /* ignore malformed AI prefs header */
    }
  }

  // S2 fix — verify thread ownership before any agent work runs.
  // This check gates both single-agent and multi-agent paths.
  const thread = await getThread(user.userId, body.threadId);
  if (!thread) {
    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'Thread not found' } },
      { status: 404 },
    );
  }

  try {
    // Multi-Agent Orchestration — route to multi-agent pipeline if
    // analysisMode is provided and not 'single'. When 'auto', the
    // orchestrator auto-detects based on the user's message.
    const analysisMode = body.analysisMode ?? 'single';

    if (analysisMode !== 'single') {
      const { settings: userSettings, user: userRow } = await getUserWithSettings(user.userId);

      if (!userSettings)
        return errorResponse(new Error('User settings not found. Please complete onboarding.'));

      const displayName =
        userRow?.name?.trim() || (userRow?.email ? userRow.email.split('@')[0] : null);
      const userText = extractUserMessageText(last as UIMessage);
      const resolvedMode = resolveMode(analysisMode, userText);

      if (resolvedMode !== 'single') {
        // U2 — Full mode: queue to worker via analysis_jobs DB table.
        // Quick and standard modes stay synchronous (they're fast enough).
        if (resolvedMode === 'full') {
          const requestId = req.headers.get('x-request-id') ?? undefined;
          return withDiagnostics(user.userId, body.threadId, async () => {
            const job = await enqueueAnalysisJob({
              userId: user.userId,
              threadId: body.threadId,
              userMessageText: userText,
              userMessageParts: (last as UIMessage).parts,
              // The worker reloads authoritative history from chat_messages.
              // Keep this column populated only for backward compatibility;
              // never use the client snapshot as model context.
              historyParts: [],
              mode: 'full',
              status: 'pending',
              // The UI message ID is stable across transport retries. Scope
              // it to the thread so the same client ID cannot collide across
              // conversations or users.
              idempotencyKey: `full:${body.threadId}:${last.id}`,
              // OBS-1: propagate the diagnostic traceId so worker
              // logs can be correlated with this chat turn.
              traceId: getDiagnosticTraceId() ?? crypto.randomUUID(),
            });

            if (!job) {
              return Response.json(
                { error: { code: 'INTERNAL', message: 'Failed to queue analysis job' } },
                { status: 500 },
              );
            }

            const queued = AnalysisQueuedEventSchema.parse({
              type: 'analysis-queued',
              jobId: job.id,
              status: 'queued',
            });
            return Response.json(queued);
          }, requestId ? { requestId } : {});
        }

        // Quick and Standard modes — SSE event stream with a documented
        // event envelope. The format is line-delimited `data: <json>` so it
        // can be consumed by either an EventSource or the AI SDK transport.
        const encoder = new TextEncoder();
        const messageId = crypto.randomUUID();
        // Quick mode has one specialist and should fail fast; Standard keeps
        // the full route budget for its two specialists plus fusion. Full mode
        // is queued and does not use this synchronous timeout.
        const multiAgentTimeoutMs = resolvedMode === 'quick' ? 45_000 : ROUTE_TIMEOUT_MS;
        const multiAgentTimeoutSignal = AbortSignal.timeout(multiAgentTimeoutMs);
        const multiAgentSignal = req.signal
          ? AbortSignal.any([req.signal, multiAgentTimeoutSignal])
          : multiAgentTimeoutSignal;
        let firstTextAt: number | null = null;
        const multiAgentStartedAt = Date.now();
        const stream = new ReadableStream({
          async start(controller) {
            const tracker = new ProgressTracker(
              resolvedMode,
              resolvedMode === 'quick'
                ? ['technical']
                : resolvedMode === 'standard'
                  ? ['technical', 'fundamental']
                  : ['technical', 'fundamental', 'risk', 'sentiment'],
            );
            const streamLog = createRequestLogger(req, user);

            const send = (chunk: object) => {
              const parsed = ChatStreamEventSchema.safeParse(chunk);
              if (!parsed.success) {
                streamLog.warn({ chunk }, 'invalid chat stream event shape');
                return;
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed.data)}\n\n`));
            };

            let textStarted = false;
            let textStreamed = false;
            const startText = () => {
              if (textStarted) return;
              textStarted = true;
              send({ type: 'text-start', id: messageId });
            };

            try {
              const persistedHistory = persistedMessagesToUi(
                await listMessages(user.userId, body.threadId, 200),
              );
              const requestId = req.headers.get('x-request-id') ?? undefined;
              const result = await withDiagnostics(user.userId, body.threadId, () => runMultiAgentChat({
                threadId: body.threadId,
                userId: user.userId,
                userMessage: last as UIMessage,
                // The latest user message is passed separately. Rebuild prior
                // history from the authenticated thread rather than trusting
                // the client-provided transcript.
                history: persistedHistory,
                userSettings,
                displayName: displayName ?? null,
                ...(customInstructions ? { customInstructions } : {}),
                env: pickAiEnv(env),
                signal: multiAgentSignal,
                analysisMode,
                ...(requestId ? { requestId } : {}),
                onProgress: (event) => {
                  const publicEvent = event.type === 'agent_error'
                    ? { ...event, error: 'Required agent failed. Full analysis cannot continue.' }
                    : event.type === 'fusion_error'
                      ? { ...event, error: 'Decision agent failed. Full analysis cannot continue.' }
                      : event.type === 'analysis_error'
                        ? { ...event, error: 'Full analysis stopped. No partial answer was returned.' }
                        : event;
                  tracker.update(publicEvent);
                  send(tracker.buildPart());
                },
                // P1-4/U1 — publish the successfully completed fusion result
                // as an AI SDK text-delta event.
                onTextChunk: (chunk) => {
                  if (!chunk) return;
                  firstTextAt ??= Date.now();
                  textStreamed = true;
                  startText();
                  send({ type: 'text-delta', id: messageId, delta: chunk });
                },
              }), requestId ? { requestId } : {});

              // The quick/standard route can finish before the exporter batch
              // interval. Flush after the durable run result is available so
              // the Langfuse trace is visible even when the function freezes.
              await flushLangfuse();

              // Fusion output is published transactionally. Strict Full mode
              // throws before this point if any required agent or the Decision
              // agent fails, so no partial assistant message can be emitted.
              if (!textStreamed && result.finalText) {
                firstTextAt ??= Date.now();
                startText();
                send({ type: 'text-delta', id: messageId, delta: result.finalText });
              }
              startText();
              send({ type: 'text-end', id: messageId });

              const ttfbMs = firstTextAt === null ? null : firstTextAt - multiAgentStartedAt;
              streamLog.info({
                mode: resolvedMode,
                timeoutMs: multiAgentTimeoutMs,
                ttfbMs,
                totalLatencyMs: result.totalLatencyMs,
              }, 'multi-agent latency');

              // Surface cost/latency/opinions as a transient data part. The client can
              // choose to ignore it; it will not be persisted because it is transient.
              send({
                type: 'data-multi-agent-meta',
                id: messageId,
                data: {
                  agentOpinions: result.agentOpinions,
                  mode: result.mode,
                  totalCostUsd: result.totalCostUsd,
                  totalLatencyMs: result.totalLatencyMs,
                  ttfbMs,
                  messageId: result.messageId,
                },
                transient: true,
              });
            } catch (err) {
              Sentry.captureException(err, {
                tags: { component: 'chat', mode: 'multi-agent', route: '/api/chat' },
                extra: { threadId: body.threadId, userId: user.userId },
              });
              log.error(
                { err: String(err), threadId: body.threadId, mode: resolvedMode },
                'multi-agent chat failed',
              );
              await flushLangfuse();
              const errorMessage =
                err instanceof BudgetExceededError
                  ? 'Daily AI budget exceeded. Please try again tomorrow.'
                  : process.env.NODE_ENV === 'production'
                    ? 'An unexpected error occurred. Please try again.'
                    : err instanceof Error
                      ? err.message
                      : String(err);
              send({ type: 'error', errorText: errorMessage });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }
    }

    // Single-agent fallback (both for explicit 'single' mode and when auto resolves to 'single').
    // `last` is validated by Zod as a user-role message with content, so the
    // UIMessage cast is safe — it carries the id/role/content/parts shape the
    // SDK expects.
    //
    // M6 (RELIABILITY_AUDIT_REPORT.md) — hard route-level timeout so the
    // function can return a clean error before Vercel kills it at 60s.
    const timeoutSignal = AbortSignal.timeout(ROUTE_TIMEOUT_MS);
    const signal = req.signal
      ? AbortSignal.any([req.signal as AbortSignal, timeoutSignal])
      : timeoutSignal;

    const result = await runChat({
      threadId: body.threadId,
      userId: user.userId,
      userMessage: last as UIMessage,
      ...(body.modelOverride !== undefined && body.modelOverride !== null
        ? { modelOverride: body.modelOverride }
        : {}),
      ...(customInstructions ? { customInstructions } : {}),
      env: pickAiEnv(env),
      signal,
      ...(req.headers.get('x-request-id') ? { requestId: req.headers.get('x-request-id')! } : {}),
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
    // OBS-01 (Phase 5.3): Log the error via pino.
    log.error({ err: String(err), threadId: body.threadId }, 'chat agent failed');
    // OBS-01 (Phase 5): Explicitly capture chat errors with chat-specific tags.
    Sentry.captureException(err, {
      tags: { component: 'chat', mode: 'single', route: '/api/chat' },
      extra: { threadId: body.threadId, userId: user.userId },
    });
    // M-3: In production, return a generic error message to avoid
    // leaking internal details (model names, tool names, DB structure).
    // In development, return the full error for debugging.
    const requestId = req.headers.get('x-request-id');
    const errorHeaders: Record<string, string> = {};
    if (requestId) errorHeaders['x-request-id'] = requestId;
    const isProd = process.env.NODE_ENV === 'production';
    const message = isProd
      ? 'An unexpected error occurred. Please try again.'
      : err instanceof Error
        ? err.message
        : String(err);
    return Response.json(
      { error: { code: 'CHAT_FAILED', message, ...(requestId ? { requestId } : {}) } },
      { status: 500, headers: errorHeaders },
    );
  }
});
