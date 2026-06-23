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

// /api/settings/bulk-test — test every configured BYOK key in one call.
//
// Phase D — api-keys page overhaul.
//
// The api-keys page has a "Test all" button. Clicking it sends
// one POST to this endpoint, which iterates the user's saved
// BYOK keys and runs the same per-provider testProviderKey logic
// the single-test endpoint uses. Returns a per-provider result so
// the UI can show which ones passed, which ones failed, and what
// the error message was.
//
// Auth: NextAuth session gate.
//
// Rate limit: 2 calls / 5 minutes / user. Bulk testing is expensive
// (we hit each provider's SDK init path) and the per-card "Test"
// button is right there for single-provider use.

import { testProviderKey } from '@hamafx/ai';
import { getDb, schema } from '@hamafx/db';
import { decryptByok, PROVIDER_IDS } from '@hamafx/shared/encryption';
import { withRateLimit } from '@hamafx/db';
import { eq } from 'drizzle-orm';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<void>(async (_req, { user }) => {
  try {
    const rate = await withRateLimit(user.userId, 'bulk_test', 2);
    if (!rate.allowed) {
      return Response.json(
        { error: { message: 'Bulk test rate-limited. Try again in a few minutes.' } },
        { status: 429 },
      );
    }

    const db = getDb();
    const [settings] = await db
      .select({ aiApiKeys: schema.userSettings.aiApiKeys })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, user.userId));
    const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;

    const testedAt = new Date();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const results: Array<{
            provider: string;
            status: 'ok' | 'failed' | 'missing';
            error?: string;
          }> = [];

          const activeProviders = PROVIDER_IDS.filter((id) => {
            const key = decrypted?.[id];
            return typeof key === 'string' && key.trim().length > 0;
          });

          const total = activeProviders.length;
          let current = 0;

          // Fill in missing ones first
          for (const id of PROVIDER_IDS) {
            const key = decrypted?.[id];
            if (typeof key !== 'string' || key.trim().length === 0) {
              results.push({ provider: id, status: 'missing' as const });
            }
          }

          // Test active ones sequentially
          for (const providerId of activeProviders) {
            current += 1;
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'progress',
                  current,
                  total,
                  provider: providerId,
                }) + '\n',
              ),
            );

            const key = decrypted?.[providerId] ?? '';
            const r = await testProviderKey(providerId, key);
            const status = r.ok ? ('ok' as const) : ('failed' as const);
            results.push({
              provider: providerId,
              status,
              ...(r.ok ? {} : { error: r.error }),
            });
          }

          // Persist health snapshots
          const rows = results
            .filter((r) => r.status !== 'missing')
            .map((r) => ({
              userId: user.userId,
              providerId: r.provider,
              ok: r.status === 'ok',
              error: r.status === 'failed' ? r.error ?? 'unknown error' : null,
              testedAt: testedAt.toISOString(),
            }));
          if (rows.length > 0) {
            await db
              .delete(schema.providerTests)
              .where(eq(schema.providerTests.userId, user.userId));
            await db.insert(schema.providerTests).values(rows);
          }

          const ok = results.filter((r) => r.status === 'ok').length;
          const failed = results.filter((r) => r.status === 'failed').length;
          const missing = results.filter((r) => r.status === 'missing').length;

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'done',
                results,
                summary: { ok, failed, missing, total: results.length, testedAt: testedAt.toISOString() },
              }) + '\n',
            ),
          );
        } catch (e) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'error',
                message: e instanceof Error ? e.message : 'Testing failed',
              }) + '\n',
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'application/x-ndjson',
        'cache-control': 'no-cache',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// silence the unused-import warning when this file is bundled in isolation
