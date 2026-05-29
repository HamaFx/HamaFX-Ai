// GET /api/cron/cleanup-uploads — deletes chat-attachment blobs from
// Supabase Storage that are older than 7 days.
//
// Phase 3 hardening §7. The upload route writes blobs under a
// `YYYY-MM-DD/<hex>-<filename>` path. We list all objects in the
// `chat-images` bucket, filter by the date prefix, and delete any
// whose date is ≥ 7 days ago.
//
// Triggered by a daily systemd timer on the GCE VM (see
// infra/cron-vm/units/hamafx-light-cleanup-uploads.{service,timer}).

import { withCronAuth } from '@/lib/cron';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'chat-images';
const RETENTION_DAYS = 7;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const env = getServerEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return { processed: 0, note: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipped' };
    }

    const base = env.SUPABASE_URL.replace(/\/+$/, '');
    const headers = {
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    };

    // Build the list of date-prefixes that are old enough to delete.
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const prefixesToDelete = buildExpiredPrefixes(cutoff);

    let deleted = 0;
    let errors = 0;

    for (const prefix of prefixesToDelete) {
      // List objects under this prefix.
      const listRes = await fetch(
        `${base}/storage/v1/object/list/${BUCKET}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
        },
      );
      if (!listRes.ok) {
        console.warn(`[cleanup-uploads] list ${prefix} failed: ${listRes.status}`);
        errors += 1;
        continue;
      }
      const objects = (await listRes.json()) as Array<{ name: string }>;
      if (!Array.isArray(objects) || objects.length === 0) continue;

      const paths = objects.map((o) => `${prefix}/${o.name}`);
      const delRes = await fetch(
        `${base}/storage/v1/object/${BUCKET}`,
        {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ prefixes: paths }),
        },
      );
      if (!delRes.ok) {
        console.warn(`[cleanup-uploads] delete ${prefix} failed: ${delRes.status}`);
        errors += 1;
        continue;
      }
      deleted += paths.length;
    }

    return {
      processed: deleted,
      note: `deleted=${deleted} errors=${errors} cutoff=${cutoff.toISOString().slice(0, 10)}`,
    };
  });
}

/**
 * Return the ISO date strings (YYYY-MM-DD) for every day from
 * `cutoff` back to 30 days before it. We cap at 30 days so a
 * misconfigured cron can't scan the entire bucket history.
 */
function buildExpiredPrefixes(cutoff: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(cutoff.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
