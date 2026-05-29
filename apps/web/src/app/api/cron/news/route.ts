// GET /api/cron/news — pulls latest from Marketaux + Finnhub, upserts
// news_articles, dedupes by sha1(url). Embeddings are intentionally NOT
// computed here so a news-fetch failure doesn't block the embedding
// cron, and vice versa.
//
// Phase 3 hardening §13 — backfill missed windows. The pre-fix code
// always asked for "the last 6 hours", which papered over short cron
// outages but lost data when a deploy or worker pause stretched
// longer. We now ask for everything published since the most-recent
// stored article (with a 6-hour fallback when the table is empty),
// then loop until the upstream returns nothing new.
//
// Trigger options (Hobby plan caps Vercel cron at daily):
//   - Pro: schedule via vercel.json (5-minute cadence is ideal)
//   - Hobby: external scheduler (Fly.io worker, GitHub Actions, etc.) hits
//     this URL with `Authorization: Bearer ${CRON_SECRET}`.

import { latestArticleTimestampMs, upsertArticles } from '@hamafx/ai';
import { fetchNews } from '@hamafx/data';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 60 s is the Hobby cap; we expect <10 s in practice.
export const maxDuration = 60;

/**
 * Furthest we'll ever look back when the news_articles table is empty.
 * Beyond this the upstream's free-tier paging caps make the call noisy.
 */
const FALLBACK_LOOKBACK_MS = 6 * 60 * 60 * 1000;

/**
 * Floor on the high-water mark to stop us asking for "everything since
 * 1970" if the published_at column ever lands a bad value. 7 days is
 * comfortably longer than any realistic cron outage.
 */
const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Per-page cap. Marketaux's free tier returns up to 50 per call. */
const PAGE_LIMIT = 50;

/** Hard ceiling so a misconfigured cron can't burn the daily quota. */
const MAX_PAGES = 4;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    let publishedAfter = await highWaterMarkIso();
    let totalProcessed = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let pages = 0;

    try {
      while (pages < MAX_PAGES) {
        const articles = await fetchNews({ publishedAfter, limit: PAGE_LIMIT });
        if (articles.length === 0) break;

        const { inserted, skipped } = await upsertArticles(articles);
        totalProcessed += articles.length;
        totalInserted += inserted;
        totalSkipped += skipped;

        // Bump the floor to the freshest article we just stored. The
        // articles array isn't guaranteed sort-order from the upstream,
        // so take max manually.
        const freshestMs = articles.reduce((acc, a) => Math.max(acc, a.publishedAt), 0);
        if (freshestMs <= 0) break;
        const next = new Date(freshestMs + 1).toISOString();
        if (next === publishedAfter) break; // no progress; bail
        publishedAfter = next;
        pages += 1;
      }

      return {
        processed: totalProcessed,
        note: `pages=${pages} inserted=${totalInserted} skipped=${totalSkipped} since=${publishedAfter}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[cron/news] fetch failed:', message);
      throw new Error(`news fetch failed: ${message}`);
    }
  });
}

/**
 * Read the most-recent `published_at` from `news_articles`. Falls back
 * to a 6-hour lookback when the table is empty (fresh DB / first run
 * after a wipe). Clamped at 7 days in case of a stray future-dated row.
 */
async function highWaterMarkIso(): Promise<string> {
  try {
    const ms = await latestArticleTimestampMs();
    if (ms !== null) {
      const clamped = Math.max(ms, Date.now() - MAX_LOOKBACK_MS);
      return new Date(clamped).toISOString();
    }
  } catch (err) {
    console.warn('[cron/news] high-water-mark probe failed; falling back to 6h', err);
  }
  return new Date(Date.now() - FALLBACK_LOOKBACK_MS).toISOString();
}
