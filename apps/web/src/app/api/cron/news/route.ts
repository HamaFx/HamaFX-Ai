// GET /api/cron/news — Vercel Cron, every 5 min.
//
// Phase-0 stub: verifies the bearer token and exits 200. Real logic lands
// in Phase 1c per docs/13-data-flow.md § "News ingestion pipeline":
//   1. Pull primary (Marketaux) → fallback (Finnhub)
//   2. Filter by symbol/currency/keyword
//   3. Embed title+summary (text-embedding-3-small)
//   4. Upsert news_articles + news_embeddings (pgvector)

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => ({
    processed: 0,
    note: 'phase-0 stub — implement in Phase 1c',
  }));
}
