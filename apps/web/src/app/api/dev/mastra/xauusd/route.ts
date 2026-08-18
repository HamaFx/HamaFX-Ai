// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { withRateLimit } from '@/lib/services/api-boundary';
import { runMastraXauusdResearch } from '@/lib/services/mastra-xauusd';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodySchema = z.object({
  threadId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(10_000),
});

function isEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.ENABLE_MASTRA_POC === 'true';
}

export const POST = withAuth<void>(async (req, { user }) => {
  if (!isEnabled()) return new Response('Not Found', { status: 404 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (error) {
    return errorResponse(error, req);
  }

  const rateLimit = await withRateLimit(user.userId, 'mastra_xauusd_poc', 5);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many Mastra proof-of-concept runs.' } },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const runId = crypto.randomUUID();
  const timeout = AbortSignal.timeout(55_000);
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;

  try {
    const run = await runMastraXauusdResearch({
      userId: user.userId,
      threadId: body.threadId,
      runId,
      prompt: body.prompt,
      signal,
    });

    return Response.json({
      runId,
      modelId: run.modelId,
      providerId: run.providerId,
      stats: run.stats,
      researchStatus: run.packet.status,
      dataQuality: run.packet.dataQuality,
      packetId: run.packet.packetId,
      report: run.report,
      text: run.result.text,
    });
  } catch (error) {
    return errorResponse(error, req);
  }
});
