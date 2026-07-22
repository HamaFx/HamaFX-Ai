// SPDX-License-Identifier: Apache-2.0

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
