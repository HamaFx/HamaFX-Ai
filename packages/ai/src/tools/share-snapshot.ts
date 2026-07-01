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

// Tool: share_snapshot.
//
// Persists a one-off analysis snapshot to `shared_snapshots` and returns
// a signed URL of the form `https://<host>/share/<id>?t=<token>`. The
// host comes from `NEXT_PUBLIC_APP_URL`. The token is an HMAC-SHA-256 of
// `{id, exp}` keyed off `AUTH_COOKIE_SECRET`, so the share route can
// verify access without a session cookie. Bypassed by the password gate
// in middleware; gated instead by the token signature + expiry.

import { ShareSnapshotInputSchema, type ShareSnapshotOutput } from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

import { createSnapshot } from '../share/persistence';
import { signShareToken } from '../share/sign';
import { getToolContext } from '../tool-context';
import { assertMutationIntent } from './mutation-guard';

const InputSchema = ShareSnapshotInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    share_snapshot: { input: z.infer<typeof InputSchema> };
  }
}

export const shareSnapshotTool = tool({
  description:
    "Persist a one-off analysis snapshot (title + body + optional chart overlay) and return a signed share URL the user can paste into Telegram/iMessage/etc. The link is valid for `ttlMinutes` (default 7 days). Use when the user says 'share this analysis' or 'send me a link to this'. The link bypasses the password gate but verifies an HMAC token, so the password is never exposed.",
  inputSchema: InputSchema,
  execute: async ({ title, body, overlay, symbol, tf, ttlMinutes }): Promise<ShareSnapshotOutput> => {
    assertMutationIntent('share_snapshot');
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    const row = await createSnapshot({
      userId: getToolContext().userId,
      title,
      body,
      ...(overlay !== undefined ? { overlay } : {}),
      ...(symbol !== undefined ? { symbol } : {}),
      ...(tf !== undefined ? { tf } : {}),
      expiresAt,
    });

    const secret = process.env.AUTH_COOKIE_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('share_snapshot: AUTH_COOKIE_SECRET missing or too short');
    }
    const token = signShareToken({ id: row.id, exp: row.expiresAt }, secret);

    const host = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const base = host.replace(/\/+$/, '');
    const url = `${base}/share/${row.id}?t=${token}`;

    return { id: row.id, url, expiresAt: row.expiresAt };
  },
});
