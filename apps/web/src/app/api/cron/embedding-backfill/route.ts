// GET /api/cron/embedding-backfill — Vercel Cron, hourly.
// Embeds any news_articles rows missing news_embeddings entries (small batches
// to stay under function timeout). Phase-0 stub.

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => ({
    processed: 0,
    note: 'phase-0 stub — implement in Phase 1c',
  }));
}
