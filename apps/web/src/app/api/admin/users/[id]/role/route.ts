// SPDX-License-Identifier: Apache-2.0

// S-2 — Admin endpoint to promote / demote users.

import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody } from '@/lib/api';
import { LastAdminError, SelfDemoteError, updateUserRoleService } from '@/lib/services/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  role: z.enum(['admin', 'user']),
});

interface Params {
  id: string;
}

export const PATCH = withAdminAuth<Params>(async (req, { user, params }) => {
  const { id } = await params;
  const { role } = await parseJsonBody(req, bodySchema);

  try {
    const result = await updateUserRoleService({
      actorUserId: user.userId,
      targetUserId: id,
      role,
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof LastAdminError) {
      return Response.json({ error: { code: 'LAST_ADMIN', message: err.message } }, { status: 409 });
    }

    if (err instanceof SelfDemoteError) {
      return Response.json(
        { error: { code: 'SELF_DEMOTE', message: err.message } },
        { status: 409 },
      );
    }

    if (err instanceof Error && err.message === 'User not found') {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: err.message } },
        { status: 404 },
      );
    }

    throw err;
  }
});
