// SPDX-License-Identifier: Apache-2.0

import { marketDataProviders } from '@hamafx/data';
import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  provider: z.enum(['biquote', 'finnhub', 'live-ticks']),
  apiKey: z.string().max(8192).optional(),
});

export const POST = withAuth<void>(async (req) => {
  let body: z.infer<typeof BodySchema>;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  let providerInstance;
  try {
    providerInstance = marketDataProviders.get(body.provider);
  } catch {
    return Response.json(
      { ok: false, error: `Invalid provider: ${body.provider}` },
      { status: 400 },
    );
  }

  if (!providerInstance.testConnection) {
    return Response.json(
      { ok: false, error: `Provider "${body.provider}" does not support connection testing` },
      { status: 400 },
    );
  }

  const result = await providerInstance.testConnection(
    body.apiKey ? { apiKey: body.apiKey, baseUrl: body.apiKey } : undefined,
  );

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error ?? 'Connection test failed' },
      { status: 400 }
    );
  }
  return Response.json({ ok: true });
});
