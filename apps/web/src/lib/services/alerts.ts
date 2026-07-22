// SPDX-License-Identifier: Apache-2.0

// PF-22 — Alerts service layer.
//
// Separates business logic from HTTP handling. Route handlers (controllers)
// call these service functions instead of importing @hamafx/ai directly.
// The service layer handles:
//   - Input validation (Zod schemas)
//   - Authorization checks (scoped to userId)
//   - Error wrapping (converts domain errors to typed results)
//   - Response formatting (returns typed DTOs)
//
// Pattern: Service (PF-22). Controllers remain thin: parse request →
// call service → format Response.

import {
  listAlerts as aiListAlerts,
  getAlert as aiGetAlert,
  createAlert as aiCreateAlert,
  updateAlert as aiUpdateAlert,
  deleteAlert as aiDeleteAlert,
  simulateAlert,
  getNoiseConfig,
  type SimCandle,
} from '@hamafx/ai';
import type { Alert, AlertRule, NoiseConfig, Severity } from '@hamafx/shared';
import { SEVERITY_RANK } from '@hamafx/shared';
import { getRecentCandles, withRateLimit } from '@hamafx/db';

// ── Schemas (re-exported from the client-safe schema file) ───────────────────

import {
  AlertCreateSchema,
  AlertPatchSchema,
  AlertPreviewBodySchema,
  type AlertCreateInput,
  type AlertPatchInput,
  type AlertPreviewInput,
} from './alerts.schema';

