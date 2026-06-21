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

// /api/settings/default-model — per-user per-domain default model
// overrides. The resolver consults these before falling back to
// the spec defaults in BYOK_PROVIDERS.defaultModels.
//
//   GET  /api/settings/default-model
//     → { defaults: { fundamental?: "<provider>:<modelId>", ... } }
//
//   POST /api/settings/default-model
//     body: { domain: ModelDomain, providerId: ProviderId, modelId: string }
//        | { domain: ModelDomain, clear: true }
//     → { ok: true, defaults: ... }
//
//   DELETE /api/settings/default-model?domain=fundamental
//     → { ok: true, defaults: ... }
//
// Auth: NextAuth session gate. The user only ever sees/owns their
// own overrides.

import {
  BYOK_PROVIDERS,
  type ModelDomain,
} from '@hamafx/ai';
import {
  PROVIDER_IDS,
  type ProviderId,
} from '@hamafx/shared/encryption';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  errorResponse,
  parseJsonBody,
  withAuth,
} from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DefaultModels {
  fundamental?: string;
  technical?: string;
  summary?: string;
  vision?: string;
  embedding?: string;
}

async function getCurrentDefaults(userId: string): Promise<DefaultModels> {
  const db = getDb();
  const [row] = await db
    .select({ defaultModels: schema.userSettings.defaultModels })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  return (row?.defaultModels ?? {}) as DefaultModels;
}

const DOMAIN_VALUES = [
  'fundamental',
  'technical',
  'summary',
  'vision',
  'embedding',
] as const;

// Hand-written discriminated union — `z.discriminatedUnion(...).infer<typeof>`
// in this Zod version resolves to a union that includes an open
// `{ [x: string]: any }` member, which prevents downstream narrowing
// from working. Inline the type so narrowing is reliable.
// (Kept as documentation — the request shape lives entirely in
// PostBodySchema below. The inline interface is currently unused
// after the move to runtime shape checks — see POST handler.)
interface _SetDefaultBodyShape {
  action: 'set';
  domain: typeof DOMAIN_VALUES[number];
  providerId: ProviderId;
  modelId: string;
}
interface _ClearDefaultBodyShape {
  action: 'clear';
  domain: typeof DOMAIN_VALUES[number];
}

const PostBodySchema = z.union([
  z.object({
    action: z.literal('set'),
    domain: z.enum(DOMAIN_VALUES),
    providerId: z.enum(PROVIDER_IDS as readonly [ProviderId, ...ProviderId[]]),
    modelId: z.string().min(1).max(120),
  }),
  z.object({
    action: z.literal('clear'),
    domain: z.enum(DOMAIN_VALUES),
  }),
]);

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const defaults = await getCurrentDefaults(user.userId);
    return Response.json({ defaults });
  } catch (err) {
    return errorResponse(err);
  }
});

export const POST = withAuth<void>(async (req, { user }) => {
  // Parse + validate first; on failure, return the Zod error.
  let body: unknown;
  try {
    body = await parseJsonBody(req, PostBodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  // The parsed value has the discriminated shape but the inferred
  // type from Zod's union is too wide for TS narrowing; do an
  // explicit shape check and handle each branch.
  if (
    typeof body === 'object' &&
    body !== null &&
    'action' in body &&
    (body as { action: unknown }).action === 'clear' &&
    'domain' in body &&
    typeof (body as { domain: unknown }).domain === 'string' &&
    (DOMAIN_VALUES as readonly string[]).includes(
      (body as { domain: string }).domain,
    )
  ) {
    const domain = (body as { domain: typeof DOMAIN_VALUES[number] }).domain;
    const current = await getCurrentDefaults(user.userId);
    const { [domain]: _omit, ...rest } = current;
    await persist(user.userId, rest);
    return Response.json({ ok: true, defaults: rest });
  }

  // 'set' branch
  if (
    typeof body === 'object' &&
    body !== null &&
    'action' in body &&
    (body as { action: unknown }).action === 'set' &&
    'providerId' in body &&
    'modelId' in body &&
    'domain' in body
  ) {
    const setBody = body as {
      providerId: string;
      modelId: string;
      domain: string;
    };
    const providerId = setBody.providerId as ProviderId;
    // The cast above is safe — parseJsonBody + the zod enum on
    // providerId already validated membership in PROVIDER_IDS.
    // We can't use the `PROVIDER_IDS.includes(x)` narrowing trick
    // here because providerId is already widened to string by the
    // cast (the includes() check would only narrow string, not the
    // ProviderId literal union).
    if (!BYOK_PROVIDERS[providerId]) {
      return Response.json(
        { error: { message: `Unknown provider: ${providerId}` } },
        { status: 400 },
      );
    }
    const spec = BYOK_PROVIDERS[providerId];
    const known = spec.models ?? [];
    // Models with provider prefix (OpenRouter, Vertex) come in as
    // `<provider>/<bare>` — strip the prefix before lookup.
    const bareModelId = setBody.modelId.includes('/')
      ? setBody.modelId.split('/').slice(1).join('/')
      : setBody.modelId;
    if (!known.some((m: { modelId: string }) => m.modelId === bareModelId)) {
      return Response.json(
        {
          error: {
            message: `Model ${setBody.modelId} is not in the ${providerId} catalog`,
          },
        },
        { status: 400 },
      );
    }

    if (!(DOMAIN_VALUES as readonly string[]).includes(setBody.domain)) {
      return Response.json(
        { error: { message: `Invalid domain: ${setBody.domain}` } },
        { status: 400 },
      );
    }
    const domain = setBody.domain as typeof DOMAIN_VALUES[number];

    const current = await getCurrentDefaults(user.userId);
    const next = { ...current, [domain]: `${providerId}:${bareModelId}` };
    await persist(user.userId, next);
    return Response.json({ ok: true, defaults: next });
  }

  return Response.json(
    { error: { message: 'Invalid request body. Expected {action, domain, ...}.' } },
    { status: 400 },
  );
});

export const DELETE = withAuth<void>(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const domain = url.searchParams.get('domain');
    if (!domain || !(DOMAIN_VALUES as readonly string[]).includes(domain)) {
      return Response.json(
        {
          error: {
            message: `Missing or invalid domain. Expected one of: ${DOMAIN_VALUES.join(', ')}`,
          },
        },
        { status: 400 },
      );
    }
    const domainLiteral = domain as typeof DOMAIN_VALUES[number];
    const current = await getCurrentDefaults(user.userId);
    const { [domainLiteral]: _omit, ...rest } = current;
    await persist(user.userId, rest);
    return Response.json({ ok: true, defaults: rest });
  } catch (err) {
    return errorResponse(err);
  }
});

async function persist(
  userId: string,
  defaults: DefaultModels,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.userSettings)
    .set({ defaultModels: defaults })
    .where(eq(schema.userSettings.userId, userId));
}

// Domain export — handy for tests and for the client picker UI.
export { DOMAIN_VALUES };
export type { ModelDomain };
// Re-export from model so callers can type-check without a separate
// `@hamafx/ai` import (RSC bundle size win).
void ({} as { ProviderId: ProviderId });