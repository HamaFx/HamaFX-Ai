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

// F4 — Notification Noise Control
//
// Zod schemas for dedup, cooldown, quiet hours, severity filtering,
// and per-route channel routing. These are the shared contract between
// the AI package noise engine, API routes, and the settings UI.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F4 for the full design.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const SeveritySchema = z.enum(['info', 'warning', 'error', 'critical']);
export type Severity = z.infer<typeof SeveritySchema>;

export const RouteTypeSchema = z.enum([
  'report',
  'alert',
  'system_error',
  'signal_outcome',
  'briefing',
  'usage_warning',
]);
export type RouteType = z.infer<typeof RouteTypeSchema>;

export const ChannelSchema = z.enum(['email', 'push', 'telegram']);
export type Channel = z.infer<typeof ChannelSchema>;

export const NoiseReasonCodeSchema = z.enum([
  'allowed',
  'duplicate',
  'cooldown',
  'quiet_hours',
  'below_min_severity',
]);
export type NoiseReasonCode = z.infer<typeof NoiseReasonCodeSchema>;

// ---------------------------------------------------------------------------
// Noise Decision — output of evaluateNoise()
// ---------------------------------------------------------------------------

export const NoiseDecisionSchema = z.object({
  shouldSend: z.boolean(),
  reasonCode: NoiseReasonCodeSchema,
  message: z.string(),
  dedupKey: z.string().nullable(),
  cooldownKey: z.string().nullable(),
});
export type NoiseDecision = z.infer<typeof NoiseDecisionSchema>;

// ---------------------------------------------------------------------------
// Noise Config — per-user configuration
// ---------------------------------------------------------------------------

export const QuietHoursSchema = z
  .object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  })
  .nullable();

export const NoiseConfigSchema = z.object({
  dedupTtlSeconds: z.number().int().min(0).max(86_400).default(300),
  cooldownSeconds: z.number().int().min(0).max(86_400).default(60),
  quietHours: QuietHoursSchema.default(null),
  timezone: z.string().default('UTC'),
  minSeverity: SeveritySchema.default('info'),
  minSeverityDuringQuietHours: SeveritySchema.default('critical'),
  dailyDigestMode: z.boolean().default(false),
});
export type NoiseConfig = z.infer<typeof NoiseConfigSchema>;

// ---------------------------------------------------------------------------
// Route Config — which channels get which notification types
// ---------------------------------------------------------------------------

export const RouteConfigSchema = z.object({
  report: z.array(ChannelSchema).default(['email']),
  alert: z.array(ChannelSchema).default(['push', 'telegram']),
  signal_outcome: z.array(ChannelSchema).default(['push']),
  system_error: z.array(ChannelSchema).default(['email']),
  briefing: z.array(ChannelSchema).default(['push']),
  usage_warning: z.array(ChannelSchema).default(['email', 'push']),
});
export type RouteConfig = z.infer<typeof RouteConfigSchema>;

// ---------------------------------------------------------------------------
// Noise State — persisted dedup/cooldown state
// ---------------------------------------------------------------------------

export const NoiseStateEntrySchema = z.object({
  dedupKey: z.string(),
  routeType: RouteTypeSchema,
  lastSentAt: z.number().int(),
  expiresAt: z.number().int(),
});
export type NoiseStateEntry = z.infer<typeof NoiseStateEntrySchema>;

// ---------------------------------------------------------------------------
// Severity ranking helper
// ---------------------------------------------------------------------------

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity] ?? 0;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_NOISE_CONFIG: NoiseConfig = {
  dedupTtlSeconds: 300,
  cooldownSeconds: 60,
  quietHours: null,
  timezone: 'UTC',
  minSeverity: 'info',
  minSeverityDuringQuietHours: 'critical',
  dailyDigestMode: false,
};

export const DEFAULT_ROUTE_CONFIG: RouteConfig = {
  report: ['email'],
  alert: ['push', 'telegram'],
  signal_outcome: ['push'],
  system_error: ['email'],
  briefing: ['push'],
  usage_warning: ['email', 'push'],
};