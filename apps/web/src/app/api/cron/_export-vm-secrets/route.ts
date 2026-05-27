// GET /api/cron/_export-vm-secrets — one-shot route used while migrating
// production secrets onto the GCE worker VM. Vercel CLI's `env pull` only
// returns system bindings, not user-encrypted values, so the only way to
// move them off Vercel without touching the dashboard manually is to
// have the running deployment echo them back to a caller that already
// proved knowledge of CRON_SECRET.
//
// SECURITY MODEL:
//   - Bearer-token gated by CRON_SECRET (same gate every other cron uses).
//   - Returns an explicit allow-list of keys; never `process.env` itself.
//   - Logs an audit line (without values) on every successful export.
//   - This file is intentionally short-lived. Delete it in the *next*
//     PR after the VM has been seeded.

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const ALLOWED_KEYS: ReadonlyArray<string> = [
  'AI_GATEWAY_API_KEY',
  'FRED_API_KEY',
  'FINNHUB_API_KEY',
  'MARKETAUX_API_KEY',
  'SENTRY_DSN',
  'VAPID_PRIVATE_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_SUBJECT',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
  'GOOGLE_VERTEX_LOCATION',
  'GOOGLE_VERTEX_PROJECT',
  'AI_DEFAULT_MODEL',
  'AI_TITLE_MODEL',
  'AI_SUMMARY_MODEL',
  'AI_TECHNICAL_MODEL',
  'AI_FUNDAMENTAL_MODEL',
];

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const out: Record<string, string> = {};
    const present: Array<string> = [];
    const missing: Array<string> = [];

    for (const key of ALLOWED_KEYS) {
      const val = process.env[key];
      if (typeof val === 'string' && val.length > 0) {
        out[key] = val;
        present.push(key);
      } else {
        missing.push(key);
      }
    }

    console.warn('[cron/_export-vm-secrets] exported', {
      presentCount: present.length,
      missingCount: missing.length,
      present,
      missing,
    });

    // Stash the payload in `note` so the standard `withCronAuth` envelope
    // works. Caller decodes the JSON itself.
    return {
      processed: present.length,
      note: JSON.stringify({ keys: out, missing }),
    };
  });
}
