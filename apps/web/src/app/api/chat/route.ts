// SPDX-License-Identifier: Apache-2.0

// /api/chat — Mastra-owned chat boundary. Kestrel retains HTTP validation,
// authentication, persistence, budgets, and the UI transport; Mastra owns
// agent selection, workflows, tool loops, structured research, and synthesis.

import {
  classifyMutationRequest,
  isMastraMutationEnabled,
  MutationExtractionError,
} from '@kestrel/ai/mastra';
import type { UIMessage } from 'ai';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { createRequestLogger } from '@/lib/logger';
import {
  AnalysisQueuedEventSchema,
  BudgetExceededError,
  enqueueFullAnalysis,
  extractUserMessageText,
  getThread,
  listMessages,
  resolveMode,
  traceIdStorage,
  withDiagnostics,
  withRateLimit,
} from '@/lib/services/api-boundary';
import { startMutationDraft } from '@/lib/services/mastra-mutation-draft';
import { runMastraCanonicalChatStreamService } from '@/lib/services/mastra-canonical-chat-stream';
import { runMastraXauusdChat } from '@/lib/services/mastra-chat';
import { runMastraXauusdConversationStreamChat } from '@/lib/services/mastra-chat-stream';
import { mastraChatResponse } from '@/lib/services/mastra-chat-response';
import {
  extractMastraSymbol,
  isMastraPromptUnsafe,
  isMastraSymbolCandidate,
  isMastraXauusdCandidate,
  isMastraXauusdFollowupCandidate,
  mastraXauusdChatKind,
} from '@/lib/services/mastra-chat-routing';
import { runMastraModeChat } from '@/lib/services/mastra-mode';
import { mastraModeResponse } from '@/lib/services/mastra-mode-response';
import {
  extractLatestMastraReport,
  mayReferToMastraReport,
} from '@/lib/services/mastra-report-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROUTE_TIMEOUT_MS = 55_000;
const CHAT_RATE_LIMIT = Number(process.env.AI_CHAT_RATE_LIMIT ?? '30');

const BodySchema = z.object({
  threadId: z.string().uuid(),
  modelOverride: z.string().min(1).max(120).nullable().optional(),
  analysisMode: z.enum(['single', 'quick', 'standard', 'full', 'auto']).optional(),
  messages: z
    .array(
      z.object({
        id: z.string().max(200),
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(50_000, 'Message too long').default(''),
        parts: z.array(z.unknown()).max(50, 'Too many message parts').default([]),
      }),
    )
    .min(1)
    .max(100, 'Too many messages'),
});

