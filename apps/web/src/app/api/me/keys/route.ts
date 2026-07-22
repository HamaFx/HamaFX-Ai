// SPDX-License-Identifier: Apache-2.0

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
import { getUserWithSettings } from '@hamafx/db';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const { settings } = await getUserWithSettings(user.userId);
    const providers = configuredProviders(decryptByok(settings?.aiApiKeys));
    return Response.json({ providers });
  } catch (err) {
    return errorResponse(err);
  }
});
