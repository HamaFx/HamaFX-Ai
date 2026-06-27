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

// /api/bot/unlink — Unlink Telegram from the user's HamaFX account.
// POST /api/bot/unlink

import { unlinkBot } from '@hamafx/ai';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<void>(async (_req, { user }) => {
  try {
    await unlinkBot(user.userId, 'telegram');
    return Response.json({ success: true, message: 'Telegram unlinked successfully.' });
  } catch (err) {
    return errorResponse(err);
  }
});
