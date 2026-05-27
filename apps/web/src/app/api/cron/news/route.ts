// GET /api/cron/news — pulls latest from Marketaux, upserts news_articles,
// dedupes by sha1(url). Embeddings are intentionally NOT computed here so a
// news-fetch failure doesn't block the embedding cron, and vice versa.
//
// Trigger options (Hobby plan caps Vercel cron at daily):
//   - Pro: schedule via vercel.json (5-minute cadence is ideal)
//   - Hobby: external scheduler (Fly.io worker, GitHub Actions, etc.) hits
//     this URL with `Authorization: Bearer ${CRON_SECRET}`.

import { upsertArticles } from '@hamafx/ai';
import { fetchNews } from '@hamafx/data';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 60 s is the Hobby cap; we expect <10 s in practice.
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    // Look back 6 hours so we don't miss anything between cron beats while
    // staying well clear of the page-size cap.
    const publishedAfter = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    try {
      const articles = await fetchNews({ publishedAfter, limit: 50 });
      const { inserted, skipped } = await upsertArticles(articles);
      return {
        processed: articles.length,
        note: `inserted=${inserted} skipped=${skipped}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[cron/news] fetch failed:', message);
      // Re-throw with the actual message so the response is useful for debugging
      throw new Error(`news fetch failed: ${message}`);
    }
  });
}
