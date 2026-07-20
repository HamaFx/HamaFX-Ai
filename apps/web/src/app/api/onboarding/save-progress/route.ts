import { z } from 'zod';

import { updateUserSettingsField } from '@hamafx/db';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ProgressSchema = z.object({
  step: z.number().int().min(1).max(5),
  name: z.string().optional(),
  timezone: z.string().optional(),
  defaultSymbol: z.string().optional(),
  selectedProvider: z.string().nullable().optional(),
  tradingStyle: z.enum(['scalper', 'day_trader', 'swing', 'position']).optional(),
  selectedSymbols: z.array(z.string()).optional(),
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const body = await req.json();
    const parsed = ProgressSchema.parse(body);

    await updateUserSettingsField(user.userId, 'onboardingProgress', parsed as unknown as Record<string, unknown>);

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
