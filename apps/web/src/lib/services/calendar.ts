// SPDX-License-Identifier: Apache-2.0

// PF-22 — Calendar service layer.
//
// Handles economic calendar event retrieval.
//
// Pattern: Service (PF-22). Controllers remain thin: parse request →
// call service → format Response.

import { listUpcomingEvents } from '@hamafx/ai';
import type { EconomicEvent } from '@hamafx/shared';
import { withRateLimit } from '@hamafx/db';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CalendarEventDTO {
  id: string;
  title: string;
  date: string;
  impact: string;
  forecast?: string | null;
  previous?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

const CALENDAR_RATE_LIMIT = Number(process.env.CALENDAR_RATE_LIMIT) || 60;

// ── DTO mappers ──────────────────────────────────────────────────────────────

/**
 * Map domain EconomicEvent → CalendarEventDTO.
 * Handles timestamp→ISO string conversion and field name mapping
 * (importance→impact, forecast/previous number→string).
 * Preserves all extended fields (country, currency, actual, etc.) via destructure-spread.
 */
function toCalendarEventDTO(e: EconomicEvent): CalendarEventDTO {
  const { date, importance, forecast, previous, ...rest } = e;
  return {
    ...rest, // preserve country, currency, actual, unit, source, etc.
    id: e.id,
    title: e.title,
    date: new Date(date).toISOString(),
    impact: importance, // domain uses 'importance', API contract uses 'impact'
    forecast: forecast != null ? String(forecast) : null,
    previous: previous != null ? String(previous) : null,
  };
}

// ── Service functions ────────────────────────────────────────────────────────

export async function checkCalendarRateLimit(userId: string): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
}> {
  const rl = await withRateLimit(userId, 'calendar_read', CALENDAR_RATE_LIMIT);
  return { allowed: rl.allowed, count: rl.count, limit: rl.limit };
}

export async function listEventsService(): Promise<CalendarEventDTO[]> {
  const events = await listUpcomingEvents();
  return events.map(toCalendarEventDTO);
}