function errorJson(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

function mastraFailureResponse(error: unknown): Response {
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Mastra could not complete this request. Please try again.'
      : error instanceof Error
        ? error.message
        : String(error);
  return errorJson('MASTRA_FAILED', message, 502);
}

function isReadOnlySafePrompt(prompt: string): boolean {
  return !isMastraPromptUnsafe(prompt);
}

export const POST = withAuth<void>(async (req, { user }) => {
  const log = createRequestLogger(req, user);
  const rateLimit = await withRateLimit(user.userId, 'ai_chat', CHAT_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Too many chat turns (${rateLimit.count}/${rateLimit.limit} per minute). Slow down.`,
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (error) {
    return errorResponse(error);
  }

  const last = body.messages.at(-1);
  if (!last || last.role !== 'user') {
    return errorJson('VALIDATION', 'last message must be from the user', 400);
  }

  try {
    getServerEnv();
  } catch (error) {
    return errorResponse(error);
  }

  const aiPrefsHeader = req.headers.get('X-AI-Prefs');
  let customInstructions: string | undefined;
  if (aiPrefsHeader) {
    try {
      const prefs = JSON.parse(aiPrefsHeader) as { customInstructions?: unknown };
      if (typeof prefs.customInstructions === 'string') {
        customInstructions = prefs.customInstructions;
      }
    } catch {
      // Malformed optional preferences do not invalidate the chat request.
    }
  }

  const thread = await getThread(user.userId, body.threadId);
  if (!thread) return errorJson('NOT_FOUND', 'Thread not found', 404);

  const analysisMode = body.analysisMode ?? 'single';
  const userMessage = last as UIMessage;
  const userText = extractUserMessageText(userMessage);
  const priorReport = mayReferToMastraReport(userText)
    ? extractLatestMastraReport(await listMessages(user.userId, body.threadId, 100))
    : null;
  const resolvedMode = resolveMode(analysisMode, userText);

  // Mutations and injection-like requests are intentionally rejected rather
  // than handed to an old fallback. When the operator enables the mutation
  // capability, a clearly-mutation prompt is routed to the confirmation
  // workflow instead: classify → extract (fast model) → draft → suspend with
  // a single-use token. Nothing is written until the user confirms.
  if (isMastraMutationEnabled()) {
    const mutationKind = classifyMutationRequest(userText);
    if (mutationKind !== null) {
      try {
        const draft = await startMutationDraft({
          userId: user.userId,
          threadId: body.threadId,
          userText,
          kind: mutationKind,
        });
        return Response.json(draft);
      } catch (error) {
        if (error instanceof MutationExtractionError) {
          return errorJson('MUTATION_EXTRACTION_FAILED', error.message, 422);
        }
        log.error(
          { err: String(error), threadId: body.threadId, mutation: mutationKind },
          'Mutation draft failed',
        );
        return errorJson('MUTATION_DRAFT_FAILED', 'Could not prepare this mutation for confirmation.', 502);
      }
    }
  }

  if (!isReadOnlySafePrompt(userText)) {
    return errorJson(
      'READ_ONLY_REQUEST_REQUIRED',
      'This request is not eligible for the read-only Mastra research capabilities.',
      422,
    );
  }

  try {
    // Full mode remains durable: the web request enqueues a Mastra workflow
    // run (pending snapshot) and the worker claims it. Explicit model
    // overrides are not yet serializable on the run payload, so reject them
    // clearly instead of silently selecting another model.
    if (resolvedMode === 'full') {
      if (body.modelOverride != null) {
        return errorJson(
          'MODEL_OVERRIDE_UNSUPPORTED',
          'Full analysis currently uses the configured Mastra worker model; remove the override and retry.',
          400,
        );
      }
      const requestId = req.headers.get('x-request-id') ?? undefined;
      return withDiagnostics(
        user.userId,
        body.threadId,
        async () => {
          const runId = await enqueueFullAnalysis({
            userId: user.userId,
            threadId: body.threadId,
            userMessageText: userText,
            userMessageParts: userMessage.parts,
            idempotencyKey: `full:${body.threadId}:${last.id}`,
            traceId: traceIdStorage.getStore() ?? crypto.randomUUID(),
          });
          if (!runId) return errorJson('INTERNAL', 'Failed to queue analysis job', 500);
          return Response.json(
            AnalysisQueuedEventSchema.parse({
              type: 'analysis-queued',
              jobId: runId,
              status: 'queued',
            }),
          );
        },
        requestId ? { requestId } : {},
      );
    }

    const timeout = AbortSignal.timeout(ROUTE_TIMEOUT_MS);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
    const symbol = extractMastraSymbol(userText);
    const hasReportFollowup = priorReport !== null && isMastraXauusdFollowupCandidate(userText);

    // Deep XAUUSD analysis and verified-report follow-ups retain their
    // specialized packet/report verifier. This path is always preferred over
    // generic chat when the request is clearly about XAUUSD.
    //
    // Verified reports (kind === 'research') stay buffered until verification
    // completes. Ordinary XAUUSD conversation (kind === 'conversation') streams
    // provider tokens immediately.
    if (
      (symbol === 'XAUUSD' && (isMastraXauusdCandidate(userText) || hasReportFollowup)) ||
      (resolvedMode === 'single' && symbol === 'XAUUSD' && priorReport !== null)
    ) {
      const kind = mastraXauusdChatKind(userText, priorReport !== null);
      if (kind === 'conversation') {
        return runMastraXauusdConversationStreamChat({
          userId: user.userId,
          threadId: body.threadId,
          userMessage,
          prompt: userText,
          modelOverride: body.modelOverride ?? null,
          signal,
          ...(priorReport ? { priorReport } : {}),
        });
      }
      const run = await runMastraXauusdChat({
        userId: user.userId,
        threadId: body.threadId,
        userMessage,
        prompt: userText,
        kind,
        modelOverride: body.modelOverride ?? null,
        signal,
        ...(priorReport ? { followup: true, priorReport } : {}),
      });
      return mastraChatResponse({
        messageId: crypto.randomUUID(),
        text: run.result.text,
        runId: run.runId,
        modelId: run.modelId,
        providerId: run.providerId,
        report: run.report,
        researchStatus: run.packet.status,
        dataQuality: run.packet.dataQuality,
        packetId: run.packet.packetId,
        observedCost: run.observedCost,
      });
    }

    // Quick, Standard, and symbol-scoped Single requests use the bounded
    // shared-packet Mastra mode workflow. It is no longer feature-flagged and
    // has no legacy fallback.
    if (resolvedMode === 'quick' || resolvedMode === 'standard' || symbol !== null) {
      if (!symbol || !isMastraSymbolCandidate(userText)) {
        return errorJson(
          'UNSUPPORTED_RESEARCH_SCOPE',
          'Mastra requires one supported symbol and a read-only research request.',
          422,
        );
      }
      const run = await runMastraModeChat({
        userId: user.userId,
        threadId: body.threadId,
        userMessage,
        prompt: userText,
        symbol,
        mode: resolvedMode === 'quick' || resolvedMode === 'standard' ? resolvedMode : 'single',
        modelOverride: body.modelOverride ?? null,
        signal,
      });
      return mastraModeResponse(run);
    }

    // Ordinary symbol-free conversation is handled by the streaming canonical
    // Mastra agent, which owns the reviewed read-only Kestrel tool allowlist.
    return runMastraCanonicalChatStreamService({
      userId: user.userId,
      threadId: body.threadId,
      userMessage,
      modelOverride: body.modelOverride ?? null,
      ...(customInstructions ? { customInstructions } : {}),
      signal,
    });
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return errorJson(
        'BUDGET_EXCEEDED',
        `Daily AI budget exceeded ($${error.spent.toFixed(2)} / $${error.max.toFixed(2)}). Resets at UTC midnight.`,
        429,
      );
    }
    log.error({ err: String(error), threadId: body.threadId }, 'Mastra chat failed');
    return mastraFailureResponse(error);
  }
});
