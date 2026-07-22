// SPDX-License-Identifier: Apache-2.0

// GET /api/cron/embedding-backfill — finds news_articles without embeddings
// and embeds them in batches via the AI Gateway. Capped per run so it stays
// under Vercel's function timeout regardless of backlog.
//
// Phase 8 PR-9: this route is now a **manual-fallback path**. The
// scheduled invocation runs on the GCE worker VM via a systemd timer
// (`hamafx-job-embedding-backfill.timer`), where it's not bound by the
// 60s function ceiling. The route stays here so:
//
//   1. We can hand-trigger via curl during a worker outage:
//      `curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/embedding-backfill`
//   2. Existing scripts / docs that reference the URL keep working.
//
// The cap stays low (256 rows) because the route still has the 60s ceiling.
// The worker job ramps to 1024 rows per run — see apps/worker/src/jobs/embedding-backfill.ts.

import { backfillEmbeddings, countPendingEmbeddings } from '@hamafx/ai';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const before = await countPendingEmbeddings();
    const result = await backfillEmbeddings({
      batchSize: 32,
      // Soft cap. At ~100 ms/text on the gateway, 256 fits in <30 s.
      maxRows: 256,
      ...(req.signal ? { signal: req.signal } : {}),
    });
    const after = await countPendingEmbeddings();
    return {
      processed: result.embedded,
      note: `pending: ${before}->${after}, batches=${result.batches}, tokens=${result.totalTokens}`,
    };
  });
}
