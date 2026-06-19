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

// Output envelope returned by the `share_snapshot` AI tool.
//
// Persists a one-off analysis snapshot to `shared_snapshots` and returns
// a signed URL of the form `https://<host>/share/<id>?t=<token>`. The
// token is an HMAC of `{id, expiresAt}` keyed off `AUTH_COOKIE_SECRET`,
// so the share route can verify access without a database read of any
// session cookie.
//
// Source of truth: packages/ai/src/tools/share-snapshot.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { TimeframeSchema } from '../../timeframes';
import { AnnotateChartOutputSchema } from './annotate-chart';

const DEFAULT_TTL_MINUTES = 7 * 24 * 60; // 7 days
const MAX_TTL_MINUTES = 30 * 24 * 60; // 30 days

export const ShareSnapshotInputSchema = z.object({
  title: z.string().min(2).max(200),
  body: z.string().min(2).max(8000),
  /** Optional `AnnotateChartOutput` so the share page can re-render an overlay. */
  overlay: AnnotateChartOutputSchema.optional(),
  symbol: SymbolSchema.optional(),
  tf: TimeframeSchema.optional(),
  /** Minutes from now until the share link stops working. */
  ttlMinutes: z.number().int().min(5).max(MAX_TTL_MINUTES).default(DEFAULT_TTL_MINUTES),
});
export type ShareSnapshotInput = z.infer<typeof ShareSnapshotInputSchema>;

export const ShareSnapshotOutputSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  /** ms epoch UTC at which the share link expires. */
  expiresAt: z.number().int(),
});
export type ShareSnapshotOutput = z.infer<typeof ShareSnapshotOutputSchema>;
