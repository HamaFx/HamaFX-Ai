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
