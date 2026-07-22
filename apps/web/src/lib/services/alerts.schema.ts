/**
 * Copyright 2026 HamaFX-Ai
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

import { z } from 'zod';
import { AlertChannelSchema, AlertRuleSchema } from '@hamafx/shared';

/**
 * Client-safe alert schemas.
 *
 * Kept in a separate file so the alert form (a client component) can
 * import them without pulling in the server-only service module.
 */

export const AlertCreateSchema = z.object({
  rule: AlertRuleSchema,
  channels: z.array(AlertChannelSchema).min(1).default(['email']),
  note: z.string().max(280).nullable().default(null),
  snoozeHours: z.number().int().min(0).max(168).default(0),
});

export const AlertPatchSchema = z.object({
  rule: AlertRuleSchema.optional(),
  channels: z.array(AlertChannelSchema).optional(),
  note: z.string().max(280).nullable().optional(),
  active: z.boolean().optional(),
  firedAt: z.number().int().nullable().optional(),
});

export const AlertPreviewBodySchema = z.object({
  rule: AlertRuleSchema,
  lookbackDays: z.number().int().min(1).max(365).default(90),
});

export type AlertCreateInput = z.infer<typeof AlertCreateSchema>;
export type AlertPatchInput = z.infer<typeof AlertPatchSchema>;
export type AlertPreviewInput = z.infer<typeof AlertPreviewBodySchema>;
