// /api/chat — streaming chat endpoint. Receives a UI messages array from
// `useChat`, runs the agent, and streams back the SDK's UI-message stream
// for the client to consume.

import { BudgetExceededError, runChat } from '@hamafx/ai';
import { providerUnavailable } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, parseJsonBody } from '@/lib/api';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// We only validate the parts of the body we care about. The full UIMessage
// shape is large + provider-specific, so we trust the client (which is also
// us) for the rest.
const BodySchema = z.object({
  threadId: z.string().uuid(),
  /**
   * Phase 7c — optional one-shot model override forwarded from the chat
   * surface's "Regenerate with…" picker. Wins over the router's per-domain
   * choice for this turn only; the persisted thread.modelOverride is
   * untouched.
   */
  modelOverride: z.string().min(1).max(120).nullable().optional(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(['user', 'assistant', 'system']),
        parts: z.array(z.unknown()).default([]),
      }),
    )
    .min(1),
});

export async function POST(req: Request): Promise<Response> {
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

  // Auto-Journal — the chat route used to regex-parse `Journal: …` shortcuts
  // and call `createEntry` server-side, but the same user message was then
  // forwarded to the model verbatim, which has a `log_journal` tool and
  // would create a duplicate row. The model owns journal logging now;
  // unstructured "I just bought XAU at 2400" messages still work via the
  // tool. See docs/15-hardening-phase-1-correctness.md §2.

  try {
    const result = await runChat({
      threadId: body.threadId,
      // The client-side cast to UIMessage is safe enough here — we only
      // forward the shape AI SDK already understands.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userMessage: last as any,
      ...(body.modelOverride !== undefined && body.modelOverride !== null
        ? { modelOverride: body.modelOverride }
        : {}),
      env: {
        AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
        GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT,
        GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
        GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
        GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
        AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL,
        AI_TITLE_MODEL: env.AI_TITLE_MODEL,
        AI_VISION_MODEL: env.AI_VISION_MODEL,
        AI_FUNDAMENTAL_MODEL: env.AI_FUNDAMENTAL_MODEL,
        AI_TECHNICAL_MODEL: env.AI_TECHNICAL_MODEL,
        AI_SUMMARY_MODEL: env.AI_SUMMARY_MODEL,
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
}
