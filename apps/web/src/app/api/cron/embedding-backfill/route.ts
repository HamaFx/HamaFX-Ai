// GET /api/cron/embedding-backfill — finds news_articles without embeddings
// and embeds them in batches via the AI Gateway. Capped per run so it stays
// under Vercel's function timeout regardless of backlog.

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
