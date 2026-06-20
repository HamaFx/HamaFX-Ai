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

// /api/me/keys — return the list of provider ids the current user
// has a BYOK key for. Used by the chat regenerate popover to
// render a provider tab.
//
// Phase B — UX_UPGRADE_PLAN.md item 8.
//
// Response shape:
//   { providers: string[] }  — provider ids (e.g. ["anthropic", "google"])
//
// Auth: NextAuth session gate; unauthenticated requests return 401.
// The endpoint never returns key values — only the presence/absence
// per provider.

import { configuredProviders, decryptByok } from '@hamafx/shared/encryption';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const db = getDb();
    const [settings] = await db
      .select({ aiApiKeys: schema.userSettings.aiApiKeys })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, user.userId));
    const providers = configuredProviders(decryptByok(settings?.aiApiKeys));
    return Response.json({ providers });
  } catch (err) {
    return errorResponse(err);
  }
});
