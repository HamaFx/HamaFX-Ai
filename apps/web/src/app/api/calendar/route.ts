// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/calendar — economic calendar (thin controller).

import { errorResponse, withAuth } from '@/lib/api';
import { checkCalendarRateLimit, listEventsService } from '@/lib/services/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const rl = await checkCalendarRateLimit(user.userId);
    if (!rl.allowed) {
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: `Too many requests (${rl.count}/${rl.limit} per minute).` } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const events = await listEventsService();
    return Response.json(events);
  } catch (err) {
    return errorResponse(err, req);
  }
});