export { AlertCreateSchema, AlertPatchSchema, AlertPreviewBodySchema };
export type { AlertCreateInput, AlertPatchInput, AlertPreviewInput };

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface AlertDTO {
  id: string;
  userId: string;
  rule: AlertRule;
  channels: string[];
  note: string | null;
  snoozeHours: number;
  active: boolean;
  firedAt: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreviewResultDTO {
  count: number;
  avgHoldMs: number;
  recentFires: number[];
  unsupported: boolean;
}

export interface PreviewDigestDTO {
  breakdown: {
    total: number;
    allowed: number;
    blocked: number;
    bySeverity: { severity: Severity; total: number; allowed: number; blocked: number }[];
    digestMode: boolean;
  };
  allowedPct: number;
  blockedPct: number;
  dailyEstimate: number;
}

// ── DTO mappers ──────────────────────────────────────────────────────────────

/** Map domain Alert → AlertDTO (number timestamps → Date objects, field name mapping). */
function toAlertDTO(a: Alert): AlertDTO {
  return {
    id: a.id,
    userId: a.userId,
    rule: a.rule,
    channels: a.channels,
    note: a.note,
    snoozeHours: a.snoozeHours,
    active: a.active,
    firedAt: a.lastFiredAt ?? a.firedAt ?? null,
    createdAt: new Date(a.createdAt),
    updatedAt: new Date(a.createdAt), // Alert has no updatedAt; use createdAt as fallback
  };
}

// ── Service functions ────────────────────────────────────────────────────────

export async function listAlertsService(
  userId: string,
  opts?: { activeOnly?: boolean },
): Promise<{ alerts: AlertDTO[] }> {
  const alerts = await aiListAlerts(userId, opts);
  return { alerts: alerts.map(toAlertDTO) };
}

export async function createAlertService(
  userId: string,
  input: AlertCreateInput,
): Promise<{ alert: AlertDTO }> {
  const rl = await withRateLimit(userId, 'alerts_create', 60);
  if (!rl.allowed) {
    throw Object.assign(new Error('Too many requests'), { statusCode: 429 });
  }

  const alert = await aiCreateAlert({ ...input, userId });
  return { alert: toAlertDTO(alert) };
}

export async function getAlertService(
  userId: string,
  id: string,
): Promise<AlertDTO | null> {
  const alert = await aiGetAlert(userId, id);
  return alert ? toAlertDTO(alert) : null;
}

export async function updateAlertService(
  userId: string,
  id: string,
  input: AlertPatchInput,
): Promise<AlertDTO | null> {
  const alert = await aiUpdateAlert(userId, id, input);
  return alert ? toAlertDTO(alert) : null;
}

export async function deleteAlertService(userId: string, id: string): Promise<void> {
  await aiDeleteAlert(userId, id);
}

// ── Preview / Simulation ─────────────────────────────────────────────────────

const PREVIEW_RATE_LIMIT = Number(process.env.AI_ALERT_PREVIEW_RATE_LIMIT ?? '10');

async function fetchCandles(rule: AlertRule, _lookbackDays: number): Promise<SimCandle[]> {
  const rows = await getRecentCandles(rule.symbol, 1500);
  return rows
    .map((r) => {
      const t = (r as { t?: number | Date | string }).t;
      const o = (r as { o?: number }).o ?? 0;
      const h = (r as { h?: number }).h ?? 0;
      const l = (r as { l?: number }).l ?? 0;
      const c = (r as { c?: number }).c ?? 0;
      const tMs = typeof t === 'number' ? t : t instanceof Date ? t.getTime() : Date.parse(String(t));
      return { t: tMs, o, h, l, c } satisfies SimCandle;
    })
    .filter((candle) => Number.isFinite(candle.t));
}

export async function previewAlertRuleService(
  userId: string,
  input: AlertPreviewInput,
): Promise<PreviewResultDTO> {
  const rl = await withRateLimit(userId, 'ai_alert_preview', PREVIEW_RATE_LIMIT);
  if (!rl.allowed) {
    throw Object.assign(
      new Error(`Too many preview requests (${rl.count}/${rl.limit} per minute).`),
      { statusCode: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': '0' } },
    );
  }

  if (input.rule.type === 'indicatorCross') {
    return { count: 0, avgHoldMs: 0, recentFires: [], unsupported: true };
  }

  const candles = await fetchCandles(input.rule, input.lookbackDays);
  const sim = simulateAlert(input.rule, candles, { maxFires: 50 });

  if (!sim) {
    return { count: 0, avgHoldMs: 0, recentFires: [], unsupported: true };
  }

  return {
    count: sim.fires.length,
    avgHoldMs: sim.avgHoldMs,
    recentFires: sim.fires.slice().reverse().map((f) => f.at).slice(0, 10),
    unsupported: false,
  };
}

// ── Digest Preview ───────────────────────────────────────────────────────────

const SEVERITY_LABELS: Severity[] = ['info', 'warning', 'error', 'critical'];

const BASE_VOLUMES: Record<Severity, number> = {
  info: 80,
  warning: 40,
  error: 15,
  critical: 5,
};

function simulateBreakdown(config: NoiseConfig, time: Date): PreviewDigestDTO['breakdown'] {
  const hour = time.getUTCHours();
  const qh = config.quietHours;
  const qhStart = qh?.start ?? '';
  const qhEnd = qh?.end ?? '';
  const qhStartH = parseInt(qhStart.split(':')[0] ?? '0', 10);
  const qhEndH = parseInt(qhEnd.split(':')[0] ?? '0', 10);
  const inQuietHours = qh !== null && hour >= qhStartH && hour < qhEndH;

  const effectiveMinSeverity = inQuietHours
    ? config.minSeverityDuringQuietHours
    : config.minSeverity;

  const minRank = SEVERITY_RANK[effectiveMinSeverity] ?? 0;

  let total = 0;
  let allowed = 0;
  let blocked = 0;

  const bySeverity = SEVERITY_LABELS.map((severity) => {
    const raw = BASE_VOLUMES[severity];
    const sevRank = SEVERITY_RANK[severity] ?? 0;
    const isBlocked = sevRank < minRank;
    const sevAllowed = isBlocked ? 0 : raw;
    const sevBlocked = isBlocked ? raw : 0;

    total += raw;
    allowed += sevAllowed;
    blocked += sevBlocked;

    return { severity, total: raw, allowed: sevAllowed, blocked: sevBlocked };
  });

  return { total, allowed, blocked, bySeverity, digestMode: config.dailyDigestMode };
}

export async function previewDigestService(userId: string): Promise<PreviewDigestDTO> {
  const config = await getNoiseConfig(userId);
  const breakdown = simulateBreakdown(config, new Date());
  const allowedPct = breakdown.total > 0 ? Math.round((breakdown.allowed / breakdown.total) * 100) : 100;
  const blockedPct = 100 - allowedPct;

  return {
    breakdown,
    allowedPct,
    blockedPct,
    dailyEstimate: breakdown.allowed * 3,
  };
}
