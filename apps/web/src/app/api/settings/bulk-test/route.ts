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
    const rate = await withRateLimit(user.userId, 'bulk_test', 2, 5 * 60_000);
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

    // Iterate PROVIDER_IDS in declaration order. Providers without
    // a saved key are reported as 'missing' rather than 'failed' so
    // the UI can label them differently ("no key" vs "key invalid").
    const testedAt = new Date();
    const results: Array<{
      provider: string;
      status: 'ok' | 'failed' | 'missing';
      error?: string;
    }> = await Promise.all(
      PROVIDER_IDS.map(async (providerId) => {
        const key = decrypted?.[providerId];
        if (typeof key !== 'string' || key.trim().length === 0) {
          return { provider: providerId, status: 'missing' as const };
        }
        const r = await testProviderKey(providerId, key);
        return r.ok
          ? { provider: providerId, status: 'ok' as const }
          : { provider: providerId, status: 'failed' as const, error: r.error };
      }),
    );

    // Persist health snapshots so the per-card badge on the page
    // reflects the new test results without the user clicking
    // individual "Test" buttons.
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
      // Wipe prior rows for this user and re-insert. We treat the
      // health table as a snapshot, not an event log.
      await db
        .delete(schema.providerTests)
        .where(eq(schema.providerTests.userId, user.userId));
      await db.insert(schema.providerTests).values(rows);
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const missing = results.filter((r) => r.status === 'missing').length;
    return Response.json({
      results,
      summary: { ok, failed, missing, total: results.length, testedAt: testedAt.toISOString() },
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// silence the unused-import warning when this file is bundled in isolation
