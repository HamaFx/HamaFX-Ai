// SPDX-License-Identifier: Apache-2.0

import { getDiagnosticTrace } from '@hamafx/db';

import { getAdminUser } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { admin, reason } = await getAdminUser();
  if (!admin) {
    const status = reason === 'unauthenticated' ? 401 : 403;
    const code = reason === 'unauthenticated' ? 'UNAUTHORIZED' : 'FORBIDDEN';
    const message = reason === 'unauthenticated' ? 'Authentication required' : 'Admin access required';
    return Response.json({ error: { code, message } }, { status });
  }

  const { id } = await params;

  const trace = await getDiagnosticTrace(id);

  if (!trace) {
    return Response.json({ error: { code: 'NOT_FOUND', message: 'Trace not found' } }, { status: 404 });
  }

  return Response.json({ trace });
};
