// SPDX-License-Identifier: Apache-2.0

// POST /api/admin/billing/dlq/:id/replay — replay one authenticated
// NOWPayments webhook failure through the canonical webhook processor.

import {
  claimBillingWebhookReplay,
  markBillingWebhookReplayed,
  releaseBillingWebhookReplay,
} from '@hamafx/db';

import { IpnPayloadSchema, processVerifiedIpnPayload, type IpnPayload } from '@/app/api/billing/webhook/route';
import { withAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

export const POST = withAdminAuth<Params>(async (_req, { params }) => {
  const { id } = await params;
  const entry = await claimBillingWebhookReplay(id);
  if (!entry) {
    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'DLQ entry is missing or already being replayed' } },
      { status: 404 },
    );
  }

  try {
    if (!entry.replayToken) {
      throw new Error('DLQ replay lease is missing');
    }
    if (entry.provider !== 'nowpayments') {
      throw new Error('Unsupported billing webhook provider');
    }
    const parsed = IpnPayloadSchema.safeParse(entry.payload);
    if (!parsed.success) {
      throw new Error('DLQ payload failed billing webhook validation');
    }
    const payload = parsed.data as IpnPayload;
    await processVerifiedIpnPayload(payload);
    await markBillingWebhookReplayed(id, entry.replayToken);
    return Response.json({ ok: true, id, status: 'replayed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (entry.replayToken) await releaseBillingWebhookReplay(id, message, entry.replayToken);
    return Response.json(
      { error: { code: 'REPLAY_FAILED', message: 'DLQ replay failed', requestId: id } },
      { status: 422 },
    );
  }
});
