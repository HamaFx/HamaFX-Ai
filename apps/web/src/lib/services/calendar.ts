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
