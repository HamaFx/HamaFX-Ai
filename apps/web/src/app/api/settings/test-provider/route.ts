// SPDX-License-Identifier: Apache-2.0

import { testProviderKey } from '@hamafx/ai';
import { PROVIDER_IDS, type ProviderId } from '@hamafx/shared/encryption';
import { schema } from '@hamafx/db';
import { getDb } from '@hamafx/ai';
import { and, eq } from 'drizzle-orm';
import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vertex service-account JSON files are typically 1.5-2.5 KB; the
// `private_key` field alone is ~1.6 KB after newline escapes. 8 KB
// covers every realistic key size.
const BodySchema = z.object({
  provider: z.enum(PROVIDER_IDS as readonly [ProviderId, ...ProviderId[]]),
  apiKey: z.string().min(8).max(8192),
});

export const POST = withAuth<void>(async (req, { user }) => {
  let body: z.infer<typeof BodySchema>;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  const result = await testProviderKey(body.provider, body.apiKey);

  // Phase A — UX_UPGRADE_PLAN.md item 7. Upsert the latest test
  // result for this (user, provider). Idempotent: re-testing
  // overwrites the previous row rather than accumulating history.
  // The health badge on /settings/api-keys reads from this table.
  const db = getDb();
  const testedAt = new Date();
  await db
    .delete(schema.providerTests)
    .where(
      and(
        eq(schema.providerTests.userId, user.userId),
        eq(schema.providerTests.providerId, body.provider),
      ),
    );
  await db.insert(schema.providerTests).values({
    userId: user.userId,
    providerId: body.provider,
    ok: result.ok,
    error: result.ok ? null : (result.error ?? 'unknown error'),
    testedAt: testedAt.toISOString(),
    rateLimit: result.ok ? ((result as Record<string, unknown>).rateLimit as { remainingRequests?: number; remainingTokens?: number; resetRequests?: string; resetTokens?: string; } | null) : undefined,
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }
  return Response.json({ ok: true });
});
